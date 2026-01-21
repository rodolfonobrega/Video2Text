"""
Provider Groq usando LiteLLM.
Otimizado para performance (json_object em vez de json_schema strict).
"""
from .litellm_base import LiteLLMProvider


class GroqProvider(LiteLLMProvider):
    """Provider para Groq via LiteLLM otimizado para velocidade."""
    
    def get_name(self) -> str:
        return "groq"
    
    def get_concurrency_limit(self) -> int:
        """Pode usar concorrência padrão do LiteLLM (10)."""
        return 10
    
    def use_structured_output(self) -> bool:
        """
        No Groq, evitamos 'strict: true' (json_schema) pois causa lentidão excessiva (5x-10x mais lento).
        Retornando False, a classe base usará 'json_object', que é ultra-rápido.
        """
        return False
    
    def get_transcription_params(self, model: str, api_key: str, base_url: str) -> dict:
        """Adiciona parâmetros específicos do Groq para transcrição."""
        params = super().get_transcription_params(model, api_key, base_url)
        params["temperature"] = 0
        return params
    
    def get_translation_params(self, model: str, api_key: str, base_url: str) -> dict:
        """Adiciona parâmetros específicos do Groq para tradução."""
        params = super().get_translation_params(model, api_key, base_url)
        
        # Para modelos que não são gpt-oss, adicionar max_tokens se necessário
        # gpt-oss já tem limite alto. Llama as vezes precisa explicitar se o lote for grande.
        if "gpt-oss" not in model:
            params["max_tokens"] = 4096
            
        return params
