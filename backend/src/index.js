const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const XLSX = require('xlsx');
const rateLimit = require('express-rate-limit');
const { prisma, ContactStatus } = require('./prisma');
const { generateToken, comparePassword, hashPassword, authenticate } = require('./auth');
const { sendEmail } = require('./email');
const { renderTemplate, invalidateTemplate } = require('./templates-service');

require('dotenv').config();

// --- Rate Limit Settings for Email Sending (Human-like Random Delays) ---
const EMAIL_BATCH_SIZE = parseInt(process.env.EMAIL_BATCH_SIZE || '1', 10);
const EMAIL_BATCH_DELAY_MS = parseInt(process.env.EMAIL_BATCH_DELAY_MS || '0', 10);

function getRandomIndividualDelayMs() {
  const min = parseInt(process.env.EMAIL_INDIVIDUAL_DELAY_MIN_MS || '20000', 10);
  const max = parseInt(process.env.EMAIL_INDIVIDUAL_DELAY_MAX_MS || '30000', 10);
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const app = express();
app.set('trust proxy', 1); // Trust Render reverse proxy for express-rate-limit X-Forwarded-For



// --- CORS Configuration ---
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman, server-to-server)
      if (!origin) return callback(null, true);

      // Dynamically allow all Vercel domains (*.vercel.app), Render domains, and localhost
      if (
        origin.endsWith('.vercel.app') ||
        origin.endsWith('.onrender.com') ||
        origin.includes('localhost') ||
        process.env.FRONTEND_URL === '*'
      ) {
        return callback(null, origin);
      }

      // Read FRONTEND_URL env var, split multiple origins, and auto-prefix missing https://
      if (process.env.FRONTEND_URL) {
        const allowedOrigins = process.env.FRONTEND_URL.split(',').map((item) => {
          let trimmed = item.trim();
          if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
            trimmed = 'https://' + trimmed;
          }
          return trimmed;
        });

        if (allowedOrigins.includes(origin)) {
          return callback(null, origin);
        }
      }

      // Permissive fallback so cross-domain deployment never gets blocked
      return callback(null, origin);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);


app.use(express.json());

// Multer: memory storage, 10 MB hard cap
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// --- Rate limiters ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { message: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const batchLimiter = rateLimit({
  windowMs: 1000,
  max: 10,
  message: { message: 'Too many batch requests, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// --- Unsubscribed list in-memory cache (5-minute TTL) ---
let _unsubscribedCache = null;
let _unsubscribedCacheTime = 0;
const UNSUB_CACHE_TTL_MS = 5 * 60 * 1000;

async function getUnsubscribedSet() {
  const now = Date.now();
  if (_unsubscribedCache && now - _unsubscribedCacheTime < UNSUB_CACHE_TTL_MS) {
    return _unsubscribedCache;
  }
  const rows = await prisma.unsubscribed.findMany({ select: { email: true } });
  _unsubscribedCache = new Set(rows.map((r) => r.email.toLowerCase()));
  _unsubscribedCacheTime = now;
  return _unsubscribedCache;
}

function invalidateUnsubscribedCache() {
  _unsubscribedCache = null;
  _unsubscribedCacheTime = 0;
}

// --- Valid upload status transitions ---
const VALID_TRANSITIONS = {
  idle: ['processing', 'scheduled'],
  scheduled: ['idle', 'processing', 'scheduled'],
  processing: ['completed', 'failed'],
  completed: ['idle', 'processing', 'scheduled'],
  failed: ['idle', 'processing', 'scheduled'],
};

function assertCanTransition(current, next) {
  if (!VALID_TRANSITIONS[current]?.includes(next)) {
    throw new Error(`Cannot transition upload from '${current}' to '${next}'`);
  }
}

// --- Helper: aggregate upload stats in ONE query ---
async function recountUploadStats(uploadId) {
  const [statusRows, deliveryRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        COUNT(*)::int                                          AS "totalRows",
        COUNT(*) FILTER (WHERE status = 'valid')::int         AS "validEmails",
        COUNT(*) FILTER (WHERE status = 'invalid')::int       AS "invalidEmails",
        COUNT(*) FILTER (WHERE status = 'duplicate')::int     AS "duplicateEmails",
        COUNT(*) FILTER (WHERE status = 'unsubscribed')::int  AS "unsubscribedEmails"
      FROM contacts
      WHERE upload_id = ${uploadId}
    `,
    prisma.$queryRaw`
      SELECT
        COUNT(*) FILTER (WHERE delivery_status = 'sent')::int     AS "sentCount",
        COUNT(*) FILTER (WHERE delivery_status = 'failed')::int   AS "failedCount",
        COUNT(*) FILTER (WHERE delivery_status = 'pending')::int  AS "pendingCount",
        COUNT(*) FILTER (WHERE delivery_status = 'skipped')::int  AS "skippedCount"
      FROM contacts
      WHERE upload_id = ${uploadId}
    `,
  ]);
  const stats = { ...statusRows[0], ...deliveryRows[0] };
  return { ...stats, totalCount: stats.validEmails };
}

// --- Helper: sync aggregated stats into Upload database record ---
async function syncAndRecountUploadStats(uploadId) {
  const counts = await recountUploadStats(uploadId);
  await prisma.upload.update({
    where: { id: uploadId },
    data: {
      totalCount: counts.totalCount,
      sentCount: counts.sentCount,
      failedCount: counts.failedCount,
      pendingCount: counts.pendingCount,
      skippedCount: counts.skippedCount,
      validEmails: counts.validEmails,
      invalidEmails: counts.invalidEmails,
      duplicateEmails: counts.duplicateEmails,
      unsubscribedEmails: counts.unsubscribedEmails,
    },
  }).catch(() => { });
  return counts;
}

// --- Helper: mask email for GDPR compliance ---
function maskEmail(email) {
  const parts = email.split('@');
  if (parts.length !== 2) return '***@***.***';
  const [user, domain] = parts;
  const maskedUser = user.length > 2 ? user[0] + '***' + user[user.length - 1] : '***';
  return `${maskedUser}@${domain}`;
}

// --- Helper: finalize upload status after all batches done ---
async function checkUploadCompletion(uploadId) {
  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
  if (!upload) return 'failed';

  const counts = await syncAndRecountUploadStats(uploadId);

  if (counts.pendingCount === 0) {
    let finalStatus = upload.status;
    if (upload.status === 'processing') {
      finalStatus = counts.failedCount > 0 && counts.sentCount === 0 ? 'failed' : 'completed';
    }
    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: finalStatus,
      },
    });
    return finalStatus;
  }
  return upload.status;
}

// --- Helper: Self-Chaining Worker Trigger for Vercel Serverless Deployments ---
function triggerSelfContainedVercelWorker(req) {
  try {
    const host = req?.headers?.host;
    if (!host) return;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const targetUrl = `${protocol}://${host}/api/cron/process-campaigns`;

    fetch(targetUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'vercel-self-chain-worker',
        'x-cron-secret': process.env.CRON_SECRET || 'desire-mail-cron-secret-2026-production',
      },
    }).catch(() => { });
  } catch (_e) { }
}

// --- Helper: Dispatch campaign to Azure Durable Functions (Production) or Local/Vercel Worker ---
async function dispatchCampaignOrchestration(uploadId, templateId, scheduledAt = null, req = null) {
  const durableStarterUrl = process.env.DURABLE_STARTER_URL;
  const durableFunctionKey = process.env.DURABLE_FUNCTION_KEY;

  if (durableStarterUrl) {
    try {
      const url = durableFunctionKey
        ? `${durableStarterUrl}?code=${durableFunctionKey}`
        : durableStarterUrl;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, templateId, scheduledAt }),
      });
      const data = await res.json();
      console.log(`[Durable Starter Success] Upload ${uploadId}:`, data);
      return;
    } catch (err) {
      console.error(`[Durable Starter Error] Upload ${uploadId}:`, err.message);
    }
  }

  // Fallback: Local In-Process Worker + Vercel Self-Chaining Trigger
  if (!scheduledAt || new Date(scheduledAt) <= new Date()) {
    processCampaignInBackground(uploadId, templateId).catch((err) => {
      console.error(`❌ [Background Launch Error] Upload ${uploadId}:`, err);
    });
    if (req) {
      triggerSelfContainedVercelWorker(req);
    }
  }
}

// Track active running campaigns to prevent duplicate worker loops
const activeRunningCampaigns = new Set();

// --- Background Campaign Processor ---
async function processCampaignInBackground(uploadId, templateId) {
  if (activeRunningCampaigns.has(uploadId)) return;
  activeRunningCampaigns.add(uploadId);

  try {
    const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
    if (!upload) return;
    if (upload.status !== 'processing' && upload.status !== 'scheduled') return;

    if (upload.status === 'scheduled') {
      await prisma.upload.update({
        where: { id: uploadId },
        data: { status: 'processing', scheduledAt: null },
      });
    }

    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (!template) {
      console.error(`❌ [Campaign Error] Upload ${uploadId} missing template ID ${templateId}`);
      await prisma.upload.update({ where: { id: uploadId }, data: { status: 'failed' } });
      return;
    }

    const pendingContacts = await prisma.contact.findMany({
      where: { uploadId, deliveryStatus: 'pending' },
      orderBy: { createdAt: 'asc' },
    });

    if (pendingContacts.length === 0) {
      await checkUploadCompletion(uploadId);
      console.log(`🎉 [Campaign Completed] Upload ID ${uploadId}: All contacts processed.`);
      return;
    }

    console.log(`\n🚀 [Campaign Worker] Processing ${pendingContacts.length} pending emails for campaign "${upload.originalName}" (${uploadId})...`);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    for (let i = 0; i < pendingContacts.length; i++) {
      const contact = pendingContacts[i];

      // Double-check contact status in DB before processing to avoid duplicate sending
      const currentContact = await prisma.contact.findUnique({
        where: { id: contact.id },
        select: { deliveryStatus: true },
      });
      if (currentContact?.deliveryStatus !== 'pending') {
        continue;
      }

      const token = crypto.createHash('sha256').update(contact.email + 'desire-unsubscribe-salt').digest('hex').substring(0, 32);
      const unsubscribeLink = `${frontendUrl}/unsubscribe/${token}`;

      const variables = { name: contact.name, email: contact.email, unsubscribeLink };
      const rendered = renderTemplate(
        { id: template.id, subject: template.subject, htmlBody: template.htmlBody, plainTextBody: template.plainTextBody },
        variables
      );

      console.log(`  📧 [Email ${i + 1}/${pendingContacts.length}] Sending to ${contact.email} (${contact.name})...`);

      let sentSuccessfully = false;
      let lastError = null;
      let attempts = 0;

      while (attempts < 3) {
        try {
          const result = await sendEmail({
            to: contact.email,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
          });
          sentSuccessfully = true;
          console.log(`  ✅ [Success] Sent to ${contact.email} | Provider: ${result.provider} | ID: ${result.messageId}`);
          break;
        } catch (err) {
          attempts++;
          lastError = err;
          console.warn(`  ⚠️ [Retry ${attempts}/3] Failed to send to ${contact.email}: ${err.message}`);
          if (attempts < 3) await new Promise((r) => setTimeout(r, 1000));
        }
      }

      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          deliveryStatus: sentSuccessfully ? 'sent' : 'failed',
          deliveryError: sentSuccessfully ? null : (lastError?.message || 'Failed to deliver email'),
          sentAt: new Date(),
        },
      });

      // Recount stats directly from database to keep upload table perfectly synchronized
      await syncAndRecountUploadStats(uploadId);

      if (i < pendingContacts.length - 1) {
        const delayMs = EMAIL_BATCH_DELAY_MS > 0 ? EMAIL_BATCH_DELAY_MS : 1000;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    const finalStatus = await checkUploadCompletion(uploadId);
    console.log(`🎉 [Campaign Finished] Campaign "${upload.originalName}" finished with status: "${finalStatus}"\n`);
  } catch (err) {
    console.error(`❌ [Worker Error] Campaign ${uploadId}:`, err.message);
  } finally {
    activeRunningCampaigns.delete(uploadId);
  }
}

// --- Background Worker Loop for Dev & Recovery (runs every 10s) ---
setInterval(async () => {
  try {
    const now = new Date();

    // 1. Scheduled campaigns due
    const dueUploads = await prisma.upload.findMany({
      where: { status: 'scheduled', scheduledAt: { lte: now } },
    });

    for (const upload of dueUploads) {
      if (upload.templateId) {
        console.log(`⏰ [Scheduler Worker] Triggering scheduled campaign "${upload.originalName}" (${upload.id})...`);
        processCampaignInBackground(upload.id, upload.templateId);
      }
    }

    // 2. Resume processing campaigns with pending contacts
    const processingUploads = await prisma.upload.findMany({
      where: { status: 'processing' },
    });

    for (const upload of processingUploads) {
      if (upload.templateId) {
        const counts = await syncAndRecountUploadStats(upload.id);
        if (counts.pendingCount > 0) {
          processCampaignInBackground(upload.id, upload.templateId);
        } else {
          await checkUploadCompletion(upload.id);
        }
      }
    }
  } catch (_err) {
    // Ignore quiet polling errors
  }
}, 10000);

// --- Helper: re-evaluate duplicate status for specific emails ---
async function revalidateDuplicatesForEmails(uploadId, emails) {
  const uniqueEmails = [...new Set(emails.filter(Boolean).map((e) => e.trim().toLowerCase()))];
  if (uniqueEmails.length === 0) return;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const unsubSet = await getUnsubscribedSet();

  await Promise.all(
    uniqueEmails.map(async (email) => {
      const contacts = await prisma.contact.findMany({ where: { uploadId, email } });
      if (contacts.length === 0) return;

      if (contacts.length > 1) {
        await prisma.contact.updateMany({
          where: { uploadId, email },
          data: { status: 'duplicate', error: 'Duplicate email in file' },
        });
      } else {
        let status = 'valid';
        let error = null;
        if (!email) {
          status = 'invalid'; error = 'Email is empty';
        } else if (!emailRegex.test(email)) {
          status = 'invalid'; error = 'Invalid email format';
        } else if (unsubSet.has(email)) {
          status = 'unsubscribed'; error = 'Email is unsubscribed';
        }
        await prisma.contact.update({
          where: { id: contacts[0].id },
          data: { status, error },
        });
      }
    })
  );
}

// --- Async error wrapper ---
const catchAsync = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ============================================================
// API Router
// ============================================================
const apiRouter = express.Router();

// GET /health
apiRouter.get('/health', catchAsync(async (_req, res) => {
  const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'degraded', db: dbOk });
}));

// GET /cron/check-scheduler
apiRouter.get('/cron/check-scheduler', catchAsync(async (req, res) => {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ message: 'Unauthorized cron trigger' });
  }

  const results = await runSchedulerIncrementally();
  return res.status(200).json({ success: true, ...results });
}));

// POST /auth/login
apiRouter.post('/auth/login', loginLimiter, catchAsync(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
  if (!admin) return res.status(401).json({ message: 'Invalid credentials' });

  const isValid = await comparePassword(password, admin.password);
  if (!isValid) return res.status(401).json({ message: 'Invalid credentials' });

  const token = generateToken({ id: admin.id, email: admin.email, name: admin.name });
  return res.status(200).json({
    access_token: token,
    admin: { id: admin.id, email: admin.email, name: admin.name },
  });
}));

// GET /auth/me
apiRouter.get('/auth/me', catchAsync(async (req, res) => {
  const user = await authenticate(req);
  const admin = await prisma.admin.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  if (!admin) return res.status(404).json({ message: 'Admin not found' });
  return res.status(200).json(admin);
}));



// GET /uploads/stats/dashboard
apiRouter.get('/uploads/stats/dashboard', catchAsync(async (req, res) => {
  await authenticate(req);
  const [totalUploads, totalTemplates, totalEmailsSent, totalFailedEmails] = await Promise.all([
    prisma.upload.count(),
    prisma.template.count(),
    prisma.contact.count({ where: { deliveryStatus: 'sent' } }),
    prisma.contact.count({ where: { deliveryStatus: 'failed' } }),
  ]);
  return res.status(200).json({ totalUploads, totalTemplates, totalEmailsSent, totalFailedEmails });
}));

// GET /uploads
apiRouter.get('/uploads', catchAsync(async (req, res) => {
  await authenticate(req);
  const uploads = await prisma.upload.findMany({
    include: { template: true },
    orderBy: { createdAt: 'desc' },
  });
  return res.status(200).json(uploads);
}));

// POST /uploads/excel
apiRouter.post('/uploads/excel', uploadMiddleware.single('file'), catchAsync(async (req, res) => {
  await authenticate(req);
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  // Validate XLSX magic bytes (PK zip header: 0x50 0x4B)
  const buf = req.file.buffer;
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4B) {
    return res.status(400).json({ message: 'Uploaded file is not a valid .xlsx file' });
  }

  const workbook = XLSX.read(buf, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

  if (rows.length === 0) return res.status(400).json({ message: 'Excel file is empty' });

  const normalizedRows = rows.map((row) => {
    const normalized = {};
    for (const key of Object.keys(row)) {
      normalized[key.trim().toLowerCase()] = row[key];
    }
    return normalized;
  });

  const firstRow = normalizedRows[0];
  if (!('name' in firstRow) || !('email' in firstRow)) {
    return res.status(400).json({ message: 'Excel file must contain "name" and "email" columns' });
  }

  const unsubscribedSet = await getUnsubscribedSet();
  const seenEmails = new Set();
  let validCount = 0, invalidCount = 0, duplicateCount = 0, unsubscribedCount = 0;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const contactsToCreate = [];

  for (const row of normalizedRows) {
    const name = String(row.name || '').trim();
    const email = String(row.email || '').trim().toLowerCase();

    if (!email) {
      contactsToCreate.push({ name, email, status: 'invalid', error: 'Email is empty' });
      invalidCount++; continue;
    }
    if (!emailRegex.test(email)) {
      contactsToCreate.push({ name, email, status: 'invalid', error: 'Invalid email format' });
      invalidCount++; continue;
    }
    if (seenEmails.has(email)) {
      contactsToCreate.push({ name, email, status: 'duplicate', error: 'Duplicate email in file' });
      duplicateCount++; continue;
    }
    if (unsubscribedSet.has(email)) {
      contactsToCreate.push({ name, email, status: 'unsubscribed', error: 'Email is unsubscribed' });
      unsubscribedCount++;
      seenEmails.add(email); continue;
    }
    seenEmails.add(email);
    contactsToCreate.push({ name, email, status: 'valid', error: null });
    validCount++;
  }

  const upload = await prisma.upload.create({
    data: {
      fileName: req.file.originalname || 'uploaded_file.xlsx',
      originalName: req.file.originalname || 'uploaded_file.xlsx',
      totalRows: normalizedRows.length,
      validEmails: validCount,
      invalidEmails: invalidCount,
      duplicateEmails: duplicateCount,
      unsubscribedEmails: unsubscribedCount,
      contacts: { create: contactsToCreate },
    },
  });

  return res.status(201).json(upload);
}));

// GET /uploads/:id/stats  — lightweight poll endpoint (no contacts list)
apiRouter.get('/uploads/:id/stats', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  const counts = await syncAndRecountUploadStats(id);
  const upload = await prisma.upload.findUnique({
    where: { id },
    select: {
      id: true, status: true,
      totalCount: true, sentCount: true, failedCount: true,
      pendingCount: true, skippedCount: true,
    },
  });
  if (!upload) return res.status(404).json({ message: 'Upload not found' });
  return res.status(200).json({ ...upload, ...counts });
}));

// GET /uploads/:id/contacts — Paginated contacts for an upload
apiRouter.get('/uploads/:id/contacts', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit || '50', 10)));
  const skip = (page - 1) * limit;

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where: { uploadId: id },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    }),
    prisma.contact.count({ where: { uploadId: id } }),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;
  return res.status(200).json({ contacts, total, page, limit, totalPages });
}));

// GET /uploads/:id — Fetch single upload with template (generic route must come after specific routes)
apiRouter.get('/uploads/:id', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  await syncAndRecountUploadStats(id);
  const upload = await prisma.upload.findUnique({
    where: { id },
    include: { template: true },
  });
  if (!upload) return res.status(404).json({ message: 'Upload not found' });
  return res.status(200).json(upload);
}));

// ALL /cron/process-campaigns — Cron endpoint for Vercel Cron or external schedulers
apiRouter.all('/cron/process-campaigns', catchAsync(async (req, res) => {
  const now = new Date();

  // 1. Scheduled campaigns due
  const dueUploads = await prisma.upload.findMany({
    where: { status: 'scheduled', scheduledAt: { lte: now } },
  });

  for (const upload of dueUploads) {
    if (upload.templateId) {
      await prisma.upload.update({
        where: { id: upload.id },
        data: { status: 'processing', scheduledAt: null },
      });
      processCampaignInBackground(upload.id, upload.templateId);
    }
  }

  // 2. Fetch processing campaigns
  const processingUploads = await prisma.upload.findMany({
    where: { status: 'processing' },
  });

  let totalPendingRemaining = 0;

  for (const upload of processingUploads) {
    if (!upload.templateId) continue;
    const counts = await syncAndRecountUploadStats(upload.id);
    if (counts.pendingCount > 0) {
      processCampaignInBackground(upload.id, upload.templateId);
      totalPendingRemaining += counts.pendingCount;
    } else {
      await checkUploadCompletion(upload.id);
    }
  }

  return res.status(200).json({
    success: true,
    message: `Cron worker executed. Checked ${processingUploads.length} campaigns.`,
    totalPendingRemaining,
  });
}));

// PUT /uploads/:id — Update upload label/fileName
apiRouter.put('/uploads/:id', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  const { fileName, originalName } = req.body;

  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload) return res.status(404).json({ message: 'Upload not found' });

  const updated = await prisma.upload.update({
    where: { id },
    data: {
      fileName: fileName !== undefined ? fileName : upload.fileName,
      originalName: originalName !== undefined ? originalName : upload.originalName,
    },
  });

  return res.status(200).json(updated);
}));

// DELETE /uploads/:id — Permanently delete an upload and all associated contacts
apiRouter.delete('/uploads/:id', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);

  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload) return res.status(404).json({ message: 'Upload not found' });

  // Delete all contacts belonging to this upload first, then delete upload
  await prisma.contact.deleteMany({ where: { uploadId: id } });
  await prisma.upload.delete({ where: { id } });

  return res.status(200).json({ message: 'Upload history deleted successfully' });
}));

// POST /uploads/:id/finalize — Check & finalize upload sending status
apiRouter.post('/uploads/:id/finalize', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);

  const status = await checkUploadCompletion(id);
  return res.status(200).json({ status });
}));

// PUT /contacts/:id — Update a single contact in a list
apiRouter.put('/contacts/:id', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  const { name, email } = req.body;

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) return res.status(404).json({ message: 'Contact not found' });

  const updatedEmail = email ? email.trim().toLowerCase() : contact.email;
  const updatedName = name !== undefined ? name.trim() : contact.name;

  const updatedContact = await prisma.contact.update({
    where: { id },
    data: { name: updatedName, email: updatedEmail },
  });

  await revalidateDuplicatesForEmails(contact.uploadId, [updatedEmail, contact.email]);
  const newCounts = await recountUploadStats(contact.uploadId);
  await prisma.upload.update({ where: { id: contact.uploadId }, data: newCounts });

  return res.status(200).json(updatedContact);
}));

// DELETE /contacts/:id — Delete a single contact from a list
apiRouter.delete('/contacts/:id', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) return res.status(404).json({ message: 'Contact not found' });

  await prisma.contact.delete({ where: { id } });

  await revalidateDuplicatesForEmails(contact.uploadId, [contact.email]);
  const newCounts = await recountUploadStats(contact.uploadId);
  await prisma.upload.update({ where: { id: contact.uploadId }, data: newCounts });

  return res.status(200).json({ message: 'Contact deleted successfully' });
}));

// GET /contacts/logs — Delivery Logs Endpoint with Pagination & Filtering
apiRouter.get('/contacts/logs', catchAsync(async (req, res) => {
  await authenticate(req);
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '10', 10)));
  const skip = (page - 1) * limit;

  const { status, search, startDate, endDate } = req.query;
  const where = {};

  if (status && status !== 'all') {
    where.deliveryStatus = String(status);
  }

  if (search && String(search).trim() !== '') {
    const searchStr = String(search).trim();
    where.OR = [
      { email: { contains: searchStr, mode: 'insensitive' } },
      { name: { contains: searchStr, mode: 'insensitive' } },
      { upload: { originalName: { contains: searchStr, mode: 'insensitive' } } },
      { upload: { fileName: { contains: searchStr, mode: 'insensitive' } } },
    ];
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) {
      where.createdAt.gte = new Date(String(startDate));
    }
    if (endDate) {
      const end = new Date(String(endDate));
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  const [logs, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: {
        upload: {
          select: {
            originalName: true,
            fileName: true,
            template: {
              select: {
                name: true,
                subject: true,
                htmlBody: true,
                plainTextBody: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.contact.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return res.status(200).json({
    logs,
    total,
    page,
    limit,
    totalPages,
  });
}));

// POST /uploads/:id/send
apiRouter.post('/uploads/:id/send', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  const { templateId } = req.body;

  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload) return res.status(404).json({ message: 'Upload not found' });

  // State machine guard
  try { assertCanTransition(upload.status, 'processing'); }
  catch (e) { return res.status(400).json({ message: e.message }); }

  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) return res.status(404).json({ message: 'Template not found' });

  const contacts = await prisma.contact.findMany({ where: { uploadId: id, status: 'valid' } });
  if (contacts.length === 0) {
    return res.status(400).json({ message: 'No valid contacts found in this upload' });
  }

  const unsubscribedSet = await getUnsubscribedSet();
  const unsubscribedArray = [...unsubscribedSet];

  const [skippedResult, pendingResult] = await Promise.all([
    prisma.contact.updateMany({
      where: { uploadId: id, status: 'valid', email: { in: unsubscribedArray } },
      data: { deliveryStatus: 'skipped', deliveryError: 'Email is unsubscribed' },
    }),
    prisma.contact.updateMany({
      where: { uploadId: id, status: 'valid', email: { notIn: unsubscribedArray } },
      data: { deliveryStatus: 'pending' },
    }),
  ]);

  await prisma.upload.update({
    where: { id },
    data: {
      status: 'processing',
      templateId,
      totalCount: contacts.length,
      pendingCount: pendingResult.count,
      skippedCount: skippedResult.count,
      sentCount: 0,
      failedCount: 0,
    },
  });

  // Launch background processor or Azure Durable Orchestrator
  dispatchCampaignOrchestration(id, templateId, null, req).catch((err) => {
    console.error(`❌ [Dispatch Launch Error] Upload ${id}:`, err);
  });

  const queuedContacts = contacts.filter((c) => !unsubscribedSet.has(c.email.toLowerCase()));
  return res.status(200).json({
    message: 'Sending initiated',
    totalCount: contacts.length,
    queuedCount: pendingResult.count,
    skippedCount: skippedResult.count,
    queuedContacts: queuedContacts.map((c) => ({ id: c.id, email: c.email, name: c.name })),
    batchSize: EMAIL_BATCH_SIZE,
    batchDelayMs: EMAIL_BATCH_DELAY_MS,
  });
}));

// POST /uploads/:id/schedule
apiRouter.post('/uploads/:id/schedule', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);
  const { templateId, scheduledAt } = req.body;

  if (!templateId || !scheduledAt) {
    return res.status(400).json({ message: 'templateId and scheduledAt are required' });
  }

  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload) return res.status(404).json({ message: 'Upload not found' });

  try {
    assertCanTransition(upload.status, 'scheduled');
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }

  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) return res.status(404).json({ message: 'Template not found' });

  const schedDate = new Date(scheduledAt);
  if (isNaN(schedDate.getTime()) || schedDate <= new Date()) {
    return res.status(400).json({ message: 'scheduledAt must be a valid date in the future' });
  }



  const contacts = await prisma.contact.findMany({ where: { uploadId: id, status: 'valid' } });
  if (contacts.length === 0) {
    return res.status(400).json({ message: 'No valid contacts found in this upload' });
  }

  const unsubscribedSet = await getUnsubscribedSet();
  const unsubscribedArray = [...unsubscribedSet];

  const [skippedResult, pendingResult] = await Promise.all([
    prisma.contact.updateMany({
      where: { uploadId: id, status: 'valid', email: { in: unsubscribedArray } },
      data: { deliveryStatus: 'skipped', deliveryError: 'Email is unsubscribed' },
    }),
    prisma.contact.updateMany({
      where: { uploadId: id, status: 'valid', email: { notIn: unsubscribedArray } },
      data: { deliveryStatus: 'pending' },
    }),
  ]);

  const updatedUpload = await prisma.upload.update({
    where: { id },
    data: {
      status: 'scheduled',
      templateId,
      scheduledAt: schedDate,
      totalCount: contacts.length,
      pendingCount: pendingResult.count,
      skippedCount: skippedResult.count,
      sentCount: 0,
      failedCount: 0,
    },
  });

  // Dispatch scheduled campaign to Azure Durable Functions (if DURABLE_STARTER_URL configured)
  dispatchCampaignOrchestration(id, templateId, schedDate).catch((err) => {
    console.error(`❌ [Dispatch Schedule Error] Upload ${id}:`, err);
  });

  return res.status(200).json({
    message: 'Campaign scheduled successfully',
    upload: updatedUpload,
  });
}));

// POST /uploads/:id/unschedule
apiRouter.post('/uploads/:id/unschedule', catchAsync(async (req, res) => {
  const { id } = req.params;
  await authenticate(req);

  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload) return res.status(404).json({ message: 'Upload not found' });

  if (upload.status !== 'scheduled') {
    return res.status(400).json({ message: 'Campaign is not scheduled' });
  }

  try {
    assertCanTransition(upload.status, 'idle');
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }

  const updatedUpload = await prisma.upload.update({
    where: { id },
    data: {
      status: 'idle',
      scheduledAt: null,
    },
  });

  return res.status(200).json({
    message: 'Campaign schedule cancelled',
    upload: updatedUpload,
  });
}));

// ============================================================
// Templates CRUD Endpoints
// ============================================================

// GET /templates
apiRouter.get('/templates', catchAsync(async (req, res) => {
  await authenticate(req);
  const templates = await prisma.template.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return res.status(200).json(templates);
}));

// GET /templates/:id
apiRouter.get('/templates/:id', catchAsync(async (req, res) => {
  await authenticate(req);
  const { id } = req.params;
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) return res.status(404).json({ message: 'Template not found' });
  return res.status(200).json(template);
}));

// POST /templates
apiRouter.post('/templates', catchAsync(async (req, res) => {
  await authenticate(req);
  const { name, subject, htmlBody, plainTextBody } = req.body;
  if (!name || !subject) {
    return res.status(400).json({ message: 'Name and subject are required' });
  }
  const template = await prisma.template.create({
    data: {
      name,
      subject,
      htmlBody: htmlBody || '',
      plainTextBody: plainTextBody || '',
    },
  });
  return res.status(201).json(template);
}));

// PUT /templates/:id
apiRouter.put('/templates/:id', catchAsync(async (req, res) => {
  await authenticate(req);
  const { id } = req.params;
  const { name, subject, htmlBody, plainTextBody } = req.body;
  const existing = await prisma.template.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Template not found' });

  const updated = await prisma.template.update({
    where: { id },
    data: {
      name: name !== undefined ? name : existing.name,
      subject: subject !== undefined ? subject : existing.subject,
      htmlBody: htmlBody !== undefined ? htmlBody : existing.htmlBody,
      plainTextBody: plainTextBody !== undefined ? plainTextBody : existing.plainTextBody,
    },
  });
  invalidateTemplate(id);
  return res.status(200).json(updated);
}));

// DELETE /templates/:id
apiRouter.delete('/templates/:id', catchAsync(async (req, res) => {
  await authenticate(req);
  const { id } = req.params;
  const existing = await prisma.template.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Template not found' });

  await prisma.template.delete({ where: { id } });
  invalidateTemplate(id);
  return res.status(200).json({ message: 'Template deleted successfully' });
}));

// POST /templates/:id/test
apiRouter.post('/templates/:id/test', catchAsync(async (req, res) => {
  await authenticate(req);
  const { id } = req.params;
  const { testEmail } = req.body;

  if (!testEmail) {
    return res.status(400).json({ message: 'Test email is required' });
  }

  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) return res.status(404).json({ message: 'Template not found' });

  const rendered = renderTemplate(
    { id: template.id, subject: template.subject, htmlBody: template.htmlBody, plainTextBody: template.plainTextBody },
    { name: 'Test User', email: testEmail, unsubscribeLink: '#' }
  );

  await sendEmail({
    to: testEmail,
    subject: `[TEST] ${rendered.subject}`,
    html: rendered.html,
    text: rendered.text,
  });

  return res.status(200).json({ message: `Test email sent to ${testEmail}` });
}));

app.use('/api', apiRouter);

// --- Global Error Handling Middleware ---
app.use((err, req, res, _next) => {
  if (err.message === 'Unauthorized') {
    return res.status(401).json({ message: 'Unauthorized access: Please login first' });
  }
  console.error('[API Error]', err.stack || err);
  return res.status(500).json({ message: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 7071;
app.listen(PORT, () => {
  console.log(`[Express Started] Backend listening on port ${PORT}`);
});

module.exports = app;
