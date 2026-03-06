const API_URL = 'http://localhost:3001';

const state = {
  authToken: '',
  user: null,
  demandNotes: [],
  activeFilter: 'all',
  searchText: '',
  loading: false,
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString();
}

function formatAmount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { style: 'currency', currency: 'USD' }) : '$0.00';
}

function getStatusClass(status) {
  const key = String(status || 'draft').toLowerCase();
  if (key === 'approved' || key === 'pending' || key === 'rejected' || key === 'draft') return `status-${key}`;
  if (key === 'initiated') return 'status-pending';
  return 'status-draft';
}

function getInitials(user) {
  const first = user?.firstName?.trim()?.[0] || '';
  const last = user?.lastName?.trim()?.[0] || '';
  const fallback = user?.email?.trim()?.[0] || 'U';
  return (first + last || fallback).toUpperCase();
}

function setSyncStatus(message, tone = 'info') {
  const statusEl = document.getElementById('syncStatus');
  const msgEl = document.getElementById('syncStatusMessage');
  if (!statusEl || !msgEl) return;

  statusEl.classList.remove('hidden', 'success', 'error');
  if (tone === 'success') statusEl.classList.add('success');
  if (tone === 'error') statusEl.classList.add('error');
  msgEl.textContent = message;
}

function hideSyncStatus() {
  const statusEl = document.getElementById('syncStatus');
  if (!statusEl) return;
  statusEl.classList.add('hidden');
}

function setSyncing(isSyncing) {
  const syncBtn = document.getElementById('syncNowBtn');
  const syncIcon = document.getElementById('syncIcon');
  if (!syncBtn || !syncIcon) return;

  syncBtn.classList.toggle('syncing', isSyncing);
  syncBtn.disabled = isSyncing;
  syncIcon.classList.toggle('fa-spin', isSyncing);
}

function updateTime() {
  const currentTime = document.getElementById('currentTime');
  if (!currentTime) return;
  const now = new Date();
  currentTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function setActiveView(viewName) {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === viewName);
  });

  const map = {
    'demand-notes': 'demandNotesView',
    documents: 'documentsView',
    intake: 'intakeView',
    detail: 'demandNoteDetailView',
  };

  document.querySelectorAll('.view-container').forEach((view) => view.classList.remove('active'));
  const targetId = map[viewName] || 'demandNotesView';
  const target = document.getElementById(targetId);
  if (target) target.classList.add('active');
}

function renderDemandNotes() {
  const listEl = document.getElementById('demandNotesList');
  if (!listEl) return;

  const filtered = state.demandNotes.filter((note) => {
    const matchesFilter = state.activeFilter === 'all' || String(note.status || '').toLowerCase() === state.activeFilter;
    if (!matchesFilter) return false;

    if (!state.searchText) return true;
    const q = state.searchText.toLowerCase();
    return (
      String(note.title || '').toLowerCase().includes(q) ||
      String(note.clientName || '').toLowerCase().includes(q) ||
      String(note.referenceNumber || '').toLowerCase().includes(q)
    );
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="fas fa-file-pen"></i></div>
        <div class="empty-text">No demand notes found</div>
        <div class="empty-subtext">Try changing search or filter</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.map((note) => {
    const safeTitle = escapeHtml(note.title || 'Untitled Demand Note');
    const safeClient = escapeHtml(note.clientName || '-');
    const safeStatus = escapeHtml(note.status || 'draft');
    const safePreview = escapeHtml(note.description || 'No description');
    return `
      <div class="demand-note-card" data-note-id="${escapeHtml(note.id)}">
        <div class="demand-note-header">
          <div class="demand-note-title">${safeTitle}</div>
          <span class="demand-note-status ${getStatusClass(note.status)}">${safeStatus}</span>
        </div>
        <div class="demand-note-meta">
          <span><i class="fas fa-calendar"></i> ${formatDate(note.updatedAt)}</span>
          <span><i class="fas fa-dollar-sign"></i> ${formatAmount(note.totalAmount)}</span>
        </div>
        <div class="demand-note-client"><i class="fas fa-user"></i> ${safeClient}</div>
        <div class="demand-note-preview">${safePreview.length > 180 ? `${safePreview.slice(0, 180)}...` : safePreview}</div>
        <div class="demand-note-footer">
          <span>Ref: ${escapeHtml(note.referenceNumber || '-')}</span>
          <span>Due: ${formatDate(note.dueDate)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderDemandNoteDetail(noteId) {
  const detailEl = document.getElementById('demandNoteDetail');
  if (!detailEl) return;

  const note = state.demandNotes.find((n) => n.id === noteId);
  if (!note) return;

  detailEl.innerHTML = `
    <div class="detail-view">
      <h3 style="margin-bottom: 12px; color:#1e293b;">${escapeHtml(note.title || 'Untitled Demand Note')}</h3>
      <div style="display:grid; gap:10px; font-size:13px; color:#475569;">
        <div><strong>Status:</strong> ${escapeHtml(note.status || '-')}</div>
        <div><strong>Client:</strong> ${escapeHtml(note.clientName || '-')}</div>
        <div><strong>Total Amount:</strong> ${formatAmount(note.totalAmount)}</div>
        <div><strong>Reference:</strong> ${escapeHtml(note.referenceNumber || '-')}</div>
        <div><strong>Due Date:</strong> ${formatDate(note.dueDate)}</div>
        <div><strong>Updated:</strong> ${formatDate(note.updatedAt)}</div>
        <div><strong>Description:</strong><br>${escapeHtml(note.description || '-')}</div>
      </div>
    </div>
  `;

  setActiveView('detail');
}

function renderDocumentsSection(documents) {
  if (!Array.isArray(documents) || documents.length === 0) {
    return `
      <div style="margin-top:16px;">
        <h4 style="margin-bottom:8px; color:#1e293b;">Uploaded Documents</h4>
        <div style="font-size:13px; color:#64748b;">No documents uploaded for this demand note.</div>
      </div>
    `;
  }

  const rows = documents.map((doc) => {
    const fileName = escapeHtml(doc.fileName || 'Unnamed file');
    const fileType = escapeHtml(doc.fileType || '-');
    const fileStatus = escapeHtml(doc.status || '-');
    const createdAt = formatDate(doc.createdAt);
    const size = Number(doc.size || 0);
    const sizeText = size > 0 ? `${Math.round(size / 1024)} KB` : '-';
    const fileUrl = escapeHtml(doc.fileUrl || '');

    return `
      <div style="border:1px solid #e2e8f0; border-radius:8px; padding:10px; margin-bottom:8px; background:#fff;">
        <div style="font-weight:600; color:#1e293b; margin-bottom:4px;">${fileName}</div>
        <div style="font-size:12px; color:#64748b;">Type: ${fileType} | Size: ${sizeText} | Status: ${fileStatus} | Uploaded: ${createdAt}</div>
        ${fileUrl ? `<div style="margin-top:6px; font-size:12px;"><a href="${fileUrl}" target="_blank" rel="noopener noreferrer">Open file</a></div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div style="margin-top:16px;">
      <h4 style="margin-bottom:8px; color:#1e293b;">Uploaded Documents (${documents.length})</h4>
      ${rows}
    </div>
  `;
}

async function fetchDemandNoteDetail(noteId) {
  const response = await fetch(`${API_URL}/api/demand-notes/${encodeURIComponent(noteId)}`, {
    headers: {
      Authorization: `Bearer ${state.authToken}`,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Failed to load demand note detail');
  }

  return response.json();
}

async function openDemandNoteDetail(noteId) {
  const detailEl = document.getElementById('demandNoteDetail');
  if (detailEl) {
    detailEl.innerHTML = `
      <div class="detail-view">
        <div style="font-size:13px; color:#64748b;">Loading details...</div>
      </div>
    `;
  }
  setActiveView('detail');

  try {
    const data = await fetchDemandNoteDetail(noteId);
    const note = data?.note;
    const documents = Array.isArray(data?.documents) ? data.documents : [];
    if (!note) {
      throw new Error('Demand note not found');
    }

    detailEl.innerHTML = `
      <div class="detail-view">
        <h3 style="margin-bottom: 12px; color:#1e293b;">${escapeHtml(note.title || 'Untitled Demand Note')}</h3>
        <div style="display:grid; gap:10px; font-size:13px; color:#475569;">
          <div><strong>Status:</strong> ${escapeHtml(note.status || '-')}</div>
          <div><strong>Client:</strong> ${escapeHtml(note.clientName || '-')}</div>
          <div><strong>Total Amount:</strong> ${formatAmount(note.totalAmount)}</div>
          <div><strong>Reference:</strong> ${escapeHtml(note.referenceNumber || '-')}</div>
          <div><strong>Due Date:</strong> ${formatDate(note.dueDate)}</div>
          <div><strong>Updated:</strong> ${formatDate(note.updatedAt)}</div>
          <div><strong>Description:</strong><br>${escapeHtml(note.description || '-')}</div>
        </div>
        ${renderDocumentsSection(documents)}
      </div>
    `;
  } catch (error) {
    console.error('Error loading demand note detail:', error);
    detailEl.innerHTML = `
      <div class="detail-view">
        <div style="font-size:13px; color:#b91c1c;">${escapeHtml(error.message || 'Failed to load detail')}</div>
      </div>
    `;
  }
}

async function fetchDemandNotes(full = true) {
  if (!state.authToken) return;

  state.loading = true;
  setSyncing(true);
  setSyncStatus('Loading demand notes...');

  try {
    const response = await fetch(`${API_URL}/api/demand-notes?full=${full ? 'true' : 'false'}`, {
      headers: {
        Authorization: `Bearer ${state.authToken}`,
      },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to load demand notes');
    }

    const data = await response.json();
    state.demandNotes = Array.isArray(data.notes) ? data.notes : [];
    renderDemandNotes();
    setSyncStatus(`Loaded ${state.demandNotes.length} demand notes`, 'success');
    setTimeout(() => hideSyncStatus(), 1200);
  } catch (error) {
    console.error('Error loading demand notes:', error);
    setSyncStatus(error.message || 'Failed to load demand notes', 'error');
  } finally {
    state.loading = false;
    setSyncing(false);
  }
}

function setupEventListeners() {
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => setActiveView(tab.dataset.view));
  });

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await chrome.storage.local.remove(['authToken', 'user', 'isAuthenticated', 'authExpiry']);
      window.location.href = 'login.html';
    });
  }

  const searchInput = document.getElementById('searchDemandNotes');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchText = String(e.target.value || '').trim();
      renderDemandNotes();
    });
  }

  document.querySelectorAll('#demandNoteFilters .filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#demandNoteFilters .filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.activeFilter = chip.dataset.filter || 'all';
      renderDemandNotes();
    });
  });

  const syncNowBtn = document.getElementById('syncNowBtn');
  if (syncNowBtn) {
    syncNowBtn.addEventListener('click', () => {
      if (!state.loading) fetchDemandNotes(true);
    });
  }

  const listEl = document.getElementById('demandNotesList');
  if (listEl) {
    listEl.addEventListener('click', (event) => {
      const card = event.target.closest('.demand-note-card');
      if (!card) return;
      const noteId = card.getAttribute('data-note-id');
      if (noteId) void openDemandNoteDetail(noteId);
    });
  }

  const backBtn = document.getElementById('backToDemandNotes');
  if (backBtn) {
    backBtn.addEventListener('click', () => setActiveView('demand-notes'));
  }
}

function populateUser(user) {
  const nameEl = document.getElementById('userName');
  const roleEl = document.getElementById('userRole');
  const avatarEl = document.getElementById('userAvatar');

  if (nameEl) {
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    nameEl.textContent = fullName || user?.email || 'User';
  }

  if (roleEl) {
    const roleText = Array.isArray(user?.roles) && user.roles.length > 0 ? user.roles.join(', ') : 'Authenticated User';
    roleEl.textContent = roleText;
  }

  if (avatarEl) {
    avatarEl.textContent = getInitials(user);
  }
}

async function init() {
  const authData = await chrome.storage.local.get(['authToken', 'user', 'isAuthenticated', 'authExpiry']);
  if (!authData.isAuthenticated || !authData.authToken || authData.authExpiry <= Date.now()) {
    window.location.href = 'login.html';
    return;
  }

  state.authToken = authData.authToken;
  state.user = authData.user || null;
  populateUser(state.user);

  setupEventListeners();
  updateTime();
  setInterval(updateTime, 1000);
  setActiveView('demand-notes');
  await fetchDemandNotes(true);
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    console.error('Popup init failed:', error);
    window.location.href = 'login.html';
  });
});
