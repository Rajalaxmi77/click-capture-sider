console.log('Background script loaded');

// Store all captured clicks
let allClicks = [];
let isCapturing = true;

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
chrome.storage.local.get(['capturedClicks'], function(result) {
    if (result.capturedClicks) {
        allClicks = result.capturedClicks;
        console.log('Loaded', allClicks.length, 'clicks from storage');
    }
});

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

        case 'CLICK_CAPTURED':
            if (isCapturing) {
                const clickData = message.data;

                // Add timestamp
                clickData.timestamp = Date.now();
                clickData.time = new Date().toLocaleTimeString();

                // Add to array
                allClicks.unshift(clickData);

                // Keep only last 1000 clicks
                if (allClicks.length > 1000) {
                    allClicks = allClicks.slice(0, 1000);
                }

                // Save to storage
                chrome.storage.local.set({capturedClicks: allClicks}, function() {
                    console.log('Saved click to storage. Total:', allClicks.length);
                });

                // Forward to side panel if it's open
                chrome.runtime.sendMessage({
                    type: 'CLICK_CAPTURED',
                    data: clickData
                }).catch(() => {
                    // Side panel might not be open
                });
            }
            break;

        case 'URL_CHANGED':
            // Handle URL changes from content script (SPA navigation)
            console.log('URL changed message received:', message.newUrl);

            // Update recent clicks that might have wrong URLs
            if (message.newUrl && message.oldUrl) {
                let updated = false;
                allClicks = allClicks.map(click => {
                    // Update clicks that have the old URL and were captured recently
                    if (click.pageUrl === message.oldUrl &&
                        click.timestamp &&
                        Date.now() - click.timestamp < 5000) {
                        click.pageUrl = message.newUrl;
                        click.wasUpdated = true;
                        updated = true;
                    }
                    return click;
                });

                if (updated) {
                    chrome.storage.local.set({capturedClicks: allClicks}, function() {
                        console.log('Updated click URLs after navigation');
                    });

                    // Notify side panel to refresh
                    chrome.runtime.sendMessage({
                        type: 'CLICKS_UPDATED',
                        clicks: allClicks
                    }).catch(() => {
                        // Side panel might not be open
                    });
                }
            }
            break;

        case 'GET_CLICKS':
            sendResponse({ clicks: allClicks });
            break;

        case 'TOGGLE_CAPTURE':
            isCapturing = message.isCapturing;
            console.log('Capture toggled in background:', isCapturing);
            break;

        case 'CLEAR_CLICKS':
            allClicks = [];
            chrome.storage.local.set({capturedClicks: []});
            break;

        case 'CLICKS_UPDATED':
            chrome.storage.local.set({capturedClicks: message.clicks});
            break;

        case 'DOWNLOAD_STATUS':
            chrome.runtime.sendMessage(message).catch(() => {
                // Side panel might not be open.
            });
            break;

        case 'UPLOAD_FILE_TO_BACKEND':
            (async () => {
                try {
                    const { authToken, blob, fileName, demandNoteId, fileCategory, fileUrl, apiOrigin } = message || {};

                    if (!authToken) {
                        sendResponse({ success: false, error: 'Missing auth token' });
                        return;
                    }

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

                    const response = await fetch('http://localhost:3000/api/upload', {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${authToken}`
                        },
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
                    const { authToken, demandNoteId } = message || {};
                    if (!authToken) {
                        sendResponse({ success: false, error: 'Missing auth token' });
                        return;
                    }
                    if (!demandNoteId) {
                        sendResponse({ success: false, error: 'Missing demand note ID' });
                        return;
                    }

                    const response = await fetch(`http://localhost:3000/api/demand-notes/${encodeURIComponent(String(demandNoteId))}/files`, {
                        method: 'GET',
                        headers: {
                            Authorization: `Bearer ${authToken}`
                        }
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

    chrome.storage.local.get(['capturedClicks'], function(result) {
        if (!result.capturedClicks) {
            chrome.storage.local.set({capturedClicks: []});
        }
    });
});
