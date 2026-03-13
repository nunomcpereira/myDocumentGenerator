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