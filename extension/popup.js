document.addEventListener('DOMContentLoaded', () => {
  // Load saved settings
  chrome.storage.local.get(
    ['apiKey', 'baseUrl', 'targetLanguage', 'transcriptionModel', 'translationModel'],
    (result) => {
      const apiKeyEl = document.getElementById('apiKey');
      const baseUrlEl = document.getElementById('baseUrl');
      const targetLanguageEl = document.getElementById('targetLanguage');
      const transcriptionModelEl = document.getElementById('transcriptionModel');
      const translationModelEl = document.getElementById('translationModel');

      if (result.apiKey && apiKeyEl) apiKeyEl.value = result.apiKey;
      if (result.baseUrl && baseUrlEl) baseUrlEl.value = result.baseUrl;
      if (result.targetLanguage && targetLanguageEl) targetLanguageEl.value = result.targetLanguage;
      if (result.transcriptionModel && transcriptionModelEl)
        transcriptionModelEl.value = result.transcriptionModel;
      if (result.translationModel && translationModelEl)
        translationModelEl.value = result.translationModel;
    }
  );

  // Save settings
  document.getElementById('saveBtn').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value;
    const baseUrl = document.getElementById('baseUrl').value;
    const targetLanguage = document.getElementById('targetLanguage').value;
    const transcriptionModel = document.getElementById('transcriptionModel').value;
    const translationModel = document.getElementById('translationModel').value;

    chrome.storage.local.set(
      {
        apiKey: apiKey,
        baseUrl: baseUrl,
        targetLanguage: targetLanguage,
        transcriptionModel: transcriptionModel,
        translationModel: translationModel,
      },
      () => {
        const status = document.getElementById('status');
        status.textContent = 'Settings saved!';
        setTimeout(() => {
          status.textContent = '';
        }, 2000);
      }
    );
  });
});
