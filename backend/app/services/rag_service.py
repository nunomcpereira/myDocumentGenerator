from __future__ import annotations

import re
from pathlib import Path

from app.core.config import get_settings
from app.models.document_state import ExampleSnippet, RetrievalContext

try:
    from langchain_chroma import Chroma
    from langchain_core.documents import Document
    from langchain_huggingface import HuggingFaceEmbeddings
except ImportError:  # pragma: no cover - optional dependency path
    Chroma = None
    Document = None
    HuggingFaceEmbeddings = None


class RAGService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._fallback_examples: dict[str, list[ExampleSnippet]] = {}
        self._collections: dict[str, str] = {}

    def index_examples(
        self,
        session_id: str,
        good_examples: list[tuple[str, str]],
        bad_examples: list[tuple[str, str]],
    ) -> list[str]:
        warnings: list[str] = []
        snippets = [
            ExampleSnippet(file_name=file_name, quality="good", content=content)
            for file_name, content in good_examples
        ]
        snippets.extend(
            ExampleSnippet(file_name=file_name, quality="bad", content=content)
            for file_name, content in bad_examples
        )
        self._fallback_examples[session_id] = snippets

        if not snippets:
            return warnings

        if Chroma is None or Document is None or HuggingFaceEmbeddings is None:
            warnings.append("LangChain Chroma dependencies are unavailable. Falling back to lexical retrieval.")
            return warnings

        try:
            embeddings = HuggingFaceEmbeddings(model_name=self.settings.embedding_model)
            persist_directory = self.settings.vector_store_root / session_id
            persist_directory.mkdir(parents=True, exist_ok=True)
            collection_name = f"documentation-{session_id}"
            documents = [
                Document(
                    page_content=snippet.content,
                    metadata={"quality": snippet.quality, "file_name": snippet.file_name},
                )
                for snippet in snippets
            ]
            store = Chroma(
                collection_name=collection_name,
                embedding_function=embeddings,
                persist_directory=str(persist_directory),
            )
            store.add_documents(documents)
            self._collections[session_id] = collection_name
        except Exception as exc:  # pragma: no cover - resilience path
            warnings.append(f"Vector indexing failed, falling back to lexical retrieval: {exc}")
        return warnings

    def retrieve(self, session_id: str, query: str, limit: int = 2) -> RetrievalContext:
        if session_id in self._collections and Chroma is not None and HuggingFaceEmbeddings is not None:
            try:
                embeddings = HuggingFaceEmbeddings(model_name=self.settings.embedding_model)
                store = Chroma(
                    collection_name=self._collections[session_id],
                    embedding_function=embeddings,
                    persist_directory=str(self.settings.vector_store_root / session_id),
                )
                raw_docs = store.similarity_search(query, k=max(limit * 2, 4))
                good_examples: list[ExampleSnippet] = []
                bad_examples: list[ExampleSnippet] = []
                for doc in raw_docs:
                    snippet = ExampleSnippet(
                        file_name=doc.metadata.get("file_name", "example.txt"),
                        quality=doc.metadata.get("quality", "good"),
                        content=doc.page_content,
                    )
                    if snippet.quality == "good" and len(good_examples) < limit:
                        good_examples.append(snippet)
                    if snippet.quality == "bad" and len(bad_examples) < limit:
                        bad_examples.append(snippet)
                return RetrievalContext(good_examples=good_examples, bad_examples=bad_examples)
            except Exception as exc:  # pragma: no cover - resilience path
                return self._fallback_retrieve(session_id, query, limit, warning=str(exc))
        return self._fallback_retrieve(session_id, query, limit)

    def build_negative_constraints(self, snippets: list[ExampleSnippet]) -> list[str]:
        constraints: list[str] = []
        for snippet in snippets:
            sentences = re.split(r"(?<=[.!?])\s+", snippet.content)
            for sentence in sentences:
                normalized = sentence.strip()
                if 12 <= len(normalized) <= 180:
                    constraints.append(f"Avoid phrasing similar to: {normalized}")
                if len(constraints) >= 3:
                    return constraints
        return constraints

    def _fallback_retrieve(
        self,
        session_id: str,
        query: str,
        limit: int,
        warning: str | None = None,
    ) -> RetrievalContext:
        tokens = {token.lower() for token in re.findall(r"\w+", query) if len(token) > 2}
        ranked = []
        for snippet in self._fallback_examples.get(session_id, []):
            haystack = snippet.content.lower()
            score = sum(1 for token in tokens if token in haystack)
            ranked.append((score, snippet))
        ranked.sort(key=lambda item: item[0], reverse=True)

        good_examples: list[ExampleSnippet] = []
        bad_examples: list[ExampleSnippet] = []
        for _, snippet in ranked:
            if snippet.quality == "good" and len(good_examples) < limit:
                good_examples.append(snippet)
            if snippet.quality == "bad" and len(bad_examples) < limit:
                bad_examples.append(snippet)
            if len(good_examples) >= limit and len(bad_examples) >= limit:
                break

        warnings = [f"Using lexical retrieval fallback: {warning}"] if warning else []
        return RetrievalContext(good_examples=good_examples, bad_examples=bad_examples, warnings=warnings)


rag_service = RAGService()