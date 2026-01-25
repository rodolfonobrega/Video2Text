from abc import ABC, abstractmethod
from typing import Dict, Optional, Any
from dataclasses import dataclass


@dataclass
class TranscriptionSegment:
    start: float
    end: float
    text: str


class TranscriptionProvider(ABC):
    @abstractmethod
    def get_name(self) -> str:
        pass

    @abstractmethod
    async def transcribe(
        self, audio_path: str, model: str, api_key: str, base_url: str, **kwargs
    ) -> str:
        pass

    @abstractmethod
    async def translate(
        self,
        vtt_content: str,
        target_language: str,
        model: str,
        api_key: str,
        base_url: str,
        progress_callback: Optional[callable] = None,
        **kwargs,
    ) -> str:
        pass

    @abstractmethod
    async def summarize(
        self,
        transcript: str,
        target_language: str,
        model: str,
        api_key: str,
        base_url: str,
        progress_callback: Optional[callable] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        pass

    @abstractmethod
    async def extract_key_moments(
        self,
        transcript: str,
        target_language: str,
        model: str,
        api_key: str,
        base_url: str,
        progress_callback: Optional[callable] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        pass

    def supports_timestamps(self, model: str) -> bool:
        return "whisper" in model.lower()

    def create_vtt_from_segments(self, segments: list[TranscriptionSegment]) -> str:
        vtt_content = "WEBVTT\n\n"
        for segment in segments:
            start_text = self._format_timestamp(segment.start)
            end_text = self._format_timestamp(segment.end)
            text = segment.text.strip()
            vtt_content += f"{start_text} --> {end_text}\n{text}\n\n"
        return vtt_content

    def _format_timestamp(self, seconds: float) -> str:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = seconds % 60
        return f"{hours:02}:{minutes:02}:{secs:06.3f}"


class ProviderFactory:
    _providers: Dict[str, TranscriptionProvider] = {}

    @classmethod
    def register(cls, name: str, provider: TranscriptionProvider):
        cls._providers[name] = provider

    @classmethod
    def get_provider(cls, name: str) -> Optional[TranscriptionProvider]:
        return cls._providers.get(name)

    @classmethod
    def list_providers(cls) -> list[str]:
        return list(cls._providers.keys())
