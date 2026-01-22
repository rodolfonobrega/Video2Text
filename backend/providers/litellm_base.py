"""
Classe base com lógica compartilhada de tradução usando LiteLLM.
Todos os providers que usam LiteLLM podem herdar desta classe.
"""
import json
import asyncio
import os
from typing import List, Optional
import litellm
from .base import TranscriptionProvider, TranscriptionSegment
from .vtt_utils import parse_vtt_segments, build_vtt_from_segments


BATCH_SIZE = 150

# Cache for loaded prompts
_prompt_cache = {}


def load_prompt(prompt_type: str, lang: str = "en") -> str:
    """
    Load a prompt from file. Falls back to defaults if file not found.
    
    Args:
        prompt_type: Type of prompt (translation_system, translation_user, summary_system, summary_user)
        lang: Language code (not currently used but available for future language-specific prompts)
    
    Returns:
        The prompt text with placeholders
    """
    cache_key = f"{prompt_type}_{lang}"
    if cache_key in _prompt_cache:
        return _prompt_cache[cache_key]
    
    # Look for language-specific prompts first, then fallback to default
    possible_paths = [
        os.path.join(os.path.dirname(__file__), '..', 'prompts', f'{prompt_type}_{lang}.txt'),
        os.path.join(os.path.dirname(__file__), '..', 'prompts', f'{prompt_type}.txt'),
    ]
    
    prompt_text = None
    for path in possible_paths:
        abs_path = os.path.abspath(path)
        if os.path.exists(abs_path):
            with open(abs_path, 'r', encoding='utf-8') as f:
                prompt_text = f.read()
            break
    
    # Fallback to hardcoded prompts if file not found
    if prompt_text is None:
        fallbacks = {
            'translation_system': 'You are a professional translator. Translate the following subtitles to {target_language}. Return ONLY a JSON object with a translations key containing an array of translated strings in the exact same order and quantity. Do not add any explanation or markdown.',
            'translation_user': 'JSON array to translate:\n{json_texts}',
            'summary_system': '''You are a professional content summarizer.

You MUST respond EXCLUSIVELY in {target_language}.
All output — including titles, bullet points, and conclusions — must be written in {target_language}.
Do NOT use any other language besides {target_language}.

The input text is a transcription of a video.
Your task is to summarize the video by:
- Explaining what the video is about
- Highlighting the main topics discussed
- Extracting the key points and insights

Structure the summary using Markdown with:
- Section headers (##)
- Bullet points (-)

The summary must be clear, concise, and faithful to the original content.
End with a brief conclusion that synthesizes the main message of the video.''',
            'summary_user': 'Summarize this video transcript in {target_language}:\n\n{transcript}',
        }
        prompt_text = fallbacks.get(prompt_type, '')
    
    _prompt_cache[cache_key] = prompt_text
    return prompt_text


def format_prompt(prompt_template: str, **kwargs) -> str:
    """Format a prompt template with the given parameters."""
    return prompt_template.format(**kwargs)


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
    
    def use_structured_output(self, model: str = None) -> bool:
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
            "reasoning_effort": None,  # Disable reasoning for all models
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
            "reasoning_effort": None,  # Disable reasoning for all models
        }
        
        # Usar structured output se habilitado para este modelo específico
        if self.use_structured_output(model):
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
                
                # Load prompts from files
                system_prompt = load_prompt('translation_system')
                system_prompt = format_prompt(system_prompt, target_language=target_language)
                
                user_prompt = load_prompt('translation_user')
                user_prompt = format_prompt(user_prompt, json_texts=json.dumps(texts, ensure_ascii=False))
                
                try:
                    response = await litellm.acompletion(
                        model=model,
                        messages=[
                            {
                                "role": "system",
                                "content": system_prompt
                            },
                            {
                                "role": "user",
                                "content": user_prompt
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
    ) -> dict:
        """
        Gera um resumo estruturado do transcrito usando LiteLLM.
        Executa duas requisições em paralelo:
        1. Resumo do conteúdo (sem timestamps)
        2. Extração de momentos-chave (com timestamps)
        Returns dict with 'summary' and 'key_moments' fields.
        """
        print(f"[DEBUG] Summarize called with target_language: {target_language}, model: {model}")

        summary_task = self._generate_summary(transcript, target_language, model, api_key, base_url)
        key_moments_task = self._extract_key_moments(transcript, target_language, model, api_key, base_url)

        summary_result, key_moments_result = await asyncio.gather(summary_task, key_moments_task)

        summary_text = summary_result.get('summary', '')
        key_moments = key_moments_result.get('key_moments', [])

        print(f"[DEBUG] Summary generated, key moments: {len(key_moments)}")

        return {
            'summary': summary_text,
            'key_moments': key_moments
        }

    async def _generate_summary(
        self,
        transcript: str,
        target_language: str,
        model: str,
        api_key: str,
        base_url: str,
    ) -> dict:
        """Gera o resumo do conteúdo (sem timestamps)."""
        provider_prefix = self.get_name()

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

        if target_language == 'original':
            lang_name = "the original language of this text"
        else:
            lang_name = lang_names.get(target_language, target_language)

        system_prompt = load_prompt('summary_system')
        system_prompt = format_prompt(system_prompt, target_language=lang_name)

        user_prompt = load_prompt('summary_user')
        user_prompt = format_prompt(user_prompt, target_language=lang_name, transcript=transcript[:15000])

        try:
            response = await litellm.acompletion(
                model=f"{provider_prefix}/{model}",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                api_key=api_key,
                timeout=self.get_timeout(),
                reasoning_effort=None,
            )

            content = response.choices[0].message.content
            print(f"[DEBUG] Summary response: {content[:100] if content else '(empty)'}...")

            if not content:
                return {'summary': 'No summary generated'}

            return {'summary': content}

        except Exception as e:
            print(f"[ERROR] Summary generation failed: {e}")
            return {'summary': f'Error: {e}'}

    async def _extract_key_moments(
        self,
        transcript: str,
        target_language: str,
        model: str,
        api_key: str,
        base_url: str,
    ) -> dict:
        """Extrai momentos-chave usando structured output."""
        provider_prefix = self.get_name()

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

        if target_language == 'original':
            lang_name = "the original language of this text"
        else:
            lang_name = lang_names.get(target_language, target_language)

        system_prompt = load_prompt('key_moments_system')
        system_prompt = format_prompt(system_prompt, target_language=lang_name)

        user_prompt = f"Extract key moments from this transcript with timestamps:\n\n{transcript[:20000]}"

        try:
            response = await litellm.acompletion(
                model=f"{provider_prefix}/{model}",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                api_key=api_key,
                timeout=self.get_timeout(),
                reasoning_effort=None,
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content
            print(f"[DEBUG] Key moments response: {content[:100] if content else '(empty)'}...")

            if not content:
                return {'key_moments': []}

            data = json.loads(content)
            key_moments = data.get('key_moments', [])
            return {'key_moments': key_moments}

        except json.JSONDecodeError as err:
            print(f"[WARN] Failed to parse key moments as JSON: {err}")
            print(f"[WARN] Raw content: {content[:200] if content else '(empty)'}")
            return {'key_moments': []}
        except Exception as e:
            print(f"[ERROR] Key moments extraction failed: {e}")
            return {'key_moments': []}

    async def extract_key_moments(
        self,
        transcript: str,
        target_language: str,
        model: str,
        api_key: str,
        base_url: str,
        **kwargs,
    ) -> dict:
        """Extrai momentos-chave do transcrito usando LiteLLM com structured output."""
        return await self._extract_key_moments(transcript, target_language, model, api_key, base_url)
        
        # Use original language detection by AI if requested
        if target_language == 'original':
            lang_name = "the original language of this text"
        else:
            lang_name = lang_names.get(target_language, target_language)
        
        # Load prompts from files
        system_prompt = load_prompt('summary_system')
        system_prompt = format_prompt(system_prompt, target_language=lang_name)
        
        user_prompt = load_prompt('summary_user')
        user_prompt = format_prompt(user_prompt, target_language=lang_name, transcript=transcript[:15000])
        
        # Determine if model supports structured output
        use_structured = self.use_structured_output(model)
        
        try:
            request_params = {
                "model": f"{provider_prefix}/{model}",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "api_key": api_key,
                "timeout": self.get_timeout(),
                "reasoning_effort": None,
            }
            
            # Only use structured output if supported
            if use_structured:
                request_params["response_format"] = {"type": "json_object"}
            
            response = await litellm.acompletion(**request_params)
            
            # Parse the JSON response
            message = response.choices[0].message
            content = message.content if message and message.content else ''
            print(f"[DEBUG] Raw summary response: {content[:200] if content else '(empty)'}...")
            
            if not content:
                print(f"[WARN] Empty response from AI")
                return {
                    'summary': 'No summary generated',
                    'key_moments': []
                }
            
            try:
                # Clean up the response - remove markdown code blocks if present
                cleaned_content = content.strip()
                if cleaned_content.startswith('```'):
                    lines = cleaned_content.split('\n')
                    if lines and lines[0].startswith('```'):
                        lines = lines[1:]
                    if lines and lines[-1].strip() == '```':
                        lines = lines[:-1]
                    cleaned_content = '\n'.join(lines).strip()
                
                data = json.loads(cleaned_content)
                summary = data.get('summary', content)
                key_moments = data.get('key_moments', [])
                print(f"[DEBUG] Summary generated with {len(key_moments)} key moments")
                return {
                    'summary': summary,
                    'key_moments': key_moments
                }
            except json.JSONDecodeError as err:
                print(f"[WARN] Failed to parse summary as JSON: {err}")
                print(f"[WARN] Raw content: {content[:200]}")
                # Return raw content as summary if parsing fails
                return {
                    'summary': content,
                    'key_moments': []
                }
        
        except Exception as e:
            print(f"[ERROR] Summarization failed: {e}")
            return {
                'summary': f"Error during summarization: {e}",
                'key_moments': []
            }
