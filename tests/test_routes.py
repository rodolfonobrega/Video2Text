import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from main import app

client = TestClient(app)


def test_health_endpoint():
    """Test health check endpoint returns 200."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "providers" in data


def test_models_endpoint():
    """Test models endpoint returns provider models."""
    response = client.get("/models")
    assert response.status_code == 200
    data = response.json()
    assert "providers" in data
    # Check that providers include groq and openai
    provider_names = [p["id"] for p in data["providers"]]
    assert "groq" in provider_names
    assert "openai" in provider_names


@patch('backend.main.yt_dlp.YoutubeDL')
@patch('backend.main.ProviderFactory.get_provider')
def test_transcribe_endpoint_success(mock_get_provider, mock_ytdl):
    """Test successful transcription request."""
    # Mock yt-dlp
    mock_ytdl_instance = MagicMock()
    mock_ytdl.return_value.__enter__.return_value = mock_ytdl_instance
    mock_ytdl_instance.extract_info.return_value = {"title": "Test Video"}

    # Mock provider
    mock_provider = MagicMock()
    mock_provider.transcribe.return_value = "WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nTest subtitle"
    mock_get_provider.return_value = mock_provider

    data = {
        "video_url": "https://www.youtube.com/watch?v=test",
        "api_key": "test_key_with_length",
        "base_url": "",
        "target_language": "en",
        "transcription_model": "whisper-1",
        "translation_model": "gpt-4o-mini",
        "provider": "openai",
        "check_cache": False
    }

    response = client.post("/transcribe", json=data)
    assert response.status_code == 200
    # Should return streaming response, but for test we can check it starts


@patch('backend.main.ProviderFactory.get_provider')
def test_transcribe_endpoint_invalid_provider(mock_get_provider):
    """Test transcription with invalid provider."""
    mock_get_provider.side_effect = ValueError("Invalid provider")

    data = {
        "video_url": "https://www.youtube.com/watch?v=test",
        "api_key": "test_key_with_length",
        "provider": "invalid",
        "check_cache": False
    }

    response = client.post("/transcribe", json=data)
    assert response.status_code == 422


def test_cache_delete_endpoint():
    """Test cache delete endpoint."""
    response = client.delete("/cache")
    assert response.status_code == 200
    data = response.json()
    assert "removed_count" in data