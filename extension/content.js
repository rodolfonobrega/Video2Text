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

// Backend availability check
async function checkBackendAvailability() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('http://localhost:8000/health', {
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
function showProgress(stage, progress, details = '') {
  let overlay = document.getElementById('ai-progress-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ai-progress-overlay';
    overlay.innerHTML = `
      <div id="ai-progress-content">
        <div id="ai-progress-title">Generating Subtitles...</div>
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

  bar.style.width = `${progress}%`;
  stageEl.textContent = stage;
  if (details) {
    detailsEl.textContent = details;
    detailsEl.style.display = 'block';
  } else {
    detailsEl.style.display = 'none';
  }

  overlay.style.display = 'block';
}

function updateProgress(stage, progress, details = '') {
  showProgress(stage, progress, details);
}

function hideProgress() {
  const overlay = document.getElementById('ai-progress-overlay');
  if (overlay) {
    overlay.style.display = 'none';
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
    if (error.message?.includes('Extension context invalidated')) {
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

async function clearExpiredCache() {
  if (!chrome.storage || !chrome.storage.local) return;
  try {
    const all = await chrome.storage.local.get(null);
    const now = Date.now();
    const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const key of Object.keys(all)) {
      if (key.startsWith(CACHE_PREFIX)) {
        const data = all[key];
        if (data.cachedAt && now - data.cachedAt > expiryMs) {
          await chrome.storage.local.remove(key);
          removed++;
        }
      }
    }

    if (removed > 0) {
      console.log(`AI Subtitles: Removed ${removed} expired cache entries`);
    }
  } catch (error) {
    console.warn('AI Subtitles: Cache cleanup error:', error);
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

  console.log('AI Subtitles: Injecting button...');

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

  const settingsBtn = document.querySelector('.ytp-settings-button');
  if (settingsBtn && settingsBtn.parentNode === controls) {
    controls.insertBefore(btn, settingsBtn);
  } else {
    controls.insertBefore(btn, controls.firstChild);
  }
  console.log('AI Subtitles: Button injected successfully');
}

async function handleSubtitleButtonClick() {
  if (cachedSubtitles) {
    toggleSubtitleVisibility();
  } else {
    await generateSubtitles();
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

  if (!chrome.storage || !chrome.storage.local) {
    showOverlay('Extension context invalidated. Please refresh the page.', 5000);
    return;
  }

  try {
    const { apiKey, baseUrl, targetLanguage, transcriptionModel, translationModel, translationMethod } =
      await chrome.storage.local.get([
        'apiKey',
        'baseUrl',
        'targetLanguage',
        'transcriptionModel',
        'translationModel',
        'translationMethod',
      ]);

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

    updateProgress('Starting transcription...', 15);

    const port = chrome.runtime.connect({ name: 'transcription-port' });

    const keepAliveInterval = setInterval(() => {
      port.postMessage({ action: 'ping' });
    }, 25000);

    let progressStage = 'downloading';
    let progressValue = 15;

    port.onMessage.addListener((response) => {
      if (response.action === 'progress') {
        progressValue = response.progress;
        progressStage = response.stage;

        const stageMessages = {
          downloading: 'Downloading audio...',
          transcribing: 'Transcribing with AI...',
          translating: 'Translating...',
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
        showOverlay('Subtitles Ready!', 2000);

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
        base_url: baseUrl || 'https://api.openai.com/v1',
        target_language: targetLanguage || 'en',
        transcription_model: transcriptionModel || 'whisper-1',
        translation_model: translationModel || 'gpt-4o-mini',
        translation_method: translationMethod || 'chatgpt',
      },
    });

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

// Clean up on page unload
window.addEventListener('unload', cleanup);

// Initial check and cache cleanup
currentVideoUrl = window.location.href;
currentVideoId = getVideoId(currentVideoUrl);
injectButton();

// Clean expired cache on startup (10% chance)
if (Math.random() < 0.1) {
  clearExpiredCache();
}
