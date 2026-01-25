"""
Configuração de modelos disponíveis para cada provider.
Usado para popular dropdowns no frontend.
"""

PROVIDER_MODELS = {
    "openai": {
        "name": "OpenAI",
        "transcription_models": [
            {
                "id": "whisper-1",
                "name": "Whisper v1",
                "description": "Modelo Whisper com timestamps",
            }
        ],
        "translation_models": [
            {
                "id": "gpt-4.1",
                "name": "GPT-4.1",
                "description": "Modelo mais avancado",
                "supports_structured_output": True,
            },
            {
                "id": "gpt-4.1-mini",
                "name": "GPT-4.1 Mini",
                "description": "Versao compacta do GPT-4.1",
                "supports_structured_output": True,
            },
            {
                "id": "gpt-4.1-nano",
                "name": "GPT-4.1 Nano",
                "description": "Versao ultra-compacta",
                "supports_structured_output": True,
            },
            {
                "id": "gpt-4o",
                "name": "GPT-4o",
                "description": "GPT-4 otimizado",
                "supports_structured_output": True,
            },
            {
                "id": "gpt-4o-mini",
                "name": "GPT-4o Mini",
                "description": "Versao compacta do GPT-4o",
                "supports_structured_output": True,
            },
            {
                "id": "gpt-5",
                "name": "GPT-5",
                "description": "Proxima geracao",
                "supports_structured_output": True,
            },
            {
                "id": "gpt-5-mini",
                "name": "GPT-5 Mini",
                "description": "Versao compacta do GPT-5",
                "supports_structured_output": True,
            },
            {
                "id": "gpt-5-nano",
                "name": "GPT-5 Nano",
                "description": "Versao ultra-compacta do GPT-5",
                "supports_structured_output": True,
            },
        ],
    },
    "groq": {
        "name": "Groq",
        "transcription_models": [
            {
                "id": "whisper-large-v3-turbo",
                "name": "Whisper Large v3 Turbo",
                "description": "Modelo de transcricao rapido",
            }
        ],
        "translation_models": [
            # Models with Structured Output (gpt-oss)
            {
                "id": "openai/gpt-oss-120b",
                "name": "GPT-OSS 120B",
                "description": "120B parametros com structured output",
                "supports_structured_output": True,
            },
            {
                "id": "openai/gpt-oss-20b",
                "name": "GPT-OSS 20B",
                "description": "20B parametros com structured output",
                "supports_structured_output": True,
            },
            # Llama Models
            {
                "id": "llama-3.3-70b-versatile",
                "name": "Llama 3.3 70B Versatile",
                "description": "Modelo versatil de 70B",
                "supports_structured_output": False,
            },
            {
                "id": "llama-3.1-8b-instant",
                "name": "Llama 3.1 8B Instant",
                "description": "Modelo rapido de 8B",
                "supports_structured_output": False,
            },
            # Llama 4 Models
            {
                "id": "meta-llama/llama-4-scout-17b-16e-instruct",
                "name": "Llama 4 Scout 17B",
                "description": "Llama 4 Scout",
                "supports_structured_output": False,
            },
            {
                "id": "meta-llama/llama-4-maverick-17b-128e-instruct",
                "name": "Llama 4 Maverick 17B",
                "description": "Llama 4 Maverick",
                "supports_structured_output": False,
            },
            # Other models
            {
                "id": "qwen/qwen3-32b",
                "name": "Qwen3 32B",
                "description": "Modelo Qwen de 32B",
                "supports_structured_output": False,
            },
            {
                "id": "moonshotai/kimi-k2-instruct-0905",
                "name": "Kimi K2 Instruct",
                "description": "Modelo Kimi K2",
                "supports_structured_output": False,
            },
        ],
    },
}


def get_provider_models(provider_name: str, model_type: str = "translation"):
    """
    Retorna a lista de modelos para um provider específico.

    Args:
        provider_name: Nome do provider ("openai" ou "groq")
        model_type: Tipo de modelo ("transcription" ou "translation")

    Returns:
        Lista de modelos disponíveis
    """
    provider = PROVIDER_MODELS.get(provider_name.lower())
    if not provider:
        return []

    key = f"{model_type}_models"
    return provider.get(key, [])


def get_all_providers():
    """Retorna lista de todos os providers disponíveis."""
    return [{"id": key, "name": value["name"]} for key, value in PROVIDER_MODELS.items()]


def model_supports_structured_output(provider_name: str, model_id: str) -> bool:
    """Verifica se um modelo suporta structured output."""
    models = get_provider_models(provider_name, "translation")
    for model in models:
        if model["id"] == model_id:
            return model.get("supports_structured_output", False)
    return False
