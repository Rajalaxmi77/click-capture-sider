console.log('Background script loaded');

// Store all captured clicks
let allClicks = [];
let isCapturing = true;

// Load clicks from storage on startup
chrome.storage.local.get(['capturedClicks'], function(result) {
    if (result.capturedClicks) {
        allClicks = result.capturedClicks;
        console.log('Loaded', allClicks.length, 'clicks from storage');
    }
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    console.log('Background received message:', message.type);
    
    switch (message.type) {
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
                
                // Forward to popup if it's open
                chrome.runtime.sendMessage({
                    type: 'CLICK_CAPTURED',
                    data: clickData
                }).catch(error => {
                    // Popup might not be open
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
                    
                    // Notify popup to refresh
                    chrome.runtime.sendMessage({
                        type: 'CLICKS_UPDATED',
                        clicks: allClicks
                    }).catch(error => {
                        // Popup might not be open
                    });
                }
            }
            break;
            
        case 'GET_CLICKS':
            sendResponse({clicks: allClicks});
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
    }
    
    return true;
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(function(details) {
    console.log('Extension installed/updated:', details.reason);
    
    chrome.storage.local.get(['capturedClicks'], function(result) {
        if (!result.capturedClicks) {
            chrome.storage.local.set({capturedClicks: []});
        }
    });
});
