from .base import TranscriptionProvider, TranscriptionSegment, ProviderFactory
from .openai import OpenAIProvider

__all__ = ["TranscriptionProvider", "TranscriptionSegment", "ProviderFactory", "OpenAIProvider"]

ProviderFactory.register("openai", OpenAIProvider())
