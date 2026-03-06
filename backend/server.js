const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;
const prisma = new PrismaClient();

// Middleware
app.use(cors({
  origin: ['chrome-extension://*'], // Allow your extension
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

// JWT Secret (prefer JWT_SECRET, fallback to NEXTAUTH_SECRET for compatibility)
const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'your-fallback-secret';

function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return req.query.token || null;
}

function authenticateRequest(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Authentication token required' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.auth = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Authentication API is working',
    timestamp: new Date().toISOString()
  });
});

// Demand notes list endpoint (compatible with /api/demand-notes?full=true)
app.get('/api/demand-notes', authenticateRequest, async (req, res) => {
  try {
    const full = String(req.query.full || '').toLowerCase() === 'true';
    const limit = full ? 500 : 50;

    const notes = await prisma.$queryRawUnsafe(
      `
      SELECT
        id,
        title,
        description,
        status,
        priority,
        "totalAmount",
        "dueDate",
        "createdAt",
        "updatedAt",
        "clientName",
        "referenceNumber"
      FROM "DemandNote"
      ORDER BY "updatedAt" DESC
      LIMIT ${limit}
      `
    );

    const totalRows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM "DemandNote"`
    );

    const total = Array.isArray(totalRows) && totalRows[0] ? totalRows[0].total : notes.length;
    return res.json({ notes, total });
  } catch (error) {
    console.error('Demand notes fetch error:', error);
    return res.status(500).json({ error: 'Failed to load demand notes' });
  }
});

// Demand note detail endpoint with uploaded documents/files
app.get('/api/demand-notes/:id', authenticateRequest, async (req, res) => {
  try {
    const demandNoteId = String(req.params.id || '').trim();
    if (!demandNoteId) {
      return res.status(400).json({ error: 'Demand note id is required' });
    }

    const notes = await prisma.$queryRaw`
      SELECT
        id,
        title,
        description,
        status,
        priority,
        "totalAmount",
        "dueDate",
        "createdAt",
        "updatedAt",
        "clientName",
        "referenceNumber"
      FROM "DemandNote"
      WHERE id = ${demandNoteId}
      LIMIT 1
    `;

    if (!Array.isArray(notes) || notes.length === 0) {
      return res.status(404).json({ error: 'Demand note not found' });
    }

    const files = await prisma.$queryRaw`
      SELECT
        id,
        "fileName",
        "fileUrl",
        "fileType",
        size,
        "createdAt",
        status,
        "summaryStatus"
      FROM "DemandFile"
      WHERE "demandNoteId" = ${demandNoteId}
      ORDER BY "createdAt" DESC
    `;

    return res.json({
      note: notes[0],
      documents: Array.isArray(files) ? files : []
    });
  } catch (error) {
    console.error('Demand note detail fetch error:', error);
    return res.status(500).json({ error: 'Failed to load demand note detail' });
  }
});

// Login endpoint using your existing user table
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Login attempt for email:', email);
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user by email (case-insensitive)
    const user = await prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
      select: {
        id: true,
        email: true,
        password: true,
        firstName: true,
        lastName: true,
        roles: true,
        status: true,
        isDeletedUser: true,
        forcePasswordReset: true,
        uniqueUserId: true
      }
    });
    
    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check if password exists (some users might use OAuth)
    if (!user.password) {
      console.log('User has no password set (likely OAuth user):', email);
      return res.status(401).json({ error: 'This account uses SSO. Please sign in with your provider.' });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      console.log('Invalid password for user:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update last login (you might want to add this field to your schema)
    // For now, we'll just update updatedAt
    await prisma.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() }
    });
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        roles: user.roles,
        uniqueUserId: user.uniqueUserId
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log('Login successful for user:', email);
    
    // Return user info (excluding password)
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles,
        uniqueUserId: user.uniqueUserId,
        forcePasswordReset: user.forcePasswordReset
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token endpoint
app.post('/api/auth/verify', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ valid: false, error: 'Token required' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        roles: true,
        status: true,
        isDeletedUser: true,
        uniqueUserId: true
      }
    });
    
    if (!user) {
      return res.json({ valid: false });
    }
    
    res.json({ 
      valid: true, 
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles,
        uniqueUserId: user.uniqueUserId
      }
    });
    
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ valid: false, error: 'Invalid token' });
  }
});

// Refresh token endpoint
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    
    // Check if user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        roles: true,
        status: true,
        isDeletedUser: true
      }
    });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Generate new token
    const newToken = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        roles: user.roles
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ token: newToken });
    
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Get user permissions/roles
app.post('/api/auth/permissions', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        roles: true,
        uniqueUserId: true
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      roles: user.roles,
      uniqueUserId: user.uniqueUserId
    });
    
  } catch (error) {
    console.error('Permissions error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Optional: Create session in your sessions table (if you want to track extension sessions)
app.post('/api/auth/create-session', async (req, res) => {
  try {
    const { token, sessionToken } = req.body;
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Create a session record (optional)
    const session = await prisma.session.create({
      data: {
        sessionToken: sessionToken || `ext_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        userId: decoded.userId,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    });
    
    res.json({ success: true, sessionId: session.id });
    
  } catch (error) {
    console.error('Session creation error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(port, () => {
  console.log(`Authentication API running on http://localhost:${port}`);
  console.log(`Using JWT secret from JWT_SECRET/NEXTAUTH_SECRET`);
});
