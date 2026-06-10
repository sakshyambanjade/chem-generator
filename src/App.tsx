import { useMemo, useState } from 'react';
import { Box, Button, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import ClearRoundedIcon from '@mui/icons-material/ClearRounded';
import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded';

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
    <Box sx={{ minHeight: '100dvh', p: { xs: 2, md: 3 } }}>
      <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1380, mx: 'auto' }}>
        <Box sx={heroSx}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              <Chip size="small" icon={<BoltRoundedIcon />} label={running ? 'Running' : `${results.length || baseCandidates.length} sample candidates`} sx={heroChipSx} />
            </Stack>
            <Typography variant="h3" sx={titleSx}>
              Chem Generator
            </Typography>
          </Box>
          <Box sx={heroStatsSx}>
            <Box>
              <Typography sx={statValueSx}>{results.length || '-'}</Typography>
              <Typography sx={statLabelSx}>Candidates</Typography>
            </Box>
            <Box>
              <Typography sx={statValueSx}>3</Typography>
              <Typography sx={statLabelSx}>Presets</Typography>
            </Box>
            <Box>
              <Typography sx={statValueSx}>2</Typography>
              <Typography sx={statLabelSx}>Engines</Typography>
            </Box>
          </Box>
        </Box>

        <Box sx={workspaceGridSx}>
          <GenerationForm onStartGeneration={startGeneration} />

          <Box sx={resultsPanelSx}>
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ color: 'var(--molvis-text)', fontWeight: 900, lineHeight: 1.15 }}>
                  Candidates
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--molvis-muted)', mt: 0.35 }}>
                  Ranked molecules appear here after generation.
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                startIcon={<ClearRoundedIcon />}
                onClick={() => setResults([])}
                disabled={!results.length}
                sx={{ textTransform: 'none', fontWeight: 800, borderRadius: 1.5 }}
              >
                Clear
              </Button>
            </Stack>

            {running ? (
              <Box sx={runningSx}>
                <Stack direction="row" spacing={1.2} alignItems="center">
                  <AutoAwesomeRoundedIcon color="primary" />
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontWeight: 900, color: 'var(--molvis-text)' }}>Generating candidates</Typography>
                    <LinearProgress sx={{ mt: 1, borderRadius: 99 }} />
                  </Box>
                </Stack>
              </Box>
            ) : null}

            {!running && !decoratedResults.length ? (
              <Box sx={emptySx}>
                <ScienceRoundedIcon sx={{ fontSize: 34, color: 'var(--molvis-accent)' }} />
                <Typography sx={{ fontWeight: 900, color: 'var(--molvis-text)', mt: 1 }}>No candidates yet</Typography>
                <Typography sx={{ color: 'var(--molvis-muted)', maxWidth: 320, mx: 'auto', mt: 0.5 }}>
                  Start a generation run or choose a preset goal to populate this review panel.
                </Typography>
              </Box>
            ) : null}

            <Box sx={cardsGridSx}>
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
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}

const heroSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto' },
  gap: 2,
  alignItems: 'end',
  p: { xs: 2, md: 3 },
  border: '1px solid rgba(255, 255, 255, 0.72)',
  borderRadius: 2,
  bgcolor: 'rgba(255, 255, 255, 0.72)',
  boxShadow: '0 16px 45px rgba(20, 32, 51, 0.08)',
  backdropFilter: 'blur(18px)',
} as const;

const heroChipSx = {
  height: 28,
  borderRadius: 1.2,
  bgcolor: 'rgba(41, 88, 255, 0.08)',
  color: 'var(--molvis-text)',
  fontWeight: 800,
  '& .MuiChip-icon': { fontSize: 16, color: 'var(--molvis-accent)' },
} as const;

const titleSx = {
  color: 'var(--molvis-text)',
  fontWeight: 950,
  letterSpacing: 0,
  fontSize: { xs: '2rem', md: '3rem' },
  lineHeight: 1,
} as const;

const subtitleSx = {
  color: 'var(--molvis-muted)',
  maxWidth: 760,
  mt: 1.2,
  lineHeight: 1.6,
} as const;

const heroStatsSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(88px, 1fr))',
  gap: 1,
  width: { xs: '100%', md: 340 },
  '& > div': {
    p: 1.5,
    border: '1px solid var(--molvis-border-soft)',
    borderRadius: 1.5,
    bgcolor: 'rgba(248, 250, 252, 0.78)',
  },
} as const;

const statValueSx = {
  color: 'var(--molvis-text)',
  fontWeight: 950,
  fontSize: '1.45rem',
  lineHeight: 1,
} as const;

const statLabelSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.72rem',
  fontWeight: 850,
  textTransform: 'uppercase',
  mt: 0.6,
} as const;

const workspaceGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(620px, 0.98fr) minmax(390px, 0.72fr)' },
  gap: 2.2,
  alignItems: 'start',
  justifyContent: 'center',
} as const;

const resultsPanelSx = {
  p: { xs: 2, md: 2.4 },
  border: '1px solid var(--molvis-border-soft)',
  borderRadius: 2,
  bgcolor: 'rgba(255, 255, 255, 0.86)',
  boxShadow: 'var(--molvis-shadow)',
  minHeight: { lg: 560 },
} as const;

const cardsGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
  gap: 1.2,
} as const;

const runningSx = {
  p: 2,
  mb: 1.5,
  bgcolor: '#f7f9ff',
  border: '1px solid rgba(41, 88, 255, 0.14)',
  borderRadius: 1.5,
} as const;

const emptySx = {
  display: 'grid',
  placeItems: 'center',
  textAlign: 'center',
  minHeight: 360,
  border: '1px dashed rgba(20, 32, 51, 0.18)',
  borderRadius: 1.5,
  bgcolor: 'rgba(248, 250, 252, 0.7)',
  p: 3,
} as const;
