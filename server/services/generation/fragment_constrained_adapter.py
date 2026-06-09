'''Fragment‑constrained generation adapter.

Generates molecules using the existing GraphGA engine but ensures that each
candidate contains at least one fragment from the curated Maybridge Ro3
fragment library. The library is loaded lazily via ``load_fragment_library``.
'''

import logging
from typing import Any, Dict, List, Optional

from rdkit import Chem

from app.services.generation.graph_ga_adapter import GraphGAAdapter
from app.services.fragment_library_service import load_fragment_library

logger = logging.getLogger(__name__)


class FragmentConstrainedAdapter(GraphGAAdapter):
    """Adapter that runs GraphGA generation and filters results by fragments.

    The payload may include a ``constraints.fragments`` list (SMILES strings). If omitted,
    the full Maybridge Ro3 library is used. Each generated molecule is kept only when it
    contains at least one fragment (substructure match).
    """

    def __init__(self):
        super().__init__()
        self._fragment_mols: Optional[List[Chem.Mol]] = None

    def _load_fragments(self, fragments: Optional[List[str]] = None) -> List[Chem.Mol]:
        """Return a list of RDKit Mol objects for fragment matching.

        If ``fragments`` is provided it should be a list of SMILES strings; otherwise the
        full Maybridge Ro3 CSV library is loaded via ``load_fragment_library``.
        """
        if fragments is not None:
            mols = []
            for smi in fragments:
                mol = Chem.MolFromSmiles(smi)
                if mol:
                    mols.append(mol)
                else:
                    logger.debug("Invalid fragment SMILES ignored: %s", smi)
            return mols
        if self._fragment_mols is None:
            self._fragment_mols = load_fragment_library()
        return self._fragment_mols

    def _matches_fragment(self, mol: Chem.Mol, fragment_mols: List[Chem.Mol]) -> bool:
        """Return True if ``mol`` contains any of the ``fragment_mols`` as substructure."""
        for frag in fragment_mols:
            if mol.HasSubstructMatch(frag):
                return True
        return False

    def generate(self, request: Dict[str, Any], on_progress: Any = None) -> Dict[str, Any]:
        # Load fragment constraints from request (if any)
        constraints = request.get("constraints", {}) or {}
        fragment_list: Optional[List[str]] = constraints.get("fragments")
        fragment_mols = self._load_fragments(fragment_list)

        # Run the original GraphGA generation
        result = super().generate(request, on_progress)

        # Filter candidates according to fragment match
        filtered = []
        for cand in result.get("candidates", []):
            try:
                smiles = getattr(cand, "smiles", None)
                if not smiles:
                    continue
                mol = Chem.MolFromSmiles(smiles)
                if mol and self._matches_fragment(mol, fragment_mols):
                    filtered.append(cand)
            except Exception as exc:
                logger.debug("Fragment filter error for %s: %s", smiles, exc)

        # Update result with filtered candidates and metadata
        result["candidates"] = filtered
        result.setdefault("metadata", {})["fragment_filter"] = {
            "requested_fragments": len(fragment_list) if fragment_list else "all",
            "matched": len(filtered),
        }
        return result
