# AGENTS.md

This document provides guidance for agentic coding assistants working in this repository.

## Project Overview

A Chrome extension with Python FastAPI backend that generates AI-powered subtitles for YouTube videos using OpenAI/OpenRouter APIs.

## Build/Run Commands

### Docker (Recommended)
```bash
# Start backend
make docker-up

# View logs
make docker-logs

# Stop backend
make docker-down

# Restart
make docker-restart
```

### Local Development
```bash
# Setup environment
make setup

# Start backend
make dev

# Install dependencies
pip install -r backend/requirements.txt
```

### Extension
Load the `extension` folder in Chrome at `chrome://extensions` with Developer mode enabled.

### Linting & Formatting
```bash
# Run linters
npm run lint

# Format code
npm run format

# Both
npm run validate
```

## Code Style Guidelines

### Python (backend/)
- Use type hints: `from typing import Optional`
- Pydantic models with validators for request validation
- FastAPI route handlers with `@app.post`, `@app.get` decorators
- Error handling: wrap in try/except, raise `HTTPException` with status_code
- Cleanup in `finally` blocks (file deletion, connections)
- Import order: std lib → third-party → local modules
- Function names: `snake_case`
- Constants: `UPPER_SNAKE_CASE`
- Class names: `PascalCase`
- Keep functions focused and <50 lines when possible
- Use context managers: `with open() as file:`

### JavaScript (extension/)
- Use ES6+ features (async/await, arrow functions, const/let)
- Chrome Extension APIs: `chrome.storage.local`, `chrome.runtime.connect`
- Event listeners with anonymous functions for closure access
- Function names: `camelCase`
- DOM queries: `document.querySelector()`, `document.getElementById()`
- Error handling: try/catch with user-friendly overlays
- Timeout/interval cleanup: store IDs, clear on component destruction
- SVG icons inline in HTML strings
- State management: global variables with clear purpose

### CSS (extension/)
- Use BEM-like naming: `#ai-subtitle-container`, `#ai-status-overlay`
- Absolute positioning for overlays
- Z-index: subtitles 9999, status 10000
- Responsive sizing with max-width: 80%
- Font-family chain starting with YouTube fonts

## Provider Architecture

The backend uses a provider pattern to support multiple AI transcription services. To add a new provider:

1. **Create provider file**: `backend/providers/<provider_name>.py`
2. **Implement `TranscriptionProvider`**: Inherit from `TranscriptionProvider` base class
3. **Register provider**: Add to `ProviderFactory` in `__init__.py`

### Provider Base Class (`backend/providers/base.py`)
```python
class TranscriptionProvider(ABC):
    def get_name(self) -> str:
        """Return provider identifier"""

    async def transcribe(self, audio_path, model, api_key, base_url, **kwargs) -> str:
        """Transcribe audio file and return VTT content"""

    async def translate(self, vtt_content, target_language, model, api_key, base_url, **kwargs) -> str:
        """Translate VTT content to target language"""
```

### Available Providers
- `openai` - OpenAI Whisper/GPT-4o Audio API (default)

### Adding a New Provider Example
```python
# backend/providers/anthropic.py
from .base import TranscriptionProvider, TranscriptionSegment

class AnthropicProvider(TranscriptionProvider):
    def get_name(self) -> str:
        return "anthropic"

    async def transcribe(self, audio_path, model, api_key, base_url, **kwargs):
        # Implementation here
        pass

    async def translate(self, vtt_content, target_language, model, api_key, base_url, **kwargs):
        # Implementation here
        pass

# Register in __init__.py
ProviderFactory.register('anthropic', AnthropicProvider())
```

## Error Handling

### Backend Exceptions
- `ProviderError` - Base provider error
- `APIConnectionError` - Network/connection failures
- `AuthenticationError` - Invalid API key
- `RateLimitError` - Rate limit exceeded
- `InvalidModelError` - Invalid model specified

### HTTP Status Codes
- `400` - Validation errors (invalid URL, API key, provider)
- `401` - Authentication failed
- `500` - Internal server error
- `503` - API connection failed

### Frontend Error Handling
- Automatic backend availability check before requests
- User-friendly error messages with troubleshooting hints
- Clear instructions when backend is not running

## Key Patterns

### Backend API Endpoints
- `GET /health` - Health check, returns available providers
- `GET /` - Root info
- `POST - Main transcription endpoint

### Extension Communication /transcribe`
- Content script → Background service worker via port messaging
- Background worker → Localhost:8000 backend via fetch
- Keep-alive pings prevent service worker termination
- Backend availability check before requests

### VTT Format
- WebVTT header: `WEBVTT`
- Timestamps: `HH:MM:SS.mmm --> HH:MM:SS.mmm`
- Text content on following lines

## File Structure
```
backend/
├── main.py              # FastAPI server, routes, validation
├── requirements.txt     # Python dependencies
└── providers/
    ├── __init__.py      # ProviderFactory, exports
    ├── base.py          # TranscriptionProvider ABC
    └── openai.py        # OpenAI implementation

extension/
├── manifest.json        # Chrome extension config
├── content.js           # UI injection, subtitle display
├── background.js        # Service worker, backend communication
├── popup.js             # Settings form, chrome.storage
└── styles.css           # Subtitle and overlay styling

Dockerfile              # Backend container
docker-compose.yml      # Orchestration
Makefile               # Cross-platform commands
package.json           # NPM scripts
pyproject.toml         # Python config (Black)
.eslintrc.json         # JS linting
.prettierrc.json       # Code formatting
```

## Common Pitfalls
- YouTube DOM changes may break selectors (test on different layouts)
- Service worker timeout: always use keep-alive intervals > 25s
- FFmpeg must be in PATH for local development
- Cleanup temp files in finally blocks
- VTT timestamp format must be exact (HH:MM:SS.mmm)
- Validate API requests early (failfast pattern)
