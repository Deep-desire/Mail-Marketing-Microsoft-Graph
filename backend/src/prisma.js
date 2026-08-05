const { PrismaClient } = require('@prisma/client');

let dbUrl = process.env.DATABASE_URL || 'postgresql://postgres.cbsyzgiwyzcwomskyhdl:Siz%23gul1233@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=3&pool_timeout=20';

// 1. If dbUrl references outdated aws-0 pooler, update to active aws-1 pooler
if (dbUrl.includes('aws-0-ap-south-1.pooler.supabase.com')) {
  dbUrl = dbUrl.replace('aws-0-ap-south-1.pooler.supabase.com', 'aws-1-ap-south-1.pooler.supabase.com');
}

// 2. Fallback: If running on Vercel and Vercel provides the direct IPv6 URL, automatically rewrite it to the IPv4 pooler URL.
if (process.env.VERCEL && dbUrl.includes('db.cbsyzgiwyzcwomskyhdl.supabase.co')) {
  dbUrl = 'postgresql://postgres.cbsyzgiwyzcwomskyhdl:Siz%23gul1233@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=3&pool_timeout=20';
}

// 3. Ensure essential serverless pooler parameters are included on Supabase pooler URLs
if (dbUrl.includes('pooler.supabase.com')) {
  if (!dbUrl.includes('pgbouncer=true')) {
    dbUrl += (dbUrl.includes('?') ? '&' : '?') + 'pgbouncer=true';
  }
  if (!dbUrl.includes('connection_limit=')) {
    dbUrl += '&connection_limit=3';
  }
  if (!dbUrl.includes('pool_timeout=')) {
    dbUrl += '&pool_timeout=20';
  }
}

// Global caching for Prisma Client in serverless environments to prevent connection pool exhaustion across container re-invocations
const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma || new PrismaClient({
  datasources: {
    db: {
      url: dbUrl,
    },
  },
});

if (process.env.NODE_ENV !== 'production' || process.env.VERCEL) {
  globalForPrisma.prisma = prisma;
}

const ContactStatus = {
  valid: 'valid',
  invalid: 'invalid',
  duplicate: 'duplicate',
  unsubscribed: 'unsubscribed',
};

module.exports = { prisma, ContactStatus };

