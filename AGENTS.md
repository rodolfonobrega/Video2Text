# AGENTS.md

This document provides guidance for agentic coding assistants working in this repository.

## Project Overview

A Chrome extension with Python FastAPI backend that generates AI-powered subtitles for YouTube videos using OpenAI/OpenRouter APIs.

## Build/Run Commands

### Docker (Recommended)
```bash
make docker-up      # Start backend
make docker-logs    # View logs
make docker-down    # Stop backend
make docker-restart # Restart containers
```

### Local Development
```bash
make setup          # Create conda env and install deps
make dev            # Start backend server locally
pip install -r backend/requirements.txt
```

### Extension
Load `extension/` folder in Chrome at `chrome://extensions` with Developer mode enabled.

## Linting & Formatting

```bash
make lint           # Run all linters (ESLint + Black check)
make format         # Format all code (ESLint + Black)
npm run lint        # JS lint only
npm run lint:fix    # JS lint with auto-fix
npm run format      # JS format only (Prettier)
npm run validate    # Run lint + format
```

### Single Test Commands
```bash
pytest              # Run all tests
pytest tests/       # Run specific test directory
pytest file.py      # Run specific test file
pytest -v           # Verbose output
pytest -k "test_name"  # Run tests matching pattern
```

## Code Style Guidelines

### Python (backend/)
- **Formatting**: Black (line-length 100, Python 3.12)
- **Imports**: std lib → third-party → local modules
- **Types**: Use type hints (`from typing import Optional`)
- **Naming**: `snake_case` (functions/vars), `UPPER_SNAKE_CASE` (constants), `PascalCase` (classes)
- **Validation**: Pydantic models with `@field_validator`
- **Routes**: FastAPI with `@app.post`, `@app.get` decorators
- **Error Handling**: Wrap in try/except, raise `HTTPException` with status_code
- **Cleanup**: Use `finally` blocks for file deletion, connections
- **Context Managers**: Use `with open() as file:`
- **Functions**: Keep focused, <50 lines when possible

### JavaScript (extension/)
- **ES6+**: async/await, arrow functions, const/let
- **APIs**: `chrome.storage.local`, `chrome.runtime.connect`
- **Naming**: `camelCase` (functions/vars)
- **DOM**: `document.querySelector()`, `document.getElementById()`
- **Error Handling**: try/catch with user-friendly overlays
- **Cleanup**: Store timeout/interval IDs, clear on component destruction
- **Icons**: Inline SVG in HTML strings
- **State**: Global variables with clear purpose

### CSS (extension/)
- **Naming**: BEM-like (`#ai-subtitle-container`, `#ai-status-overlay`)
- **Positioning**: Absolute for overlays
- **Z-index**: subtitles 9999, status 10000
- **Responsive**: max-width 80%
- **Font**: Start with YouTube fonts chain

### Linting Config
- **Python**: Black (`pyproject.toml`)
- **JS**: ESLint + Prettier (`.eslintrc.json`, `.prettierrc.json`)
- **JS Rules**: 2-space indent, single quotes, semicolons required

## Provider Architecture

Add new AI transcription providers by creating `backend/providers/<name>.py`:
1. Inherit from `TranscriptionProvider` base class
2. Implement `get_name()`, `transcribe()`, `translate()`
3. Register in `ProviderFactory` (`__init__.py`)

## Error Handling

### Backend Exceptions
- `ProviderError` (base), `APIConnectionError`, `AuthenticationError`, `RateLimitError`, `InvalidModelError`

### HTTP Status Codes
- 400 (validation), 401 (auth), 500 (server), 503 (API unavailable)

### Frontend
- Check backend availability before requests
- User-friendly messages with troubleshooting hints

## Common Pitfalls
- YouTube DOM changes may break selectors
- Service worker timeout: use keep-alive > 25s
- FFmpeg must be in PATH for local dev
- Cleanup temp files in `finally` blocks
- VTT timestamps: `HH:MM:SS.mmm --> HH:MM:SS.mmm`
- Validate API requests early (failfast)
