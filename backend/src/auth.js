const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET = process.env.JWT_SECRET || 'desire-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

function generateToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

async function authenticate(req) {
  let authHeader;
  if (req.headers && typeof req.headers.get === 'function') {
    authHeader = req.headers.get('authorization');
  } else if (req.headers) {
    authHeader = req.headers.authorization || req.headers['authorization'];
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { id: decoded.sub, email: decoded.email, name: decoded.name };
  } catch (err) {
    throw new Error('Unauthorized');
  }
}

module.exports = {
  generateToken,
  hashPassword,
  comparePassword,
  authenticate,
};
