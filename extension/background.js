/* eslint-disable no-constant-condition */

chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.includes('port')) return;

  port.onMessage.addListener((msg) => {
    if (msg.action === 'ping') {
      // Do nothing, just receiving the message keeps the SW alive
      // console.log("Ping received");
    } else if (msg.action === 'transcribe') {
      handleTranscribe(msg.data, port, '/transcribe');
    } else if (msg.action === 'summarize') {
      handleTranscribe(msg.data, port, '/summarize');
    }
  });
});

async function handleTranscribe(data, port, endpoint) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1800000); // 30 minutes

    const response = await fetch(`http://127.0.0.1:8000${endpoint}`, {
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
        action: endpoint === '/summarize' ? 'summary_result' : 'transcription_result',
        success: false,
        error: `Server error: ${response.status} - ${errorText}`,
      });
      return;
    }

    // Handle Streaming Response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep partial line for next chunk

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const payload = JSON.parse(line);
          port.postMessage(payload);
        } catch (e) {
          console.error('Error parsing stream chunk:', e, line);
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      try {
        const payload = JSON.parse(buffer);
        port.postMessage(payload);
      } catch (e) {
        console.error('Error parsing final stream chunk:', e, buffer);
      }
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      port.postMessage({ action: 'error', error: 'Request timed out after 30 minutes' });
    } else {
      port.postMessage({ action: 'error', error: error.message });
    }
  }
}