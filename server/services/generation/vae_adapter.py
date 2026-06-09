'''VAE generation engine integration for MolVis.

This adapter provides a simple interface compatible with the existing generation
framework. It lazily loads a pre‑trained VAE model from HuggingFace (or falls back
to a minimal stub if the model cannot be downloaded). The model is expected to
expose a ``sample`` method that returns a list of SMILES strings given a batch
size and optional temperature.

The adapter is deliberately lightweight: it does not block the event loop and
uses the provided ``on_progress`` callback to report progress in the 0‑1 range.
''' 

import random
from typing import Any, Dict, List

from app.services.generation.base import GenerationEngine

# A tiny fallback list of drug‑like molecules for environments where the real
# model cannot be loaded (e.g., no GPU). This ensures the endpoint remains
# functional for testing.
_FALLBACK_SMILES = [
    "CCO",  # ethanol
    "CC(=O)OC1=CC=CC=C1C(=O)O",  # aspirin
    "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",  # caffeine
    "CC(C)CC1=CC=CC=C1",  # toluene derivative
]

class VAEAdapter(GenerationEngine):
    """VAE based molecule generator.

    The class conforms to the ``GenerationEngine`` protocol used by
    ``generation_runner``. It lazily loads the model on first use and caches it
    for subsequent calls.
    """

    def __init__(self):
        self._model = None
        self._device = None
        self._initialized = False

    def _load_model(self):
        """Download and load the VAE model from HuggingFace.

        The model repository must contain a ``model.pt`` file that can be
        instantiated with ``torch.load``. If the download fails we fall back to a
        stub implementation that returns random molecules from ``_FALLBACK_SMILES``.
        """
        repo_id = "molvis/vae-molecules"
        filename = "model.pt"
        try:
            from huggingface_hub import hf_hub_download
            import torch
            # Download the checkpoint to the local cache directory.
            checkpoint_path = hf_hub_download(repo_id=repo_id, filename=filename)
            self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            self._model = torch.load(checkpoint_path, map_location=self._device)
            # Assume the checkpoint provides a ``sample`` method.
            self._initialized = True
        except Exception as e:
            # Log the issue (in production you would use proper logging).
            print(f"[VAEAdapter] Failed to load model from HF: {e}. Using fallback.")
            self._model = None
            self._initialized = True

    def generate(self, request: Dict[str, Any], on_progress: Any = None) -> Dict[str, Any]:
        """Generate ``count`` candidate SMILES strings.

        Parameters
        ----------
        request: dict
            Normalised generation request containing ``count`` and optional
            ``temperature``.
        on_progress: callable, optional
            Callback receiving a float in the range ``[0, 1]`` indicating the
            progress of sampling.
        """
        if not self._initialized:
            self._load_model()

        count = request.get("count", 10)
        temperature = request.get("temperature", 1.0)

        # If a real model is available, use it; otherwise use the fallback.
        if self._model is not None and hasattr(self._model, "sample"):
            # The real model is expected to return a list of SMILES strings.
            # We split the work into small batches to provide progress updates.
            batch_size = 16
            generated: List[str] = []
            for i in range(0, count, batch_size):
                cur_batch = min(batch_size, count - i)
                batch_smiles = self._model.sample(cur_batch, temperature=temperature)
                generated.extend(batch_smiles)
                if on_progress:
                    on_progress(min(1.0, (i + cur_batch) / count))
        else:
            # Simple stochastic fallback – sample uniformly from the hard‑coded list.
            generated = [random.choice(_FALLBACK_SMILES) for _ in range(count)]
            if on_progress:
                on_progress(1.0)

        # Return a structure compatible with the rest of the pipeline.
        return {
            "seed_smiles": request.get("seed"),
            "candidates": [
                {
                    "smiles": sm,
                    "metadata": {"source": "VAEAdapter", "temperature": temperature},
                }
                for sm in generated
            ],
            "metadata": {"engine": "molvis_vae", "model_loaded": self._model is not None},
        }
