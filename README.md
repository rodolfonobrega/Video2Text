# YouTube AI Subtitles

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://www.docker.com/)
[![Code style: black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black)

Generate AI-powered subtitles for YouTube videos using OpenAI's Whisper and GPT models.

</div>

## Features

- Generate subtitles using AI (Whisper/GPT-4o)
- Translate subtitles to any language
- Cross-platform support (Windows, macOS, Linux)
- Docker support for easy deployment
- Chrome Extension with clean UI
- Extensible provider architecture

## Prerequisites

- **Docker** (recommended) OR
- **Conda** + **FFmpeg** (for local development)
- **OpenAI API Key** from OpenAI or compatible provider (like OpenRouter)
- **Chrome/Edge Browser** with extensions support

## Quick Start (Docker - Recommended)

### 1. Clone and Setup
```bash
git clone <repository-url>
cd youtube_subtitles
```

### 2. Start Backend with Docker
```bash
make docker-up
```

Backend will be available at http://localhost:8000

### 3. Load Extension in Chrome
- Go to `chrome://extensions`
- Enable "Developer mode" (top right)
- Click "Load unpacked"
- Select the `extension` folder

### 4. Configure Extension
- Click the extension icon in the Chrome toolbar
- Enter your **API Key**
- (Optional) Set **Base URL** (e.g., `https://openrouter.ai/api/v1`)
- Configure **Transcription Model** (default: `gpt-4o-mini-transcribe`)
- Configure **Translation Model** (default: `gpt-4o-mini`)
- Select target **Language**
- Click **Save Settings**

### 5. Use the Extension
1. Open a YouTube video
2. Click the **Generate AI Subtitles** button (✨ icon) in player controls
3. Wait for AI processing
4. Subtitles will appear automatically

## Development Setup

### Option 1: Docker (Cross-platform)
```bash
# Start backend
make docker-up

# View logs
make docker-logs

# Stop backend
make docker-down

# Restart backend
make docker-restart
```

### Option 2: Local Development (Python + Conda)

#### Prerequisites
- **Conda** installed
- **FFmpeg** installed and in PATH
  - Windows: `winget install ffmpeg` or [ffmpeg.org](https://ffmpeg.org/)
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg` (Ubuntu/Debian)

#### Setup
```bash
# Create environment
make setup

# Or manually:
conda create -n youtube_extension python=3.12
conda activate youtube_extension
pip install -r backend/requirements.txt
npm install
```

#### Start Backend
```bash
make dev
# Or: python backend/main.py
```

## Available Commands

### Makefile Commands (Cross-platform)
```bash
make help          # Show all available commands
make install       # Install Python dependencies
make setup         # Create conda environment and install dependencies
make dev           # Start backend server locally
make docker-up     # Start backend with Docker
make docker-down   # Stop Docker containers
make docker-logs   # Show Docker logs
make docker-restart # Restart Docker containers
make lint          # Run linters
make format        # Format code
make clean         # Clean temporary files
```

### NPM Commands (Extension)
```bash
npm install        # Install dev dependencies
npm run lint       # Lint JavaScript files
npm run format     # Format JavaScript/CSS/HTML
npm run validate   # Run linting and formatting
```

## Configuration

### Extension Settings
Access via extension popup in Chrome toolbar:

| Setting | Description | Default |
|---------|-------------|---------|
| API Key | OpenAI/OpenRouter API key | *Required* |
| Base URL | API endpoint URL | `https://api.openai.com/v1` |
| Transcription Model | Speech-to-text model | `gpt-4o-mini-transcribe` |
| Translation Model | Translation model | `gpt-4o-mini` |
| Target Language | Output language | `en` |

## Architecture

### Project Structure
```
youtube_subtitles/
├── backend/
│   ├── main.py              # FastAPI server
│   ├── requirements.txt     # Python dependencies
│   └── providers/
│       ├── __init__.py      # ProviderFactory, exports
│       ├── base.py          # TranscriptionProvider ABC
│       └── openai.py        # OpenAI implementation
├── extension/
│   ├── manifest.json        # Chrome extension config
│   ├── content.js           # Content script
│   ├── background.js        # Service worker
│   ├── popup.js             # Settings popup
│   ├── styles.css           # Extension styles
│   └── images/              # Extension icons
├── Dockerfile               # Backend Docker image
├── docker-compose.yml       # Orchestration
├── Makefile                 # Cross-platform commands
├── package.json             # Node.js scripts
├── pyproject.toml           # Python config (Black)
├── .eslintrc.json           # JS linting
├── .prettierrc.json         # Code formatting
├── AGENTS.md                # Agent guidance
└── README.md                # This file
```

### Tech Stack
- **Backend**: Python 3.12, FastAPI, Uvicorn, yt-dlp, OpenAI
- **Frontend**: Chrome Extension Manifest V3, Vanilla JS
- **Container**: Docker, docker-compose
- **Code Quality**: ESLint, Prettier, Black

## Extending the Project

### Adding a New Provider
The backend uses a provider pattern to support multiple AI transcription services.

1. Create `backend/providers/<provider_name>.py`:
```python
from .base import TranscriptionProvider, TranscriptionSegment

class NewProvider(TranscriptionProvider):
    def get_name(self) -> str:
        return "newprovider"

    async def transcribe(self, audio_path, model, api_key, base_url, **kwargs):
        # Implementation here
        pass

    async def translate(self, vtt_content, target_language, model, api_key, base_url, **kwargs):
        # Implementation here
        pass
```

2. Register in `backend/providers/__init__.py`:
```python
from .newprovider import NewProvider
ProviderFactory.register('newprovider', NewProvider())
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Troubleshooting

### Docker Issues
- **"Cannot connect to Docker daemon"**: Ensure Docker is running
- **"Port 8000 already in use"**: Stop existing services or change port in docker-compose.yml
- **Container fails to start**: Check logs with `make docker-logs`

### Extension Issues
- **Button not showing?** Refresh the page
- **"Failed to fetch" error?** Ensure backend is running (`make docker-up` or `make dev`)
- **"ffmpeg not found"** (local only): Install FFmpeg and restart backend

### API Issues
- **Invalid API key**: Verify your OpenAI/OpenRouter key
- **Rate limiting**: Slow down requests or upgrade API tier
- **Timeout**: Long videos may take time to process

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
