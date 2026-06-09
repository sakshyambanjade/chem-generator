import { useMemo, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';

import { GenerationForm } from '../client/GenerationForm';
import type { GenerationCondition, GenerationSettings } from '../client/GenerationForm';
import { GeneratedMoleculeCard } from '../client/GeneratedMoleculeCard';
import type { GeneratedCandidate } from '../client/GeneratedMoleculeTable';

const baseCandidates: GeneratedCandidate[] = [
  { rank: 1, smiles: 'CC(=O)Oc1ccccc1C(=O)O', score: 0.91, logP: 1.19, tpsa: 63.6, qed: 0.55, synthesizability: 'green' },
  { rank: 2, smiles: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O', score: 0.86, logP: 3.5, tpsa: 37.3, qed: 0.82, synthesizability: 'yellow' },
  { rank: 3, smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C', score: 0.8, logP: -0.1, tpsa: 61.8, qed: 0.54, synthesizability: 'green' },
];

function moleculeSvg(smiles: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 150"><rect width="220" height="150" rx="12" fill="#ffffff"/><circle cx="58" cy="76" r="15" fill="#142033"/><circle cx="110" cy="48" r="15" fill="#2958ff"/><circle cx="162" cy="76" r="15" fill="#16a34a"/><path d="M72 69 L96 55 M124 55 L148 69" stroke="#475569" stroke-width="5" stroke-linecap="round"/><text x="110" y="128" text-anchor="middle" font-family="monospace" font-size="12" fill="#475569">${smiles}</text></svg>`;
}

export function App() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<GeneratedCandidate[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const decoratedResults = useMemo(
    () => results.map((candidate) => ({ ...candidate, svg: candidate.svg || moleculeSvg(candidate.smiles) })),
    [results],
  );

  function startGeneration(_conditions: GenerationCondition[], settings: GenerationSettings) {
    setRunning(true);
    window.setTimeout(() => {
      setResults(
        baseCandidates.slice(0, Math.min(settings.numToGenerate, baseCandidates.length)).map((candidate, index) => ({
          ...candidate,
          rank: index + 1,
          score: Math.max(0.1, (candidate.score || 0.75) - index * 0.03),
        })),
      );
      setRunning(false);
    }, 450);
  }

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'var(--molvis-bg)', p: { xs: 1.2, md: 2.5 } }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: 'var(--molvis-text)' }}>
            Chem Generator
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--molvis-muted)' }}>
            Standalone molecule generation workspace
          </Typography>
        </Box>

        <GenerationForm onStartGeneration={startGeneration} />

        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" sx={{ color: 'var(--molvis-text)', fontWeight: 800 }}>
            Candidates
          </Typography>
          <Button size="small" onClick={() => setResults([])} disabled={!results.length}>
            Clear
          </Button>
        </Stack>

        {running ? (
          <Box sx={{ p: 3, bgcolor: '#fff', border: '1px solid var(--molvis-border-soft)', borderRadius: 1 }}>
            <Typography>Generating candidates...</Typography>
          </Box>
        ) : null}

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 1.2 }}>
          {decoratedResults.map((candidate) => (
            <GeneratedMoleculeCard
              key={candidate.smiles}
              candidate={candidate}
              selected={selected === candidate.smiles}
              onSelect={(next) => setSelected(next.smiles)}
              onCommand={() => undefined}
            />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
