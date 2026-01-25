"""
Utilidades compartilhadas para parsing e formatação de VTT (WebVTT).
Usado por todos os providers de transcrição.
"""

import re
from typing import List
from .base import TranscriptionSegment


def parse_vtt_segments(vtt_content: str) -> List[TranscriptionSegment]:
    """
    Parse VTT content into a list of TranscriptionSegment objects.

    Args:
        vtt_content: String containing WebVTT formatted content

    Returns:
        List of TranscriptionSegment objects with start, end, and text
    """
    lines = vtt_content.strip().split("\n")
    segments = []
    current_segment = None

    time_pattern = re.compile(r"(\d{2}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(\d{2}:)?\d{2}:\d{2}\.\d{3}")

    for line in lines:
        line = line.strip()
        if not line or line == "WEBVTT":
            continue

        if time_pattern.search(line):
            if current_segment:
                segments.append(current_segment)
            times = line.split("-->")
            start = parse_vtt_time(times[0].strip())
            end = parse_vtt_time(times[1].strip())
            current_segment = TranscriptionSegment(start=start, end=end, text="")
        elif current_segment is not None:
            current_segment.text += ("\n" if current_segment.text else "") + line

    if current_segment:
        segments.append(current_segment)

    return segments


def parse_vtt_time(time_str: str) -> float:
    """
    Convert VTT timestamp string to seconds (float).

    Supports formats:
    - MM:SS.mmm
    - HH:MM:SS.mmm

    Args:
        time_str: Timestamp string (e.g., "00:01:23.456")

    Returns:
        Time in seconds as float
    """
    parts = time_str.split(":")
    seconds = 0
    if len(parts) == 3:
        seconds += int(parts[0]) * 3600
        seconds += int(parts[1]) * 60
        seconds += float(parts[2])
    else:
        seconds += int(parts[0]) * 60
        seconds += float(parts[1])
    return seconds


def format_vtt_time(seconds: float) -> str:
    """
    Convert seconds (float) to VTT timestamp string.

    Args:
        seconds: Time in seconds

    Returns:
        VTT formatted timestamp (e.g., "00:01:23.456")
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


def build_vtt_from_segments(segments: List[TranscriptionSegment]) -> str:
    """
    Build WebVTT formatted string from list of TranscriptionSegment objects.

    Args:
        segments: List of TranscriptionSegment objects

    Returns:
        WebVTT formatted string
    """
    vtt = "WEBVTT\n\n"
    for seg in segments:
        start = format_vtt_time(seg.start)
        end = format_vtt_time(seg.end)
        text = seg.text.strip()
        vtt += f"{start} --> {end}\n{text}\n\n"
    return vtt
