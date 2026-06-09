import { Box, Typography } from '@mui/material';

import type { ArtifactRendererProps } from '@/features/artifacts/artifactRendererRegistry';

export function GenerationJobPanel({ artifact }: ArtifactRendererProps) {
  const data = artifact.data || {};
  return (
    <Box sx={shellSx}>
      <Typography sx={titleSx}>{artifact.title}</Typography>
      <Typography sx={metaSx}>Job {String(data.job_id || 'pending')}</Typography>
      <Typography sx={summarySx}>{artifact.summary || 'Generation job is ready.'}</Typography>
    </Box>
  );
}

const shellSx = {
  height: '100%',
  display: 'grid',
  alignContent: 'start',
  gap: 0.55,
  p: 1.2,
  border: '1px solid rgba(20, 32, 51, 0.08)',
  borderRadius: 0.75,
  bgcolor: '#ffffff',
} as const;

const titleSx = {
  color: 'var(--molvis-text)',
  fontSize: '1rem',
  fontWeight: 900,
} as const;

const metaSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.72rem',
  fontWeight: 760,
} as const;

const summarySx = {
  color: 'var(--molvis-text)',
  fontSize: '0.82rem',
  fontWeight: 700,
} as const;

