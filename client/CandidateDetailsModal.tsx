import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import PlaylistAddCheckRoundedIcon from '@mui/icons-material/PlaylistAddCheckRounded';
import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { sanitizeSvg } from '@/lib/sanitize';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';

import type { GeneratedCandidate } from './GeneratedMoleculeTable';

export function CandidateDetailsModal({
  candidate,
  onClose,
  onCommand,
  open,
  seedSmiles,
}: {
  candidate: GeneratedCandidate | null;
  onClose: () => void;
  onCommand?: (command: string) => void;
  open: boolean;
  seedSmiles?: string;
}) {
  const rank = candidate?.rank ?? '-';
  const smiles = candidate?.smiles || '';
  const mutationTrace = candidate?.mutation_trace || [];
  const generationTrace = candidate?.generation_trace || [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" aria-labelledby="candidate-details-title">
      <DialogTitle id="candidate-details-title" sx={titleSx}>
        Candidate {rank} Details
      </DialogTitle>
      <DialogContent sx={contentSx}>
        {candidate ? (
          <Box sx={layoutSx}>
            <Box sx={structurePaneSx}>
              <Box sx={largeSvgSx}>
                {candidate.svg ? (
                  <Box sx={svgSx} dangerouslySetInnerHTML={{ __html: sanitizeSvg(candidate.svg) }} />
                ) : (
                  <Typography sx={mutedSx}>2D structure unavailable</Typography>
                )}
              </Box>
              <Box sx={smilesBoxSx}>
                <Typography sx={sectionLabelSx}>Full SMILES</Typography>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Typography sx={smilesSx}>{smiles}</Typography>
                  <Tooltip title="Copy SMILES">
                    <IconButton
                      aria-label="Copy candidate SMILES"
                      onClick={() => void navigator.clipboard?.writeText(smiles)}
                      sx={iconButtonSx}
                    >
                      <ContentCopyRoundedIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>
            </Box>

            <Stack spacing={1.2} sx={{ minWidth: 0 }}>
              <Box sx={metricsGridSx}>
                <Metric label="Score" value={candidate.score} />
                <Metric label="LogP" value={candidate.logP} />
                <Metric label="TPSA" value={candidate.tpsa} />
                <Metric label="Mol. Weight" value={candidate.molecular_weight} />
                <Metric label="QED" value={candidate.qed} />
                <Metric label="Similarity" value={candidate.similarity_to_seed} />
                <Metric label="HBD" value={candidate.hbd} />
                <Metric label="HBA" value={candidate.hba} />
              </Box>

              <DetailSection title="Why ranked">
                {candidate.rank_reason || 'Balanced descriptor profile.'}
              </DetailSection>

              <TraceSection title="Mutation trace" traces={mutationTrace} empty="No mutation trace was recorded." />
              <TraceSection title="Generation trace" traces={generationTrace} empty="No grammar generation trace was recorded." />
            </Stack>
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions sx={actionsSx}>
        <Button onClick={onClose} sx={secondaryButtonSx}>Close</Button>
        {candidate ? (
          <>
            <Button startIcon={<ScienceRoundedIcon />} onClick={() => onCommand?.(`Load ${smiles}`)} sx={actionButtonSx}>
              Open
            </Button>
            {seedSmiles ? (
              <Button
                startIcon={<PlaylistAddCheckRoundedIcon />}
                onClick={() => onCommand?.(`Compare ${seedSmiles} with ${smiles}`)}
                sx={actionButtonSx}
              >
                Compare with seed
              </Button>
            ) : null}
            <Button startIcon={<TuneRoundedIcon />} onClick={() => onCommand?.(`Optimize analogs of ${smiles}`)} sx={refineButtonSx}>
              Refine
            </Button>
          </>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <Box sx={metricSx}>
      <Typography sx={metricLabelSx}>{label}</Typography>
      <Typography sx={metricValueSx}>{typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : 'n/a'}</Typography>
    </Box>
  );
}

function DetailSection({ children, title }: { children: string; title: string }) {
  return (
    <Box sx={detailBoxSx}>
      <Typography sx={sectionLabelSx}>{title}</Typography>
      <Typography sx={detailTextSx}>{children}</Typography>
    </Box>
  );
}

function TraceSection({ empty, title, traces }: { empty: string; title: string; traces: string[] }) {
  return (
    <Box sx={detailBoxSx}>
      <Typography sx={sectionLabelSx}>{title}</Typography>
      {traces.length ? (
        <Box component="ul" sx={traceListSx}>
          {traces.map((trace, index) => (
            <Box component="li" key={`${trace}-${index}`}>{trace}</Box>
          ))}
        </Box>
      ) : (
        <Typography sx={detailTextSx}>{empty}</Typography>
      )}
    </Box>
  );
}

const titleSx = {
  color: 'var(--molvis-text)',
  fontSize: '1rem',
  fontWeight: 900,
  borderBottom: '1px solid rgba(20, 32, 51, 0.08)',
} as const;

const contentSx = {
  p: { xs: 1.2, md: 1.5 },
  bgcolor: '#fbfcfe',
} as const;

const layoutSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 0.9fr) minmax(0, 1.1fr)' },
  gap: 1.4,
} as const;

const structurePaneSx = {
  minWidth: 0,
  display: 'grid',
  gap: 1,
} as const;

const largeSvgSx = {
  minHeight: { xs: 280, md: 380 },
  display: 'grid',
  placeItems: 'center',
  bgcolor: '#ffffff',
  border: '1px solid rgba(20, 32, 51, 0.08)',
  borderRadius: 0.75,
  overflow: 'hidden',
} as const;

const svgSx = {
  width: '100%',
  height: '100%',
  p: 1.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '& svg': { width: '92%', height: '92%', maxWidth: '100%', maxHeight: '100%', display: 'block' },
} as const;

const smilesBoxSx = {
  p: 1,
  bgcolor: '#ffffff',
  border: '1px solid rgba(20, 32, 51, 0.08)',
  borderRadius: 0.75,
} as const;

const smilesSx = {
  minWidth: 0,
  flex: 1,
  color: 'var(--molvis-accent)',
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: '0.78rem',
  fontWeight: 750,
  lineHeight: 1.55,
  wordBreak: 'break-all',
} as const;

const iconButtonSx = {
  width: 32,
  height: 32,
  color: 'var(--molvis-muted)',
  border: '1px solid rgba(20, 32, 51, 0.08)',
  borderRadius: 0.6,
  bgcolor: '#ffffff',
  '&:hover': { color: 'var(--molvis-accent)', bgcolor: '#eef4ff' },
} as const;

const metricsGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
  gap: 0.75,
} as const;

const metricSx = {
  p: 0.85,
  bgcolor: '#ffffff',
  border: '1px solid rgba(20, 32, 51, 0.08)',
  borderRadius: 0.65,
} as const;

const metricLabelSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.62rem',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
} as const;

const metricValueSx = {
  color: 'var(--molvis-text)',
  fontSize: '1rem',
  fontWeight: 900,
} as const;

const detailBoxSx = {
  p: 1,
  bgcolor: '#ffffff',
  border: '1px solid rgba(20, 32, 51, 0.08)',
  borderRadius: 0.75,
} as const;

const sectionLabelSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.64rem',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  mb: 0.5,
} as const;

const detailTextSx = {
  color: 'var(--molvis-text)',
  fontSize: '0.82rem',
  fontWeight: 680,
  lineHeight: 1.55,
} as const;

const traceListSx = {
  m: 0,
  pl: 2,
  color: 'var(--molvis-text)',
  fontSize: '0.76rem',
  fontWeight: 680,
  lineHeight: 1.6,
} as const;

const mutedSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.82rem',
  fontWeight: 700,
} as const;

const actionsSx = {
  p: 1.2,
  borderTop: '1px solid rgba(20, 32, 51, 0.08)',
  flexWrap: 'wrap',
  gap: 0.5,
} as const;

const actionButtonSx = {
  minHeight: 34,
  borderRadius: 0.6,
  color: 'var(--molvis-accent)',
  border: '1px solid rgba(49, 93, 255, 0.2)',
  fontSize: '0.74rem',
  fontWeight: 850,
  textTransform: 'none',
  '&:hover': { bgcolor: '#f0f4ff' },
} as const;

const refineButtonSx = {
  ...actionButtonSx,
  bgcolor: '#8b5cf6',
  color: '#ffffff',
  border: 'none',
  '&:hover': { bgcolor: '#7c3aed' },
} as const;

const secondaryButtonSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.74rem',
  fontWeight: 850,
  textTransform: 'none',
} as const;
