import { Box, Typography } from '@mui/material';

export function GenerationSettingsPanel() {
  return (
    <Box sx={shellSx}>
      <Typography sx={titleSx}>Descriptor-guided generation</Typography>
    </Box>
  );
}

const shellSx = {
  p: 1,
} as const;

const titleSx = {
  color: 'var(--molvis-text)',
  fontSize: '0.82rem',
  fontWeight: 850,
} as const;

