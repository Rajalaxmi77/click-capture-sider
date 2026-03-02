console.log('Click Capture content script loaded');

// Initialize click tracking
let isCapturing = true;
let lastSelectedDocument = null;
const selectedDocumentIds = new Set();

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

    if (documentId) {
        lastSelectedDocument = {
            documentId: documentId,
            pageUrl: window.location.href,
            selectedAt: Date.now()
        };
        selectedDocumentIds.add(documentId);
    }
    
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
        selectedDocumentIds.clear();
        
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
        const selectedIds = getAllSelectedDocumentIds();

        if (selectedIds.length > 1) {
            const perDocResults = [];
            (async () => {
                for (const id of selectedIds) {
                    const singleResult = await downloadDocumentById(id, window.location.href);
                    perDocResults.push({
                        id,
                        ok: !!singleResult?.ok,
                        error: singleResult?.error || ''
                    });
                }

                const successCount = perDocResults.filter((r) => r.ok).length;
                sendResponse({
                    ok: successCount > 0,
                    mode: 'loop_single_download',
                    requested: selectedIds.length,
                    succeeded: successCount,
                    failed: selectedIds.length - successCount,
                    details: perDocResults
                });
            })();
            return true;
        }

        if (selectedIds.length === 1) {
            downloadDocumentById(selectedIds[0], window.location.href).then((result) => {
                sendResponse({
                    mode: 'selected_document',
                    ...result
                });
            });
            return true;
        }

        // If user selected a specific Filevine document row, download only that file.
        if (lastSelectedDocument && lastSelectedDocument.documentId) {
            downloadDocumentById(
                lastSelectedDocument.documentId,
                lastSelectedDocument.pageUrl || window.location.href
            ).then((result) => {
                sendResponse({
                    mode: 'selected_document',
                    ...result
                });
            });
            return true;
        }

        // For medical records custom page, pull document IDs from the API used by that menu.
        if (isMedicalRecordsPage(window.location.href)) {
            (async () => {
                const projectId = getProjectIdFromUrl(window.location.href);
                const sectionKey = getCustomSectionKeyFromUrl(window.location.href);
                const apiDocIds = await getMedicalRecordsDocumentIds(projectId, sectionKey, window.location.href);
                const domDocIds = getAllDocumentIdsOnPage();
                const allIds = apiDocIds.length > 0 ? apiDocIds : domDocIds;

                if (!allIds.length) {
                    sendResponse({
                        ok: false,
                        mode: 'medical_records_custom_api',
                        error: 'No document IDs found in medical records section'
                    });
                    return;
                }

                const result = await downloadDocumentIdsSequentially(allIds, window.location.href);
                sendResponse({
                    mode: 'medical_records_custom_api',
                    projectId,
                    sectionKey,
                    sourceCounts: {
                        api: apiDocIds.length,
                        dom: domDocIds.length
                    },
                    ...result
                });
            })();
            return true;
        }

        // Documents menu flow:
        // 1) /api/projects/{projectId}/limitedProjectFolderTree
        // 2) /api/docs/project/{projectId}
        // 3) per doc => ExistsForFilevineDocumentIds -> details -> download
        const projectId = getProjectIdFromUrl(window.location.href);
        if (projectId) {
            (async () => {
                const fromDocsMenuApi = await getDocumentsMenuProjectDocIds(projectId, window.location.href);
                if (fromDocsMenuApi.ids.length > 0) {
                    const result = await downloadDocumentIdsSequentially(fromDocsMenuApi.ids, window.location.href);
                    sendResponse({
                        mode: 'documents_menu_project_api',
                        projectId,
                        requestedFromProjectApi: fromDocsMenuApi.ids.length,
                        descendantFolderCount: fromDocsMenuApi.descendantFolderIDs.length,
                        maxChildrenPerFolder: fromDocsMenuApi.maxChildrenPerFolder,
                        ...result
                    });
                    return;
                }

                // No docs from project API: fallback to visible rows.
                const pageDocIds = getAllDocumentIdsOnPage();
                if (pageDocIds.length > 0) {
                    const perDocResults = [];
                    for (const id of pageDocIds) {
                        const singleResult = await downloadDocumentById(id, window.location.href);
                        perDocResults.push({
                            id,
                            ok: !!singleResult?.ok,
                            error: singleResult?.error || ''
                        });
                    }

                    const successCount = perDocResults.filter((r) => r.ok).length;
                    sendResponse({
                        ok: successCount > 0,
                        mode: 'all_visible_docs_on_page',
                        requested: pageDocIds.length,
                        succeeded: successCount,
                        failed: pageDocIds.length - successCount,
                        details: perDocResults
                    });
                    return;
                }

                const urls = downloadAllFilesOnPage();
                sendResponse({
                    mode: 'page_scan',
                    ok: urls.length > 0,
                    count: urls.length
                });
            })();
            return true;
        }

        // No manual selection: download every visible document row on the current page.
        const pageDocIds = getAllDocumentIdsOnPage();
        if (pageDocIds.length > 0) {
            const perDocResults = [];
            (async () => {
                for (const id of pageDocIds) {
                    const singleResult = await downloadDocumentById(id, window.location.href);
                    perDocResults.push({
                        id,
                        ok: !!singleResult?.ok,
                        error: singleResult?.error || ''
                    });
                }

                const successCount = perDocResults.filter((r) => r.ok).length;
                sendResponse({
                    ok: successCount > 0,
                    mode: 'all_visible_docs_on_page',
                    requested: pageDocIds.length,
                    succeeded: successCount,
                    failed: pageDocIds.length - successCount,
                    details: perDocResults
                });
            })();
            return true;
        }

        const urls = downloadAllFilesOnPage();
        sendResponse({
            mode: 'page_scan',
            ok: urls.length > 0,
            count: urls.length
        });
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

function downloadAllFilesOnPage() {
    // Run once in the top frame to avoid duplicate scans in all_frames mode.
    if (window.top !== window) return [];

    const filePattern = /\.(pdf|doc|docx|xlsx|xls|png|jpe?g|csv|txt|zip)(?:$|[?#])/i;
    const downloadHintPattern = /(\/download\b|[?&](download|attachment|filename|response-content-disposition|docid)=)/i;
    const candidateUrls = new Set();

    function maybeAddUrl(rawUrl) {
        const url = normalizeUrl(rawUrl);
        if (!url) return;
        if (filePattern.test(url) || downloadHintPattern.test(url)) {
            candidateUrls.add(url);
        }
    }

    document.querySelectorAll('a[href], [data-url], [data-href], [data-file-url], [data-download-url], [src]').forEach(el => {
        if (el.hasAttribute('href')) maybeAddUrl(el.getAttribute('href'));
        if (el.hasAttribute('src')) maybeAddUrl(el.getAttribute('src'));

        const datasetUrl = getDatasetUrl(el);
        if (datasetUrl) maybeAddUrl(datasetUrl);
    });

    document.querySelectorAll('[onclick]').forEach(el => {
        const onclick = el.getAttribute('onclick') || '';
        const urlMatch = onclick.match(/https?:\/\/[^'" )]+/i);
        if (urlMatch) maybeAddUrl(urlMatch[0]);
    });

    const fileUrls = Array.from(candidateUrls);
    console.log('Found files:', fileUrls);

    fileUrls.forEach(url => {
        chrome.runtime.sendMessage({
            type: 'DOWNLOAD_FILE',
            url: url
        });
    });

    return fileUrls;
}

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

function getCustomSectionKeyFromUrl(pageUrl) {
    const source = pageUrl || window.location.href;
    const match = source.match(/\/custom\/([^/?#]+)/i);
    return match ? match[1] : '';
}

function isMedicalRecordsPage(pageUrl) {
    const key = getCustomSectionKeyFromUrl(pageUrl);
    return /^medicalrecords\d+$/i.test(key);
}

function getSelectedDocumentIdsFromDom() {
    const ids = new Set();

    function addIdFromElement(el) {
        if (!el || !el.id) return;
        const match = el.id.match(/^list-item-doc-(\d+)$/);
        if (match) ids.add(match[1]);
    }

    document.querySelectorAll('li[id^="list-item-doc-"]').forEach((el) => {
        const isSelected =
            el.classList.contains('selected') ||
            el.getAttribute('aria-selected') === 'true' ||
            el.matches('.active, [data-selected="true"]');

        if (isSelected) addIdFromElement(el);
    });

    document.querySelectorAll('input[type="checkbox"]:checked').forEach((checkbox) => {
        const row = checkbox.closest('li[id^="list-item-doc-"]');
        addIdFromElement(row);
    });

    return Array.from(ids);
}

function getAllSelectedDocumentIds() {
    const fromDom = getSelectedDocumentIdsFromDom();
    const merged = new Set([...fromDom, ...selectedDocumentIds]);
    return Array.from(merged);
}

function getAllDocumentIdsOnPage() {
    const ids = new Set();
    document.querySelectorAll('li[id^="list-item-doc-"]').forEach((el) => {
        const match = el.id.match(/^list-item-doc-(\d+)$/);
        if (match) ids.add(match[1]);
    });
    return Array.from(ids);
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

function extractMedicalRecordDocIdsFromCustomPayload(payload) {
    const ids = new Set();
    const seen = new Set();

    function addId(value) {
        const str = String(value || '').trim();
        if (/^\d+$/.test(str)) ids.add(str);
    }

    function walk(value, depth = 0) {
        if (value === null || value === undefined || depth > 10) return;

        if (Array.isArray(value)) {
            value.forEach((item) => walk(item, depth + 1));
            return;
        }

        if (typeof value !== 'object') return;
        if (seen.has(value)) return;
        seen.add(value);

        for (const [key, item] of Object.entries(value)) {
            const isRecordsArray = /^records\d+$/i.test(key) && Array.isArray(item);
            if (isRecordsArray) {
                item.forEach((record) => {
                    if (!record || typeof record !== 'object') return;
                    if (record.id !== undefined) addId(record.id);
                });
            }
        }

        Object.values(value).forEach((item) => walk(item, depth + 1));
    }

    walk(payload, 0);
    return Array.from(ids);
}

async function getMedicalRecordsDocumentIds(projectId, sectionKey, pageUrl) {
    if (!projectId || !sectionKey) return [];
    if (!/^medicalrecords\d+$/i.test(sectionKey)) return [];

    const key = sectionKey;
    const origin = (() => {
        if (pageUrl) {
            try {
                return new URL(pageUrl).origin;
            } catch (error) {
                // fall through
            }
        }
        return window.location.origin;
    })();

    const reportMetaUrl = `${origin}/api/customSectionReportsByKey/${key}`;
    const customDataUrl = `${origin}/api/projects/${projectId}/custom/${key}?page=1`;

    const ids = new Set();

    try {
        const metaRes = await fetch(reportMetaUrl, {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json, text/plain, */*' }
        });
        if (metaRes.ok) {
            await metaRes.json();
        }
    } catch (error) {
        // non-blocking
    }

    try {
        const dataRes = await fetch(customDataUrl, {
            method: 'POST',
            credentials: 'include',
            headers: {
                Accept: 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        if (dataRes.ok) {
            const payload = await dataRes.json();
            extractMedicalRecordDocIdsFromCustomPayload(payload).forEach((id) => ids.add(id));
        }
    } catch (error) {
        // non-blocking
    }

    return Array.from(ids);
}

async function downloadDocumentIdsSequentially(documentIds, pageUrl) {
    const perDocResults = [];
    for (const id of documentIds) {
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
        requested: documentIds.length,
        succeeded: successCount,
        failed: documentIds.length - successCount,
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

async function downloadMultipleDocuments(projectId, documentIds, pageUrl) {
    if (!projectId) {
        return { ok: false, error: 'Missing project ID' };
    }
    if (!documentIds || !documentIds.length) {
        return { ok: false, error: 'No selected document IDs found' };
    }

    const origin = (() => {
        if (pageUrl) {
            try {
                return new URL(pageUrl).origin;
            } catch (error) {
                // Fall back below.
            }
        }
        return window.location.origin;
    })();

    const endpoint = `${origin}/api/projects/${projectId}/multidocs/download`;
    const payloadCandidates = [
        { documentIds: documentIds },
        { docIds: documentIds },
        { ids: documentIds }
    ];

    let lastError = 'Unknown error';

    for (const body of payloadCandidates) {
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                lastError = `Multi download API failed (${res.status})`;
                continue;
            }

            let urls = [];
            const contentType = (res.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                const payload = await res.json();
                const out = new Set();
                extractUrlsFromObject(payload, out);
                urls = Array.from(out);
            } else {
                const textBody = (await res.text()).trim();
                const maybeUrl = normalizeUrl(textBody);
                if (maybeUrl && /^https?:/i.test(maybeUrl)) {
                    urls = [maybeUrl];
                }
            }

            if (!urls.length) {
                lastError = 'Multi download API returned no downloadable URL';
                continue;
            }

            urls.forEach((url) => {
                chrome.runtime.sendMessage({
                    type: 'DOWNLOAD_FILE',
                    url: url
                });
            });

            return {
                ok: true,
                mode: 'multi_download_api',
                endpoint,
                count: urls.length
            };
        } catch (error) {
            lastError = error.message || 'Unknown error';
        }
    }

    return { ok: false, error: lastError, endpoint };
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
