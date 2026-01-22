"""
Provider Groq usando LiteLLM.
Otimizado para performance com suporte a structured output para modelos específicos.
"""
from .litellm_base import LiteLLMProvider
from config.models import model_supports_structured_output


class GroqProvider(LiteLLMProvider):
    """Provider para Groq via LiteLLM otimizado para velocidade e qualidade."""
    
    def get_name(self) -> str:
        return "groq"
    
    def get_concurrency_limit(self) -> int:
        """Pode usar concorrência padrão do LiteLLM (10)."""
        return 10
    
    def use_structured_output(self, model: str = None) -> bool:
        """
        Verifica se o modelo específico suporta structured output (strict mode).
        
        Segundo a docs do Groq:
        - Strict mode (strict: true): Apenas modelos limitados (GPT-OSS 20B, 120B)
        - Best-effort (json_object): Todos os modelos
        """
        if model:
            return model_supports_structured_output("groq", model)
        return False
    
    def get_translation_schema(self) -> dict:
        """Schema para structured output na tradução."""
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
    
    def get_translation_params(self, model: str, api_key: str, base_url: str) -> dict:
        """Adiciona parâmetros específicos do Groq para tradução."""
        params = {
            "api_key": api_key,
            "temperature": 0.1,
            "timeout": self.get_timeout(),
        }
        
        # Verificar se o modelo suporta structured output (strict mode)
        if self.use_structured_output(model):
            # Strict mode: apenas para modelos que suportam (GPT-OSS)
            params["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "batch_translation",
                    "strict": True,
                    "schema": self.get_translation_schema()
                }
            }
            print(f"[DEBUG] Using structured output (strict) for model: {model}")
        else:
            # Best-effort mode: para todos os outros modelos
            params["response_format"] = {"type": "json_object"}
            print(f"[DEBUG] Using best-effort JSON for model: {model}")
        
        return params
