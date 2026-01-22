// Helper to parse VTT string into an array of cues
function parseVTT(vttString) {
  const lines = vttString.split('\n');
  const cues = [];
  let currentCue = null;

  const timePattern = /(\d{2}:)?\d{2}:\d{2}\.\d{3} --> (\d{2}:)?\d{2}:\d{2}\.\d{3}/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line || line === 'WEBVTT') continue;

    if (line.match(timePattern)) {
      if (currentCue) {
        cues.push(currentCue);
      }
      const times = line.split(' --> ');
      currentCue = {
        start: parseTime(times[0]),
        end: parseTime(times[1]),
        text: '',
      };
    } else if (currentCue) {
      currentCue.text += (currentCue.text ? '\n' : '') + line;
    }
  }
  if (currentCue) cues.push(currentCue);

  return cues;
}

function parseTime(timeStr) {
  const parts = timeStr.split(':');
  let seconds = 0;
  if (parts.length === 3) {
    seconds += parseInt(parts[0]) * 3600;
    seconds += parseInt(parts[1]) * 60;
    seconds += parseFloat(parts[2]);
  } else {
    seconds += parseInt(parts[0]) * 60;
    seconds += parseFloat(parts[1]);
  }
  return seconds;
}

function getVideoId(url) {
  const match = url.match(/(?:v=|\/v\/|youtu\.be\/)([^&\s]+)/);
  return match ? match[1] : null;
}

// Helper to check if extension context is valid
function isExtensionContextInvalid() {
  try {
    return !chrome.runtime.id;
  } catch (e) {
    return true;
  }
}

function safeGet(callback, fallback = null) {
  if (isExtensionContextInvalid()) return fallback;
  try {
    return callback();
  } catch (e) {
    if (e.message.includes('Extension context invalidated')) {
      return fallback;
    }
    throw e;
  }
}

// Backend availability check
async function checkBackendAvailability() {
  if (isExtensionContextInvalid()) return false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('http://127.0.0.1:8000/health', {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.warn('Backend not available:', error.message);
    return false;
  }
}

// Progress bar overlay
function showProgress(stage, progress, details = '', customTitle = null) {
  let overlay = document.getElementById('ai-progress-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ai-progress-overlay';
    overlay.innerHTML = `
      <div id="ai-progress-content">
        <div id="ai-progress-title">AI Processing...</div>
        <div id="ai-progress-bar-container">
          <div id="ai-progress-bar"></div>
        </div>
        <div id="ai-progress-stage">Initializing...</div>
        <div id="ai-progress-details"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const bar = overlay.querySelector('#ai-progress-bar');
  const stageEl = overlay.querySelector('#ai-progress-stage');
  const detailsEl = overlay.querySelector('#ai-progress-details');
  const titleEl = overlay.querySelector('#ai-progress-title');

  bar.style.width = `${progress}%`;
  stageEl.textContent = stage;
  if (customTitle) {
    titleEl.textContent = customTitle;
  }
  if (details) {
    detailsEl.textContent = details;
    detailsEl.style.display = 'block';
  } else {
    detailsEl.style.display = 'none';
  }

  overlay.style.display = 'block';
}

function updateProgress(stage, progress, details = '', customTitle = null) {
  showProgress(stage, progress, details, customTitle);
}

function hideProgress() {
  const overlay = document.getElementById('ai-progress-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

function showSummary(text) {
  console.log('[AI Summary] showSummary called');
  
  let panel = document.getElementById('ai-summary-panel');
  console.log('[AI Summary] Panel exists:', !!panel);
  
  if (!panel) {
    console.log('[AI Summary] Creating new panel');
    panel = document.createElement('div');
    panel.id = 'ai-summary-panel';
    panel.innerHTML = `
      <div id="ai-summary-panel-header">
        <div class="ai-summary-title">
          <svg viewBox="0 0 24 24">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M16,11V18.1L13.9,16L11,18.9L8.1,16L11,13.1L8.9,11H16Z"/>
          </svg>
          <span>Video Summary</span>
        </div>
        <div class="ai-summary-actions">
          <button class="ai-summary-btn" data-action="copy" title="Copy to clipboard">
            <svg viewBox="0 0 24 24">
              <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/>
            </svg>
          </button>
          <button class="ai-summary-btn" data-action="font-decrease" title="Decrease font size">A-</button>
          <button class="ai-summary-btn" data-action="font-increase" title="Increase font size">A+</button>
          <button class="ai-summary-btn" data-action="collapse" title="Collapse">
            <svg viewBox="0 0 24 24">
              <path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z"/>
            </svg>
          </button>
        </div>
      </div>
      <div id="ai-summary-content"></div>
    `;
    document.body.appendChild(panel);
    
    setupSummaryPanelEvents(panel);
    loadSummaryPreferences(panel);
  }
  
  const content = panel.querySelector('#ai-summary-content');
  
  if (typeof marked !== 'undefined') {
    content.innerHTML = marked.parse(text);
  } else {
    content.innerHTML = text
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.*)/gm, '• $1');
  }
  
  injectSummaryPanel();
  panel.classList.add('visible');
  panel.querySelector('#ai-summary-content').classList.remove('collapsed');
  
  updateCollapseIcon(panel);
  console.log('[AI Summary] Panel should now be visible');
  console.log('[AI Summary] Panel display:', window.getComputedStyle(panel).display);
  console.log('[AI Summary] Panel parent:', panel.parentNode);
}

function loadSummaryPreferences(panel) {
  if (!chrome.storage || !chrome.storage.local) return;
  
  chrome.storage.local.get(['summary_font_size', 'summary_collapsed'], (result) => {
    const content = panel.querySelector('#ai-summary-content');
    
    if (result.summary_font_size) {
      content.style.fontSize = result.summary_font_size + 'px';
    }
    
    if (result.summary_collapsed) {
      content.classList.add('collapsed');
      updateCollapseIcon(panel);
    }
  });
}

function setupSummaryPanelEvents(panel) {
  const header = panel.querySelector('#ai-summary-panel-header');
  const actions = panel.querySelector('.ai-summary-actions');
  
  header.addEventListener('click', (e) => {
    if (actions.contains(e.target)) return;
  });
  
  actions.addEventListener('click', async (e) => {
    const btn = e.target.closest('.ai-summary-btn');
    if (!btn) return;
    
    const action = btn.dataset.action;
    const content = panel.querySelector('#ai-summary-content');
    
    switch (action) {
    case 'copy': {
      const textToCopy = content.innerText;
      try {
        await navigator.clipboard.writeText(textToCopy);
        showSummaryToast('Copied to clipboard!');
      } catch (err) {
        showSummaryToast('Failed to copy');
      }
      break;
    }
      
    case 'font-decrease':
      adjustSummaryFont(content, -1);
      break;
      
    case 'font-increase':
      adjustSummaryFont(content, 1);
      break;
      
    case 'collapse':
      toggleSummaryCollapse(panel, content);
      break;
    }
  });
}

function adjustSummaryFont(content, delta) {
  let currentSize = parseFloat(getComputedStyle(content).fontSize);
  const newSize = Math.max(12, Math.min(20, currentSize + delta));
  content.style.fontSize = newSize + 'px';
  
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ summary_font_size: newSize });
  }
}

function toggleSummaryCollapse(panel, content) {
  content.classList.toggle('collapsed');
  updateCollapseIcon(panel);
  
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ summary_collapsed: content.classList.contains('collapsed') });
  }
}

function updateCollapseIcon(panel) {
  const btn = panel.querySelector('[data-action="collapse"] svg');
  const isCollapsed = panel.querySelector('#ai-summary-content').classList.contains('collapsed');
  
  if (isCollapsed) {
    btn.innerHTML = '<path d="M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z"/>';
  } else {
    btn.innerHTML = '<path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z"/>';
  }
}

function showSummaryToast(message) {
  let toast = document.getElementById('ai-summary-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ai-summary-toast';
    document.body.appendChild(toast);
  }
  
  toast.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

function injectSummaryPanel() {
  const panel = document.getElementById('ai-summary-panel');
  console.log('[AI Summary] injectSummaryPanel called');
  console.log('[AI Summary] Panel element:', panel);
  console.log('[AI Summary] Panel parent:', panel?.parentNode);
  
  if (!panel || panel.parentNode) {
    console.log('[AI Summary] Panel already has parent or not found');
    return;
  }
  
  const selectors = [
    '#comments',
    'ytd-comments',
    '#comment-section-renderer',
    '.ytd-watch-flexy #comments',
    '#columns #comments',
    '#primary + #secondary #comments',
    '.ytd-two-column-bolt #comments',
  ];
  
  let targetElement = null;
  for (const selector of selectors) {
    targetElement = document.querySelector(selector);
    console.log(`[AI Summary] Trying selector "${selector}":`, targetElement);
    if (targetElement) break;
  }
  
  if (targetElement) {
    console.log('[AI Summary] Found target, injecting panel');
    const parent = targetElement.parentNode;
    if (parent) {
      parent.insertBefore(panel, targetElement);
      console.log('[AI Summary] Panel injected successfully');
      return;
    }
  }
  
  // Fallback: try to find any reasonable place
  console.log('[AI Summary] No target found, trying fallback locations');
  
  const fallbacks = [
    '#columns',
    '#primary',
    '#secondary',
    '.ytd-watch-flexy',
    'body',
  ];
  
  for (const selector of fallbacks) {
    const el = document.querySelector(selector);
    if (el) {
      console.log(`[AI Summary] Using fallback: ${selector}`);
      el.appendChild(panel);
      return;
    }
  }
  
  // Last resort: append to body
  console.log('[AI Summary] Appending to body');
  document.body.appendChild(panel);
}

function makeDraggable(el) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  const header = el.querySelector('#ai-summary-header');
  if (header) {
    header.onmousedown = dragMouseDown;
  }

  function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    el.style.top = (el.offsetTop - pos2) + 'px';
    el.style.left = (el.offsetLeft - pos1) + 'px';
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

function showOverlay(text, duration = 0) {
  let overlay = document.getElementById('ai-status-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ai-status-overlay';
    document.body.appendChild(overlay);
  }
  overlay.textContent = text;
  overlay.style.display = 'block';

  if (duration > 0) {
    setTimeout(() => {
      overlay.style.display = 'none';
    }, duration);
  }
}

function hideOverlay() {
  const overlay = document.getElementById('ai-status-overlay');
  if (overlay) overlay.style.display = 'none';
}

// Cache management
const CACHE_PREFIX = 'yt_subtitles_cache_';
const CACHE_EXPIRY_DAYS = 7;

async function getCachedSubtitles(videoId) {
  if (isExtensionContextInvalid()) return null;

  if (!chrome.storage || !chrome.storage.local) return null;
  try {
    const cacheKey = CACHE_PREFIX + videoId;
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) {
      const data = cached[cacheKey];
      const now = Date.now();
      const ageDays = (now - data.cachedAt) / (1000 * 60 * 60 * 24);

      if (ageDays < CACHE_EXPIRY_DAYS) {
        console.log('AI Subtitles: Using cached subtitles for', videoId);
        return data.vtt;
      } else {
        console.log('AI Subtitles: Cache expired for', videoId);
        try {
          await chrome.storage.local.remove(cacheKey);
        } catch (e) {
          // Context invalidated, ignore
        }
      }
    }
  } catch (error) {
    if (error.message?.includes('Extension context invalidated') || isExtensionContextInvalid()) {
      console.log('AI Subtitles: Extension context invalidated, skipping cache read');
      return null;
    }
    console.warn('AI Subtitles: Cache read error:', error);
  }
  return null;
}

async function setCachedSubtitles(videoId, vtt) {
  if (!chrome.storage || !chrome.storage.local) return;
  try {
    const cacheKey = CACHE_PREFIX + videoId;
    await chrome.storage.local.set({
      [cacheKey]: {
        vtt: vtt,
        cachedAt: Date.now(),
      },
    });
    console.log('AI Subtitles: Subtitles cached for', videoId);
  } catch (error) {
    if (error.message?.includes('Extension context invalidated')) {
      return;
    }
    console.warn('AI Subtitles: Cache write error:', error);
  }
}

const SUMMARY_CACHE_PREFIX = 'yt_summary_cache_';
const SUMMARY_CACHE_EXPIRY_DAYS = 7;

async function getCachedSummary(videoId, lang) {
  if (isExtensionContextInvalid()) return null;

  if (!chrome.storage || !chrome.storage.local) return null;
  try {
    const cacheKey = SUMMARY_CACHE_PREFIX + videoId + '_' + lang;
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) {
      const data = cached[cacheKey];
      const now = Date.now();
      const ageDays = (now - data.cachedAt) / (1000 * 60 * 60 * 24);

      if (ageDays < SUMMARY_CACHE_EXPIRY_DAYS) {
        console.log('AI Summary: Using cached summary for', videoId, 'lang:', lang);
        return data.summary;
      } else {
        console.log('AI Summary: Cache expired for', videoId);
        try {
          await chrome.storage.local.remove(cacheKey);
        } catch (e) {
          // Context invalidated, ignore
        }
      }
    }
  } catch (error) {
    if (error.message?.includes('Extension context invalidated') || isExtensionContextInvalid()) {
      console.log('AI Summary: Extension context invalidated, skipping cache read');
      return null;
    }
    console.warn('AI Summary: Cache read error:', error);
  }
  return null;
}

async function setCachedSummary(videoId, lang, summary) {
  if (!chrome.storage || !chrome.storage.local) return;
  try {
    const cacheKey = SUMMARY_CACHE_PREFIX + videoId + '_' + lang;
    await chrome.storage.local.set({
      [cacheKey]: {
        summary: summary,
        cachedAt: Date.now(),
      },
    });
    console.log('AI Summary: Summary cached for', videoId, 'lang:', lang);
  } catch (error) {
    if (error.message?.includes('Extension context invalidated')) {
      return;
    }
    console.warn('AI Summary: Cache write error:', error);
  }
}

async function clearExpiredCache() {
  if (!chrome.storage || !chrome.storage.local) return;
  try {
    const all = await chrome.storage.local.get(null);
    const now = Date.now();
    const subtitleExpiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const summaryExpiryMs = SUMMARY_CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const key of Object.keys(all)) {
      if (key.startsWith(CACHE_PREFIX)) {
        const data = all[key];
        if (data.cachedAt && now - data.cachedAt > subtitleExpiryMs) {
          await chrome.storage.local.remove(key);
          removed++;
        }
      } else if (key.startsWith(SUMMARY_CACHE_PREFIX)) {
        const data = all[key];
        if (data.cachedAt && now - data.cachedAt > summaryExpiryMs) {
          await chrome.storage.local.remove(key);
          removed++;
        }
      }
    }

    if (removed > 0) {
      console.log(`AI Cache: Removed ${removed} expired cache entries (subtitles + summaries)`);
    }
  } catch (error) {
    console.warn('AI Cache: Cleanup error:', error);
  }
}

// Retry mechanism
async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

      const errorText = await response.text();
      lastError = new Error(`HTTP ${response.status}: ${errorText}`);

      // Don't retry on client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`AI Subtitles: Retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Global state for subtitle management
let cachedSubtitles = null;
let subtitlesVisible = false;
let subtitleInterval = null;
let currentVideoUrl = null;
let currentVideoId = null;
let cachedSummary = null;
let summaryLanguage = null;

function clearSubtitleState() {
  cachedSubtitles = null;
  subtitlesVisible = false;

  if (subtitleInterval) {
    clearInterval(subtitleInterval);
    subtitleInterval = null;
  }

  const container = document.getElementById('ai-subtitle-container');
  if (container) {
    container.style.display = 'none';
    container.textContent = '';
  }

  const btn = document.getElementById('ai-subtitle-btn');
  if (btn) {
    btn.style.opacity = 1;
    btn.title = 'Generate AI Subtitles';
  }
}

function checkVideoChange() {
  const newUrl = window.location.href;
  const newVideoId = getVideoId(newUrl);

  if (currentVideoUrl && currentVideoUrl !== newUrl) {
    console.log('AI Subtitles: Video changed, clearing state');
    clearSubtitleState();
  }

  currentVideoUrl = newUrl;
  currentVideoId = newVideoId;
}

// UI Injection
function injectButton() {
  if (document.getElementById('ai-subtitle-btn')) return;

  const controls =
    document.querySelector('.ytp-right-controls') ||
    document.querySelector('.ytp-chrome-controls') ||
    document.querySelector('.ytp-left-controls');

  if (!controls) {
    return;
  }

  console.log('AI Subtitles: Injecting buttons...');

  // Subtitles button
  const btn = document.createElement('button');
  btn.id = 'ai-subtitle-btn';
  btn.className = 'ytp-button';
  btn.innerHTML = `
    <svg height="24px" version="1.1" viewBox="0 0 24 24" width="24px" fill="#fff">
      <path d="M19,9l1.25-2.75L23,5l-2.75-1.25L19,1l-1.25,2.75L15,5l2.75,1.25L19,9z M19,15l-1.25,2.75L15,19l2.75,1.25L19,23 l1.25-2.75L23,19l-2.75-1.25L19,15z M11.5,9.5L9,4L6.5,9.5L1,12l5.5,2.5L9,20l2.5-5.5L17,12L11.5,9.5z"></path>
    </svg>
  `;
  btn.title = 'Generate AI Subtitles';
  btn.style.opacity = 1;
  btn.style.cursor = 'pointer';

  btn.style.display = 'inline-flex';
  btn.style.alignItems = 'center';
  btn.style.justifyContent = 'center';

  btn.style.verticalAlign = 'middle';
  btn.style.width = '48px';
  btn.style.padding = '0';

  btn.addEventListener('click', handleSubtitleButtonClick);

  // Summary button
  const summaryBtn = document.createElement('button');
  summaryBtn.id = 'ai-summary-btn';
  summaryBtn.className = 'ytp-button';
  summaryBtn.innerHTML = `
    <svg height="24px" version="1.1" viewBox="0 0 24 24" width="24px" fill="#fff">
      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M13,13V16H7V13H10V12H8V14H12V13H13M16,11V14H14V11H15V10H17V11H16Z"></path>
    </svg>
  `;
  summaryBtn.title = 'Generate AI Summary';
  summaryBtn.style.opacity = 1;
  summaryBtn.style.cursor = 'pointer';

  summaryBtn.style.display = 'inline-flex';
  summaryBtn.style.alignItems = 'center';
  summaryBtn.style.justifyContent = 'center';

  summaryBtn.style.verticalAlign = 'middle';
  summaryBtn.style.width = '48px';
  summaryBtn.style.padding = '0';
  summaryBtn.style.marginLeft = '4px';

  summaryBtn.addEventListener('click', handleSummaryButtonClick);

  const settingsBtn = document.querySelector('.ytp-settings-button');
  if (settingsBtn && settingsBtn.parentNode === controls) {
    controls.insertBefore(btn, settingsBtn);
    controls.insertBefore(summaryBtn, settingsBtn);
  } else {
    controls.insertBefore(btn, controls.firstChild);
    controls.insertBefore(summaryBtn, controls.firstChild);
  }
  console.log('AI Subtitles: Buttons injected successfully');
}

async function handleSubtitleButtonClick() {
  if (cachedSubtitles) {
    toggleSubtitleVisibility();
  } else {
    await generateSubtitles();
  }
}

async function handleSummaryButtonClick() {
  await generateSummary();
}

async function generateSummary() {
  const btn = document.getElementById('ai-summary-btn');
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = 0.3;
  }

  updateProgress('Checking backend...', 5, '', 'Generating Summary');

  const backendAvailable = await checkBackendAvailability();
  if (!backendAvailable) {
    hideProgress();
    showOverlay(
      'Backend not running!\n\n' +
      'To start it:\n' +
      '• Docker: make docker-up\n' +
      '• Local: make dev\n\n' +
      'Then refresh this page.',
      10000
    );
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = 1;
    }
    return;
  }

  updateProgress('Checking settings...', 10, '', 'Generating Summary');

  if (isExtensionContextInvalid() || !chrome.storage || !chrome.storage.local) {
    showOverlay('Extension updated. Please refresh the page.', 5000);
    return;
  }

  try {
    const { provider, openaiApiKey, groqApiKey, baseUrl, summaryLanguage, summarizationModel } =
      await chrome.storage.local.get([
        'provider',
        'openaiApiKey',
        'groqApiKey',
        'baseUrl',
        'summaryLanguage',
        'summarizationModel',
      ]);

    console.log('AI Summary: Settings loaded:', {
      provider,
      summaryLanguage,
      summarizationModel,
    });

    const apiKey = provider === 'groq' ? groqApiKey : openaiApiKey;

    if (!apiKey) {
      hideProgress();
      showOverlay('Please set your API Key in the extension settings.', 5000);
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = 1;
      }
      return;
    }

    const videoUrl = window.location.href;
    const videoId = getVideoId(videoUrl);

    // Check for cached summary
    if (videoId && summaryLanguage) {
      const cachedSummary = await getCachedSummary(videoId, summaryLanguage);
      if (cachedSummary) {
        hideProgress();
        showSummary(cachedSummary);
        showOverlay('Cached Summary Loaded!', 2000);
        if (btn) {
          btn.disabled = false;
          btn.style.opacity = 1;
        }
        return;
      }
    }

    updateProgress('Preparing...', 15, '', 'Generating Summary');

    const port = chrome.runtime.connect({ name: 'summary-port' });

    const keepAliveInterval = setInterval(() => {
      port.postMessage({ action: 'ping' });
    }, 10000);

    port.onMessage.addListener((response) => {
      if (response.action === 'progress') {
        const stageMessages = {
          cached: 'Using cached transcription...',
          downloading: 'Downloading Audio...',
          transcribing: 'Transcribing for summary...',
          summarizing: 'Generating Summary...',
          complete: 'Complete!',
        };

        updateProgress(
          stageMessages[response.stage] || response.stage,
          response.progress,
          response.details || '',
          'Generating Summary'
        );
      } else if (response.action === 'summary_result') {
        clearInterval(keepAliveInterval);
        port.disconnect();

        if (!response.success) {
          hideProgress();
          console.error(response.error);
          showOverlay(`Error: ${response.error}`, 5000);
          if (btn) {
            btn.disabled = false;
            btn.style.opacity = 1;
          }
          return;
        }

        hideProgress();

        if (response.data.summary) {
          showSummary(response.data.summary);
          
          // Cache the summary (fire and forget)
          if (videoId && summaryLanguage) {
            setCachedSummary(videoId, summaryLanguage, response.data.summary).catch(err => {
              console.warn('AI Summary: Failed to cache summary:', err);
            });
          }
        }

        showOverlay('Summary Ready!', 2000);

        if (btn) {
          btn.disabled = false;
          btn.style.opacity = 1;
        }
      } else if (response.action === 'error') {
        clearInterval(keepAliveInterval);
        port.disconnect();
        hideProgress();
        console.error(response.error);

        let errorMessage = response.error;
        if (errorMessage.includes('503') || errorMessage.includes('API connection')) {
          errorMessage =
            'API connection failed.\n\nPossible causes:\n• Invalid API key\n• Rate limit exceeded\n• Network issues';
        } else if (errorMessage.includes('400') || errorMessage.includes('validation')) {
          errorMessage = 'Invalid request configuration.\nCheck your settings and try again.';
        } else if (errorMessage.includes('401') || errorMessage.includes('authentication')) {
          errorMessage = 'Authentication failed.\n\nCheck your API key in extension settings.';
        }

        showOverlay(`Error: ${errorMessage}`, 8000);
        if (btn) {
          btn.disabled = false;
          btn.style.opacity = 1;
        }
      }
    });

    port.postMessage({
      action: 'summarize',
      data: {
        video_url: videoUrl,
        api_key: apiKey,
        base_url: baseUrl || '',
        summary_language: summaryLanguage || 'en',
        summarization_model: summarizationModel || 'gpt-5-mini',
        provider: provider || 'openai',
      },
    });

    console.log('AI Subtitles: Sending summary request to backend');

    port.onDisconnect.addListener(() => {
      clearInterval(keepAliveInterval);
      if (chrome.runtime.lastError) {
        console.error('Port disconnected:', chrome.runtime.lastError);
        hideProgress();
        showOverlay('Connection lost. Please try again.', 5000);
        if (btn) {
          btn.disabled = false;
          btn.style.opacity = 1;
        }
      }
    });
  } catch (err) {
    hideProgress();
    console.error(err);
    let errorMessage = err.message;

    if (err.name === 'TypeError' && errorMessage.includes('fetch')) {
      showOverlay(
        'Backend not running!\n\n' +
        'To start it:\n' +
        '• Docker: make docker-up\n' +
        '• Local: make dev\n\n' +
        'Then try again.',
        10000
      );
    } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      showOverlay(
        'Cannot connect to backend.\n\n' +
        'Make sure the backend is running:\n' +
        '• Docker: make docker-up\n' +
        '• Local: make dev',
        8000
      );
    } else {
      showOverlay(`Error: ${errorMessage}`, 5000);
    }

    if (btn) {
      btn.disabled = false;
      btn.style.opacity = 1;
    }
  }
}

function toggleSubtitleVisibility() {
  const btn = document.getElementById('ai-subtitle-btn');
  const container = document.getElementById('ai-subtitle-container');

  if (!container) return;

  subtitlesVisible = !subtitlesVisible;

  if (subtitlesVisible) {
    startSubtitleDisplay(cachedSubtitles);
    if (btn) {
      btn.style.opacity = 1;
      btn.title = 'Hide AI Subtitles';
    }
    showOverlay('Subtitles Visible', 1000);
  } else {
    if (subtitleInterval) {
      clearInterval(subtitleInterval);
      subtitleInterval = null;
    }
    container.style.display = 'none';
    if (btn) {
      btn.style.opacity = 0.6;
      btn.title = 'Show AI Subtitles';
    }
    showOverlay('Subtitles Hidden', 1000);
  }
}

async function generateSubtitles() {
  const btn = document.getElementById('ai-subtitle-btn');
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = 0.3;
  }

  updateProgress('Checking backend...', 5);

  const backendAvailable = await checkBackendAvailability();
  if (!backendAvailable) {
    hideProgress();
    showOverlay(
      'Backend not running!\n\n' +
      'To start it:\n' +
      '• Docker: make docker-up\n' +
      '• Local: make dev\n\n' +
      'Then refresh this page.',
      10000
    );
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = 1;
    }
    return;
  }

  // Check for cached subtitles
  const videoId = getVideoId(window.location.href);
  if (videoId) {
    const cachedVtt = await getCachedSubtitles(videoId);
    if (cachedVtt) {
      const cues = parseVTT(cachedVtt);
      cachedSubtitles = cues;
      subtitlesVisible = true;
      startSubtitleDisplay(cues);
      hideProgress();
      showOverlay('Cached Subtitles Loaded!', 2000);
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = 1;
        btn.title = 'Hide AI Subtitles';
      }
      return;
    }
  }

  updateProgress('Checking settings...', 10);

  if (isExtensionContextInvalid() || !chrome.storage || !chrome.storage.local) {
    showOverlay('Extension updated. Please refresh the page.', 5000);
    return;
  }

  try {
    const { provider, openaiApiKey, groqApiKey, baseUrl, targetLanguage, transcriptionModel, translationModel } =
      await chrome.storage.local.get([
        'provider',
        'openaiApiKey',
        'groqApiKey',
        'baseUrl',
        'targetLanguage',
        'transcriptionModel',
        'translationModel',
      ]);

    const apiKey = provider === 'groq' ? groqApiKey : openaiApiKey;

    console.log('AI Subtitles: Settings loaded:', {
      provider,
      apiKey: apiKey ? '***' : 'missing',
      baseUrl,
      targetLanguage,
      transcriptionModel,
      translationModel,
    });

    if (!apiKey) {
      hideProgress();
      showOverlay('Please set your API Key in the extension settings.', 5000);
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = 1;
      }
      return;
    }

    const videoUrl = window.location.href;

    updateProgress('Preparing...', 15);

    const port = chrome.runtime.connect({ name: 'transcription-port' });

    const keepAliveInterval = setInterval(() => {
      port.postMessage({ action: 'ping' });
    }, 10000);

    let progressStage = 'downloading';
    let progressValue = 15;

    port.onMessage.addListener((response) => {
      if (response.action === 'progress') {
        progressValue = response.progress;
        progressStage = response.stage;

        const stageMessages = {
          downloading: 'Downloading Audio (yt-dlp)...',
          transcribing: 'Transcribing with AI...',
          translating: 'Translating Subtitles...',
          summarizing: 'Generating Summary...',
          complete: 'Complete!',
        };

        updateProgress(
          stageMessages[progressStage] || progressStage,
          progressValue,
          response.details || ''
        );
      } else if (response.action === 'transcription_result') {
        clearInterval(keepAliveInterval);
        port.disconnect();

        if (!response.success) {
          hideProgress();
          console.error(response.error);
          showOverlay(`Error: ${response.error}`, 5000);
          if (btn) {
            btn.disabled = false;
            btn.style.opacity = 1;
          }
          return;
        }

        const cues = parseVTT(response.data.vtt);

        // Cache the subtitles
        if (videoId) {
          setCachedSubtitles(videoId, response.data.vtt);
        }

        cachedSubtitles = cues;
        subtitlesVisible = true;
        startSubtitleDisplay(cues);
        hideProgress();

        if (response.data.summary) {
          showSummary(response.data.summary);
        } else {
          showOverlay('Subtitles Ready!', 2000);
        }

        if (btn) {
          btn.disabled = false;
          btn.style.opacity = 1;
          btn.title = 'Hide AI Subtitles';
        }
      } else if (response.action === 'error') {
        clearInterval(keepAliveInterval);
        port.disconnect();
        hideProgress();
        console.error(response.error);

        let errorMessage = response.error;
        if (errorMessage.includes('503') || errorMessage.includes('API connection')) {
          errorMessage =
            'API connection failed.\n\nPossible causes:\n• Invalid API key\n• Rate limit exceeded\n• Network issues\n\nCheck your API key in extension settings.';
        } else if (errorMessage.includes('400') || errorMessage.includes('validation')) {
          errorMessage = 'Invalid request configuration.\n\nCheck your settings and try again.';
        } else if (errorMessage.includes('401') || errorMessage.includes('authentication')) {
          errorMessage = 'Authentication failed.\n\nCheck your API key in extension settings.';
        }

        showOverlay(`Error: ${errorMessage}`, 8000);
        if (btn) {
          btn.disabled = false;
          btn.style.opacity = 1;
        }
      }
    });

    port.postMessage({
      action: 'transcribe',
      data: {
        video_url: videoUrl,
        api_key: apiKey,
        base_url: baseUrl || '',
        target_language: targetLanguage || 'en',
        transcription_model: transcriptionModel || 'whisper-1',
        translation_model: translationModel || 'gpt-5-nano',
        provider: provider || 'openai',
      },
    });

    console.log('AI Subtitles: Sending request to backend');

    port.onDisconnect.addListener(() => {
      clearInterval(keepAliveInterval);
      if (chrome.runtime.lastError) {
        console.error('Port disconnected:', chrome.runtime.lastError);
        hideProgress();
        showOverlay('Connection lost. Please try again.', 5000);
        if (btn) {
          btn.disabled = false;
          btn.style.opacity = 1;
        }
      }
    });
  } catch (err) {
    hideProgress();
    console.error(err);
    let errorMessage = err.message;

    if (err.name === 'TypeError' && errorMessage.includes('fetch')) {
      showOverlay(
        'Backend not running!\n\n' +
        'To start it:\n' +
        '• Docker: make docker-up\n' +
        '• Local: make dev\n\n' +
        'Then try again.',
        10000
      );
    } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      showOverlay(
        'Cannot connect to backend.\n\n' +
        'Make sure the backend is running:\n' +
        '• Docker: make docker-up\n' +
        '• Local: make dev',
        8000
      );
    } else {
      showOverlay(`Error: ${errorMessage}`, 5000);
    }

    if (btn) {
      btn.disabled = false;
      btn.style.opacity = 1;
    }
  }
}

function startSubtitleDisplay(cues) {
  const video = document.querySelector('video');
  if (!video) return;

  let container = document.getElementById('ai-subtitle-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ai-subtitle-container';
    const videoContainer = document.querySelector('#movie_player');
    if (videoContainer) {
      videoContainer.appendChild(container);
    } else {
      document.body.appendChild(container);
    }
  }

  if (subtitleInterval) clearInterval(subtitleInterval);

  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['subtitlePosition', 'subtitleSize'], (settings) => {
      const position = settings.subtitlePosition || 10;
      const size = settings.subtitleSize || 24;
      container.style.bottom = `${position}%`;
      container.style.fontSize = `${size}px`;
    });
  }

  subtitleInterval = setInterval(() => {
    const time = video.currentTime;
    const activeCue = cues.find((c) => time >= c.start && time <= c.end);

    if (activeCue) {
      container.textContent = activeCue.text;
      container.style.display = 'block';
    } else {
      container.style.display = 'none';
    }
  }, 100);
}

function cleanup() {
  clearSubtitleState();
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (injectionInterval) {
    clearInterval(injectionInterval);
    injectionInterval = null;
  }
}

let observer = null;
let injectionInterval = null;

// Observer to handle navigation (SPA)
observer = new MutationObserver(() => {
  checkVideoChange();
  injectButton();
});

observer.observe(document.body, { childList: true, subtree: true });

// Robust injection interval
injectionInterval = setInterval(() => {
  checkVideoChange();
  injectButton();
}, 2000);

// Clean up on page hide (modern replacement for unload)
window.addEventListener('pagehide', cleanup);

// Initial check and cache cleanup
currentVideoUrl = window.location.href;
currentVideoId = getVideoId(currentVideoUrl);
injectButton();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'clear-local-state') {
    console.log('AI Subtitles: Clearing local state as requested by popup');
    clearSubtitleState();
    showOverlay('Cache Cleared! Ready to regenerate.', 2000);
    sendResponse({ success: true });
  }
});

// Clean expired cache on startup (10% chance)
if (Math.random() < 0.1) {
  clearExpiredCache();
}
