import os
import re
import subprocess
import time
import uuid
from typing import Optional, Dict, Any
from fastapi import FastAPI, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
import yt_dlp
from providers import ProviderFactory
from providers.openai import ProviderError, APIConnectionError as ProviderConnectionError

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory cache for subtitles (video_id -> vtt)
subtitle_cache: Dict[str, Dict[str, Any]] = {}
CACHE_MAX_SIZE = 1000
CACHE_EXPIRY_HOURS = 24 * 7  # 7 days
MAX_AUDIO_SIZE_BYTES = 24 * 1024 * 1024  # 24MB (OpenAI limit is 25MB)


class TranscribeRequest(BaseModel):
    video_url: str
    api_key: str
    base_url: str = "https://api.openai.com/v1"
    target_language: str = "en"
    transcription_model: Optional[str] = "whisper-1"
    translation_model: Optional[str] = "gpt-4o-mini"
    translation_method: str = "chatgpt"
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


class HealthResponse(BaseModel):
    status: str
    providers: list[str]
    version: str
    cache_size: int
    uptime_seconds: float


class CacheResponse(BaseModel):
    video_id: str
    cached: bool
    vtt: Optional[str] = None
    cached_at: Optional[str] = None
    age_hours: Optional[float] = None


def get_video_id(url: str) -> str:
    match = re.search(r"(?:v=|\/v\/|youtu\.be\/)([^&\s]+)", url)
    return match.group(1) if match else None


def cleanup_expired_cache():
    """Remove expired cache entries"""
    now = time.time()
    expired = [
        video_id
        for video_id, data in subtitle_cache.items()
        if now - data.get("cached_at", 0) > CACHE_EXPIRY_HOURS * 3600
    ]
    for video_id in expired:
        del subtitle_cache[video_id]
    return len(expired)


def get_cached_subtitle(video_id: str) -> Optional[Dict[str, Any]]:
    """Get cached subtitle if exists and not expired"""
    if video_id not in subtitle_cache:
        return None

    data = subtitle_cache[video_id]
    now = time.time()
    age_seconds = now - data.get("cached_at", 0)

    if age_seconds > CACHE_EXPIRY_HOURS * 3600:
        del subtitle_cache[video_id]
        return None

    return data


def set_cached_subtitle(video_id: str, vtt: str):
    """Store subtitle in cache"""
    # Clean up if cache is full
    if len(subtitle_cache) >= CACHE_MAX_SIZE:
        cleanup_expired_cache()
        # If still full, remove oldest entries
        while len(subtitle_cache) >= CACHE_MAX_SIZE:
            oldest = min(subtitle_cache.items(), key=lambda x: x[1].get("cached_at", 0))
            del subtitle_cache[oldest[0]]

    subtitle_cache[video_id] = {
        "vtt": vtt,
        "cached_at": time.time(),
    }


def download_audio(video_url: str, output_path: str, progress_callback=None):
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
    }

    if progress_callback:

        class ProgressHook:
            def __init__(self, callback):
                self.callback = callback
                self.last_percent = 0

            def __call__(self, data):
                if data["status"] == "downloading":
                    percent = data.get("downloaded_bytes", 0) / data.get("total_bytes", 1) * 100
                    if percent - self.last_percent >= 10:
                        self.callback("downloading", percent, f"{percent:.1f}%")
                        self.last_percent = percent
                elif data["status"] == "finished":
                    self.callback("downloading", 100, "Download complete")
                return

        ydl_opts["progress_hooks"] = [ProgressHook(progress_callback)]

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([video_url])

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

    raise Exception("Audio file not found after download")


def compress_audio(input_path: str, output_path: str, max_size_bytes: int = MAX_AUDIO_SIZE_BYTES):
    """Compress audio file using FFmpeg to reduce size below max_size_bytes"""
    print(f"Compressing audio (file too large)...")
    
    # Try progressively lower bitrates until file is small enough
    bitrates = ["128k", "96k", "64k", "48k"]
    
    for bitrate in bitrates:
        print(f"  Trying {bitrate}...")
        ffmpeg_cmd = [
            "ffmpeg",
            "-i", input_path,
            "-b:a", bitrate,
            "-ar", "16000",
            "-ac", "1",
            "-y",
            output_path
        ]
        result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"FFmpeg compression failed: {result.stderr}")
        
        if os.path.exists(output_path) and get_file_size(output_path) < max_size_bytes:
            print(f"  Compression successful at {bitrate}")
            return
    
    raise Exception(f"Could not compress audio below {max_size_bytes} bytes")


def get_file_size(path: str) -> int:
    return os.path.getsize(path)


def format_timestamp(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02}:{minutes:02}:{secs:06.3f}"


def create_vtt_from_segments(segments) -> str:
    vtt_content = "WEBVTT\n\n"
    for segment in segments:
        start_text = format_timestamp(segment.start)
        end_text = format_timestamp(segment.end)
        text = segment.text.strip()
        vtt_content += f"{start_text} --> {end_text}\n{text}\n\n"
    return vtt_content


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


@app.get("/cache/{video_id}", response_model=CacheResponse)
async def check_cache(video_id: str):
    """Check if subtitles are cached for a video"""
    cached = get_cached_subtitle(video_id)
    if cached:
        age_hours = (time.time() - cached["cached_at"]) / 3600
        return CacheResponse(
            video_id=video_id,
            cached=True,
            vtt=cached["vtt"],
            cached_at=time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(cached["cached_at"])),
            age_hours=round(age_hours, 2),
        )
    return CacheResponse(video_id=video_id, cached=False)


@app.delete("/cache/{video_id}")
async def clear_cache(video_id: str):
    """Clear cache for a specific video"""
    if video_id in subtitle_cache:
        del subtitle_cache[video_id]
        return {"message": f"Cache cleared for {video_id}"}
    return {"message": f"No cache found for {video_id}"}


@app.delete("/cache")
async def clear_all_cache(background_tasks: BackgroundTasks):
    """Clear all cache entries"""
    count = len(subtitle_cache)
    subtitle_cache.clear()
    return {"message": f"Cleared {count} cache entries"}


@app.post("/transcribe")
async def transcribe_video(request: TranscribeRequest, background_tasks: BackgroundTasks):
    audio_path = None

    try:
        video_id = get_video_id(request.video_url)

        # Check cache if requested
        if request.check_cache and video_id:
            cached = get_cached_subtitle(video_id)
            if cached:
                return {"vtt": cached["vtt"], cached: True}

        provider = ProviderFactory.get_provider(request.provider)
        if not provider:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Provider '{request.provider}' not found. Available: {ProviderFactory.list_providers()}",
            )

        transcription_model = request.transcription_model or "whisper-1"
        translation_model = request.translation_model or "gpt-4o-mini"

        def progress_callback(stage, progress, details=""):
            print(f"[{stage}] {progress}% - {details}")

        audio_path = f"temp_audio_{uuid.uuid4().hex[:8]}"
        print(f"Downloading audio from {request.video_url}...")
        audio_path = download_audio(request.video_url, audio_path, progress_callback)
        print(f"Audio downloaded to {audio_path}")

        # Check file size and compress if necessary
        if os.path.exists(audio_path):
            file_size = get_file_size(audio_path)
            if file_size > MAX_AUDIO_SIZE_BYTES:
                compressed_path = f"temp_audio_{uuid.uuid4().hex[:8]}.mp3"
                compress_audio(audio_path, compressed_path)
                # Remove original file
                os.remove(audio_path)
                audio_path = compressed_path
                print(f"Compressed audio file size: {get_file_size(audio_path)} bytes")

        print(f"Transcribing with {request.provider}/{transcription_model}...")
        final_vtt = await provider.transcribe(
            audio_path=audio_path,
            model=transcription_model,
            api_key=request.api_key,
            base_url=request.base_url,
        )

        if request.target_language != "original":
            print(f"Translating to {request.target_language} using {translation_model}...")
            final_vtt = await provider.translate(
                vtt_content=final_vtt,
                target_language=request.target_language,
                model=translation_model,
                api_key=request.api_key,
                base_url=request.base_url,
                translation_method=request.translation_method,
                audio_path=audio_path,
            )

        # Cache the result
        if video_id:
            set_cached_subtitle(video_id, final_vtt)
            background_tasks.add_task(cleanup_expired_cache)

        return {"vtt": final_vtt, cached: False}

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ProviderConnectionError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"API connection failed: {str(e)}",
        )
    except ProviderError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}",
        )
    finally:
        if audio_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except Exception as e:
                print(f"Failed to cleanup audio file: {e}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
