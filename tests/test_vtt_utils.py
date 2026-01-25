import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest
from providers.vtt_utils import (
    parse_vtt_segments,
    parse_vtt_time,
    format_vtt_time,
    build_vtt_from_segments
)
from providers.base import TranscriptionSegment


class TestVTTUtils:
    def test_parse_vtt_time_seconds_only(self):
        """Test parsing MM:SS.mmm format."""
        assert parse_vtt_time("01:23.456") == 83.456

    def test_parse_vtt_time_with_hours(self):
        """Test parsing HH:MM:SS.mmm format."""
        assert parse_vtt_time("01:02:03.456") == 3723.456

    def test_format_vtt_time(self):
        """Test formatting seconds to VTT time."""
        assert format_vtt_time(83.456) == "00:01:23.456"
        assert format_vtt_time(3723.456) == "01:02:03.456"

    def test_parse_vtt_segments(self):
        """Test parsing VTT content into segments."""
        vtt_content = """WEBVTT

00:00:01.000 --> 00:00:05.000
Hello world

00:00:05.000 --> 00:00:10.000
This is a test
"""
        segments = parse_vtt_segments(vtt_content)
        assert len(segments) == 2
        assert segments[0].start == 1.0
        assert segments[0].end == 5.0
        assert segments[0].text == "Hello world"
        assert segments[1].text == "This is a test"

    def test_build_vtt_from_segments(self):
        """Test building VTT from segments."""
        segments = [
            TranscriptionSegment(start=1.0, end=5.0, text="Hello"),
            TranscriptionSegment(start=5.0, end=10.0, text="World")
        ]
        vtt = build_vtt_from_segments(segments)
        assert "WEBVTT" in vtt
        assert "00:00:01.000 --> 00:00:05.000" in vtt
        assert "Hello" in vtt