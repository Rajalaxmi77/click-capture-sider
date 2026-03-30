console.log('Background script loaded');

const API_URL = 'http://localhost:3000';

async function configureSidePanel() {
    if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) {
        console.warn('Side Panel API is not fully available in this browser version.');
        return;
    }

    try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
        console.log('Side panel behavior configured: open on extension icon click');
    } catch (error) {
        console.error('Failed to configure side panel behavior:', error);
    }
}

// Configure on worker startup and after install/update
configureSidePanel();

// Load clicks from storage on startup
chrome.storage.local.get([], function() {});

// Fallback for browsers that support sidePanel.open but don't honor panel behavior
chrome.action.onClicked.addListener(async (tab) => {
    if (!tab || !tab.id || !chrome.sidePanel || !chrome.sidePanel.open) return;

    try {
        await chrome.sidePanel.open({ tabId: tab.id });
    } catch (error) {
        console.error('Failed to open side panel on action click:', error);
    }
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    console.log('Background received message:', message.type);

    switch (message.type) {
        case 'DOWNLOAD_FILE':
            chrome.downloads.download(
                {
                    url: message.url,
                    filename: message.filename || undefined,
                    conflictAction: 'uniquify'
                },
                (downloadId) => {
                    if (chrome.runtime.lastError) {
                        console.error('Download failed:', message.url, chrome.runtime.lastError.message);
                        return;
                    }
                    console.log('Download started:', downloadId, message.url);
                }
            );
            break;


        case 'DOWNLOAD_STATUS':
            chrome.runtime.sendMessage(message).catch(() => {
                // Side panel might not be open.
            });
            break;

        case 'UPLOAD_FILE_TO_BACKEND':
            (async () => {
                try {
                    const { blob, fileName, demandNoteId, fileCategory, fileUrl, apiOrigin, projectId, applicationType, sourceDocumentId } = message || {};

                    if (!demandNoteId) {
                        sendResponse({ success: false, error: 'Missing demand note ID' });
                        return;
                    }

                    let fileBlob = blob || null;
                    if (!fileBlob && fileUrl) {
                        const normalizedUrl = String(fileUrl || '').startsWith('http')
                            ? String(fileUrl)
                            : `${String(apiOrigin || '').replace(/\/$/, '')}${String(fileUrl || '')}`;

                        const fetchOptions = { method: 'GET' };
                        if (/^https?:/i.test(normalizedUrl)) {
                            fetchOptions.credentials = 'include';
                        }

                        const fileRes = await fetch(normalizedUrl, fetchOptions);
                        if (!fileRes.ok) {
                            sendResponse({
                                success: false,
                                error: `Failed to fetch file for upload (${fileRes.status})`
                            });
                            return;
                        }
                        fileBlob = await fileRes.blob();
                    }

                    if (!fileBlob) {
                        sendResponse({ success: false, error: 'Missing file payload (blob/url)' });
                        return;
                    }

                    const formData = new FormData();
                    formData.append('file', fileBlob, fileName || 'document.pdf');
                    formData.append('demandNoteId', String(demandNoteId));
                    formData.append('fileCategory', fileCategory || 'Document');
                    if (projectId) {
                        formData.append('projectId', String(projectId));
                    }
                    if (applicationType) {
                        formData.append('applicationType', String(applicationType));
                    }
                    if (sourceDocumentId) {
                        formData.append('sourceDocumentId', String(sourceDocumentId));
                    }

                    const response = await fetch(`${API_URL}/api/upload`, {
                        method: 'POST',
                        credentials: 'include',
                        body: formData
                    });

                    if (!response.ok) {
                        const errorText = await response.text().catch(() => '');
                        sendResponse({
                            success: false,
                            error: errorText || `Upload failed (${response.status})`
                        });
                        return;
                    }

                    const payload = await response.json().catch(() => ({}));
                    sendResponse({
                        success: true,
                        file: payload?.file || null
                    });
                } catch (error) {
                    sendResponse({
                        success: false,
                        error: error?.message || 'Upload failed in background'
                    });
                }
            })();
            break;

        case 'GET_DEMAND_NOTE_FILES':
            (async () => {
                try {
                    const { demandNoteId } = message || {};
                    if (!demandNoteId) {
                        sendResponse({ success: false, error: 'Missing demand note ID' });
                        return;
                    }

                    const response = await fetch(`${API_URL}/api/demand-notes/${encodeURIComponent(String(demandNoteId))}/files`, {
                        method: 'GET',
                        credentials: 'include'
                    });

                    if (!response.ok) {
                        const errorText = await response.text().catch(() => '');
                        sendResponse({
                            success: false,
                            error: errorText || `Failed to fetch demand note files (${response.status})`
                        });
                        return;
                    }

                    const payload = await response.json().catch(() => ({}));
                    sendResponse({
                        success: true,
                        files: Array.isArray(payload?.files) ? payload.files : []
                    });
                } catch (error) {
                    sendResponse({
                        success: false,
                        error: error?.message || 'Failed to fetch demand note files'
                    });
                }
            })();
            break;
    }

    return true;
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(function(details) {
    console.log('Extension installed/updated:', details.reason);

    configureSidePanel();

    chrome.storage.local.get([], function() {});
});
