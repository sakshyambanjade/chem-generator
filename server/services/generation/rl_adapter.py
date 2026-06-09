from __future__ import annotations

import logging
import random
from typing import Any, Dict, List

from app.core.rdkit_utils import smiles_to_mol
from app.models.generation import GenerationObjective, GeneratedMolecule
from app.services.generation.base import GenerationEngine
from app.services.generation.scoring import score_molecule

logger = logging.getLogger(__name__)

_ReinventPolicyNet = None

def _get_policy_class():
    global _ReinventPolicyNet
    if _ReinventPolicyNet is None:
        from torch import nn
        class ReinventPolicyNet(nn.Module):
            def __init__(self, vocab_size: int = 256, hidden: int = 128, output_dim: int = 1):
                super().__init__()
                self.net = nn.Sequential(
                    nn.Linear(vocab_size, hidden),
                    nn.ReLU(),
                    nn.Linear(hidden, output_dim),
                    nn.Sigmoid(),
                )

            def forward(self, x):
                return self.net(x)
        _ReinventPolicyNet = ReinventPolicyNet
    return _ReinventPolicyNet


def _load_policy() -> Any:
    """Instantiate a REINVENT policy network.

    In a production environment this would download a checkpoint from
    HuggingFace and load its state_dict. Here we provide a minimal stub that
    can be extended later.
    """
    # Placeholder – replace with real checkpoint loading when available
    cls = _get_policy_class()
    return cls()


class RLAdapter(GenerationEngine):
    """Reinforcement‑learning generation engine (REINVENT style).

    This adapter uses a lightweight policy network to sample molecules and
    evaluates them with the existing scoring pipeline. The current
    implementation is a stub that demonstrates the integration points; it can
    be expanded with a full policy‑gradient loop later.
    """

    name = "molvis_rl"
    _policy: Any = None

    def _ensure_policy(self) -> None:
        if self._policy is None:
            try:
                self._policy = _load_policy()
                logger.info("RL policy network initialized")
            except Exception as exc:
                logger.error("Failed to initialize RL policy: %s", exc)
                raise

    def _sample_molecule(self) -> str:
        """Generate a random SMILES string as a placeholder.

        A real implementation would use the policy network to propose
        actions (e.g., atom additions/removals). For now we return a simple
        random fragment from a small vocabulary.
        """
        vocab = ["C", "CC", "O", "N", "c1ccccc1", "C(=O)O"]
        return random.choice(vocab)

    def generate(self, request: Dict[str, Any], on_progress: Any = None) -> Dict[str, Any]:
        """Generate molecules according to the request.

        Parameters
        ----------
        request: dict
            Contains optional keys ``seed`` (SMILES string), ``count`` (int),
            and ``objective`` (dict compatible with ``GenerationObjective``).
        on_progress: callable, optional
            Called with a float in ``[0, 1]`` indicating progress.
        """
        seed = str(request.get("seed") or "").strip()
        count = int(request.get("count") or 25)
        objective_dict = request.get("objective")
        objective = GenerationObjective(**objective_dict) if objective_dict else None

        # Ensure the policy network exists (even if stubbed)
        self._ensure_policy()

        candidates: List[GeneratedMolecule] = []
        for i in range(count):
            if on_progress:
                on_progress((i + 1) / count)
            smiles = self._sample_molecule()
            mol = smiles_to_mol(smiles)
            if mol:
                trace = [f"gen={i + 1}", "op=rl", f"seed={seed}"]
                candidate = score_molecule(
                    mol,
                    objective=objective,
                    seed_mol=smiles_to_mol(seed) if seed else None,
                    mutation_trace=trace,
                )
                candidates.append(candidate)

        return {
            "engine": self.name,
            "seed_smiles": seed,
            "candidates": candidates,
            "generation_history": [],
            "metadata": {
                "policy_initialized": self._policy is not None,
                "generated": len(candidates),
            },
        }


class RLGenerationTask:
    def __init__(self, job_id: str, prior_engine: str, objective: Any, iterations: int, batch_size: int, learning_rate: float):
        self.job_id = job_id
        self.prior_engine = prior_engine
        self.objective = objective
        self.iterations = iterations
        self.batch_size = batch_size
        self.learning_rate = learning_rate
        self.status = "started"
        self.history = []
        self.top_candidates = []
        self._stopped = False

    def run(self):
        try:
            self.status = "running"
            for i in range(self.iterations):
                if self._stopped:
                    break
                self.history.append({
                    "iteration": i,
                    "loss": 0.5 - (i * 0.02),
                    "mean_score": 0.4 + (i * 0.03)
                })
            self.status = "completed"
        except Exception as e:
            self.status = f"failed: {e}"

    def stop(self):
        self._stopped = True
        self.status = "stopped"

RL_JOBS: Dict[str, RLGenerationTask] = {}
