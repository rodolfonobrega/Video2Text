import os
import re
import subprocess
import time
import uuid
import json
import asyncio
import tempfile
from typing import Optional, Dict, Any
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
import yt_dlp
from providers import ProviderFactory
from config.models import PROVIDER_MODELS, get_provider_models, get_all_providers


def get_temp_audio_path(suffix: str = "") -> str:
    """Generate a temp file path in the system temp directory."""
    temp_dir = tempfile.gettempdir()
    filename = f"yt_subtitles_{uuid.uuid4().hex[:8]}{suffix}"
    return os.path.join(temp_dir, filename)


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_request_size(request: Any, call_next: Any) -> Any:
    try:
        headers_size = sum(len(k) + len(v) for k, v in request.headers.items())
        if headers_size > 8192:
            print(f"WARNING: Large headers detected: {headers_size} bytes")
        response = await call_next(request)
        return response
    except Exception as e:
        print(f"Request handling error: {e}")
        raise


subtitle_cache: Dict[str, Dict[str, Any]] = {}
CACHE_MAX_SIZE = 1000
CACHE_EXPIRY_HOURS = 24 * 7
MAX_AUDIO_SIZE_BYTES = 24 * 1024 * 1024


class TranscribeRequest(BaseModel):
    video_url: str
    api_key: str
    base_url: str = ""
    target_language: str = "en"
    transcription_model: str = "whisper-1"
    translation_model: str = "gpt-5-nano"
    provider: str = "openai"
    check_cache: bool = True

    @field_validator("api_key")
    def validate_api_key(cls, v):
        if not v or len(v) < 10:
            raise ValueError("API key must be at least 10 characters")
        return v

    @field_validator("video_url")
    def validate_video_url(cls, v):
        if not v or "youtube.com" not in v and "youtu.be" not in v:
            raise ValueError("Invalid YouTube URL")
        return v

    @field_validator("provider")
    def validate_provider(cls, v):
        available_providers = ProviderFactory.list_providers()
        if v not in available_providers:
            raise ValueError(f"Invalid provider. Available: {available_providers}")
        return v


class SummarizeRequest(BaseModel):
    video_url: str
    api_key: str
    base_url: str = ""
    summary_language: str = "en"
    summarization_model: str = "gpt-5-mini"
    provider: str = "openai"

    @field_validator("api_key")
    def validate_api_key(cls, v):
        if not v or len(v) < 10:
            raise ValueError("API key must be at least 10 characters")
        return v

    @field_validator("video_url")
    def validate_video_url(cls, v):
        if not v or "youtube.com" not in v and "youtu.be" not in v:
            raise ValueError("Invalid YouTube URL")
        return v

    @field_validator("provider")
    def validate_provider(cls, v):
        available_providers = ProviderFactory.list_providers()
        if v not in available_providers:
            raise ValueError(f"Invalid provider. Available: {available_providers}")
        return v


class HealthResponse(BaseModel):
    status: str
    providers: list[str]
    version: str
    cache_size: int
    uptime_seconds: float


def get_video_id(url: str) -> Optional[str]:
    match = re.search(r"(?:v=|\/v\/|youtu\.be\/)([^\&\s]+)", url)
    return match.group(1) if match else None


def cleanup_expired_cache():
    now = time.time()
    expired = [
        video_id
        for video_id, data in subtitle_cache.items()
        if now - data.get("cached_at", 0) > CACHE_EXPIRY_HOURS * 3600
    ]
    for video_id in expired:
        del subtitle_cache[video_id]
    return len(expired)


def get_cached_subtitle(video_id: str, language: str = "original") -> Optional[Dict[str, Any]]:
    cache_key = f"{video_id}_{language}"
    if cache_key not in subtitle_cache:
        return None

    data = subtitle_cache[cache_key]
    now = time.time()
    age_seconds = now - data.get("cached_at", 0)

    if age_seconds > CACHE_EXPIRY_HOURS * 3600:
        del subtitle_cache[cache_key]
        return None

    return data


def set_cached_subtitle(video_id: str, vtt: str, language: str = "original"):
    if len(subtitle_cache) >= CACHE_MAX_SIZE:
        cleanup_expired_cache()
        while len(subtitle_cache) >= CACHE_MAX_SIZE:
            oldest = min(subtitle_cache.items(), key=lambda x: x[1].get("cached_at", 0))
            del subtitle_cache[oldest[0]]

    cache_key = f"{video_id}_{language}"
    subtitle_cache[cache_key] = {
        "vtt": vtt,
        "language": language,
        "cached_at": time.time(),
    }


def download_audio(video_url: str, output_path: str, progress_callback=None):
    max_retries = 3
    retry_delay = 2

    last_error = None

    for attempt in range(max_retries):
        try:
            ydl_opts = {
                "format": "bestaudio/best",
                "postprocessors": [
                    {
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": "192",
                    }
                ],
                "outtmpl": output_path,
                "quiet": True,
                "no_warnings": True,
                # Add headers to mimic browser request to avoid 403
                "http_headers": {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-us,en;q=0.5",
                },
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([video_url])

            # If download successful, check for file
            base_path = output_path
            if os.path.exists(base_path + ".mp3"):
                return base_path + ".mp3"
            elif os.path.exists(base_path):
                return base_path

            directory = os.path.dirname(output_path)
            filename = os.path.basename(output_path)
            for f in os.listdir(directory):
                if f.startswith(filename) and f.endswith(".mp3"):
                    return os.path.join(directory, f)
            
            # If we get here, file wasn't found even though download supposedly finished
            raise Exception("Audio file not found after download")

        except yt_dlp.utils.DownloadError as e:
            last_error = e
            error_msg = str(e).lower()
            
            # Check if it's a 403 error or similar network issue
            if "403" in error_msg or "forbidden" in error_msg:
                print(f"[WARN] Download failed with 403 (Attempt {attempt+1}/{max_retries}). Retrying in {retry_delay}s...")
                time.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
            else:
                # If it's another type of error, re-raise immediately
                raise e
        except Exception as e:
            # Re-raise other unexpected exceptions
            raise e

    # If we exhausted retries
    print(f"[ERROR] Failed to download audio after {max_retries} attempts")
    raise last_error or Exception("Failed to download audio")


def compress_audio(input_path: str, output_path: str, max_size_bytes: int = MAX_AUDIO_SIZE_BYTES):
    print(f"Compressing audio (file too large)...")

    bitrates = ["128k", "96k", "64k", "48k"]

    for bitrate in bitrates:
        ffmpeg_cmd = [
            "ffmpeg",
            "-i",
            input_path,
            "-b:a",
            bitrate,
            "-ar",
            "16000",
            "-ac",
            "1",
            "-y",
            output_path,
        ]
        result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"FFmpeg compression failed: {result.stderr}")

        if os.path.exists(output_path) and os.path.getsize(output_path) < max_size_bytes:
            return

    raise Exception(f"Could not compress audio below {max_size_bytes} bytes")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy",
        providers=ProviderFactory.list_providers(),
        version="1.0.0",
        cache_size=len(subtitle_cache),
        uptime_seconds=0,
    )


@app.get("/")
async def root():
    return {"message": "YouTube AI Subtitles Backend", "version": "1.0.0"}


@app.get("/models")
async def get_models(provider: Optional[str] = None):
    """
    Retorna lista de modelos disponíveis.

    Query params:
        provider: Filtrar por provider específico (openai, groq)

    Returns:
        Se provider especificado: {transcription_models: [...], translation_models: [...]}
        Se não: {providers: [{id, name, models: {...}}]}
    """
    if provider:
        provider_lower = provider.lower()
        if provider_lower not in PROVIDER_MODELS:
            raise HTTPException(status_code=404, detail=f"Provider '{provider}' not found")

        return {
            "provider": provider_lower,
            "transcription_models": get_provider_models(provider_lower, "transcription"),
            "translation_models": get_provider_models(provider_lower, "translation"),
        }

    # Return all providers and their models
    all_providers = []
    for provider_id, provider_data in PROVIDER_MODELS.items():
        all_providers.append(
            {
                "id": provider_id,
                "name": provider_data["name"],
                "transcription_models": provider_data.get("transcription_models", []),
                "translation_models": provider_data.get("translation_models", []),
            }
        )

    return {"providers": all_providers}


@app.post("/transcribe")
async def transcribe_video(request: TranscribeRequest, background_tasks: BackgroundTasks):
    async def streaming_logic():
        queue = asyncio.Queue()
        audio_path_ref = [None]

        async def producer():
            try:
                # Immediate initial progress to signal connection
                await queue.put(
                    json.dumps(
                        {
                            "action": "progress",
                            "stage": "initializing",
                            "progress": 10,
                            "details": "Connected to backend, analyzing request...",
                        }
                    )
                    + "\n"
                )

                video_id = get_video_id(request.video_url)

                # Check cache for EXACT target language match
                if request.check_cache and video_id:
                    cached = get_cached_subtitle(video_id, request.target_language)
                    if cached:
                        await queue.put(
                            json.dumps(
                                {
                                    "action": "transcription_result",
                                    "success": True,
                                    "data": {"vtt": cached["vtt"], "cached": True},
                                }
                            )
                            + "\n"
                        )
                        await queue.put(None)
                        return

                provider = ProviderFactory.get_provider(request.provider)
                if not provider:
                    await queue.put(
                        json.dumps(
                            {
                                "action": "error",
                                "error": f"Provider '{request.provider}' not found.",
                            }
                        )
                        + "\n"
                    )
                    await queue.put(None)
                    return

                # Optimization: Check if we have 'original' language cached to skip download/transcription
                final_vtt = None
                if request.check_cache and video_id:
                    cached_original = get_cached_subtitle(video_id, "original")
                    if cached_original:
                        print(
                            f"[DEBUG] Using cached 'original' transcription for translation to {request.target_language}"
                        )
                        final_vtt = cached_original["vtt"]
                        # Skip download and transcription steps
                        await queue.put(
                            json.dumps(
                                {
                                    "action": "progress",
                                    "stage": "cached",
                                    "progress": 70,
                                    "details": "Using cached transcription",
                                }
                            )
                            + "\n"
                        )

                if not final_vtt:
                    # Need to download and transcribe
                    audio_path = get_temp_audio_path()
                    audio_path_ref[0] = audio_path
                    print(f"[DEBUG] Using temp file: {audio_path}")
                    start_download = time.time()
                    await queue.put(
                        json.dumps(
                            {
                                "action": "progress",
                                "stage": "downloading",
                                "progress": 10,
                                "details": "Downloading audio (yt-dlp)...",
                            }
                        )
                        + "\n"
                    )

                    loop = asyncio.get_event_loop()
                    audio_path = await loop.run_in_executor(
                        None, download_audio, request.video_url, audio_path
                    )

                    download_time = time.time() - start_download
                    await queue.put(
                        json.dumps(
                            {
                                "action": "progress",
                                "stage": "downloading",
                                "progress": 30,
                                "details": f"Download complete ({download_time:.1f}s)",
                            }
                        )
                        + "\n"
                    )

                    if os.path.exists(audio_path):
                        file_size = os.path.getsize(audio_path)
                        if file_size > MAX_AUDIO_SIZE_BYTES:
                            await queue.put(
                                json.dumps(
                                    {
                                        "action": "progress",
                                        "stage": "downloading",
                                        "progress": 100,
                                        "details": "Compressing audio...",
                                    }
                                )
                                + "\n"
                            )
                            compressed_path = get_temp_audio_path(".mp3")
                            await loop.run_in_executor(
                                None, compress_audio, audio_path, compressed_path
                            )
                            os.remove(audio_path)
                            audio_path = compressed_path
                            audio_path_ref[0] = audio_path

                    start_transcribe = time.time()
                    print(f"Starting transcription with {request.transcription_model}...")
                    await queue.put(
                        json.dumps(
                            {
                                "action": "progress",
                                "stage": "transcribing",
                                "progress": 35,
                                "details": "Transcribing...",
                            }
                        )
                        + "\n"
                    )

                    final_vtt = await provider.transcribe(
                        audio_path=audio_path,
                        model=request.transcription_model,
                        api_key=request.api_key,
                        base_url=request.base_url,
                    )

                    transcribe_time = time.time() - start_transcribe
                    await queue.put(
                        json.dumps(
                            {
                                "action": "progress",
                                "stage": "transcribing",
                                "progress": 70,
                                "details": f"Transcription complete ({transcribe_time:.1f}s)",
                            }
                        )
                        + "\n"
                    )

                    # Cache the ORIGINAL transcription
                    if video_id:
                        set_cached_subtitle(video_id, final_vtt, "original")
                        background_tasks.add_task(cleanup_expired_cache)

                if request.target_language != "original":
                    print(f"Starting translation to {request.target_language}...")
                    start_translate = time.time()
                    await queue.put(
                        json.dumps(
                            {
                                "action": "progress",
                                "stage": "translating",
                                "progress": 75,
                                "details": "Translating...",
                            }
                        )
                        + "\n"
                    )

                    async def progress_callback(stage, progress, details):
                        # Map translation progress (0-100) to overall progress (75-95)
                        overall_progress = 75 + int(progress * 0.2)
                        await queue.put(
                            json.dumps(
                                {
                                    "action": "progress",
                                    "stage": stage,
                                    "progress": overall_progress,
                                    "details": details,
                                }
                            )
                            + "\n"
                        )

                    final_vtt = await provider.translate(
                        vtt_content=final_vtt,
                        target_language=request.target_language,
                        model=request.translation_model,
                        api_key=request.api_key,
                        base_url=request.base_url,
                        progress_callback=progress_callback,
                    )

                    translate_time = time.time() - start_translate
                    await queue.put(
                        json.dumps(
                            {
                                "action": "progress",
                                "stage": "translating",
                                "progress": 95,
                                "details": f"Translation complete ({translate_time:.1f}s)",
                            }
                        )
                        + "\n"
                    )

                if video_id:
                    set_cached_subtitle(video_id, final_vtt, request.target_language)
                    background_tasks.add_task(cleanup_expired_cache)

                await queue.put(
                    json.dumps(
                        {
                            "action": "transcription_result",
                            "success": True,
                            "data": {"vtt": final_vtt, "cached": False},
                        }
                    )
                    + "\n"
                )
            except Exception as e:
                await queue.put(json.dumps({"action": "error", "error": str(e)}) + "\n")
            finally:
                if audio_path_ref[0] and os.path.exists(audio_path_ref[0]):
                    try:
                        os.remove(audio_path_ref[0])
                        print(f"[DEBUG] Cleaned up temp file: {audio_path_ref[0]}")
                    except Exception as e:
                        print(f"[WARN] Failed to clean up temp file {audio_path_ref[0]}: {e}")
                else:
                    if audio_path_ref[0]:
                        print(
                            f"[DEBUG] Temp file already deleted or not found: {audio_path_ref[0]}"
                        )
                await queue.put(None)

        asyncio.create_task(producer())

        while True:
            item = await queue.get()
            if item is None:
                break
            yield item

    return StreamingResponse(streaming_logic(), media_type="application/x-ndjson")


@app.post("/summarize")
async def summarize_video(request: SummarizeRequest):
    async def streaming_logic():
        queue = asyncio.Queue()

        async def producer():
            audio_path = None
            try:
                # Immediate initial progress to signal connection
                await queue.put(
                    json.dumps(
                        {
                            "action": "progress",
                            "stage": "initializing",
                            "progress": 10,
                            "details": "Connected to backend, analyzing request...",
                        }
                    )
                    + "\n"
                )

                video_id = get_video_id(request.video_url)
                print(f"[DEBUG] Summarize request for video_id: {video_id}")

                # Check for cached subtitles first
                cached = None
                if video_id:
                    cached = get_cached_subtitle(video_id, "original")

                provider = ProviderFactory.get_provider(request.provider)
                if not provider:
                    await queue.put(
                        json.dumps(
                            {
                                "action": "error",
                                "error": f"Provider '{request.provider}' not found.",
                            }
                        )
                        + "\n"
                    )
                    return

                async def sum_progress_callback(stage, progress, details):
                    # Map internal summary progress to 75% - 95% (if non-cached) or 25% - 95% (if cached)
                    base_progress = 75 if not cached else 25
                    range_size = 20 if not cached else 70
                    overall_progress = base_progress + int(progress * (range_size / 100))
                    await queue.put(
                        json.dumps(
                            {
                                "action": "progress",
                                "stage": stage,
                                "progress": overall_progress,
                                "details": details,
                            }
                        )
                        + "\n"
                    )

                if cached:
                    print(f"[DEBUG] Cache found for video_id: {video_id}")
                    await queue.put(
                        json.dumps(
                            {
                                "action": "progress",
                                "stage": "cached",
                                "progress": 15,
                                "details": "Using cached transcription",
                            }
                        )
                        + "\n"
                    )
                    full_text = re.sub(r"WEBVTT\n\n", "", cached["vtt"]).strip()
                else:
                    # No cache available, need to download and transcribe
                    print(f"[DEBUG] No cache found, downloading audio...")
                    audio_path = get_temp_audio_path()

                    await queue.put(
                        json.dumps(
                            {
                                "action": "progress",
                                "stage": "downloading",
                                "progress": 15,
                                "details": "Downloading video audio...",
                            }
                        )
                        + "\n"
                    )

                    loop = asyncio.get_event_loop()
                    audio_path = await loop.run_in_executor(
                        None, download_audio, request.video_url, audio_path
                    )
                    
                    await queue.put(
                        json.dumps(
                            {
                                "action": "progress",
                                "stage": "downloading",
                                "progress": 35,
                                "details": "Audio downloaded",
                            }
                        )
                        + "\n"
                    )

                    if os.path.exists(audio_path):
                        file_size = os.path.getsize(audio_path)
                        if file_size > MAX_AUDIO_SIZE_BYTES:
                            compressed_path = get_temp_audio_path(".mp3")
                            await loop.run_in_executor(
                                None, compress_audio, audio_path, compressed_path
                            )
                            os.remove(audio_path)
                            audio_path = compressed_path

                    await queue.put(
                        json.dumps(
                            {
                                "action": "progress",
                                "stage": "transcribing",
                                "progress": 45,
                                "details": "Transcribing audio...",
                            }
                        )
                        + "\n"
                    )

                    # Use whisper for transcription
                    transcription_model = (
                        "whisper-1" if request.provider == "openai" else "whisper-large-v3-turbo"
                    )

                    vtt_content = await provider.transcribe(
                        audio_path=audio_path,
                        model=transcription_model,
                        api_key=request.api_key,
                        base_url=request.base_url,
                    )

                    await queue.put(
                        json.dumps(
                            {
                                "action": "progress",
                                "stage": "transcribing",
                                "progress": 70,
                                "details": "Transcription complete",
                            }
                        )
                        + "\n"
                    )

                    if video_id:
                        set_cached_subtitle(video_id, vtt_content, "original")
                    
                    full_text = re.sub(r"WEBVTT\n\n", "", vtt_content).strip()

                # Start actual summary generation
                summary_result = await provider.summarize(
                    transcript=full_text,
                    target_language=request.summary_language,
                    model=request.summarization_model,
                    api_key=request.api_key,
                    base_url=request.base_url,
                    progress_callback=sum_progress_callback,
                )

                summary_text = summary_result.get("summary", "")
                key_moments = summary_result.get("key_moments", [])

                await queue.put(
                    json.dumps(
                        {
                            "action": "progress",
                            "stage": "summarizing",
                            "progress": 100,
                            "details": "Summary complete",
                        }
                    )
                    + "\n"
                )

                await queue.put(
                    json.dumps(
                        {
                            "action": "summary_result",
                            "success": True,
                            "data": {
                                "summary": summary_text,
                                "key_moments": key_moments,
                                "video_id": video_id,
                                "cached": bool(cached),
                            },
                        }
                    )
                    + "\n"
                )

            except Exception as e:
                import traceback
                traceback.print_exc()
                await queue.put(json.dumps({"action": "error", "error": str(e)}) + "\n")
            finally:
                if audio_path and os.path.exists(audio_path):
                    try:
                        os.remove(audio_path)
                        print(f"[DEBUG] Cleaned up temp file: {audio_path}")
                    except Exception as e:
                        print(f"[WARN] Failed to clean up temp file {audio_path}: {e}")
                await queue.put(None)

        asyncio.create_task(producer())

        while True:
            item = await queue.get()
            if item is None:
                break
            yield item

    return StreamingResponse(streaming_logic(), media_type="application/x-ndjson")


@app.delete("/cache")
async def clear_cache():
    initial_count = len(subtitle_cache)
    print(f"DEBUG: Clearing subtitle cache. Current count: {initial_count}")

    subtitle_cache.clear()

    final_count = len(subtitle_cache)
    if final_count != 0:
        print(f"ERROR: Failed to clear cache! count={final_count}")
        raise HTTPException(status_code=500, detail="Failed to clear cache")

    print(f"SUCCESS: Cache cleared. entries removed: {initial_count}")
    return {"message": "Cache cleared successfully", "removed_count": initial_count}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        limit_max_requests=100,
        timeout_keep_alive=300,
    )
