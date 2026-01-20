from typing import Optional
from openai import OpenAI, APIError, APIConnectionError, RateLimitError
from .base import TranscriptionProvider, TranscriptionSegment


class OpenAIProvider(TranscriptionProvider):
    def get_name(self) -> str:
        return "openai"

    async def transcribe(
        self, audio_path: str, model: str, api_key: str, base_url: str, **kwargs
    ) -> str:
        client = OpenAI(api_key=api_key, base_url=base_url)

        use_verbose_json = self.supports_timestamps(model)
        response_fmt = "verbose_json" if use_verbose_json else "json"

        with open(audio_path, "rb") as audio_file:
            if use_verbose_json:
                transcript = client.audio.transcriptions.create(
                    model=model,
                    file=audio_file,
                    response_format=response_fmt,
                    timestamp_granularities=["segment"],
                )
            else:
                transcript = client.audio.transcriptions.create(
                    model=model, file=audio_file, response_format=response_fmt
                )

        if hasattr(transcript, "segments"):
            segments = [
                TranscriptionSegment(start=seg.start, end=seg.end, text=seg.text)
                for seg in transcript.segments
            ]
            return self.create_vtt_from_segments(segments)
        else:
            text_content = getattr(transcript, "text", str(transcript))
            return f"WEBVTT\n\n00:00:00.000 --> 99:59:59.999\n{text_content}"

    async def translate(
        self,
        vtt_content: str,
        target_language: str,
        model: str,
        api_key: str,
        base_url: str,
        **kwargs,
    ) -> str:
        client = OpenAI(api_key=api_key, base_url=base_url)

        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": f"You are a helpful assistant that translates VTT subtitles to {target_language}. Preserve the timestamps exactly. Output ONLY the translated VTT content.",
                },
                {"role": "user", "content": vtt_content},
            ],
        )

        return response.choices[0].message.content


class ProviderError(Exception):
    pass


class APIConnectionError(ProviderError):
    pass


class AuthenticationError(ProviderError):
    pass


class RateLimitError(ProviderError):
    pass


class InvalidModelError(ProviderError):
    pass
