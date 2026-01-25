import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest
from unittest.mock import patch, MagicMock
from providers.groq import GroqProvider
from providers.openai import OpenAIProvider


class TestGroqProvider:
    def test_get_name(self):
        """Test provider name."""
        provider = GroqProvider()
        assert provider.get_name() == "groq"

    def test_get_concurrency_limit(self):
        """Test concurrency limit."""
        provider = GroqProvider()
        assert provider.get_concurrency_limit() == 10

    @pytest.mark.asyncio
    @patch('backend.providers.litellm_base.litellm.atranscription')
    @patch('builtins.open', new_callable=MagicMock)
    async def test_transcribe_success(self, mock_open, mock_atranscription):
        """Test successful transcription."""
        mock_atranscription.return_value = MagicMock(segments=[{"start": 0, "end": 5, "text": "Test"}])

        provider = GroqProvider()
        result = await provider.transcribe("dummy_audio", "whisper-large-v3-turbo", "test_key", "")
        assert "WEBVTT" in result
        assert "Test" in result

    @pytest.mark.asyncio
    @patch('backend.providers.litellm_base.litellm.acompletion')
    async def test_translate_success(self, mock_completion):
        """Test successful translation."""
        mock_completion.return_value = MagicMock(choices=[MagicMock(message=MagicMock(content='{"translations": ["Texto traducido"]}'))])

        provider = GroqProvider()
        result = await provider.translate("WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nHello", "es", "gpt-4o-mini", "test_key", "")
        assert "Texto traducido" in result


class TestOpenAIProvider:
    def test_get_name(self):
        """Test provider name."""
        provider = OpenAIProvider()
        assert provider.get_name() == "openai"

    @pytest.mark.asyncio
    @patch('backend.providers.litellm_base.litellm.atranscription')
    @patch('builtins.open', new_callable=MagicMock)
    async def test_transcribe_success(self, mock_open, mock_atranscription):
        """Test successful transcription."""
        mock_atranscription.return_value = MagicMock(segments=[{"start": 0, "end": 5, "text": "Test"}])

        provider = OpenAIProvider()
        result = await provider.transcribe("dummy_audio", "whisper-1", "test_key", "")
        assert "WEBVTT" in result
        assert "Test" in result