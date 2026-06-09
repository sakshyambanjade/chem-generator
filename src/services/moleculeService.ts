export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const moleculeService = {
  async getRetrosynthesis({ smiles }: { smiles: string }) {
    return {
      sa_score: 3,
      tree: {
        children: [],
        id: 'root',
        is_starting_material: true,
        smiles,
        title: smiles,
        type: 'compound',
      },
    };
  },
};
