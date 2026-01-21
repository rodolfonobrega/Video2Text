document.addEventListener('DOMContentLoaded', () => {
  const API_KEY_REGEX = /^sk-[a-zA-Z0-9-_]+$/;

  const transcriptionModelEl = document.getElementById('transcriptionModel');
  const methodEl = document.getElementById('translationMethod');

  function updateMethodOption() {
    const isWhisper1 = transcriptionModelEl && transcriptionModelEl.value === 'whisper-1';
    if (methodEl) {
      const whisperOption = methodEl.querySelector('option[value="whisper"]');
      if (whisperOption) {
        whisperOption.disabled = !isWhisper1;
        if (!isWhisper1 && methodEl.value === 'whisper') {
          methodEl.value = 'chatgpt';
        }
      }
    }
  }

  if (transcriptionModelEl) {
    transcriptionModelEl.addEventListener('change', updateMethodOption);
  }

  // Load saved settings
  chrome.storage.local.get(
    ['apiKey', 'baseUrl', 'targetLanguage', 'transcriptionModel', 'translationModel', 'subtitlePosition', 'subtitleSize', 'translationMethod'],
    (result) => {
      const apiKeyEl = document.getElementById('apiKey');
      const baseUrlEl = document.getElementById('baseUrl');
      const targetLanguageEl = document.getElementById('targetLanguage');
      const translationModelEl = document.getElementById('translationModel');
      const positionEl = document.getElementById('subtitlePosition');
      const sizeEl = document.getElementById('subtitleSize');

      if (apiKeyEl) apiKeyEl.value = result.apiKey || '';
      if (baseUrlEl) baseUrlEl.value = result.baseUrl || 'https://api.openai.com/v1';
      if (targetLanguageEl) targetLanguageEl.value = result.targetLanguage || 'en';
      if (transcriptionModelEl) transcriptionModelEl.value = result.transcriptionModel || 'whisper-1';
      if (translationModelEl) translationModelEl.value = result.translationModel || 'gpt-4o-mini';
      if (positionEl) positionEl.value = result.subtitlePosition || '10';
      if (sizeEl) sizeEl.value = result.subtitleSize || '24';
      if (methodEl) methodEl.value = result.translationMethod || 'chatgpt';

      updateMethodOption();
    }
  );

  // Save settings
  document.getElementById('saveBtn').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const baseUrl = document.getElementById('baseUrl').value.trim();
    const targetLanguage = document.getElementById('targetLanguage').value;
    const transcriptionModel = document.getElementById('transcriptionModel').value.trim();
    const translationModel = document.getElementById('translationModel').value.trim();
    const subtitlePosition = document.getElementById('subtitlePosition').value;
    const subtitleSize = document.getElementById('subtitleSize').value;
    const translationMethod = document.getElementById('translationMethod').value;

    const status = document.getElementById('status');
    const apiKeyError = document.getElementById('apiKeyError');

    if (apiKeyError) apiKeyError.textContent = '';

    if (!apiKey) {
      if (apiKeyError) apiKeyError.textContent = 'API Key is required';
      return;
    }

    if (!API_KEY_REGEX.test(apiKey)) {
      if (apiKeyError) apiKeyError.textContent = 'Invalid API Key format (sk-...)';
      return;
    }

    chrome.storage.local.set(
      {
        apiKey: apiKey,
        baseUrl: baseUrl,
        targetLanguage: targetLanguage,
        transcriptionModel: transcriptionModel,
        translationModel: translationModel,
        subtitlePosition: subtitlePosition,
        subtitleSize: subtitleSize,
        translationMethod: translationMethod,
      },
      () => {
        status.textContent = 'Settings saved!';
        status.style.color = '#27ae60';
        setTimeout(() => {
          status.textContent = '';
        }, 2000);
      }
    );
  });
});
