const API_URL = 'http://localhost:3000';

const state = {
  authToken: '',
  user: null,
  demandNotes: [],
  activeFilter: 'all',
  searchText: '',
  loading: false,
  capturedClicks: [],
  isCapturing: true,
  currentFilter: 'all',
  currentDemandNoteId: null
};

async function getSession() {
  try {
    const response = await fetch(`${API_URL}/api/auth/session`, {
      method: 'GET',
      credentials: 'include'
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    if (!data || !data.user) return null;
    return data;
  } catch (error) {
    return null;
  }
}

async function signOutSession() {
  try {
    const csrfRes = await fetch(`${API_URL}/api/auth/csrf`, {
      method: 'GET',
      credentials: 'include'
    });
    const csrfData = await csrfRes.json().catch(() => null);
    const csrfToken = csrfData?.csrfToken;
    if (!csrfToken) return;

    await fetch(`${API_URL}/api/auth/signout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ csrfToken })
    });
  } catch (error) {
    // Best-effort signout.
  }
}

async function getDemandNotes(full = true) {
  const response = await fetch(`${API_URL}/api/demand-notes?full=${full ? 'true' : 'false'}`, {
    credentials: 'include'
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Failed to load demand notes');
  }

  return response.json();
}

async function getDemandNoteDetail(noteId) {
  const response = await fetch(`${API_URL}/api/demand-notes/${encodeURIComponent(noteId)}`, {
    credentials: 'include'
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Failed to load demand note detail');
  }

  return response.json();
}

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
  const syncBtn = document.getElementById('downloadAllBtn');
  const syncIcon = document.getElementById('syncIcon');
  if (!syncBtn || !syncIcon) return;

  syncBtn.classList.toggle('syncing', isSyncing);
  syncBtn.disabled = isSyncing;
  syncIcon.classList.toggle('fa-spin', isSyncing);
}

function setDetailSyncStatus(message, tone = 'info') {
  const statusEl = document.getElementById('detailSyncStatus');
  const msgEl = document.getElementById('detailSyncStatusMessage');
  if (!statusEl || !msgEl) return;

  statusEl.classList.remove('hidden', 'success', 'error');
  if (tone === 'success') statusEl.classList.add('success');
  if (tone === 'error') statusEl.classList.add('error');
  msgEl.textContent = message;
}

function hideDetailSyncStatus() {
  const statusEl = document.getElementById('detailSyncStatus');
  if (!statusEl) return;
  statusEl.classList.add('hidden');
}

function setDetailSyncing(isSyncing) {
  const syncBtn = document.getElementById('syncNowBtn');
  const syncIcon = document.getElementById('syncNowIcon');
  if (!syncBtn) return;

  syncBtn.classList.toggle('syncing', isSyncing);
  syncBtn.disabled = isSyncing;
  if (syncIcon) {
    syncIcon.classList.toggle('fa-spin', isSyncing);
  }
}

function setDownloadStatus(message, tone = 'info') {
  const downloadStatus = document.getElementById('downloadStatus');
  if (!downloadStatus) return;

  downloadStatus.classList.remove('hidden', 'success', 'error');
  if (tone === 'success') downloadStatus.classList.add('success');
  if (tone === 'error') downloadStatus.classList.add('error');
  downloadStatus.textContent = message;
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
    detail: 'demandNoteDetailView'
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

function loadClicks() {
  chrome.storage.local.get(['capturedClicks'], function(result) {
    console.log('Loaded clicks from storage:', result.capturedClicks?.length || 0);
    if (result.capturedClicks) {
      state.capturedClicks = result.capturedClicks;
    }
  });
}

function saveClicks() {
  chrome.storage.local.set({capturedClicks: state.capturedClicks}, function() {
    console.log('Clicks saved to storage:', state.capturedClicks.length);
  });
}

function addClick(clickData) {
  if (!state.isCapturing) return;

  const newClick = {
    type: clickData.type,
    text: clickData.text || 'No text',
    tagName: clickData.tagName,
    classes: clickData.classes || '',
    id: clickData.id || '',
    href: clickData.href || '',
    downloadUrl: clickData.downloadUrl || clickData.href || '',
    documentId: clickData.documentId || '',
    src: clickData.src || '',
    alt: clickData.alt || '',
    title: clickData.title || '',
    name: clickData.name || '',
    value: clickData.value || '',
    role: clickData.role || '',
    'aria-label': clickData['aria-label'] || '',

    position: clickData.position || null,
    parent: clickData.parent || null,
    childrenCount: clickData.childrenCount || 0,
    path: clickData.path || '',
    'data-*': clickData['data-*'] || null,

    pageUrl: clickData.pageUrl || 'Unknown',
    pageTitle: clickData.pageTitle || '',
    time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}),
    timestamp: Date.now()
  };

  state.capturedClicks.unshift(newClick);

  if (state.capturedClicks.length > 500) {
    state.capturedClicks = state.capturedClicks.slice(0, 500);
  }

  saveClicks();
}

function buildDownloadFailedAlert(errorMessage) {
  const detail = errorMessage || 'Unknown error';
  return `Download failed.\nPlease make sure you are on the Filevine page and still logged in.\n\nError details: ${detail}`;
}

function ensureContentScript(tabId) {
  return new Promise((resolve) => {
    if (!chrome.scripting || !tabId) {
      resolve(false);
      return;
    }

    chrome.scripting.executeScript(
      {
        target: { tabId, allFrames: true },
        files: ['content.js']
      },
      () => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(true);
      }
    );
  });
}

function handleDownloadStatusMessage(message) {
  if (message.context === 'sync_upload') {
    const total = Number(message.total || 0);
    const completed = Number(message.completed || 0);
    const succeeded = Number(message.succeeded || 0);
    const failed = Number(message.failed || 0);
    const skipped = Number(message.skipped || 0);

    if (message.stage === 'upload_started') {
      setDetailSyncStatus(`Uploading in progress: 0/${total} files`, 'info');
      return;
    }

    if (message.stage === 'upload_in_progress') {
      setDetailSyncStatus(
        `Uploading in progress: ${completed}/${total} files (Success: ${succeeded}, Failed: ${failed}, Skipped: ${skipped})`,
        failed > 0 ? 'error' : 'info'
      );
      return;
    }

    if (message.stage === 'upload_completed') {
      if (failed === 0 && succeeded > 0) {
        setDetailSyncStatus(
          `Uploaded successfully: ${succeeded}/${total} files${skipped ? ` (${skipped} skipped)` : ''}.`,
          'success'
        );
      } else if (total === 0) {
        setDetailSyncStatus('No files found to upload.', 'info');
      } else {
        setDetailSyncStatus(
          `Upload completed with errors. Uploaded ${succeeded}/${total} files${skipped ? ` (${skipped} skipped)` : ''}.`,
          'error'
        );
      }
      setTimeout(() => {
        hideDetailSyncStatus();
      }, 5000);
      return;
    }
  }

  const total = Number(message.total || 0);
  const completed = Number(message.completed || 0);
  const succeeded = Number(message.succeeded || 0);
  const failed = Number(message.failed || 0);

  if (message.stage === 'started') {
    setDownloadStatus(`Download in progress: 0/${total} files downloaded`, 'info');
    return;
  }

  if (message.stage === 'in_progress') {
    setDownloadStatus(
      `Download in progress: ${completed}/${total} files downloaded (Success: ${succeeded}, Failed: ${failed})`,
      failed > 0 ? 'error' : 'info'
    );
    return;
  }

  if (message.stage === 'completed') {
    if (failed === 0 && total > 0) {
      setDownloadStatus(
        `All files downloaded successfully: ${succeeded}/${total} files.`,
        'success'
      );
    } else if (total === 0) {
      setDownloadStatus('No files found to download.', 'error');
    } else {
      setDownloadStatus(
        `Download completed with errors. Downloaded ${succeeded}/${total} files.`,
        'error'
      );
    }
    setTimeout(() => {
      const downloadStatus = document.getElementById('downloadStatus');
      if (downloadStatus) downloadStatus.classList.add('hidden');
    }, 5000);
  }
}

function downloadByDocumentId(documentId, pageUrl) {
  if (!documentId) {
    alert('No document ID found for this item.');
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, async function(tabs) {
    if (!tabs || !tabs[0]) {
      alert('No active tab found.');
      return;
    }

    await ensureContentScript(tabs[0].id);

    chrome.tabs.sendMessage(
      tabs[0].id,
      {
        type: 'DOWNLOAD_DOCUMENT_BY_ID',
        documentId: documentId,
        pageUrl: pageUrl
      },
      function(response) {
        if (chrome.runtime.lastError) {
          alert(buildDownloadFailedAlert(chrome.runtime.lastError.message));
          return;
        }

        if (!response || !response.ok) {
          alert(buildDownloadFailedAlert(response?.error || 'Unknown error'));
          return;
        }

        console.log('Download started from URL:', response.downloadUrl);
        setDownloadStatus('Download started successfully!', 'success');
        setTimeout(() => {
          const downloadStatus = document.getElementById('downloadStatus');
          if (downloadStatus) downloadStatus.classList.add('hidden');
        }, 3000);
      }
    );
  });
}

async function downloadAllFiles() {
  setDownloadStatus('Download in progress: preparing files...', 'info');

  chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
    if (!tabs || !tabs[0]) {
      setDownloadStatus('No active tab found', 'error');
      return;
    }

    const injected = await ensureContentScript(tabs[0].id);
    if (!injected) {
      setDownloadStatus('Unable to initialize Filevine helper. Please refresh the page and try again.', 'error');
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, {
      type: 'DOWNLOAD_ALL_FILES'
    }, function(response) {
      if (chrome.runtime.lastError) {
        setDownloadStatus(`Download failed: ${chrome.runtime.lastError.message}. Please refresh the page.`, 'error');
        return;
      }

      if (!response) return;
      if (response.ok === false) {
        setDownloadStatus(`Download failed: ${response.error || 'Unknown error'}`, 'error');
        return;
      }

      setDownloadStatus('Download completed successfully!', 'success');
      setTimeout(() => {
        const downloadStatus = document.getElementById('downloadStatus');
        if (downloadStatus) downloadStatus.classList.add('hidden');
      }, 3000);
    });
  });
}

function exportData() {
  if (state.capturedClicks.length === 0) {
    alert('No clicks to export');
    return;
  }

  const csvData = [
    ['Type', 'Text', 'Tag', 'Classes', 'ID', 'Href', 'Time', 'Page URL'],
    ...state.capturedClicks.map(click => [
      click.type,
      click.text,
      click.tagName,
      click.classes,
      click.id || '',
      click.href || '',
      click.time,
      click.pageUrl
    ])
  ].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

  const blob = new Blob([csvData], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `clicks_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function openDemandNoteDetail(noteId) {
  state.currentDemandNoteId = noteId;

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
    const data = await getDemandNoteDetail(noteId);
    console.log('Demand note detail response:', data);
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
    const documents = Array.isArray(documentsRaw) ? documentsRaw : [];
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
    if (detailEl) {
      detailEl.innerHTML = `
        <div class="detail-view">
          <div style="font-size:13px; color:#b91c1c;">${escapeHtml(error.message || 'Failed to load detail')}</div>
        </div>
      `;
    }
  }
}

async function syncFilesForDemandNote(demandNoteId) {
  if (!demandNoteId) {
    setDetailSyncStatus('No demand note selected', 'error');
    return;
  }

  setDetailSyncStatus('Checking for Filevine page...', 'info');
  setDetailSyncing(true);

  try {
    const syncTab = await new Promise((resolve) => {
      chrome.tabs.query({ currentWindow: true }, (tabs) => {
        const isFilevineTab = (tab) => {
          const tabUrl = String(tab?.url || '').toLowerCase();
          return tabUrl.includes('filevine') || tabUrl.includes('vinesign');
        };

        const activeTab = Array.isArray(tabs) ? tabs.find((tab) => tab.active) : null;
        if (activeTab && isFilevineTab(activeTab)) {
          resolve(activeTab);
          return;
        }

        const filevineTab = Array.isArray(tabs) ? tabs.find(isFilevineTab) : null;
        resolve(filevineTab || null);
      });
    });

    if (!syncTab || !syncTab.id) {
      setDetailSyncStatus('Open a Filevine project tab, then click Sync Now', 'error');
      setDetailSyncing(false);
      return;
    }

    const injected = await ensureContentScript(syncTab.id);
    if (!injected) {
      setDetailSyncStatus('Unable to initialize Filevine helper. Please refresh the page and try again.', 'error');
      setDetailSyncing(false);
      return;
    }

    setDetailSyncStatus('Downloading Medical Provider Records from Filevine...', 'info');

    const downloadResult = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(
        syncTab.id,
        {
          type: 'SYNC_MEDICAL_RECORDS',
          demandNoteId: demandNoteId
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });

    if (!downloadResult || downloadResult.ok === false) {
      if (downloadResult?.error) {
        setDetailSyncStatus(`Download failed: ${downloadResult.error}`, 'error');
      } else {
        setDetailSyncStatus('Download failed. Please refresh the page and try again.', 'error');
      }
      setDetailSyncing(false);
      return;
    }

    const totalDownloaded = downloadResult.succeeded || 0;
    const totalSkipped = downloadResult.skipped || 0;

    if (totalDownloaded === 0 && totalSkipped > 0) {
      setDetailSyncStatus(`All Medical Provider Records already synced (${totalSkipped} files skipped)`, 'success');
      setDetailSyncing(false);
      await openDemandNoteDetail(demandNoteId);
      setTimeout(() => {
        hideDetailSyncStatus();
      }, 5000);
      return;
    }

    if (totalDownloaded === 0) {
      setDetailSyncStatus('No Medical Provider Records found to sync', 'info');
      setDetailSyncing(false);
      return;
    }

    setDetailSyncStatus(`Uploading ${totalDownloaded} Medical Provider Records to database...`, 'info');

    const uploadedFiles = downloadResult.uploadedFiles || [];

    if (uploadedFiles.length > 0) {
      setDetailSyncStatus(`Successfully uploaded ${uploadedFiles.length} Medical Provider Records!`, 'success');
    } else {
      setDetailSyncStatus(`Downloaded ${totalDownloaded} files. Upload to backend pending.`, 'success');
    }

    await openDemandNoteDetail(demandNoteId);

    setTimeout(() => {
      hideDetailSyncStatus();
    }, 5000);
  } catch (error) {
    console.error('Sync error:', error);
    setDetailSyncStatus(`Sync failed: ${error.message}`, 'error');
  } finally {
    setDetailSyncing(false);
  }
}

function setupEventListeners() {
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => setActiveView(tab.dataset.view));
  });

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await signOutSession();
      await chrome.storage.local.remove(['authToken', 'user', 'isAuthenticated', 'authExpiry', 'capturedClicks']);
      window.location.href = 'login.html';
    });
  }

  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.classList.add('refreshing');
      await loadDemandNotes(true);
      refreshBtn.classList.remove('refreshing');
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

  const downloadAllBtn = document.getElementById('downloadAllBtn');
  if (downloadAllBtn) {
    downloadAllBtn.addEventListener('click', downloadAllFiles);
  }

  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportData);
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

  const syncNowBtn = document.getElementById('syncNowBtn');
  if (syncNowBtn) {
    syncNowBtn.addEventListener('click', () => {
      console.log('=== Sync Now button clicked ===');
      console.log('currentDemandNoteId:', state.currentDemandNoteId);
      console.log('Session expected for sync.');

      if (state.currentDemandNoteId) {
        syncFilesForDemandNote(state.currentDemandNoteId);
      } else {
        console.error('No demand note selected - currentDemandNoteId is null');
        setDetailSyncStatus('No demand note selected', 'error');
      }
    });
  } else {
    console.error('syncNowBtn not found in DOM');
  }
}

async function loadDemandNotes(full = true) {
  state.loading = true;
  setSyncing(true);
  setSyncStatus('Loading demand notes...');

  try {
    const data = await getDemandNotes(full);
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

async function init() {
  const authData = await chrome.storage.local.get(['capturedClicks']);
  const session = await getSession();

  if (!session?.user) {
    window.location.href = 'login.html';
    return;
  }

  const rawUser = session.user || {};
  const normalizedUser = {
    ...rawUser,
    firstName: rawUser.firstName || (rawUser.name ? rawUser.name.split(' ')[0] : ''),
    lastName: rawUser.lastName || (rawUser.name ? rawUser.name.split(' ').slice(1).join(' ') : '')
  };

  state.user = normalizedUser;

  if (authData.capturedClicks) {
    state.capturedClicks = authData.capturedClicks;
  }

  const expiry = session.expires ? Date.parse(session.expires) : Date.now() + (24 * 60 * 60 * 1000);
  await chrome.storage.local.set({
    user: normalizedUser,
    isAuthenticated: true,
    authExpiry: expiry
  });

  populateUser(state.user);
  setupEventListeners();
  updateTime();
  setInterval(updateTime, 1000);
  setActiveView('demand-notes');
  await loadDemandNotes(true);

  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    console.log('Message received in popup:', message);

    if (message.type === 'CLICK_CAPTURED') {
      addClick(message.data);
    }

    if (message.type === 'CLICKS_UPDATED') {
      state.capturedClicks = message.clicks;
    }

    if (message.type === 'DOWNLOAD_STATUS') {
      handleDownloadStatusMessage(message);
    }

    return true;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    console.error('Popup init failed:', error);
    window.location.href = 'login.html';
  });
});
