// This controls what you see in the sidebar/popup.

let capturedClicks = [];
let isCapturing = true;
let currentFilter = 'all';

// DOM Elements
const clicksList = document.getElementById('clicksList');
const totalCount = document.getElementById('totalCount'); 
const linkCount = document.getElementById('linkCount');
const buttonCount = document.getElementById('buttonCount');
const toggleBtn = document.getElementById('toggleBtn');
const clearBtn = document.getElementById('clearBtn');
const exportBtn = document.getElementById('exportBtn');
const currentTime = document.getElementById('currentTime');
const filterButtons = document.querySelectorAll('.filter-btn');
const downloadStatus = document.getElementById('downloadStatus');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('Popup loaded');
    
    loadClicks();
    updateTime();
    setInterval(updateTime, 1000);
    
    // Setup event listeners
    setupEventListeners();
    
// Listen for new clicks from background script
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        console.log('Message received in popup:', message);
        
        if (message.type === 'CLICK_CAPTURED') {
            addClick(message.data);
        }
        
        if (message.type === 'CLICKS_UPDATED') {
            // Update local clicks and refresh display
            capturedClicks = message.clicks;
            updateDisplay();
        }

        if (message.type === 'DOWNLOAD_STATUS') {
            handleDownloadStatusMessage(message);
        }
        
        return true;
    });
    
    // Request existing clicks
    chrome.runtime.sendMessage({type: 'GET_CLICKS'}, function(response) {
        console.log('Got clicks from background:', response);
        if (response && response.clicks) {
            capturedClicks = response.clicks;
            updateDisplay();
        }
    });
});

function setupEventListeners() {

    const downloadAllBtn = document.getElementById('downloadAllBtn');

    if (downloadAllBtn) {
        downloadAllBtn.addEventListener('click', function() {
            setDownloadStatus('Download in progress: preparing files...', 'info');
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (!tabs || !tabs[0]) return;
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
                });
                });
            });
    }

    clicksList.addEventListener('click', function(event) {
        const docBtn = event.target.closest('.download-doc-btn');
        if (docBtn) {
            const documentId = docBtn.dataset.docId || '';
            const pageUrl = decodeURIComponent(docBtn.dataset.pageUrl || '');
            downloadByDocumentId(documentId, pageUrl);
            return;
        }

        const openBtn = event.target.closest('.open-link-btn');
        if (openBtn) {
            const url = decodeURIComponent(openBtn.dataset.url || '');
            if (url) {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
            return;
        }

        const copyBtn = event.target.closest('.copy-json-btn');
        if (copyBtn) {
            const json = decodeURIComponent(copyBtn.dataset.json || '');
            if (json) {
                navigator.clipboard.writeText(json);
            }
        }
    });
    // Toggle button
    toggleBtn.addEventListener('click', function() {
        isCapturing = !isCapturing;
        const icon = isCapturing ? 'fa-pause' : 'fa-play';
        const title = isCapturing ? 'Pause' : 'Resume';
        
        toggleBtn.innerHTML = `<i class="fas ${icon}"></i>`;
        toggleBtn.title = title;
        
        // Send message to background script
        chrome.runtime.sendMessage({
            type: 'TOGGLE_CAPTURE',
            isCapturing: isCapturing
        });
        
        console.log('Capture toggled:', isCapturing);
    });
    
    // Clear button
    clearBtn.addEventListener('click', function() {
        if (capturedClicks.length === 0) return;
        
        if (confirm(`Clear all ${capturedClicks.length} captured clicks?`)) {
            capturedClicks = [];
            saveClicks();
            updateDisplay();
            console.log('All clicks cleared');
        }
    });
    
    // Export button
    exportBtn.addEventListener('click', function() {
        if (capturedClicks.length === 0) {
            alert('No clicks to export');
            return;
        }
        
        const csvData = [
            ['Type', 'Text', 'Tag', 'Classes', 'ID', 'Href', 'Time', 'Page URL'],
            ...capturedClicks.map(click => [
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
    });
    
    // Filter buttons
    filterButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            filterButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            updateDisplay();
        });
    });
}

function addClick(clickData) {
    if (!isCapturing) return;
    
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
        
        // Enhanced fields (might be undefined)
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
    
    capturedClicks.unshift(newClick);
    
    // Keep only last 500 clicks to prevent memory issues
    if (capturedClicks.length > 500) {
        capturedClicks = capturedClicks.slice(0, 500);
    }
    
    saveClicks();
    updateDisplay();
}

function saveClicks() {
    chrome.storage.local.set({capturedClicks: capturedClicks}, function() {
        console.log('Clicks saved to storage:', capturedClicks.length);
    });
}

function loadClicks() {
    chrome.storage.local.get(['capturedClicks'], function(result) {
        console.log('Loaded clicks from storage:', result.capturedClicks?.length || 0);
        if (result.capturedClicks) {
            capturedClicks = result.capturedClicks;
            updateDisplay();
        }
    });
}

function updateDisplay() {
    console.log('Updating display with', capturedClicks.length, 'clicks');
    
    // Update stats
    totalCount.textContent = capturedClicks.length;
    
    const linkClicks = capturedClicks.filter(c => c.type === 'link').length;
    const buttonClicks = capturedClicks.filter(c => c.type === 'button').length;
    
    linkCount.textContent = linkClicks;
    buttonCount.textContent = buttonClicks;
    
    // Filter clicks
    let filteredClicks = capturedClicks;
    
    if (currentFilter !== 'all') {
        filteredClicks = filteredClicks.filter(click => click.type === currentFilter);
    }
    
    // Update list
    if (filteredClicks.length === 0) {
        if (capturedClicks.length === 0) {
            clicksList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-mouse-pointer"></i>
                    </div>
                    <div class="empty-text">Click anywhere to start capturing</div>
                    <div class="empty-subtext">All clicks will appear here in real-time</div>
                </div>
            `;
        } else {
            clicksList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-filter"></i>
                    </div>
                    <div class="empty-text">No clicks match the current filter</div>
                    <div class="empty-subtext">Try a different filter</div>
                </div>
            `;
        }
    } else {
        clicksList.innerHTML = filteredClicks.map(click => createClickElement(click)).join('');
    }
}

function createClickElement(click) {
    const typeClasses = {
        'link': 'type-link',
        'button': 'type-button',
        'input': 'type-input',
        'div': 'type-div',
        'span': 'type-span',
        'other': 'type-other'
    };
    
    const typeClass = typeClasses[click.type] || 'type-other';
    const typeName = click.type ? click.type.toUpperCase() : 'ELEMENT';
    
    // Build detailed HTML
    let detailsHTML = `
        <div class="detail-row">
            <div class="detail-label">Tag:</div>
            <div class="detail-value">&lt;${click.tagName.toLowerCase()}&gt;</div>
        </div>
    `;
    
    // Add classes if present
    if (click.classes) {
        detailsHTML += `
            <div class="detail-row">
                <div class="detail-label">Classes:</div>
                <div class="detail-value class-list">
                    ${click.classes.split(' ').map(cls => 
                        `<span class="class-chip">${cls}</span>`
                    ).join(' ')}
                </div>
            </div>
        `;
    }
    
    // Add ID if present
    if (click.id) {
        detailsHTML += `
            <div class="detail-row">
                <div class="detail-label">ID:</div>
                <div class="detail-value id-value">#${click.id}</div>
            </div>
        `;
    }
    
    // Add common attributes
    const commonAttrs = ['href', 'src', 'alt', 'title', 'name', 'value', 'role', 'aria-label'];
    commonAttrs.forEach(attr => {
        if (click[attr]) {
            detailsHTML += `
                <div class="detail-row">
                    <div class="detail-label">${attr}:</div>
                    <div class="detail-value">${click[attr]}</div>
                </div>
            `;
        }
    });
    
    // Add page URL prominently
    if (click.pageUrl) {
        detailsHTML += `
            <div class="detail-row page-url-row">
                <div class="detail-label">Page URL:</div>
                <div class="detail-value page-url-value">${click.pageUrl}</div>
            </div>
        `;
    }

    if (click.documentId) {
        detailsHTML += `
            <div class="detail-row">
                <div class="detail-label">Document ID:</div>
                <div class="detail-value">${click.documentId}</div>
            </div>
        `;
    }

    if (click.downloadUrl) {
        detailsHTML += `
            <div class="detail-row">
                <div class="detail-label">Download URL:</div>
                <div class="detail-value">${click.downloadUrl}</div>
            </div>
        `;
    }
    
    // Add position info if available
    if (click.position) {
        detailsHTML += `
            <div class="detail-row">
                <div class="detail-label">Position:</div>
                <div class="detail-value">
                    (${click.position.x}, ${click.position.y}) - ${click.position.width}×${click.position.height}
                </div>
            </div>
        `;
    }
    
    // Add parent info if available
    if (click.parent) {
        detailsHTML += `
            <div class="detail-row">
                <div class="detail-label">Parent:</div>
                <div class="detail-value">
                    &lt;${click.parent.tag.toLowerCase()}&gt;
                    ${click.parent.classes ? ` class="${click.parent.classes}"` : ''}
                    ${click.parent.id ? ` id="${click.parent.id}"` : ''}
                </div>
            </div>
        `;
    }
    
    // Add children count
    if (click.childrenCount > 0) {
        detailsHTML += `
            <div class="detail-row">
                <div class="detail-label">Children:</div>
                <div class="detail-value">${click.childrenCount} element(s)</div>
            </div>
        `;
    }
    
    // Add DOM path if available
    if (click.path) {
        detailsHTML += `
            <div class="detail-row">
                <div class="detail-label">DOM Path:</div>
                <div class="detail-value dom-path">${click.path}</div>
            </div>
        `;
    }
    
    // Add data attributes if present
    if (click['data-*']) {
        const dataAttrs = click['data-*'];
        detailsHTML += `
            <div class="detail-row">
                <div class="detail-label">Data Attributes:</div>
                <div class="detail-value">
                    ${Object.entries(dataAttrs).map(([key, value]) => 
                        `<div class="data-attr">data-${key}="${value}"</div>`
                    ).join('')}
                </div>
            </div>
        `;
    }
    
    const openUrl = click.downloadUrl || click.href || '';
    const encodedUrl = encodeURIComponent(openUrl);
    const encodedJson = encodeURIComponent(JSON.stringify(click));
    const encodedPageUrl = encodeURIComponent(click.pageUrl || '');

    return `
        <div class="click-item ${click.type}">
            <div class="click-header">
                <div class="click-text" title="${click.text}">
                    ${click.text.length > 100 ? click.text.substring(0, 100) + '...' : click.text}
                </div>
                <div class="click-type ${typeClass}">${typeName}</div>
            </div>
            
            <div class="click-details">
                ${detailsHTML}
            </div>
            
            <div class="click-meta">
                <div class="click-time">
                    <i class="far fa-clock"></i>
                    ${click.time}
                </div>
                <div class="page-url" title="${click.pageUrl}">
                    ${click.pageTitle || click.pageUrl.replace(/^https?:\/\//, '').split('/')[0]}
                </div>
            </div>
            
            <div class="click-actions">
                ${click.documentId ? `
                <button class="action-btn download-doc-btn" data-doc-id="${click.documentId}" data-page-url="${encodedPageUrl}">
                    <i class="fas fa-download"></i> Download by ID
                </button>
                ` : ''}
                ${openUrl ? `
                <button class="action-btn open-link-btn" data-url="${encodedUrl}">
                    <i class="fas fa-file-arrow-down"></i> Open File
                </button>
                ` : ''}
                <button class="action-btn copy-json-btn" data-json="${encodedJson}">
                    <i class="fas fa-copy"></i> Copy JSON
                </button>
            </div>
        </div>
    `;
}

function updateTime() {
    const now = new Date();
    currentTime.textContent = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function buildDownloadFailedAlert(errorMessage) {
    const detail = errorMessage || 'Unknown error';
    return `Download failed.\nPlease make sure you are on the Filevine page and still logged in.\n\nError details: ${detail}`;
}

function setDownloadStatus(message, tone = 'info') {
    if (!downloadStatus) return;
    downloadStatus.classList.remove('hidden', 'success', 'error');
    if (tone === 'success') downloadStatus.classList.add('success');
    if (tone === 'error') downloadStatus.classList.add('error');
    downloadStatus.textContent = message;
}

function handleDownloadStatusMessage(message) {
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
                `All files downloaded successfully. Saved inside individual folders.`,
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
    }
}

function downloadByDocumentId(documentId, pageUrl) {
    if (!documentId) {
        alert('No document ID found for this item.');
        return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (!tabs || !tabs[0]) {
            alert('No active tab found.');
            return;
        }

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
            }
        );
    });
}
