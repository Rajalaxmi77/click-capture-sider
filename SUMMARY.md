# System Summary

This document explains how the extension backend connects to the database, performs login, and fetches demand notes, with code excerpts.

## Database Connection

The backend uses Prisma and reads the connection string from `backend/.env` (`DATABASE_URL`). Prisma is initialized once and reused.

Code (backend/server.js):

```js
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();
```

The database URL is loaded via `dotenv`:

```env
DATABASE_URL="postgresql://..."
```

## Login Flow

The login endpoint validates email/password, checks the user in the database, and issues a JWT.

Code (backend/server.js):

```js
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: 'insensitive' } },
    select: { id: true, email: true, password: true, firstName: true, lastName: true, roles: true, status: true, isDeletedUser: true, forcePasswordReset: true, uniqueUserId: true }
  });

  const isValidPassword = await bcrypt.compare(password, user.password);

  const token = jwt.sign(
    { userId: user.id, email: user.email, roles: user.roles, uniqueUserId: user.uniqueUserId },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token, user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, roles: user.roles, uniqueUserId: user.uniqueUserId, forcePasswordReset: user.forcePasswordReset } });
});
```

JWTs are verified by the `authenticateRequest` middleware, which reads the token from `Authorization: Bearer <token>` and attaches `req.auth`.

```js
function authenticateRequest(req, res, next) {
  const token = extractToken(req);
  const decoded = jwt.verify(token, JWT_SECRET);
  req.auth = decoded;
  next();
}
```

## Fetching Demand Notes

The demand notes list endpoint returns recent notes, with a configurable limit. It uses raw SQL for performance and ordering.

Code (backend/server.js):

```js
app.get('/api/demand-notes', authenticateRequest, async (req, res) => {
  const full = String(req.query.full || '').toLowerCase() === 'true';
  const limit = full ? 500 : 50;

  const notes = await prisma.$queryRawUnsafe(`
    SELECT id, title, description, status, priority, "totalAmount", "dueDate", "createdAt", "updatedAt", "clientName", "referenceNumber"
    FROM "DemandNote"
    ORDER BY "updatedAt" DESC
    LIMIT ${limit}
  `);

  const totalRows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS total FROM "DemandNote"`
  );

  res.json({ notes, total });
});
```

There is also a detail endpoint for a single demand note plus its uploaded documents:

```js
app.get('/api/demand-notes/:id', authenticateRequest, async (req, res) => {
  const demandNoteId = String(req.params.id || '').trim();

  const notes = await prisma.$queryRaw`
    SELECT id, title, description, status, priority, "totalAmount", "dueDate", "createdAt", "updatedAt", "clientName", "referenceNumber"
    FROM "DemandNote"
    WHERE id = ${demandNoteId}
    LIMIT 1
  `;

  const files = await prisma.$queryRaw`
    SELECT id, "fileName", "fileUrl", "fileType", size, "createdAt", status, "summaryStatus"
    FROM "DemandFile"
    WHERE "demandNoteId" = ${demandNoteId}
    ORDER BY "createdAt" DESC
  `;

  res.json({ note: notes[0], documents: files });
});
```

## Where These Are Called From

- The extension UI (`popup.js`) calls the backend list endpoint:

```js
const API_URL = 'http://localhost:3001';
const response = await fetch(`${API_URL}/api/demand-notes?full=true`, {
  headers: { Authorization: `Bearer ${state.authToken}` }
});
```

- Login is performed by the UI, which stores the JWT token and uses it for subsequent requests.

---
If you want this summary updated for additional endpoints or new fields, tell me which ones to add.
