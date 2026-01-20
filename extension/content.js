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

// Global state for subtitle management
let cachedSubtitles = null;
let subtitlesVisible = false;
let subtitleInterval = null;
let currentVideoUrl = null;

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

  if (currentVideoUrl && currentVideoUrl !== newUrl) {
    console.log('AI Subtitles: Video changed, clearing state');
    clearSubtitleState();
  }

  currentVideoUrl = newUrl;
}

// UI Injection
function injectButton() {
  // Check if button already exists
  if (document.getElementById('ai-subtitle-btn')) return;

  // Try multiple selectors for controls
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

  // Flexbox for perfect centering
  btn.style.display = 'inline-flex';
  btn.style.alignItems = 'center';
  btn.style.justifyContent = 'center';

  btn.style.verticalAlign = 'middle';
  btn.style.width = '48px';
  btn.style.padding = '0';

  btn.addEventListener('click', handleSubtitleButtonClick);

  // Insert before the settings button if possible to avoid overlap
  const settingsBtn = document.querySelector('.ytp-settings-button');
  if (settingsBtn && settingsBtn.parentNode === controls) {
    controls.insertBefore(btn, settingsBtn);
  } else {
    // Fallback: Prepend to the controls container
    controls.insertBefore(btn, controls.firstChild);
  }
  console.log('AI Subtitles: Button injected successfully');
}

async function handleSubtitleButtonClick() {
  // If subtitles already exist, toggle visibility
  if (cachedSubtitles) {
    toggleSubtitleVisibility();
  } else {
    // Generate new subtitles
    await generateSubtitles();
  }
}

function toggleSubtitleVisibility() {
  const btn = document.getElementById('ai-subtitle-btn');
  const container = document.getElementById('ai-subtitle-container');

  if (!container) return;

  subtitlesVisible = !subtitlesVisible;

  if (subtitlesVisible) {
    // Resume subtitle display
    startSubtitleDisplay(cachedSubtitles);
    if (btn) {
      btn.style.opacity = 1;
      btn.title = 'Hide AI Subtitles';
    }
    showOverlay('Subtitles Visible', 1000);
  } else {
    // Hide subtitles
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

  showOverlay('Checking backend availability...');

  const backendAvailable = await checkBackendAvailability();
  if (!backendAvailable) {
    hideOverlay();
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

  showOverlay('Generating Subtitles... Please wait.');

  try {
    const { apiKey, baseUrl, targetLanguage, transcriptionModel, translationModel } =
      await chrome.storage.local.get([
        'apiKey',
        'baseUrl',
        'targetLanguage',
        'transcriptionModel',
        'translationModel',
      ]);

    if (!apiKey) {
      alert('Please set your API Key in the extension settings.');
      hideOverlay();
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = 1;
      }
      return;
    }

    const videoUrl = window.location.href;

    const port = chrome.runtime.connect({ name: 'transcription-port' });

    // Keep-alive interval
    const keepAliveInterval = setInterval(() => {
      port.postMessage({ action: 'ping' });
    }, 25000); // Ping every 25 seconds

    port.onMessage.addListener((response) => {
      if (response.action === 'transcription_result') {
        clearInterval(keepAliveInterval);
        port.disconnect();

        if (!response.success) {
          console.error(response.error);
          showOverlay(`Error: ${response.error}`, 5000);
          if (btn) {
            btn.disabled = false;
            btn.style.opacity = 1;
          }
          return;
        }

        const cues = parseVTT(response.data.vtt);
        cachedSubtitles = cues;
        subtitlesVisible = true;
        startSubtitleDisplay(cues);
        showOverlay('Subtitles Ready!', 2000);

        if (btn) {
          btn.disabled = false;
          btn.style.opacity = 1;
          btn.title = 'Hide AI Subtitles';
        }
      } else if (response.action === 'error') {
        clearInterval(keepAliveInterval);
        port.disconnect();
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
        transcription_model: transcriptionModel || 'gpt-4o-mini-transcribe',
        translation_model: translationModel || 'gpt-4o-mini',
      },
    });

    // Handle disconnection (e.g., if SW crashes)
    port.onDisconnect.addListener(() => {
      clearInterval(keepAliveInterval);
      if (chrome.runtime.lastError) {
        console.error('Port disconnected:', chrome.runtime.lastError);
        showOverlay('Connection lost. Please try again.', 5000);
        if (btn) {
          btn.disabled = false;
          btn.style.opacity = 1;
        }
      }
    });
  } catch (err) {
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

// Observer to handle navigation (SPA)
const observer = new MutationObserver(() => {
  checkVideoChange();
  injectButton();
});

observer.observe(document.body, { childList: true, subtree: true });

// Robust injection interval
setInterval(() => {
  checkVideoChange();
  injectButton();
}, 2000);

// Initial check
currentVideoUrl = window.location.href;
injectButton();
