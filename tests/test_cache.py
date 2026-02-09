import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest
from unittest.mock import patch
from main import subtitle_cache, summary_cache, CACHE_MAX_SIZE


class TestCache:
    def test_cache_initially_empty(self):
        """Test cache starts empty."""
        assert len(subtitle_cache) == 0
        assert len(summary_cache) == 0

    def test_subtitle_cache_operations(self):
        """Test basic subtitle cache operations."""
        subtitle_cache["test_key"] = {"vtt": "test vtt", "cached_at": 1234567890}
        assert len(subtitle_cache) == 1
        assert subtitle_cache["test_key"]["vtt"] == "test vtt"

    def test_summary_cache_operations(self):
        """Test basic summary cache operations."""
        summary_cache["video123_en"] = {
            "summary": "Test summary",
            "key_moments": [],
            "language": "en",
            "cached_at": 1234567890
        }
        assert len(summary_cache) == 1
        assert summary_cache["video123_en"]["summary"] == "Test summary"

    def test_summary_cache_key_includes_language(self):
        """Test that summary cache keys are unique per language."""
        video_id = "video123"
        summary_cache[f"{video_id}_en"] = {
            "summary": "English summary",
            "key_moments": [],
            "language": "en",
            "cached_at": 1234567890
        }
        summary_cache[f"{video_id}_pt"] = {
            "summary": "Resumo em português",
            "key_moments": [],
            "language": "pt",
            "cached_at": 1234567890
        }
        assert len(summary_cache) == 2
        assert summary_cache[f"{video_id}_en"]["summary"] == "English summary"
        assert summary_cache[f"{video_id}_pt"]["summary"] == "Resumo em português"