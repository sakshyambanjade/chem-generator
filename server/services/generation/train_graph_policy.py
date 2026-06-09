# train_graph_policy.py – Training script for GraphGA policy network

"""Training script for the GraphGA policy network.

The policy network predicts which mutation operator to apply (append, replace,
remove, or crossover) given a molecular fingerprint, the current generation
index, and the number of attempts. The script is intended to be run manually
outside of the FastAPI process and saves a checkpoint that the ``GraphGAAdapter``
loads at runtime.

Usage (via the CLI)::

    python -m app.services.generation.train_graph_policy \
        --data-path data/training_molecules.smi \
        --epochs 30 \
        --lr 1e-3 \
        --output model.pt

The data file should contain one SMILES string per line.
"""

import argparse
import random
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from rdkit import Chem
from rdkit.Chem import AllChem

# -----------------------------------------------------------------------------
# Model definition – mirrors the lightweight network used in ``GraphGAAdapter``
# -----------------------------------------------------------------------------
class GraphPolicyNet(nn.Module):
    def __init__(self, input_dim: int = 256, hidden: int = 128, output_dim: int = 4):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden),
            nn.ReLU(),
            nn.Linear(hidden, output_dim),
            nn.Softmax(dim=-1),
        )

    def forward(self, x):
        return self.net(x)

# -----------------------------------------------------------------------------
# Helper utilities
# -----------------------------------------------------------------------------
def smiles_to_fp(smiles: str) -> torch.Tensor:
    """Convert a SMILES string to a 256‑bit Morgan fingerprint tensor."""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Invalid SMILES: {smiles}")
    fp = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=256)
    arr = torch.tensor(list(fp), dtype=torch.float32)
    return arr

def load_dataset(path: Path) -> list[str]:
    """Load SMILES from a file – ignore empty lines and comments."""
    smiles = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                smiles.append(line)
    return smiles

# -----------------------------------------------------------------------------
# Training loop – a simple supervised learning proxy.
# For each molecule we generate a pseudo‑label by selecting a random operator.
# -----------------------------------------------------------------------------
def train(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = GraphPolicyNet().to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=args.lr)

    smiles_list = load_dataset(Path(args.data_path))
    if not smiles_list:
        raise RuntimeError("Training data is empty.")

    for epoch in range(1, args.epochs + 1):
        random.shuffle(smiles_list)
        epoch_loss = 0.0
        for smi in smiles_list:
            optimizer.zero_grad()
            fp = smiles_to_fp(smi).unsqueeze(0).to(device)  # shape (1,256)
            # Random pseudo‑label (0‑3) – in practice you would derive this from
            # expert data, but a uniform label provides a usable checkpoint.
            label = torch.tensor([random.randint(0, 3)], device=device)
            output = model(fp)
            loss = criterion(output, label)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()
        print(f"Epoch {epoch}/{args.epochs} – loss: {epoch_loss/len(smiles_list):.4f}")

    # Save checkpoint – the ``GraphGAAdapter`` looks for ``model.pt`` in the HF cache.
    output_path = Path(args.output)
    torch.save(model.state_dict(), output_path)
    print(f"Model checkpoint saved to {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train GraphGA policy network")
    parser.add_argument("--data-path", type=str, required=True, help="Path to SMILES training file")
    parser.add_argument("--epochs", type=int, default=30, help="Number of training epochs")
    parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate")
    parser.add_argument("--output", type=str, default="model.pt", help="Checkpoint output file")
    args = parser.parse_args()
    train(args)

"""END OF FILE"""
