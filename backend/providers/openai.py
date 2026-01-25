"""
Provider OpenAI usando LiteLLM com Structured Output.
"""

from typing import Optional
from .litellm_base import LiteLLMProvider


class OpenAIProvider(LiteLLMProvider):
    """Provider para OpenAI via LiteLLM com Structured Output."""

    def get_name(self) -> str:
        return "openai"

    def use_structured_output(self, model: str = None) -> bool:
        """OpenAI suporta structured output."""
        return True

    def get_transcription_params(self, model: str, api_key: str, base_url: str) -> dict:
        """Adiciona parametros especificos do OpenAI para transcricao."""
        params = super().get_transcription_params(model, api_key, base_url)
        params["api_base"] = base_url or "https://api.openai.com/v1"

        # gpt-4o-mini-transcribe supports only 'json' or 'text'
        # whisper-1 supports 'verbose_json' and timestamp_granularities
        if model == "whisper-1":
            params["timestamp_granularities"] = ["segment"]
            # verbose_json is already the default in the base class
        elif model == "gpt-4o-mini-transcribe":
            # gpt-4o-mini-transcribe uses 'vtt' for timestamps
            params["response_format"] = "vtt"

        return params

    def get_translation_params(self, model: str, api_key: str, base_url: str) -> dict:
        """Adiciona parametros especificos do OpenAI para traducao."""
        params = super().get_translation_params(model, api_key, base_url)
        params["api_base"] = base_url or "https://api.openai.com/v1"
        return params

    async def extract_key_moments(
        self,
        transcript: str,
        target_language: str,
        model: str,
        api_key: str,
        base_url: str,
        progress_callback: Optional[callable] = None,
        **kwargs,
    ) -> dict:
        """Extrai momentos-chave usando OpenAI."""
        return await self._extract_key_moments(
            transcript, target_language, model, api_key, base_url, progress_callback
        )
