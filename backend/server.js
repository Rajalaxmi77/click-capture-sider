const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;
const prisma = new PrismaClient();

// Configure multer for file uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: function (req, file, cb) {
    // Allow all file types
    cb(null, true);
  }
});

// Middleware
const allowedOriginPatterns = [
  /^chrome-extension:\/\/[a-z0-9]+$/i,
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
  /^https?:\/\/([a-z0-9-]+\.)*filevineapp\.com$/i,
  /^https?:\/\/([a-z0-9-]+\.)*vinesign\.com$/i
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser or same-origin requests with no Origin header.
    if (!origin) return callback(null, true);
    const isAllowed = allowedOriginPatterns.some((pattern) => pattern.test(origin));
    if (isAllowed) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type']
}));

// Allow secure public sites (e.g., filevineapp.com) to call local backend on localhost.
app.use((req, res, next) => {
  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  next();
});
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

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

// File upload endpoint
// Upload a file and associate it with a demand note
app.post('/api/upload', authenticateRequest, upload.single('file'), async (req, res) => {
  try {
    const { demandNoteId, fileCategory } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    if (!demandNoteId) {
      // Delete the uploaded file if no demand note ID
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Demand note ID is required' });
    }
    
    // Verify the demand note exists
    const demandNote = await prisma.$queryRaw`
      SELECT id, title, "clientName" FROM "DemandNote" WHERE id = ${demandNoteId} LIMIT 1
    `;
    
    if (!Array.isArray(demandNote) || demandNote.length === 0) {
      // Delete the uploaded file if demand note not found
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ error: 'Demand note not found' });
    }
    
    // Determine file type from original filename
    const originalName = req.file.originalname || '';
    const fileExt = path.extname(originalName).toLowerCase();
    const fileType = fileExt ? fileExt.slice(1) : 'unknown';
    
    // Create the file record in the database
    // The file URL will be served statically
    const fileUrl = `/uploads/${req.file.filename}`;
    
    const createdFile = await prisma.$queryRaw`
      INSERT INTO "DemandFile" (
        id, 
        "fileName", 
        "fileUrl", 
        "fileType", 
        size, 
        "demandNoteId", 
        status, 
        "summaryStatus",
        "createdAt"
       
      ) VALUES (
        ${uuidv4()},
        ${originalName},
        ${fileUrl},
        ${fileType},
        ${req.file.size},
        ${demandNoteId},
        'active',
        'pending',
       
        ${new Date()}
      )
      RETURNING id, "fileName", "fileUrl", "fileType", size, "demandNoteId", status, "createdAt"
    `;
    
    if (!Array.isArray(createdFile) || createdFile.length === 0) {
      // Delete the uploaded file if database insert failed
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(500).json({ error: 'Failed to save file record' });
    }
    
    const file = createdFile[0];
    
    console.log(`File uploaded successfully: ${originalName} for demand note ${demandNoteId}`);
    
    res.json({
      success: true,
      file: {
        id: file.id,
        fileName: file.fileName,
        fileUrl: file.fileUrl,
        fileType: file.fileType,
        size: Number(file.size),
        demandNoteId: file.demandNoteId,
        status: file.status,
        createdAt: file.createdAt
      }
    });
    
  } catch (error) {
    console.error('File upload error:', error);
    
    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }
    
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Get uploaded files for a demand note
app.get('/api/demand-notes/:id/files', authenticateRequest, async (req, res) => {
  try {
    const demandNoteId = String(req.params.id || '').trim();
    
    if (!demandNoteId) {
      return res.status(400).json({ error: 'Demand note ID is required' });
    }
    
    const files = await prisma.$queryRaw`
      SELECT
        id,
        "fileName",
        "fileUrl",
        "fileType",
        size,
        "demandNoteId",
        status,
        "summaryStatus",
        "createdAt",
        "updatedAt"
      FROM "DemandFile"
      WHERE "demandNoteId" = ${demandNoteId}
      ORDER BY "createdAt" DESC
    `;
    
    res.json({
      files: Array.isArray(files) ? files.map(f => ({
        id: f.id,
        fileName: f.fileName,
        fileUrl: f.fileUrl,
        fileType: f.fileType,
        size: Number(f.size),
        demandNoteId: f.demandNoteId,
        status: f.status,
        summaryStatus: f.summaryStatus,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt
      })) : []
    });
    
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
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
