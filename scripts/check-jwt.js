require('dotenv').config();
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'fallback-secret-key-12345';
const payload = { id: 'test-user-id', email: 'test@test.local', role: 'ADMIN', tenantId: 'test-tenant-123' };
const token = jwt.sign(payload, SECRET, { expiresIn: '24h' });
const decoded = jwt.decode(token);
console.log('JWT_SECRET used:', SECRET);
console.log('tenantId in payload:', decoded.tenantId);
try {
  jwt.verify(token, SECRET);
  console.log('Verify: OK');
} catch(e) {
  console.log('Verify FAILED:', e.message);
}
