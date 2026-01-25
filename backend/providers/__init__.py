from .base import TranscriptionProvider, TranscriptionSegment, ProviderFactory
from .openai import OpenAIProvider
from .groq import GroqProvider

__all__ = [
    "TranscriptionProvider",
    "TranscriptionSegment",
    "ProviderFactory",
    "OpenAIProvider",
    "GroqProvider",
]

ProviderFactory.register("openai", OpenAIProvider())
ProviderFactory.register("groq", GroqProvider())
