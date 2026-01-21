"""
Classe base com lógica compartilhada de tradução usando LiteLLM.
Todos os providers que usam LiteLLM podem herdar desta classe.
"""
import json
import asyncio
from typing import List, Optional
import litellm
from .base import TranscriptionProvider, TranscriptionSegment
from .vtt_utils import parse_vtt_segments, build_vtt_from_segments


BATCH_SIZE = 150


class LiteLLMProvider(TranscriptionProvider):
    """
    Provider base que usa LiteLLM para transcrição e tradução.
    Subclasses devem implementar get_name() e podem sobrescrever
    get_transcription_params() e get_translation_params().
    """
    
    def get_concurrency_limit(self) -> int:
        """Limite de concorrência para tradução. Pode ser sobrescrito."""
        return 10
    
    def get_timeout(self) -> int:
        """Timeout em segundos para chamadas de API. Pode ser sobrescrito."""
        return 600  # 10 minutos
    
    def use_structured_output(self) -> bool:
        """Se True, usa structured output (json_schema strict mode). Pode ser sobrescrito."""
        return False
    
    def get_translation_schema(self) -> dict:
        """
        Schema para structured output na tradução.
        Subclasses podem sobrescrever para customizar o schema.
        """
        return {
            "type": "object",
            "properties": {
                "translations": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            },
            "required": ["translations"],
            "additionalProperties": False
        }
    
    def get_transcription_params(self, model: str, api_key: str, base_url: str) -> dict:
        """
        Retorna parâmetros específicos para transcrição.
        Subclasses podem sobrescrever para adicionar parâmetros específicos.
        """
        return {
            "api_key": api_key,
            "response_format": "verbose_json",
            "timeout": self.get_timeout(),
        }
    
    def get_translation_params(self, model: str, api_key: str, base_url: str) -> dict:
        """
        Retorna parâmetros específicos para tradução.
        Subclasses podem sobrescrever para adicionar parâmetros específicos.
        """
        params = {
            "api_key": api_key,
            "temperature": 0.1,
            "timeout": self.get_timeout(),
        }
        
        # Usar structured output se habilitado
        if self.use_structured_output():
            params["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "batch_translation",
                    "strict": True,
                    "schema": self.get_translation_schema()
                }
            }
        else:
            params["response_format"] = {"type": "json_object"}
        
        return params

    async def transcribe(
        self, audio_path: str, model: str, api_key: str, base_url: str, **kwargs
    ) -> str:
        """Transcreve áudio usando LiteLLM (async)."""
        provider_prefix = self.get_name()
        
        with open(audio_path, "rb") as audio_file:
            params = self.get_transcription_params(model, api_key, base_url)
            response = await litellm.atranscription(
                model=f"{provider_prefix}/{model}",
                file=audio_file,
                **params
            )

        if hasattr(response, "segments") and response.segments:
            segments = [
                TranscriptionSegment(
                    start=seg.get('start', 0),
                    end=seg.get('end', 0),
                    text=seg.get('text', '')
                )
                for seg in response.segments
            ]
            return self.create_vtt_from_segments(segments)
        else:
            text_content = getattr(response, "text", str(response))
            return f"WEBVTT\n\n00:00:00.000 --> 99:59:59.999\n{text_content}"

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
        """Traduz VTT usando LiteLLM (async)."""
        if target_language == "original":
            return vtt_content

        segments = parse_vtt_segments(vtt_content)
        if not segments:
            return vtt_content

        provider_prefix = self.get_name()
        return await self._translate_segments(
            segments=segments,
            target_language=target_language,
            model=f"{provider_prefix}/{model}",
            api_key=api_key,
            base_url=base_url,
            progress_callback=progress_callback,
        )

    async def _translate_segments(
        self,
        segments: List[TranscriptionSegment],
        target_language: str,
        model: str,
        api_key: str,
        base_url: str,
        progress_callback: Optional[callable] = None,
    ) -> str:
        """Lógica compartilhada de tradução em lotes."""
        import time
        start_total = time.time()
        
        batches = [segments[i:i + BATCH_SIZE] for i in range(0, len(segments), BATCH_SIZE)]
        print(f"[DEBUG] Iniciando tradução de {len(segments)} segmentos em {len(batches)} lotes...")
        translated_all = []

        semaphore = asyncio.Semaphore(self.get_concurrency_limit())

        async def translate_batch(batch_idx: int, batch: List[TranscriptionSegment]) -> List[TranscriptionSegment]:
            texts = [seg.text for seg in batch]
            
            async with semaphore:
                batch_start = time.time()
                print(f"[DEBUG] Iniciando lote {batch_idx+1}/{len(batches)} ({len(texts)} textos)")
                params = self.get_translation_params(model, api_key, base_url)
                
                try:
                    response = await litellm.acompletion(
                        model=model,
                        messages=[
                            {
                                "role": "system",
                                "content": f"You are a professional translator. Translate the following subtitles to {target_language}. Return ONLY a JSON object with a 'translations' key containing an array of translated strings in the exact same order and quantity. Do not add any explanation or markdown."
                            },
                            {
                                "role": "user",
                                "content": f"JSON array to translate:\n{json.dumps(texts, ensure_ascii=False)}"
                            }
                        ],
                        **params
                    )
                    
                    batch_elapsed = time.time() - batch_start
                    print(f"[DEBUG] Lote {batch_idx+1} concluído em {batch_elapsed:.2f}s")
                    
                    content = response.choices[0].message.content
                    parsed = json.loads(content)
                    translated_texts = parsed.get("translations", [])
                    
                    # Garantir que temos o mesmo número de traduções
                    if len(translated_texts) != len(texts):
                        print(f"[WARN] Lote {batch_idx+1}: recebeu {len(translated_texts)} traduções para {len(texts)} textos.")
                
                except Exception as e:
                    print(f"[ERROR] Falha no lote {batch_idx+1}: {e}")
                    translated_texts = texts
                
            for i, seg in enumerate(batch):
                if i < len(translated_texts):
                    seg.text = translated_texts[i]

            return batch

        tasks = [translate_batch(i, batch) for i, batch in enumerate(batches)]
        translated_batches = await asyncio.gather(*tasks)

        for batch in translated_batches:
            translated_all.extend(batch)

        total_segments = len(segments)
        if progress_callback:
            await progress_callback("translating", 100, f"Translated {total_segments}/{total_segments} segments")

        total_elapsed = time.time() - start_total
        print(f"[DEBUG] Tradução total concluída em {total_elapsed:.2f}s")
        
        return build_vtt_from_segments(translated_all)

    async def summarize(
        self,
        transcript: str,
        target_language: str,
        model: str,
        api_key: str,
        base_url: str,
        **kwargs,
    ) -> str:
        """Gera um resumo do transcrito usando LiteLLM."""
        print(f"[DEBUG] Summarize called with target_language: {target_language}, model: {model}")
        provider_prefix = self.get_name()
        
        # Map language codes to full names for better prompt
        lang_names = {
            'en': 'English',
            'pt': 'Portuguese (Brasil)',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'ja': 'Japanese',
            'ko': 'Korean',
            'zh': 'Chinese',
        }
        lang_name = lang_names.get(target_language, target_language)
        
        try:
            response = await litellm.acompletion(
                model=f"{provider_prefix}/{model}",
                messages=[
                    {
                        "role": "system",
                        "content": f"You are a professional content summarizer. You MUST respond EXCLUSIVELY in {lang_name}. All your output, including headers, bullet points, and any text, must be in {lang_name}. Do NOT use English words or phrases. Structure the summary with key takeaways and a brief conclusion. Use markdown formatting with headers (##) and bullet points (-)."
                    },
                    {
                        "role": "user",
                        "content": f"Summarize this video transcript in {lang_name}:\n\n{transcript[:10000]}"  # Limit transcript length
                    }
                ],
                api_key=api_key,
                timeout=self.get_timeout(),
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"[ERROR] Summarization failed: {e}")
            return f"Error during summarization: {e}"
