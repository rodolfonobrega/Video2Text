import os
from typing import Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
import yt_dlp
from providers import ProviderFactory
from providers.openai import ProviderError, APIConnectionError as ProviderConnectionError

app = FastAPI()

# Allow CORS for the extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to the extension ID
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TranscribeRequest(BaseModel):
    video_url: str
    api_key: str
    base_url: str = "https://api.openai.com/v1"
    target_language: str = "en"
    transcription_model: Optional[str] = "whisper-1"
    translation_model: Optional[str] = "gpt-4o-mini"
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


def download_audio(video_url: str, output_path: str):
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
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([video_url])

    # yt-dlp might append the extension, so we need to find the file
    base_path = output_path
    if os.path.exists(base_path + ".mp3"):
        return base_path + ".mp3"
    elif os.path.exists(base_path):
        return base_path

    # Fallback search
    directory = os.path.dirname(output_path)
    filename = os.path.basename(output_path)
    for f in os.listdir(directory):
        if f.startswith(filename) and f.endswith(".mp3"):
            return os.path.join(directory, f)

    raise Exception("Audio file not found after download")


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
        status="healthy", providers=ProviderFactory.list_providers(), version="1.0.0"
    )


@app.get("/")
async def root():
    return {"message": "YouTube AI Subtitles Backend", "version": "1.0.0"}


@app.post("/transcribe")
async def transcribe_video(request: TranscribeRequest):
    audio_path = None

    try:
        provider = ProviderFactory.get_provider(request.provider)
        if not provider:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Provider '{request.provider}' not found. Available: {ProviderFactory.list_providers()}",
            )

        transcription_model = request.transcription_model or "whisper-1"
        translation_model = request.translation_model or "gpt-4o-mini"

        print(f"Downloading audio from {request.video_url}...")
        audio_path = download_audio(request.video_url, "temp_audio")
        print(f"Audio downloaded to {audio_path}")

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
            )

        return {"vtt": final_vtt}

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
