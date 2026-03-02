console.log('Click Capture content script loaded');

// Initialize click tracking
let isCapturing = true;

function normalizeUrl(url) {
    if (!url) return '';
    try {
        return new URL(url, window.location.href).href;
    } catch (error) {
        return '';
    }
}

function getDatasetUrl(element) {
    if (!element || !element.dataset) return '';
    const urlKeys = ['url', 'href', 'downloadUrl', 'downloadurl', 'fileUrl', 'fileurl', 'link'];

    for (const key of urlKeys) {
        if (element.dataset[key]) {
            return normalizeUrl(element.dataset[key]);
        }
    }

    for (const key of Object.keys(element.dataset)) {
        if (key.toLowerCase().includes('url') || key.toLowerCase().includes('href')) {
            return normalizeUrl(element.dataset[key]);
        }
    }

    return '';
}

function getDocumentContainer(element) {
    if (!element || !element.closest) return null;
    return element.closest('[id^="list-item-doc-"], [id^="list-item-folder-"]');
}

function getDocumentId(element) {
    const container = getDocumentContainer(element);
    if (!container || !container.id) return '';

    const docMatch = container.id.match(/^list-item-doc-(\d+)$/);
    if (docMatch) return docMatch[1];

    const folderMatch = container.id.match(/^list-item-folder-(\d+)$/);
    if (folderMatch) return folderMatch[1];

    return '';
}

function resolveTargetUrl(target) {
    const directAnchor = target.closest && target.closest('a[href]');
    if (directAnchor) {
        return normalizeUrl(directAnchor.getAttribute('href') || directAnchor.href || '');
    }

    const targetHref = normalizeUrl(target.href || target.getAttribute?.('href') || '');
    if (targetHref) return targetHref;

    const targetDataUrl = getDatasetUrl(target);
    if (targetDataUrl) return targetDataUrl;

    const container = getDocumentContainer(target) || target;

    const preferredLink = container.querySelector?.(
        'a[href$=".pdf"], a[href*=".pdf?"], a[download], a[href*="/download"], a[href*="download"], a[href]'
    );
    if (preferredLink) {
        return normalizeUrl(preferredLink.getAttribute('href') || preferredLink.href || '');
    }

    const containerDataUrl = getDatasetUrl(container);
    if (containerDataUrl) return containerDataUrl;

    return '';
}

// Function to get element type
function getElementType(element) {
    const tagName = element.tagName.toLowerCase();
    
    if (tagName === 'a') return 'link';
    if (tagName === 'button') return 'button';
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return 'input';
    if (tagName === 'div') return 'div';
    if (tagName === 'span') return 'span';
    if (element.getAttribute('role') === 'button') return 'button';
    
    return 'other';
}

// Get all data-* attributes
function getDataAttributes(element) {
    const dataAttrs = {};
    if (element.dataset) {
        for (let key in element.dataset) {
            dataAttrs[key] = element.dataset[key];
        }
    }
    return Object.keys(dataAttrs).length > 0 ? dataAttrs : null;
}

// Get element's DOM path
function getElementPath(element) {
    const path = [];
    let current = element;
    
    while (current && current !== document.body) {
        let selector = current.tagName.toLowerCase();
        
        if (current.id) {
            selector += '#' + current.id;
        } else if (current.className && typeof current.className === 'string') {
            const classes = current.className.trim().split(/\s+/);
            if (classes.length > 0) {
                selector += '.' + classes.join('.');
            }
        }
        
        if (current.parentElement) {
            const siblings = Array.from(current.parentElement.children);
            const index = siblings.indexOf(current);
            if (index > 0) {
                selector += `:nth-child(${index + 1})`;
            }
        }
        
        path.unshift(selector);
        current = current.parentElement;
    }
    
    return path.join(' > ');
}

// Enhanced getElementText to capture more content
function getElementText(element) {
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        return element.value || element.placeholder || element.name || element.type || 'Input';
    }
    
    if (element.tagName === 'SELECT') {
        const selected = element.options[element.selectedIndex];
        return selected ? selected.text : 'Select';
    }
    
    if (element.tagName === 'IMG') {
        return element.alt || element.src.split('/').pop() || 'Image';
    }
    
    let text = '';
    text = element.textContent || element.innerText || '';
    text = text.trim().replace(/\s+/g, ' ').substring(0, 500);
    
    if (!text || text.length < 2) {
        text = element.title || 
               element.getAttribute('aria-label') || 
               element.getAttribute('placeholder') ||
               element.alt ||
               element.name ||
               '';
    }
    
    if (!text && element.href) {
        text = element.href;
    }
    
    if (!text && element.value) {
        text = element.value;
    }
    
    return text || 'No text content';
}

// Click listener - FIXED VERSION
document.addEventListener('click', function(event) {
    if (!isCapturing) return;
    
    const target = event.target;
    const elementType = getElementType(target);
    
    const targetUrl = resolveTargetUrl(target);
    const documentId = getDocumentId(target);

    // Keep documentId on click payload for UI visibility.
    
    // Prepare basic click data
    const clickData = {
        type: elementType,
        text: getElementText(target),
        tagName: target.tagName,
        classes: target.className || '',
        id: target.id || '',
        href: targetUrl,
        downloadUrl: targetUrl,
        documentId: documentId,
        src: target.src || target.getAttribute('src') || '',
        alt: target.alt || target.getAttribute('alt') || '',
        title: target.title || target.getAttribute('title') || '',
        name: target.name || target.getAttribute('name') || '',
        value: target.value || target.getAttribute('value') || '',
        typeAttr: target.type || target.getAttribute('type') || '',
        role: target.getAttribute('role') || '',
        'aria-label': target.getAttribute('aria-label') || '',
        
        // Page context - use target URL for navigation, otherwise use current URL
        pageUrl: targetUrl || window.location.href,
        pageTitle: document.title,
        originalPageUrl: window.location.href
    };
    
    // Get optional data
    try {
        const rect = target.getBoundingClientRect();
        clickData.position = {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        };
        
        if (target.parentElement) {
            clickData.parent = {
                tag: target.parentElement.tagName,
                classes: target.parentElement.className || '',
                id: target.parentElement.id || ''
            };
        }
        
        clickData.childrenCount = target.children ? target.children.length : 0;
        clickData.path = getElementPath(target);
        clickData['data-*'] = getDataAttributes(target);
        
    } catch (error) {
        console.log('Could not get some element details:', error);
    }
    
    console.log('Click captured:', clickData);
    
    // Sends click info to background script
    try {
        chrome.runtime.sendMessage({
            type: 'CLICK_CAPTURED',
            data: clickData
        });
    } catch (error) {
        console.log('Error sending message:', error);
    }
}, true);

// Listen for URL changes (for SPA hash routing like Filevine)
let lastUrl = window.location.href;

function checkUrlChange() {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
        console.log('URL changed from', lastUrl, 'to', currentUrl);
        const oldUrl = lastUrl;
        lastUrl = currentUrl;
        
        try {
            chrome.runtime.sendMessage({
                type: 'URL_CHANGED',
                newUrl: currentUrl,
                oldUrl: oldUrl
            });
        } catch (error) {
            console.log('Error sending URL change:', error);
        }
    }
}

window.addEventListener('hashchange', function() {
    console.log('Hash changed:', window.location.hash);
    checkUrlChange();
});

window.addEventListener('popstate', function() {
    console.log('Popstate event:', window.location.href);
    checkUrlChange();
});

setInterval(checkUrlChange, 1000);

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    console.log('Content script received message:', message);
    
    if (message.type === 'TOGGLE_CAPTURE') {
        isCapturing = message.isCapturing;
        console.log('Capture toggled:', isCapturing);
    }
    
    if (message.type === 'GET_CLICKS') {
        chrome.runtime.sendMessage({type: 'GET_CLICKS'}, function(response) {
            sendResponse(response);
        });
        return true;
    }

    // for downloading files based on user selection in the side panel
    if (message.type === 'DOWNLOAD_ALL_FILES') {
        // Prevent duplicate bulk downloads when content script runs in all frames.
        if (window.top !== window) {
            sendResponse({
                ok: false,
                skipped: true,
                reason: 'ignored_in_non_top_frame'
            });
            return true;
        }

        // Documents menu flow:
        // 1) /api/projects/{projectId}/limitedProjectFolderTree
        // 2) /api/docs/project/{projectId}
        // 3) per doc => ExistsForFilevineDocumentIds -> details -> download

        const projectId = getProjectIdFromUrl(window.location.href);
        if (!projectId) {
            sendResponse({
                ok: false,
                mode: 'documents_menu_project_api',
                error: 'Missing project ID in current URL'
            });
            return true;
        }

        (async () => {
            const fromDocsMenuApi = await getDocumentsMenuProjectDocIds(projectId, window.location.href);
            if (fromDocsMenuApi.ids.length === 0) {
                sendResponse({
                    ok: false,
                    mode: 'documents_menu_project_api',
                    projectId,
                    error: 'No documents returned from /api/docs/project'
                });
                return;
            }

            const result = await downloadDocumentIdsSequentially(fromDocsMenuApi.ids, window.location.href);
            sendResponse({
                mode: 'documents_menu_project_api',
                projectId,
                requestedFromProjectApi: fromDocsMenuApi.ids.length,
                descendantFolderCount: fromDocsMenuApi.descendantFolderIDs.length,
                maxChildrenPerFolder: fromDocsMenuApi.maxChildrenPerFolder,
                ...result
            });
        })();
        return true;
    }

    if (message.type === 'DOWNLOAD_DOCUMENT_BY_ID') {
        downloadDocumentById(message.documentId, message.pageUrl).then(sendResponse);
        return true;
    }
    
    return true;
});

// Inject styles for debugging
const style = document.createElement('style');
style.textContent = `
    .click-capture-highlight {
        outline: 2px solid #ff0000 !important;
        outline-offset: 2px !important;
        transition: outline 0.3s ease !important;
    }
`;
document.head.appendChild(style);

function extractUrlsFromObject(value, out, depth = 0) {
    if (!value || depth > 8) return;

    if (typeof value === 'string') {
        const asUrl = normalizeUrl(value);
        if (asUrl && /^https?:/i.test(asUrl)) {
            out.add(asUrl);
        }
        return;
    }

    if (Array.isArray(value)) {
        value.forEach(item => extractUrlsFromObject(item, out, depth + 1));
        return;
    }

    if (typeof value === 'object') {
        Object.values(value).forEach(item => extractUrlsFromObject(item, out, depth + 1));
    }
}

function chooseBestFileUrl(urls, documentId) {
    const list = Array.from(urls);
    if (!list.length) return '';

    const score = (url) => {
        let points = 0;
        if (/\.pdf(?:$|[?#])/i.test(url)) points += 60;
        if (/\/download\b/i.test(url)) points += 40;
        if (new RegExp(`/api/docs/${documentId}/`, 'i').test(url)) points += 35;
        if (/[?&](docid|id)=/i.test(url)) points += 20;
        if (/[?&](filename|response-content-disposition)=/i.test(url)) points += 20;
        if (/\.(js|css|map|html?)(?:$|[?#])/i.test(url)) points -= 100;
        return points;
    };

    list.sort((a, b) => score(b) - score(a));
    return list[0];
}

function getProjectIdFromUrl(pageUrl) {
    const source = pageUrl || window.location.href;
    const match = source.match(/\/project\/(\d+)/i);
    return match ? match[1] : '';
}

function getOriginFromPageUrl(pageUrl) {
    if (pageUrl) {
        try {
            return new URL(pageUrl).origin;
        } catch (error) {
            // fall through
        }
    }
    return window.location.origin;
}

function extractDescendantFolderIds(treePayload) {
    const ids = new Set();
    const candidates = [
        treePayload?.descendantFolderIDs,
        treePayload?.descendantFolderIds,
        treePayload?.data?.descendantFolderIDs,
        treePayload?.data?.descendantFolderIds
    ];

    candidates.forEach((list) => {
        if (!Array.isArray(list)) return;
        list.forEach((item) => {
            const id = String(item || '').trim();
            if (/^\d+$/.test(id)) ids.add(id);
        });
    });

    return Array.from(ids);
}

async function getDocumentsMenuProjectDocIds(projectId, pageUrl) {
    if (!projectId) return { ids: [], descendantFolderIDs: [], maxChildrenPerFolder: 500 };

    const origin = getOriginFromPageUrl(pageUrl);
    const folderTreeUrl = `${origin}/api/projects/${projectId}/limitedProjectFolderTree`;
    const docsByProjectUrl = `${origin}/api/docs/project/${projectId}`;

    let descendantFolderIDs = [];
    let maxChildrenPerFolder = 500;

    try {
        const treeRes = await fetch(folderTreeUrl, {
            method: 'POST',
            credentials: 'include',
            headers: {
                Accept: 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        if (treeRes.ok) {
            const treePayload = await treeRes.json();
            descendantFolderIDs = extractDescendantFolderIds(treePayload);
            const maxChildren =
                treePayload?.maxChildrenPerFolder ??
                treePayload?.data?.maxChildrenPerFolder;
            if (Number.isFinite(Number(maxChildren)) && Number(maxChildren) > 0) {
                maxChildrenPerFolder = Number(maxChildren);
            }
        }
    } catch (error) {
        // Keep fallback defaults.
    }

    const payloadCandidates = [
        { descendantFolderIDs, maxChildrenPerFolder },
        { descendantFolderIds: descendantFolderIDs, maxChildrenPerFolder },
        { folderIDs: descendantFolderIDs, maxChildrenPerFolder },
        { folderIds: descendantFolderIDs, maxChildrenPerFolder },
        { descendantFolderIDs },
        { descendantFolderIds: descendantFolderIDs },
        {}
    ];

    for (const payload of payloadCandidates) {
        try {
            const res = await fetch(docsByProjectUrl, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    Accept: 'application/json, text/plain, */*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) continue;

            const docsPayload = await res.json();
            const rows = Array.isArray(docsPayload?.data) ? docsPayload.data : [];
            const ids = rows
                .map((row) => String(row?.id || '').trim())
                .filter((id) => /^\d+$/.test(id));

            if (ids.length > 0) {
                return {
                    ids: Array.from(new Set(ids)),
                    descendantFolderIDs,
                    maxChildrenPerFolder
                };
            }
        } catch (error) {
            // Try next payload shape.
        }
    }

    return { ids: [], descendantFolderIDs, maxChildrenPerFolder };
}

async function downloadDocumentIdsSequentially(documentIds, pageUrl) {
    const uniqueIds = Array.from(
        new Set(
            (documentIds || [])
                .map((id) => String(id || '').trim())
                .filter((id) => /^\d+$/.test(id))
        )
    );

    const perDocResults = [];
    for (const id of uniqueIds) {
        const singleResult = await downloadDocumentById(id, pageUrl);
        perDocResults.push({
            id,
            ok: !!singleResult?.ok,
            error: singleResult?.error || ''
        });
    }

    const successCount = perDocResults.filter((r) => r.ok).length;
    return {
        ok: successCount > 0,
        requested: uniqueIds.length,
        succeeded: successCount,
        failed: uniqueIds.length - successCount,
        details: perDocResults
    };
}

function parseFileNameFromContentDisposition(headerValue) {
    if (!headerValue) return '';

    const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match && utf8Match[1]) {
        try {
            return decodeURIComponent(utf8Match[1]).trim().replace(/^["']|["']$/g, '');
        } catch (error) {
            // keep going
        }
    }

    const fileNameMatch = headerValue.match(/filename="?([^"]+)"?/i);
    return fileNameMatch?.[1]?.trim() || '';
}

function triggerBlobDownload(blob, fileName) {
    const safeName = (fileName || 'document').replace(/[\\/:*?"<>|]+/g, '_');
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = safeName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}

function extractDocumentIdFromDetails(payload, fallbackId) {
    const preferredKeys = new Set(['id', 'docid', 'documentid', 'document_id']);

    function walk(value, depth = 0) {
        if (!value || depth > 8) return '';

        if (Array.isArray(value)) {
            for (const item of value) {
                const found = walk(item, depth + 1);
                if (found) return found;
            }
            return '';
        }

        if (typeof value === 'object') {
            for (const [key, item] of Object.entries(value)) {
                const normalizedKey = key.toLowerCase();
                if (preferredKeys.has(normalizedKey)) {
                    const candidate = String(item || '').match(/^\d+$/) ? String(item) : '';
                    if (candidate) return candidate;
                }
            }

            for (const item of Object.values(value)) {
                const found = walk(item, depth + 1);
                if (found) return found;
            }
        }

        return '';
    }

    return walk(payload) || String(fallbackId || '');
}

async function downloadDocumentById(documentId, pageUrl) {
    if (!documentId) {
        return { ok: false, error: 'Missing document ID' };
    }

    const origin = getOriginFromPageUrl(pageUrl);

    const existsUrl = `https://app.vinesign.com/integration/ExistsForFilevineDocumentIds?documentIds=${encodeURIComponent(documentId)}`;
    let existsResponse = null;
    try {
        const existsRes = await fetch(existsUrl, {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json, text/plain, */*' }
        });
        if (existsRes.ok) {
            const contentType = (existsRes.headers.get('content-type') || '').toLowerCase();
            existsResponse = contentType.includes('application/json')
                ? await existsRes.json()
                : await existsRes.text();
        }
    } catch (error) {
        // Non-blocking: continue to details/download.
    }

    // First fetch details to get the resolved document ID.
    const detailsUrl = `${origin}/api/docs/${documentId}/details`;
    try {
        const res = await fetch(detailsUrl, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
        });

        if (!res.ok) {
            return { ok: false, error: `Details API failed (${res.status})`, detailsUrl };
        }

        const payload = await res.json();
        const resolvedDocumentId = extractDocumentIdFromDetails(payload, documentId);
        const directDownloadUrl = `${origin}/api/docs/download/${resolvedDocumentId}`;

        const downloadRes = await fetch(directDownloadUrl, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        if (!downloadRes.ok) {
            return {
                ok: false,
                error: `Download API failed (${downloadRes.status})`,
                detailsUrl,
                resolvedDocumentId
            };
        }

        const contentType = (downloadRes.headers.get('content-type') || '').toLowerCase();
        let finalFileUrl = directDownloadUrl;
        if (contentType.includes('application/json')) {
            const downloadPayload = await downloadRes.json();
            const extractedUrls = new Set();
            extractUrlsFromObject(downloadPayload, extractedUrls);
            const bestUrl = chooseBestFileUrl(extractedUrls, resolvedDocumentId);

            if (!bestUrl) {
                return {
                    ok: false,
                    error: 'Download API returned JSON but no valid file URL',
                    detailsUrl,
                    resolvedDocumentId
                };
            }

            finalFileUrl = bestUrl;
            chrome.runtime.sendMessage({
                type: 'DOWNLOAD_FILE',
                url: finalFileUrl
            });
        } else {
            const blob = await downloadRes.blob();
            const fileName =
                parseFileNameFromContentDisposition(downloadRes.headers.get('content-disposition') || '') ||
                `document-${resolvedDocumentId}`;
            triggerBlobDownload(blob, fileName);
        }

        return {
            ok: true,
            downloadUrl: finalFileUrl,
            detailsUrl,
            resolvedDocumentId,
            existsUrl,
            existsResponse
        };
    } catch (error) {
        return {
            ok: false,
            error: error.message || 'Unknown error',
            detailsUrl,
            existsUrl,
            existsResponse
        };
    }
}

console.log('Click Capture ready - tracking all clicks');
