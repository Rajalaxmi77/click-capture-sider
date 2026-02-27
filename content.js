console.log('Click Capture content script loaded');

// Initialize click tracking
let isCapturing = true;

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
    
    // Get the target URL - try to get the href from the clicked element or its parent anchor
    let targetUrl = '';
    let clickedElement = target;
    
    // Check if clicked element or any parent is an anchor tag
    while (clickedElement && clickedElement !== document.body) {
        if (clickedElement.tagName === 'A') {
            targetUrl = clickedElement.href || clickedElement.getAttribute('href') || '';
            break;
        }
        clickedElement = clickedElement.parentElement;
    }
    
    // Also check if the clicked element itself has href
    if (!targetUrl) {
        targetUrl = target.href || target.getAttribute('href') || '';
    }
    
    // Prepare basic click data
    const clickData = {
        type: elementType,
        text: getElementText(target),
        tagName: target.tagName,
        classes: target.className || '',
        id: target.id || '',
        href: targetUrl,
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

console.log('Click Capture ready - tracking all clicks');
