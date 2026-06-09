from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict


class GenerationEngine(ABC):
    name: str

    @abstractmethod
    def generate(self, request: Dict[str, Any], on_progress: Any = None) -> Dict[str, Any]:
        """Return generated molecules and engine metadata."""
        raise NotImplementedError

