chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'transcription-port') return;

  port.onMessage.addListener((msg) => {
    if (msg.action === 'ping') {
      // Do nothing, just receiving the message keeps the SW alive
      // console.log("Ping received");
    } else if (msg.action === 'transcribe') {
      handleTranscribe(msg.data, port);
    }
  });
});

async function handleTranscribe(data, port) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1800000);

    const response = await fetch('http://127.0.0.1:8000/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      port.postMessage({
        action: 'transcription_result',
        success: false,
        error: `Server error: ${response.status} - ${errorText}`,
      });
      return;
    }

    const result = await response.json();
    port.postMessage({ action: 'transcription_result', success: true, data: result });
  } catch (error) {
    if (error.name === 'AbortError') {
      port.postMessage({ action: 'error', error: 'Request timed out after 30 minutes' });
    } else {
      port.postMessage({ action: 'error', error: error.message });
    }
  }
}
