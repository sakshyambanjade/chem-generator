# MolVis Generation Engines

MolVis exposes two native descriptor-guided generation engines:

- **MolVis Graph** (`molvis_graph`): GB_GA-inspired RDKit graph mutation for seed-based analog generation. It is not a full GB_GA implementation.
- **MolVis Grammar** (`molvis_grammar`): ChemGE-inspired grammar/SMILES exploration for diverse molecule generation. It is not a full ChemGE implementation.

Both engines validate, canonicalize, deduplicate, filter, and descriptor-score generated molecules. They do not provide docking, synthesis, toxicity, dosing, medical, or clinical claims.
