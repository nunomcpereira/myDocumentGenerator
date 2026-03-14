class SessionNotFoundError(Exception):
    pass


class UnsupportedTemplateError(Exception):
    pass


class LLMProviderError(Exception):
    pass


class LLMOfflineError(LLMProviderError):
    pass


class ExportError(Exception):
    pass


class TranslationProviderError(Exception):
    pass


class TranslationProviderConfigurationError(TranslationProviderError):
    pass