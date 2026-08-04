const { PrismaClient } = require('@prisma/client');

let dbUrl = process.env.DATABASE_URL;

// Fallback: If running on Vercel and Vercel is still providing the direct IPv6 URL, automatically rewrite it to the IPv4 pooler URL.
if (process.env.VERCEL && dbUrl && dbUrl.includes('db.cbsyzgiwyzcwomskyhdl.supabase.co')) {
  dbUrl = 'postgresql://postgres.cbsyzgiwyzcwomskyhdl:Siz%23gul1233@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl,
    },
  },
});

const ContactStatus = {
  valid: 'valid',
  invalid: 'invalid',
  duplicate: 'duplicate',
  unsubscribed: 'unsubscribed',
};

module.exports = { prisma, ContactStatus };
