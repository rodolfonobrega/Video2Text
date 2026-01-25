import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest
from unittest.mock import patch
from main import subtitle_cache, CACHE_MAX_SIZE


class TestCache:
    def test_cache_initially_empty(self):
        """Test cache starts empty."""
        assert len(subtitle_cache) == 0

    def test_cache_operations(self):
        """Test basic cache operations."""
        subtitle_cache["test_key"] = {"vtt": "test vtt", "cachedAt": 1234567890}
        assert len(subtitle_cache) == 1
        assert subtitle_cache["test_key"]["vtt"] == "test vtt"