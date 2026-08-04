# Mail Marketing VUF — Improvement & Performance Guide

> Codebase audit as of June 2026. Based on the full frontend/backend/infra review.

---

## Table of Contents

1. [Critical Performance Bottlenecks](#1-critical-performance-bottlenecks)
2. [Architecture Improvements](#2-architecture-improvements)
3. [Database Optimizations](#3-database-optimizations)
4. [Frontend Speed & UX](#4-frontend-speed--ux)
5. [Backend Refactoring](#5-backend-refactoring)
6. [Security Hardening](#6-security-hardening)
7. [Developer Experience](#7-developer-experience)
8. [Observability & Monitoring](#8-observability--monitoring)
9. [Prioritized Roadmap](#9-prioritized-roadmap)

---

## 1. Critical Performance Bottlenecks

These are the highest-impact, highest-urgency items. Fix these first.

---

### 1.1 — O(n) COUNT Queries on Every Contact Edit

**File:** `backend/src/index.js` ~lines 635–646

**What happens now:**  
When you edit a single contact, the backend runs **5 separate `COUNT` queries** to recalculate upload stats (valid, invalid, duplicate, unsubscribed, skipped). With 10,000 contacts per upload and 100 edits in a session, that's 500 unnecessary `COUNT` queries.

```js
// Current — 5 queries fired after every single contact change
await Promise.all([
  prisma.contact.count({ where: { uploadId, status: 'valid' } }),
  prisma.contact.count({ where: { uploadId, status: 'invalid' } }),
  prisma.contact.count({ where: { uploadId, status: 'duplicate' } }),
  prisma.contact.count({ where: { uploadId, status: 'unsubscribed' } }),
])
```

**Fix — Collapse into one SQL query:**
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'valid')       AS valid_emails,
  COUNT(*) FILTER (WHERE status = 'invalid')     AS invalid_emails,
  COUNT(*) FILTER (WHERE status = 'duplicate')   AS duplicate_emails,
  COUNT(*) FILTER (WHERE status = 'unsubscribed') AS unsubscribed_emails
FROM contacts
WHERE upload_id = $1
```

In Prisma, use `prisma.$queryRaw` for this. This reduces 5 round-trips to 1.

**Alternatively:** Use a PostgreSQL `MATERIALIZED VIEW` or maintain counters in the `uploads` row using a database trigger. On every `INSERT`/`UPDATE`/`DELETE` on `contacts`, the trigger increments or decrements the relevant count in `uploads`. This reduces the recounting to zero extra queries at edit time.

---

### 1.2 — Client-Driven Batch Sending (No Durability)

**File:** `frontend/src/pages/UploadDetails.tsx` ~lines 262–293

**What happens now:**  
The frontend itself loops over 25-contact batches and calls `/uploads/:id/send-batch` for each one. If the browser tab closes, crashes, or the network drops mid-campaign, the send stops — with no way to know which batches completed and which didn't. There is no server-side queue.

```ts
// Frontend controls the loop — no persistence
for (let i = 0; i < batches.length; i++) {
  await uploadApi.sendBatch(id, { templateId, contactIds: batches[i] })
}
```

**Fix — Move send orchestration to the server:**

1. When the user clicks "Send", the frontend calls `POST /uploads/:id/send` once. That's it.
2. The backend enqueues all contacts into a **job queue** (Bull + Redis is the simplest option).
3. A worker process consumes the queue, sends emails in controlled parallel, and updates the DB.
4. The frontend receives real-time progress via Server-Sent Events (SSE) or WebSocket.

This means:
- Campaigns survive browser crashes.
- You can pause/resume campaigns.
- You get real-time progress without polling.
- Rate limiting and retry logic lives in one place.

**Minimal viable queue using Bull:**
```js
// backend/src/queue.js
import Bull from 'bull'
const emailQueue = new Bull('email-send', process.env.REDIS_URL)

emailQueue.process(10, async (job) => {
  const { contactId, templateId, uploadId } = job.data
  // send email, update DB
})
```

---

### 1.3 — Frontend Polling Every 5 Seconds

**File:** `frontend/src/pages/UploadDetails.tsx` ~lines 230–236

**What happens now:**  
While a campaign is "processing", the frontend polls `/uploads/:id` every 5 seconds. Each poll fetches up to 500 contact records. Over a 10-minute campaign that's 120 requests × potentially large payloads.

```ts
const interval = setInterval(() => {
  if (upload?.status === 'processing') {
    fetchDetails() // fetches full contact list every 5s
  }
}, 5000)
```

**Fix — Use Server-Sent Events (SSE):**

SSE is the simplest upgrade — it works over HTTP, no separate WebSocket server needed, and Express supports it natively.

```js
// backend: one endpoint per campaign
apiRouter.get('/uploads/:id/progress', authenticate, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  // Job queue emits progress events, forward them here
  emailQueue.on('progress', (job, progress) => {
    if (job.data.uploadId === req.params.id) send(progress)
  })

  req.on('close', () => res.end())
})
```

```ts
// frontend: replace setInterval with EventSource
const es = new EventSource(`/api/uploads/${id}/progress`)
es.onmessage = (e) => setProgress(JSON.parse(e.data))
```

---

### 1.4 — Template Precompilation on Every Batch

**File:** `backend/src/templates-service.js`

**What happens now:**  
Handlebars templates are compiled on **every call** to `renderTemplate`. If you're sending a 1,000-contact campaign in 40 batches of 25, the same template is compiled 40 times (or more, since contacts are compiled per-contact in some paths).

**Fix — Cache compiled templates:**

```js
import LRU from 'lru-cache'
const templateCache = new LRU({ max: 50 }) // cache up to 50 compiled templates

function getCompiledTemplate(id, html) {
  if (!templateCache.has(id)) {
    templateCache.set(id, Handlebars.compile(html))
  }
  return templateCache.get(id)
}
```

The cache is keyed on the template ID. When a template is updated, invalidate its cache entry.

---

### 1.5 — Unsubscribed List Fetched on Every Upload

**File:** `backend/src/index.js` ~lines 230–231

**What happens now:**  
On every Excel upload, the backend fetches the **entire unsubscribed list** from the database to check against it. For 50,000 unsubscribed emails this is a large query on a hot path.

**Fix — Two options:**

**Option A (simple):** Load unsubscribed emails into a Set in-memory on server startup and keep it updated with an invalidation strategy:
```js
let unsubscribedCache = null
let cacheTime = 0

async function getUnsubscribedSet() {
  if (!unsubscribedCache || Date.now() - cacheTime > 5 * 60 * 1000) {
    const rows = await prisma.unsubscribed.findMany({ select: { email: true } })
    unsubscribedCache = new Set(rows.map(r => r.email.toLowerCase()))
    cacheTime = Date.now()
  }
  return unsubscribedCache
}
```

**Option B (better for scale):** Use a `WHERE email = ANY($emails)` parameterized query to only check the emails in the current upload batch against the unsubscribed table. This avoids loading the full list.

---

## 2. Architecture Improvements

---

### 2.1 — Split the 933-Line Monolith

**File:** `backend/src/index.js`

This single file handles routing, business logic, database access, and email delivery for 20+ endpoints. It is difficult to test and maintain.

**Recommended structure:**
```
backend/src/
├── index.js              # App entry: middleware, mount routers
├── routes/
│   ├── auth.routes.js
│   ├── uploads.routes.js
│   ├── contacts.routes.js
│   ├── templates.routes.js
│   └── unsubscribe.routes.js
├── services/
│   ├── email.service.js  # Already partially exists
│   ├── template.service.js
│   ├── upload.service.js
│   └── contact.service.js
├── middleware/
│   ├── authenticate.js
│   ├── rateLimiter.js
│   └── validate.js
└── prisma.js             # Already separated
```

Each route file mounts a single concern. Each service file handles business logic for that concern. Routes call services; services call Prisma. This makes unit testing possible.

---

### 2.2 — Add a Background Job Queue

Already covered in §1.2, but worth restating as an architecture decision:

**Current:** Frontend controls campaign execution.  
**Target:** Backend job queue with worker processes.

This unlocks:
- Campaign pause/resume
- Campaign scheduling (send at specific time)
- Daily send limits per domain
- Automatic retry with exponential backoff
- Throughput control (N emails/second)

**Recommended stack:** Bull (Redis-backed) or BullMQ (newer API, same concept). Redis can run as a separate Vercel KV store or as a Docker service locally.

---

### 2.3 — Convert Backend to TypeScript

The frontend is fully TypeScript, but the backend is plain JavaScript. Adding TypeScript to the backend:

- Catches bugs at compile time (wrong field names, missing properties)
- Enables shared type definitions between frontend and backend (a `types/` package at the monorepo root)
- Makes refactoring safe when changing Prisma schema
- Works well with Prisma since Prisma already generates types

Minimum effort path: add `tsconfig.json` to backend, rename files to `.ts`, add `ts-node-dev` for dev server. Prisma client already exports TypeScript types.

---

### 2.4 — Replace localStorage JWT with HttpOnly Cookies

**File:** `frontend/src/api/axios.ts`

**Current risk:** JWT stored in `localStorage` is accessible to any JavaScript running on the page. An XSS vulnerability (e.g., via Handlebars template injection, or a malicious Excel file that triggers DOM injection) can steal the token.

**Fix:**
- Backend sets JWT as `HttpOnly; Secure; SameSite=Strict` cookie
- Frontend no longer needs to manage the token — the browser sends it automatically
- Add `credentials: 'include'` to Axios config
- Remove `Authorization: Bearer` header logic

This prevents token theft from XSS attacks entirely.

---

## 3. Database Optimizations

---

### 3.1 — Add Missing Indexes

**File:** `backend/prisma/schema.prisma`

Current indexes are good but a few are missing for common query patterns:

```prisma
// Add to Contact model
@@index([uploadId, deliveryStatus, status])  // compound for send-initiation query
@@index([sentAt])                            // for date-range reporting
@@index([deliveryStatus])                    // global delivery stats

// Add to Upload model
@@index([status])                            // filter by processing/completed
@@index([createdAt])                         // sort on listing
```

---

### 3.2 — Use `$transaction` for Atomic Operations

**File:** `backend/src/index.js`

Several operations update multiple rows and should be atomic:

- Contact delete → recount upload stats
- Contact edit → recount upload stats  
- Send initiation → mark contacts pending + update upload status

If any step fails midway, the database ends up in an inconsistent state. Wrap these in `prisma.$transaction()`:

```js
await prisma.$transaction(async (tx) => {
  await tx.contact.delete({ where: { id } })
  const counts = await tx.$queryRaw`SELECT ... FROM contacts WHERE upload_id = ${uploadId}`
  await tx.upload.update({ where: { id: uploadId }, data: counts })
})
```

---

### 3.3 — Increase Prisma Connection Pool

The default Prisma pool size is 2 connections. Under concurrent batch sends (multiple admins or multiple active campaigns), this causes queuing and timeouts.

In `backend/src/prisma.js`:
```js
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Add connection pool config
})
```

In `DATABASE_URL`, add `?connection_limit=10&pool_timeout=20` if using PgBouncer in transaction mode. For session mode, configure at the Supabase level.

---

### 3.4 — Use Aggregate SQL Instead of Multiple COUNT Queries

Already detailed in §1.1. The aggregate query:

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'valid')         AS valid_emails,
  COUNT(*) FILTER (WHERE status = 'invalid')       AS invalid_emails,
  COUNT(*) FILTER (WHERE status = 'duplicate')     AS duplicate_emails,
  COUNT(*) FILTER (WHERE status = 'unsubscribed')  AS unsubscribed_emails,
  COUNT(*) FILTER (WHERE delivery_status = 'sent') AS sent_count,
  COUNT(*) FILTER (WHERE delivery_status = 'failed') AS failed_count,
  COUNT(*) FILTER (WHERE delivery_status = 'pending') AS pending_count
FROM contacts
WHERE upload_id = $1
```

One round trip replaces 5–7 individual `COUNT` queries.

---

## 4. Frontend Speed & UX

---

### 4.1 — Add React Query for Data Fetching

**Current pattern:** Each page component fetches on mount with `useEffect`, stores in local `useState`, refetches on manual triggers.

**Problem:** No caching between navigation. Switching from Upload Details back to the Upload List refetches everything.

**Fix — Add TanStack Query (React Query):**

```ts
// replaces manual useEffect + useState pattern
const { data: upload, isLoading } = useQuery({
  queryKey: ['upload', id],
  queryFn: () => uploadApi.getUpload(id),
  refetchInterval: (data) => data?.status === 'processing' ? 5000 : false,
})
```

Benefits:
- Automatic caching (navigate away and back — no refetch)
- Built-in refetch on focus/window visibility
- Deduplicates concurrent requests
- Controlled polling (replaces manual `setInterval`)
- Optimistic updates for edits
- `staleTime` configuration to avoid unnecessary requests

---

### 4.2 — Add Virtual Scrolling for Large Contact Lists

**File:** `frontend/src/components/ReportTable.tsx`

**Current problem:** All contacts for the current page are rendered into the DOM simultaneously. At 500 contacts per page, this is 500 table rows in the DOM — slow to paint, slow to scroll.

**Fix — Use `@tanstack/react-virtual`:**

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

const rowVirtualizer = useVirtualizer({
  count: contacts.length,
  getScrollElement: () => tableContainerRef.current,
  estimateSize: () => 48,
  overscan: 10,
})
```

Only the visible rows render to the DOM. 10,000 contacts render as fast as 20.

---

### 4.3 — Route-Based Code Splitting

**File:** `frontend/src/main.tsx` (or wherever routes are defined)

**Current:** All pages imported synchronously — the full app bundle loads on first visit.

**Fix:**
```tsx
import { lazy, Suspense } from 'react'

const UploadDetails = lazy(() => import('./pages/UploadDetails'))
const Templates = lazy(() => import('./pages/Templates'))
const Dashboard = lazy(() => import('./pages/Dashboard'))

// Wrap route outlet
<Suspense fallback={<LoadingSpinner />}>
  <Outlet />
</Suspense>
```

`UploadDetails.tsx` is 818 lines — it's the heaviest page. Lazy-loading it means the initial bundle is significantly smaller, and the login and dashboard pages load faster.

---

### 4.4 — Add a Proper HTML Template Editor

**File:** `frontend/src/components/TemplateEditor.tsx`

**Current:** Plain `<textarea>` for entering raw HTML email templates. No syntax highlighting, no live preview, easy to make typos in Handlebars variables.

**Recommended:**
- Add **CodeMirror 6** or **Monaco Editor** for HTML syntax highlighting and autocompletion
- Add a live preview panel (render the HTML in a sandboxed `<iframe>` with dummy variables)
- Add a "Send Test Email" shortcut directly in the editor (already exists as an API endpoint)

This is the highest-impact UX improvement for the people writing email campaigns.

---

### 4.5 — Debounce and Reduce Polling Payload

Until polling is replaced with SSE (§1.3), at minimum reduce what the poll fetches:

Instead of fetching full contact list on every poll, create a lightweight stats-only endpoint:
```
GET /uploads/:id/stats
→ { sentCount, failedCount, pendingCount, status }
```

The poll calls this instead of the full upload details. No contact list. Much smaller payload.

---

## 5. Backend Refactoring

---

### 5.1 — Add Request Validation Middleware

`class-validator` and `class-transformer` are already in `package.json` but not used. Wire them up.

```ts
// Example: validate send-batch request body
class SendBatchDto {
  @IsArray()
  @IsUUID('4', { each: true })
  contactIds: string[]

  @IsUUID('4')
  templateId: string
}

async function validateBody<T>(cls: ClassConstructor<T>, body: unknown): Promise<T> {
  const obj = plainToInstance(cls, body)
  const errors = await validate(obj)
  if (errors.length) throw new ValidationError(errors)
  return obj
}
```

This replaces ad-hoc field checks scattered through the route handlers and gives consistent 400 errors.

---

### 5.2 — Add Rate Limiting

No rate limiting exists on any endpoint. This is a security and stability risk.

```js
import rateLimit from 'express-rate-limit'

// Brute-force protection for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many login attempts' },
})
apiRouter.post('/auth/login', loginLimiter, loginHandler)

// Prevent accidental bulk send-batch spam
const batchLimiter = rateLimit({
  windowMs: 1000,
  max: 5,
})
apiRouter.post('/uploads/:id/send-batch', authenticate, batchLimiter, sendBatchHandler)
```

Package: `express-rate-limit` (very small, no extra infrastructure needed).

---

### 5.3 — Add Structured Logging

**Current:** `console.log` throughout.

**Problems:** No log levels, no structured fields, no correlation IDs, impossible to query in production.

**Fix — Add Pino (fastest Node.js logger):**

```js
import pino from 'pino'
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

// In a request handler
logger.info({ uploadId, contactCount }, 'Starting campaign send')
logger.error({ err, contactId }, 'Email delivery failed')
```

Pino outputs newline-delimited JSON. Vercel logs, Datadog, Logtail, and most log platforms can ingest it directly. You can search by field (`uploadId`, `err.message`, etc.).

---

### 5.4 — Enforce Upload Status State Machine

**Current:** No transitions are validated. You can call `POST /uploads/:id/send` on a campaign that's already processing or completed.

**Fix:** Add explicit status transition checks:

```js
const VALID_TRANSITIONS = {
  idle: ['processing'],
  processing: ['completed', 'failed'],
  completed: [],
  failed: ['idle'], // allow retry
}

function assertCanTransition(current, next) {
  if (!VALID_TRANSITIONS[current]?.includes(next)) {
    throw new Error(`Cannot transition from ${current} to ${next}`)
  }
}
```

Call this before any status update. Prevents double-sends and race conditions.

---

### 5.5 — Improve Email Validation

**Current regex:** `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`

This accepts addresses like `a@b.c` or `user@domain` and rejects valid edge cases.

**Better alternatives:**
1. Use the `validator.js` library's `isEmail()` — it implements RFC 5322 and is already popular in Node.js
2. For higher accuracy, integrate a real-time email verification API (ZeroBounce, NeverBounce) as an optional enrichment step on upload

---

## 6. Security Hardening

---

### 6.1 — Store JWT in HttpOnly Cookie (not localStorage)

Covered in §2.4. This is the most important security fix.

---

### 6.2 — Rotate Database Credentials

The `.env` file in the repo contains real Supabase connection strings and AWS keys. Even if the file is gitignored now, the credentials may exist in git history.

**Action items:**
1. Run `git log --all -- backend/.env` to check if credentials were ever committed
2. If yes: rotate all exposed credentials immediately (Supabase DB password, AWS access key)
3. Use Vercel environment variables (set in dashboard, not in files) for all secrets
4. Add pre-commit hook to prevent `.env` commits: `git-secrets` or `truffleHog`

---

### 6.3 — Add CSRF Protection

POST endpoints are currently unprotected against CSRF. With cookie-based auth (§2.4/§6.1), add CSRF tokens:

```js
import csrf from 'csurf'
app.use(csrf({ cookie: true }))

// Frontend: read the CSRF token from cookie and send in header
axios.defaults.headers.common['X-CSRF-Token'] = getCookie('_csrf')
```

---

### 6.4 — Validate File Type by Magic Bytes

**Current:** File type is inferred from extension only. A malicious file named `contacts.xlsx` could contain anything.

**Fix — Check the actual file header:**
```js
// XLSX files start with PK (ZIP format)
function isValidXlsx(buffer) {
  return buffer[0] === 0x50 && buffer[1] === 0x4B
}
```

Also consider adding `multer` file size limits for individual fields, not just the overall body.

---

### 6.5 — Harden Unsubscribe Tokens

**Current:** The unsubscribe token is a deterministic SHA256 hash of the email address. Anyone who knows the algorithm can generate the token for any email and unsubscribe arbitrary users.

**Fix:**
1. Generate random tokens (`crypto.randomBytes(32).toString('hex')`) at send time
2. Store them in the `unsubscribed` table (already has a `token` column)
3. The token is meaningful only if it exists in the database — no algorithm to reverse

---

## 7. Developer Experience

---

### 7.1 — Add Tests

Zero test coverage on 3,500 lines of production code. The most valuable tests to add:

**Priority 1 — Integration tests for the send flow:**
```
POST /uploads/:id/send → POST /uploads/:id/send-batch → POST /uploads/:id/finalize
```
Use `supertest` + a test database (Supabase test project or local PG via Docker). These catch regressions in the most critical flow.

**Priority 2 — Unit tests for pure functions:**
- Email validation in `index.js`
- Template rendering in `templates-service.js`
- Token generation
- `checkUploadCompletion()` logic

**Priority 3 — Frontend component tests:**
- `FileUpload` — correct error states on invalid file type/size
- `ReportTable` — pagination behavior
- `ProtectedRoute` — redirect behavior

Recommended stack: **Vitest** (same config as Vite, works with the existing frontend setup) + **supertest** for backend routes.

---

### 7.2 — Add API Documentation

No OpenAPI/Swagger spec exists. With 20+ endpoints, this makes frontend/backend collaboration slow.

**Easiest path:** Use `tsoa` or `@asteasolutions/zod-to-openapi` to generate OpenAPI from type definitions. Or write a `openapi.yaml` by hand — even a partial spec that covers the send flow is more than nothing.

---

### 7.3 — Shared Type Definitions

The frontend and backend duplicate type shapes (upload status strings, contact status strings, etc.). Add a shared `packages/types` workspace:

```
/packages/types/
  index.ts
  → UploadStatus = 'idle' | 'processing' | 'completed' | 'failed'
  → ContactStatus = 'valid' | 'invalid' | 'duplicate' | 'unsubscribed'
  → DeliveryStatus = 'idle' | 'pending' | 'sent' | 'failed' | 'skipped'
```

Both frontend and backend import from here. String enum mismatches between client and server become compile errors.

---

### 7.4 — Move Magic Numbers to Config

Several values are hardcoded in the send flow:

```ts
// frontend/src/pages/UploadDetails.tsx
const BATCH_SIZE = 25         // hardcoded
const BATCH_DELAY_MS = 200    // hardcoded
```

Move these to a config object (or environment variables for the batch delay, since it affects throttling). This makes tuning throughput without code changes possible.

---

## 8. Observability & Monitoring

---

### 8.1 — Add Error Tracking (Sentry)

**Current:** Errors are logged to the console and silently swallowed in some catch blocks.

**Fix:** Add Sentry to both frontend and backend:

```js
// backend
import * as Sentry from '@sentry/node'
Sentry.init({ dsn: process.env.SENTRY_DSN })
app.use(Sentry.Handlers.requestHandler())
app.use(Sentry.Handlers.errorHandler())
```

```ts
// frontend
import * as Sentry from '@sentry/react'
Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN })
```

This surfaces runtime errors in production without needing to tail logs.

---

### 8.2 — Add Campaign Analytics

Currently there is no reporting beyond per-campaign sent/failed counts. Useful additions:

- **Open rate:** Embed a 1×1 tracking pixel in email HTML. Log pixel fetch as "opened".
- **Click rate:** Proxy links in emails through a redirect endpoint that logs the click before forwarding.
- **Bounce rate:** Parse AWS SES bounce/complaint notifications (SNS → webhook) and update contact status automatically.
- **Domain-level breakdown:** Group delivery stats by email domain to detect deliverability issues with specific providers.

---

### 8.3 — Health Check Endpoint

Add a `/health` endpoint that returns database connectivity status and job queue depth:

```js
apiRouter.get('/health', async (req, res) => {
  const dbOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false)
  res.json({ status: dbOk ? 'ok' : 'degraded', db: dbOk })
})
```

Vercel and uptime monitors can ping this to detect outages before users do.

---

## 9. Prioritized Roadmap

Roughly ordered by impact vs. effort:

| # | Item | Impact | Effort | Notes |
|---|------|--------|--------|-------|
| 1 | Aggregate COUNT query (§1.1) | High | Low | One SQL change, immediate relief |
| 2 | Stats-only poll endpoint (§4.5) | High | Low | Reduces poll payload 10–50× |
| 3 | Rate limiting (§5.2) | High | Low | One middleware, <1 hour |
| 4 | Structured logging (§5.3) | Medium | Low | Swap console.log for Pino |
| 5 | Template LRU cache (§1.4) | Medium | Low | 10 lines, real gain |
| 6 | Unsubscribed list caching (§1.5) | Medium | Low | In-memory Set with TTL |
| 7 | Sentry error tracking (§8.1) | High | Low | Mostly config, not code |
| 8 | HTTP-only cookie auth (§2.4, §6.1) | High | Medium | Requires backend + frontend change |
| 9 | Server-Sent Events for progress (§1.3) | High | Medium | Replaces polling permanently |
| 10 | React Query for data fetching (§4.1) | High | Medium | Caching + cleaner code |
| 11 | Server-side job queue (§1.2) | Very High | High | Required for reliability at scale |
| 12 | Split backend monolith (§2.1) | High | High | Prerequisite for testing |
| 13 | Add integration tests (§7.1) | High | High | Start with the send flow |
| 14 | Virtual scrolling (§4.2) | Medium | Medium | Needed at 1,000+ contacts |
| 15 | Route-based code splitting (§4.3) | Medium | Low | Mostly just `lazy()` wrapping |
| 16 | TypeScript on backend (§2.3) | Medium | High | Long-term quality win |
| 17 | Rotate exposed credentials (§6.2) | Critical | Low | Must do if `.env` was ever committed |
| 18 | Hardened unsubscribe tokens (§6.5) | Medium | Low | Random token, store in DB |
| 19 | Campaign analytics (§8.2) | Medium | High | Opens, clicks, bounces |
| 20 | OpenAPI docs (§7.2) | Low | Medium | Good to have |

---

*Generated from a full codebase audit — June 2026.*
