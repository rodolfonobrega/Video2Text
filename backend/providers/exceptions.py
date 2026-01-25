"""
Exceções compartilhadas para todos os providers de transcrição.
"""


class ProviderError(Exception):
    """Erro base para todos os providers."""

    pass


class APIConnectionError(ProviderError):
    """Erro de conexão com a API."""

    pass


class AuthenticationError(ProviderError):
    """Erro de autenticação."""

    pass


class RateLimitError(ProviderError):
    """Erro de limite de taxa (rate limit)."""

    pass


class InvalidModelError(ProviderError):
    """Erro de modelo inválido."""

    pass
