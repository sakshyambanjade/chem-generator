# Placeholder filters module

def canonical_valid_molecules(candidates):
    """
    Stub implementation that treats all provided SMILES strings as valid.
    Returns a list of tuples (None, smiles, tags) and an empty error list.
    """
    valid = [(None, sm, tags) for sm, tags in candidates]
    return valid, []

def scan_structural_alerts(mol) -> list[str]:
    """Return an empty list as placeholder for structural alerts."""
    return []
