document.addEventListener('DOMContentLoaded', () => {
  const OPENAI_API_KEY_REGEX = /^sk-[a-zA-Z0-9-_]+$/;
  const BACKEND_URL = 'http://127.0.0.1:8000';

  // Store models loaded from the API
  let availableModels = {
    openai: { transcription: [], translation: [] },
    groq: { transcription: [], translation: [] },
  };

  const PROVIDER_DEFAULTS = {
    openai: {
      transcriptionModel: 'whisper-1',
      translationModel: 'gpt-4o-mini',
      summarizationModel: 'gpt-4o-mini',
      fallback_translation: [
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
        { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
        { id: 'gpt-5-nano', name: 'GPT-5 Nano' },
      ],
    },
    groq: {
      transcriptionModel: 'whisper-large-v3-turbo',
      translationModel: 'openai/gpt-oss-20b',
      summarizationModel: 'openai/gpt-oss-20b',
      fallback_translation: [
        { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B (Pro)' },
        { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B (Swift)' },
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B' },
        { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout' },
        { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick' },
        { id: 'qwen/qwen3-32b', name: 'Qwen3 32B' },
      ],
    },
  };

  const transcriptionModelEl = document.getElementById('transcriptionModel');
  const translationModelEl = document.getElementById('translationModel');
  const summarizationModelEl = document.getElementById('summarizationModel');
  const providerEl = document.getElementById('provider');
  const openaiApiKeyGroup = document.getElementById('openaiApiKeyGroup');
  const groqApiKeyGroup = document.getElementById('groqApiKeyGroup');
  const openaiApiKeyEl = document.getElementById('openaiApiKey');
  const groqApiKeyEl = document.getElementById('groqApiKey');
  const baseUrlEl = document.getElementById('baseUrl');
  const baseUrlGroup = baseUrlEl?.closest('.form-group');

  const positionEl = document.getElementById('subtitlePosition');
  const sizeEl = document.getElementById('subtitleSize');
  const targetLanguageEl = document.getElementById('targetLanguage');
  const summaryLanguageEl = document.getElementById('summaryLanguage');

  function updateProviderUI() {
    if (!providerEl || !openaiApiKeyGroup || !groqApiKeyGroup) return;

    const provider = providerEl.value;

    if (provider === 'openai') {
      openaiApiKeyGroup.style.display = 'block';
      groqApiKeyGroup.style.display = 'none';

      // Show baseUrl for OpenAI
      if (baseUrlGroup) {
        baseUrlGroup.style.display = 'block';
      }

      // Update baseUrl placeholder
      if (baseUrlEl) {
        baseUrlEl.placeholder = 'https://api.openai.com/v1';
      }
    } else {
      // provider === 'groq'
      openaiApiKeyGroup.style.display = 'none';
      groqApiKeyGroup.style.display = 'block';

      // Hide baseUrl for Groq (not needed)
      if (baseUrlGroup) {
        baseUrlGroup.style.display = 'none';
      }

      // Update baseUrl placeholder for Groq
      if (baseUrlEl) {
        baseUrlEl.placeholder = 'Auto-detected (not needed for Groq)';
      }
    }

    // Update model dropdowns when provider changes
    populateModelDropdowns(provider);
  }

  async function loadModels(savedTranscription, savedTranslation, savedSummarization) {
    try {
      const response = await fetch(`${BACKEND_URL}/models`);
      if (!response.ok) {
        console.error('Failed to load models from API');
        populateModelDropdowns(
          providerEl?.value || 'groq',
          true,
          savedTranscription,
          savedTranslation,
          savedSummarization
        );
        return;
      }

      const data = await response.json();

      // Organize models by provider
      data.providers.forEach((provider) => {
        availableModels[provider.id] = {
          transcription: provider.transcription_models || [],
          translation: provider.translation_models || [],
        };
      });

      // Populate dropdowns with the current provider
      const currentProvider = providerEl?.value || 'groq';
      populateModelDropdowns(
        currentProvider,
        false,
        savedTranscription,
        savedTranslation,
        savedSummarization
      );
    } catch (error) {
      console.error('Error loading models:', error);
      populateModelDropdowns(
        providerEl?.value || 'groq',
        true,
        savedTranscription,
        savedTranslation,
        savedSummarization
      );
    }
  }

  function populateModelDropdowns(
    provider,
    useFallback = false,
    savedTranscription = null,
    savedTranslation = null,
    savedSummarization = null
  ) {
    if (!transcriptionModelEl || !translationModelEl || !summarizationModelEl) return;

    // Populate transcription dropdown
    transcriptionModelEl.innerHTML = '';
    const transcriptionModels = useFallback ? [] : availableModels[provider]?.transcription || [];

    if (transcriptionModels.length === 0) {
      // Fallback for default values
      const defaultModel = PROVIDER_DEFAULTS[provider]?.transcriptionModel || 'whisper-1';
      const option = document.createElement('option');
      option.value = defaultModel;
      option.textContent = defaultModel;
      transcriptionModelEl.appendChild(option);
    } else {
      transcriptionModels.forEach((model) => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        transcriptionModelEl.appendChild(option);
      });
    }

    // Priority: saved > stored > default
    if (
      savedTranscription &&
      Array.from(transcriptionModelEl.options).some((opt) => opt.value === savedTranscription)
    ) {
      transcriptionModelEl.value = savedTranscription;
    } else {
      transcriptionModelEl.value =
        PROVIDER_DEFAULTS[provider]?.transcriptionModel || transcriptionModelEl.options[0]?.value;
    }

    // Populate translation dropdown
    translationModelEl.innerHTML = '';
    const translationModels = useFallback ? [] : availableModels[provider]?.translation || [];

    if (translationModels.length === 0) {
      // Fallback for object list
      const fallbackList = PROVIDER_DEFAULTS[provider]?.fallback_translation || [
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      ];
      fallbackList.forEach((m) => {
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = m.name;
        translationModelEl.appendChild(option);
      });
    } else {
      translationModels.forEach((model) => {
        const option = document.createElement('option');
        option.value = model.id;

        // Add name and badge if structured output is supported
        let text = model.name;
        if (model.supports_structured_output) {
          text += ' [JSON]'; // Badge for structured output
        }
        option.textContent = text;

        // Add description as data attribute for future tooltip
        if (model.description) {
          option.setAttribute('title', model.description);
        }

        translationModelEl.appendChild(option);
      });
    }

    // Priority: saved > stored > default
    if (
      savedTranslation &&
      Array.from(translationModelEl.options).some((opt) => opt.value === savedTranslation)
    ) {
      translationModelEl.value = savedTranslation;
    } else {
      translationModelEl.value =
        PROVIDER_DEFAULTS[provider]?.translationModel || translationModelEl.options[0]?.value;
    }

    // Populate summary dropdown
    summarizationModelEl.innerHTML = '';
    // For summary, we use the same translation models
    const summarizationModels =
      translationModels.length > 0
        ? translationModels
        : PROVIDER_DEFAULTS[provider]?.fallback_translation || [
            { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B' },
          ];

    summarizationModels.forEach((model) => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      summarizationModelEl.appendChild(option);
    });

    // Priority: saved > stored > default
    if (
      savedSummarization &&
      Array.from(summarizationModelEl.options).some((opt) => opt.value === savedSummarization)
    ) {
      summarizationModelEl.value = savedSummarization;
    } else {
      summarizationModelEl.value =
        PROVIDER_DEFAULTS[provider]?.summarizationModel || summarizationModelEl.options[0]?.value;
    }

    // Update notes
    updateModelNotes(provider);
  }

  function updateModelNotes(provider) {
    const transcriptionNote = document.getElementById('transcriptionModelNote');
    const translationNote = document.getElementById('translationModelNote');

    if (transcriptionNote) {
      transcriptionNote.textContent =
        provider === 'groq' ? 'Ultra-fast transcription with LPUs' : 'OpenAI Whisper model';
    }

    if (translationNote) {
      const selectedModel = translationModelEl?.value || '';
      const modelData = availableModels[provider]?.translation.find((m) => m.id === selectedModel);

      if (modelData?.supports_structured_output) {
        translationNote.textContent = '✓ Structured Output enabled (100% schema adherence)';
        translationNote.style.color = '#27ae60';
      } else {
        // If no modelData (e.g., fallback) or structured output not supported
        const fallbackModel = PROVIDER_DEFAULTS[provider]?.fallback_translation.find(
          (m) => m.id === selectedModel
        );
        translationNote.textContent =
          modelData?.description || fallbackModel?.description || 'Standard JSON output';
        translationNote.style.color = '#95a5a6';
      }
    }
  }

  function applyProviderDefaults() {
    if (!providerEl || !transcriptionModelEl || !translationModelEl || !summarizationModelEl)
      return;

    const provider = providerEl.value;
    const defaults = PROVIDER_DEFAULTS[provider];

    if (defaults) {
      if (!transcriptionModelEl.dataset.userModifiedTranscription) {
        transcriptionModelEl.value = defaults.transcriptionModel;
      }
      if (!translationModelEl.dataset.userModifiedTranslation) {
        translationModelEl.value = defaults.translationModel;
      }
      if (!summarizationModelEl.dataset.userModifiedSummarization) {
        summarizationModelEl.value = defaults.summarizationModel;
      }
    }

    updateModelNotes(provider);
  }

  function updateRangeLabels() {
    const positionEl = document.getElementById('subtitlePosition');
    const sizeEl = document.getElementById('subtitleSize');
    const positionValue = document.getElementById('positionValue');
    const sizeValue = document.getElementById('sizeValue');

    if (positionEl && positionValue) {
      positionValue.textContent = positionEl.value + '%';
    }
    if (sizeEl && sizeValue) {
      sizeValue.textContent = sizeEl.value + 'px';
    }
  }

  if (providerEl) {
    providerEl.addEventListener('change', () => {
      updateProviderUI();
      applyProviderDefaults();
    });
  }

  if (transcriptionModelEl) {
    transcriptionModelEl.addEventListener('input', () => {
      transcriptionModelEl.dataset.userModifiedTranscription = 'true';
    });
  }

  if (translationModelEl) {
    translationModelEl.addEventListener('change', () => {
      translationModelEl.dataset.userModifiedTranslation = 'true';
      // Update note when model changes
      const provider = providerEl?.value || 'groq';
      updateModelNotes(provider);
    });
  }

  if (summarizationModelEl) {
    summarizationModelEl.addEventListener('change', () => {
      summarizationModelEl.dataset.userModifiedSummarization = 'true';
    });
  }

  document.getElementById('subtitlePosition')?.addEventListener('input', updateRangeLabels);
  document.getElementById('subtitleSize')?.addEventListener('input', updateRangeLabels);

  // Check backend availability when popup opens
  checkBackendStatus();

  function checkBackendStatus() {
    const statusEl = document.getElementById('backend-status');
    const statusText = statusEl?.querySelector('.status-text');

    if (!statusEl || !statusText) return;

    statusEl.className = 'checking';
    statusText.textContent = 'Checking backend...';

    fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(3000) })
      .then((response) => {
        if (response.ok) {
          statusEl.className = 'online';
          statusText.textContent = 'Backend online';
        } else {
          throw new Error('Backend returned error');
        }
      })
      .catch(() => {
        statusEl.className = 'offline';
        statusText.textContent = 'Backend offline - start with "make dev"';
      });
  }

  chrome.storage.local.get(
    [
      'provider',
      'openaiApiKey',
      'groqApiKey',
      'baseUrl',
      'targetLanguage',
      'summaryLanguage',
      'transcriptionModel',
      'translationModel',
      'summarizationModel',
      'subtitlePosition',
      'subtitleSize',
    ],
    (result) => {
      if (providerEl) providerEl.value = result.provider || 'groq';
      if (openaiApiKeyEl) openaiApiKeyEl.value = result.openaiApiKey || '';
      if (groqApiKeyEl) groqApiKeyEl.value = result.groqApiKey || '';
      if (baseUrlEl) baseUrlEl.value = result.baseUrl || '';
      if (targetLanguageEl) targetLanguageEl.value = result.targetLanguage || 'en';
      if (summaryLanguageEl) summaryLanguageEl.value = result.summaryLanguage || 'en';

      // CRITICAL UPDATE: Sync UI after loading provider
      updateProviderUI();

      // Load models FIRST (before setting saved values)
      loadModels(result.transcriptionModel, result.translationModel, result.summarizationModel);

      if (positionEl) positionEl.value = result.subtitlePosition || '10';
      if (sizeEl) sizeEl.value = result.subtitleSize || '24';

      updateRangeLabels();
    }
  );

  document.getElementById('saveBtn').addEventListener('click', () => {
    const provider = document.getElementById('provider').value;
    const openaiApiKey = document.getElementById('openaiApiKey').value.trim();
    const groqApiKey = document.getElementById('groqApiKey').value.trim();
    const baseUrl = document.getElementById('baseUrl').value.trim();
    const targetLanguage = document.getElementById('targetLanguage').value;
    const summaryLanguage = document.getElementById('summaryLanguage').value;
    const transcriptionModel = document.getElementById('transcriptionModel').value.trim();
    const translationModel = document.getElementById('translationModel').value.trim();
    const summarizationModel = document.getElementById('summarizationModel').value.trim();
    const subtitlePosition = document.getElementById('subtitlePosition').value;
    const subtitleSize = document.getElementById('subtitleSize').value;

    const openaiApiKeyError = document.getElementById('openaiApiKeyError');
    const groqApiKeyError = document.getElementById('groqApiKeyError');

    if (openaiApiKeyError) openaiApiKeyError.textContent = '';
    if (groqApiKeyError) groqApiKeyError.textContent = '';

    if (provider === 'openai') {
      if (!openaiApiKey) {
        if (openaiApiKeyError) openaiApiKeyError.textContent = 'OpenAI API Key is required';
        return;
      }
      if (!OPENAI_API_KEY_REGEX.test(openaiApiKey)) {
        if (openaiApiKeyError)
          openaiApiKeyError.textContent = 'Invalid OpenAI API Key format (sk-...)';
        return;
      }
    } else {
      if (!groqApiKey) {
        if (groqApiKeyError) groqApiKeyError.textContent = 'Groq API Key is required';
        return;
      }
      // Relaxing regex to allow varied keys
      if (groqApiKey.length < 10) {
        if (groqApiKeyError) groqApiKeyError.textContent = 'Invalid Groq API Key (too short)';
        return;
      }
    }

    chrome.storage.local.set(
      {
        provider: provider,
        openaiApiKey: openaiApiKey,
        groqApiKey: groqApiKey,
        baseUrl: baseUrl,
        targetLanguage: targetLanguage,
        summaryLanguage: summaryLanguage,
        transcriptionModel: transcriptionModel,
        translationModel: translationModel,
        summarizationModel: summarizationModel,
        subtitlePosition: subtitlePosition,
        subtitleSize: subtitleSize,
      },
      () => {
        console.log('Settings saved to storage:', {
          provider,
          groqKey: groqApiKey ? '***' : 'none',
        });
        const status = document.getElementById('status');
        if (status) {
          status.textContent = 'Settings saved!';
          status.style.color = '#27ae60';
          setTimeout(() => {
            status.textContent = '';
          }, 2000);
        }
      }
    );
  });

  document.getElementById('clearCacheBtn').addEventListener('click', async () => {
    const clearBtn = document.getElementById('clearCacheBtn');

    try {
      clearBtn.disabled = true;
      clearBtn.textContent = 'Clearing...';

      const response = await fetch('http://127.0.0.1:8000/cache', {
        method: 'DELETE',
      });
      const serverData = await response.json();

      const SUBTITLES_PREFIX = 'yt_subtitles_cache_';
      const SUMMARY_PREFIX = 'yt_summary_cache_';
      const allData = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(allData).filter(
        (key) => key.startsWith(SUBTITLES_PREFIX) || key.startsWith(SUMMARY_PREFIX)
      );
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: 'clear-local-state' }).catch(() => {});
      }

      const status = document.getElementById('status');
      if (status) {
        status.textContent = `Full Reset Complete! Removed ${serverData.removed_count} server entries + ${keysToRemove.length} local entries (subtitles + summaries).`;
        status.style.color = '#27ae60';

        setTimeout(() => {
          status.textContent = '';
        }, 3000);
      }
    } catch {
      console.error('Failed to clear cache');
      const status = document.getElementById('status');
      if (status) {
        status.textContent = 'Failed to clear cache. Check if backend is running.';
        status.style.color = '#e74c3c';
      }
    } finally {
      clearBtn.disabled = false;
      clearBtn.textContent = 'Clear Server Cache';
    }
  });
});
