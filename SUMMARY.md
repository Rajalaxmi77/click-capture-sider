# System Summary

This document explains the current extension flow using the **Next.js app as the backend** (NextAuth session cookies, no standalone `backend/`).

## End-to-End Flow (Login → Fetch → Detail → Upload)

### 1) Login (NextAuth session cookies)

- The extension uses **NextAuth session cookies**, not JWTs.
- Login happens via the NextAuth Credentials flow in `login.js`.
- After sign-in, the extension verifies the session via `/api/auth/session` and stores user info in `chrome.storage.local`.

Key endpoints:
- `GET /api/auth/csrf`
- `POST /api/auth/callback/credentials`
- `GET /api/auth/session`

Code (login.js):

```js
const csrfRes = await fetch(`${API_URL}/api/auth/csrf`, {
  method: 'GET',
  credentials: 'include'
});

await fetch(`${API_URL}/api/auth/callback/credentials`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${API_URL}/` })
});

const session = await fetch(`${API_URL}/api/auth/session`, {
  method: 'GET',
  credentials: 'include'
});
```

### 2) Session Check (Popup Init)

- When the popup opens, it calls `/api/auth/session`.
- If no active session, it redirects to `login.html`.
- If a session exists, it loads demand notes and sets up listeners.

Code (popup.js):

```js
const session = await getSession();
if (!session?.user) {
  window.location.href = 'login.html';
  return;
} 
```

### 3) Fetch Demand Notes (List)

- Uses cookies via `credentials: 'include'`.
- The API returns `{ notes }`.

Code (popup.js):

```js
const response = await fetch(`${API_URL}/api/demand-notes?full=true`, {
  credentials: 'include'
});
const data = await response.json();
state.demandNotes = Array.isArray(data.notes) ? data.notes : [];
```

### 4) Open Demand Note Detail

- When a card is clicked, the extension calls `/api/demand-notes/:id`.
- The API currently returns the **note object directly**, plus `files` array.

Code (popup.js):

```js
const data = await getDemandNoteDetail(noteId);
const note =
  data?.note ||
  data?.demandNote ||
  (data && data.id ? data : null) ||
  data?.data?.note ||
  data?.data?.demandNote ||
  data?.data ||
  null;

const documentsRaw =
  data?.documents ||
  data?.files ||
  data?.data?.documents ||
  data?.data?.files ||
  [];
```

### 5) Sync + Upload Files to DB

High-level flow:
1. Popup asks content script to download Filevine files.
2. Content script downloads files and requests upload.
3. Background script uploads to Next.js endpoint.

Key endpoint for upload:
- `POST /api/upload` (multipart/form-data)

Upload call (background.js):

```js
const response = await fetch(`${API_URL}/api/upload`, {
  method: 'POST',
  credentials: 'include',
  body: formData
});
```

### 6) Demand Note Files Lookup (for de-duplication)

Before uploading, the content script checks which files already exist:

```js
const response = await fetch(
  `${API_URL}/api/demand-notes/${encodeURIComponent(String(demandNoteId))}/files`,
  { method: 'GET', credentials: 'include' }
);
```

---

## Current Auth Model (Important)

- **No JWT** is used anymore.
- All API calls rely on **NextAuth session cookies**.
- Every fetch that hits your Next.js API uses:

```js
credentials: 'include'
```

---


Complete Call Order Summary:
============================

DOMContentLoaded (login.html)
    └─> checkExistingAuth()
        └─> getSession()

DOMContentLoaded (popup.html)
    └─> init()
        ├─> getSession()
        ├─> populateUser()
        ├─> setupEventListeners() (registers handlers)
        ├─> updateTime()
        ├─> setActiveView()
        └─> loadDemandNotes()
            ├─> getDemandNotes()
            ├─> renderDemandNotes()
            └─> setSyncStatus() / hideSyncStatus()

User Interactions (triggers):
    Click Login Button:
        └─> signInWithCredentials()
            └─> getSession()
    Click Sync Button:
        └─> syncFilesForDemandNote()
            ├─> ensureContentScript()
            └─> openDemandNoteDetail()
    Click Demand Note Card:
        └─> openDemandNoteDetail()
            └─> getDemandNoteDetail()
    Click Logout:
        └─> signOutSession()
    Click Download All:
        └─> downloadAllFiles()
            └─> ensureContentScript()
    Search/Filter:
        └─> renderDemandNotes()