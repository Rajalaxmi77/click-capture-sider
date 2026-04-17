console.log('Legasys Floating Widget loaded');

const WIDGET_INSTANCE_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
window.__lcsWidgetActiveId = WIDGET_INSTANCE_ID;

let isOpen = false;
let widgetPanel = null;
let overlay = null;
let isStudioMode = false;

function cleanupExistingWidget() {
  document.querySelectorAll('.legasys-floating-container, .legasys-widget-panel, .legasys-overlay')
    .forEach((el) => el.remove());
  widgetPanel = null;
  overlay = null;
  isOpen = false;
}

// Create the floating toggle button
function createFloatingButton() {
  const button = document.createElement('button');
  button.className = 'legasys-floating-btn';
  button.innerHTML = '<i class="fas fa-gavel"></i>';
  button.setAttribute('aria-label', 'Open Legasys Quick Access');
  
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleWidget();
  });
  
  return button;
}

// Load Font Awesome
function loadFontAwesome() {
  if (!document.querySelector('link[href*="font-awesome"]') && 
      !document.querySelector('link[href*="fontawesome"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    document.head.appendChild(link);
  }
}

// Create overlay
function createOverlay() {
  const overlayDiv = document.createElement('div');
  overlayDiv.className = 'legasys-overlay';
  overlayDiv.style.display = 'none';
  overlayDiv.addEventListener('click', closeWidget);
  return overlayDiv;
}

// Create widget panel with iframe
function createWidgetPanel() {
  const panel = document.createElement('div');
  panel.className = 'legasys-widget-panel';
  panel.style.display = 'none';
  
  panel.innerHTML = `
    <div class="legasys-widget-header">
      <div class="legasys-widget-title">
        <h3><i class="fas fa-gavel"></i>Legasys Quick Access</h3>
      </div>
      <div class="legasys-widget-controls">
        <button class="legasys-mode-toggle" id="legasys-mode-toggle" type="button" aria-pressed="false">
          <span class="legasys-mode-label"><i class="fas fa-eye"></i>Viewer</span>
          <span class="legasys-toggle-switch">
            <span class="legasys-toggle-thumb"></span>
          </span>
        </button>
        <button class="legasys-close-btn" id="legasys-close-widget" type="button" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>
    <div class="legasys-widget-content">
      <iframe id="legasys-iframe" src="${chrome.runtime.getURL('popup.html')}"></iframe>
    </div>
  `;
  
  // Close button functionality
  const closeBtn = panel.querySelector('#legasys-close-widget');
  closeBtn.addEventListener('click', closeWidget);

  const modeToggle = panel.querySelector('#legasys-mode-toggle');
  modeToggle.addEventListener('click', () => {
    isStudioMode = !isStudioMode;
    panel.classList.toggle('studio-mode', isStudioMode);
    modeToggle.classList.toggle('studio', isStudioMode);
    modeToggle.setAttribute('aria-pressed', isStudioMode ? 'true' : 'false');
    const label = modeToggle.querySelector('.legasys-mode-label');
    if (label) {
      label.innerHTML = isStudioMode
        ? '<i class="fas fa-pen-ruler"></i>Studio'
        : '<i class="fas fa-eye"></i>Viewer';
    }
  });
  
  return panel;
}

// Toggle widget
function toggleWidget() {
  if (isOpen) {
    closeWidget();
  } else {
    openWidget();
  }
}

// Open widget
function openWidget() {
  if (!widgetPanel) {
    widgetPanel = createWidgetPanel();
    overlay = createOverlay();
    document.body.appendChild(overlay);
    document.body.appendChild(widgetPanel);
  }
  
  overlay.style.display = 'block';
  widgetPanel.style.display = 'flex';
  isOpen = true;
}

// Close widget
function closeWidget() {
  if (overlay) {
    overlay.style.display = 'none';
  }
  if (widgetPanel) {
    widgetPanel.style.display = 'none';
  }
  isOpen = false;
}

// Initialize the floating widget
function initFloatingWidget() {
  loadFontAwesome();
  
  cleanupExistingWidget();
  if (document.querySelector('.legasys-floating-container')) {
    return;
  }

  // Create container and button
  const container = document.createElement('div');
  container.className = 'legasys-floating-container';
  const button = createFloatingButton();
  container.appendChild(button);
  document.body.appendChild(container);
}

// Start initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFloatingWidget);
} else {
  initFloatingWidget();
}

chrome.runtime.onMessage.addListener((message) => {
  if (window.__lcsWidgetActiveId !== WIDGET_INSTANCE_ID) return;
  if (!message || !message.type) return;
  if (message.type === 'LCS_TOGGLE_WIDGET') {
    if (!document.querySelector('.legasys-floating-container')) {
      initFloatingWidget();
    }
    toggleWidget();
  }
  if (message.type === 'LCS_OPEN_WIDGET') {
    if (!document.querySelector('.legasys-floating-container')) {
      initFloatingWidget();
    }
    openWidget();
  }
  if (message.type === 'LCS_CLOSE_WIDGET') {
    closeWidget();
  }
});
