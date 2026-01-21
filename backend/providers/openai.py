import re
from typing import List, Optional
from openai import OpenAI, APIError, APIConnectionError, RateLimitError
from .base import TranscriptionProvider, TranscriptionSegment


def parse_vtt_segments(vtt_content: str) -> List[TranscriptionSegment]:
    """Parse VTT content and extract segments with timestamps"""
    lines = vtt_content.strip().split('\n')
    segments = []
    current_segment = None

    time_pattern = re.compile(r'(\d{2}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(\d{2}:)?\d{2}:\d{2}\.\d{3}')

    for line in lines:
        line = line.strip()
        if not line or line == 'WEBVTT':
            continue

        if time_pattern.search(line):
            if current_segment:
                segments.append(current_segment)
            times = line.split('-->')
            start = _parse_vtt_time(times[0].strip())
            end = _parse_vtt_time(times[1].strip())
            current_segment = TranscriptionSegment(start=start, end=end, text='')
        elif current_segment is not None:
            current_segment.text += ('\n' if current_segment.text else '') + line

    if current_segment:
        segments.append(current_segment)

    return segments


def _parse_vtt_time(time_str: str) -> float:
    """Parse VTT timestamp to seconds"""
    parts = time_str.split(':')
    seconds = 0
    if len(parts) == 3:
        seconds += int(parts[0]) * 3600
        seconds += int(parts[1]) * 60
        seconds += float(parts[2])
    else:
        seconds += int(parts[0]) * 60
        seconds += float(parts[1])
    return seconds


def _format_vtt_time(seconds: float) -> str:
    """Format seconds to VTT timestamp"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


def build_vtt_from_segments(segments: List[TranscriptionSegment]) -> str:
    """Build VTT content from segments"""
    vtt = "WEBVTT\n\n"
    for seg in segments:
        start = _format_vtt_time(seg.start)
        end = _format_vtt_time(seg.end)
        text = seg.text.strip()
        vtt += f"{start} --> {end}\n{text}\n\n"
    return vtt


BATCH_SIZE = 50


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
        segments = parse_vtt_segments(vtt_content)

        if not segments:
            return vtt_content

        if target_language == "original":
            return vtt_content

        client = OpenAI(api_key=api_key, base_url=base_url)

        async def translate_batch(batch: List[TranscriptionSegment]) -> List[TranscriptionSegment]:
            texts = [seg.text for seg in batch]
            texts_combined = "\n---\n".join(texts)

            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": f"Translate the following subtitles to {target_language}. Keep each subtitle separate with '---'. Output ONLY the translated text, one per line, nothing else.",
                    },
                    {"role": "user", "content": texts_combined},
                ],
            )

            translated_lines = response.choices[0].message.content.strip().split('\n')
            translated_lines = [line.strip() for line in translated_lines if line.strip()]

            for i, seg in enumerate(batch):
                if i < len(translated_lines):
                    seg.text = translated_lines[i]
                else:
                    seg.text = texts[i]

            return batch

        import asyncio
        batches = [segments[i:i + BATCH_SIZE] for i in range(0, len(segments), BATCH_SIZE)]
        tasks = [translate_batch(batch) for batch in batches]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_segments = []
        for result in results:
            if isinstance(result, Exception):
                raise result
            all_segments.extend(result)

        return build_vtt_from_segments(all_segments)


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
