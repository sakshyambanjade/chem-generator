import { useState, useMemo } from 'react';
import { sanitizeSvg } from '@/lib/sanitize';
import {
  Box,
  Button,
  Collapse,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded';
import SortRoundedIcon from '@mui/icons-material/SortRounded';
import { CandidateDetailsModal } from './CandidateDetailsModal';

export type GeneratedCandidate = {
  hba?: number;
  hbd?: number;
  logP?: number;
  molecular_weight?: number;
  mutation_trace?: string[];
  generation_trace?: string[];
  qed?: number | null;
  rank?: number;
  rank_reason?: string;
  score?: number;
  similarity_to_seed?: number | null;
  smiles: string;
  svg?: string;
  tpsa?: number;
  synthesizability?: 'green' | 'yellow' | 'red' | 'gray';
  warnings?: string[];
  sa_score?: number;
};

type SortField = 'score' | 'logP' | 'qed' | 'similarity_to_seed' | 'rank';

export function GeneratedMoleculeTable({
  candidates,
  onCommand,
  seedSmiles,
  selectedSmiles,
  onSelectCandidate,
}: {
  candidates: GeneratedCandidate[];
  onCommand?: (command: string) => void;
  seedSmiles?: string;
  selectedSmiles?: string;
  onSelectCandidate?: (candidate: GeneratedCandidate) => void;
}) {
  const [limit, setLimit] = useState<number | 'all'>(10);
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [detailsCandidate, setDetailsCandidate] = useState<GeneratedCandidate | null>(null);

  const sortedCandidates = useMemo(() => {
    const list = [...candidates].sort((a, b) => {
      const valA = a[sortField] ?? 0;
      const valB = b[sortField] ?? 0;
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return limit === 'all' ? list : list.slice(0, limit);
  }, [candidates, sortField, sortDir, limit]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  return (
    <Box sx={containerSx}>
      <Box sx={toolbarSx}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box sx={controlGroupSx}>
            <Typography sx={controlLabelSx}>Show</Typography>
            <Select
              size="small"
              value={limit}
              onChange={(e) => setLimit(e.target.value as number | 'all')}
              sx={selectSx}
            >
              <MenuItem value={10}>Top 10</MenuItem>
              <MenuItem value={25}>Top 25</MenuItem>
              <MenuItem value="all">All ({candidates.length})</MenuItem>
            </Select>
          </Box>

          <Box sx={controlGroupSx}>
            <Typography sx={controlLabelSx}>Sort by</Typography>
            <Stack direction="row" spacing={0.5} sx={sortStackSx}>
              {(['rank', 'score', 'logP', 'qed', 'similarity_to_seed'] as const).map((field) => (
                <Button
                  key={field}
                  size="small"
                  onClick={() => handleSort(field)}
                  sx={sortButtonSx(sortField === field)}
                >
                  {field.replace(/_to_seed/g, '').replace(/_/g, ' ')}
                  {sortField === field && (
                    <SortRoundedIcon sx={{ fontSize: 12, ml: 0.4, transform: sortDir === 'asc' ? 'rotate(180deg)' : 'none' }} />
                  )}
                </Button>
              ))}
            </Stack>
          </Box>
        </Stack>
      </Box>

      <Box sx={tableWrapSx}>
        <Table size="small" stickyHeader aria-label="Generated molecule candidates">
          <TableHead>
            <TableRow>
              <TableCell sx={headCellSx} />
              <TableCell sx={headCellSx}>Rank</TableCell>
              <TableCell sx={headCellSx}>2D</TableCell>
              <TableCell sx={headCellSx}>Score</TableCell>
              <TableCell sx={headCellSx}>LogP</TableCell>
              <TableCell sx={headCellSx}>TPSA</TableCell>
              <TableCell sx={headCellSx}>QED</TableCell>
              <TableCell sx={headCellSx}>Similarity</TableCell>
              <TableCell sx={headCellSx}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedCandidates.map((candidate) => (
              <ExpandableRow
                key={`${candidate.rank}-${candidate.smiles}`}
                candidate={candidate}
                onCommand={onCommand}
                seedSmiles={seedSmiles}
                selected={selectedSmiles === candidate.smiles}
                onSelectCandidate={onSelectCandidate}
                onDetails={setDetailsCandidate}
              />
            ))}
          </TableBody>
        </Table>
        {!candidates.length ? <Typography sx={emptySx}>No valid generated candidates are available.</Typography> : null}
      </Box>
      <CandidateDetailsModal
        candidate={detailsCandidate}
        onClose={() => setDetailsCandidate(null)}
        onCommand={onCommand}
        open={Boolean(detailsCandidate)}
        seedSmiles={seedSmiles}
      />
    </Box>
  );
}

function ExpandableRow({
  candidate,
  onCommand,
  seedSmiles,
  selected,
  onSelectCandidate,
  onDetails,
}: {
  candidate: GeneratedCandidate;
  onCommand?: (command: string) => void;
  seedSmiles?: string;
  selected?: boolean;
  onSelectCandidate?: (candidate: GeneratedCandidate) => void;
  onDetails?: (candidate: GeneratedCandidate) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow
        hover
        sx={rowSx(open, selected)}
        onClick={() => {
          onSelectCandidate?.(candidate);
          setOpen(!open);
        }}
      >
        <TableCell sx={toggleCellSx}>
          <IconButton size="small">
            {open ? <KeyboardArrowUpRoundedIcon sx={{ fontSize: 18 }} /> : <KeyboardArrowDownRoundedIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        </TableCell>
        <TableCell sx={rankCellSx}>{candidate.rank ?? '-'}</TableCell>
        <TableCell sx={previewCellSx}>
          {candidate.svg ? <Box sx={svgSx} dangerouslySetInnerHTML={{ __html: sanitizeSvg(candidate.svg) }} /> : null}
        </TableCell>
        <TableCell sx={bodyCellSx}>{formatNumber(candidate.score)}</TableCell>
        <TableCell sx={bodyCellSx}>{formatNumber(candidate.logP)}</TableCell>
        <TableCell sx={bodyCellSx}>{formatNumber(candidate.tpsa)}</TableCell>
        <TableCell sx={bodyCellSx}>{formatNumber(candidate.qed)}</TableCell>
        <TableCell sx={bodyCellSx}>{formatNumber(candidate.similarity_to_seed)}</TableCell>
        <TableCell sx={actionCellSx} onClick={(e) => e.stopPropagation()}>
          <Button size="small" onClick={() => onCommand?.(`Load ${candidate.smiles}`)} sx={linkButtonSx}>Open</Button>
          {seedSmiles ? (
            <Button size="small" onClick={() => onCommand?.(`Compare ${seedSmiles} with ${candidate.smiles}`)} sx={linkButtonSx}>Compare</Button>
          ) : null}
          <Button size="small" onClick={() => onDetails?.(candidate)} sx={linkButtonSx}>Details</Button>
        </TableCell>
      </TableRow>
      <TableRow sx={{ bgcolor: open ? '#f8faff' : 'transparent' }}>
        <TableCell colSpan={9} sx={{ p: 0, borderBottom: open ? '1px solid rgba(20, 32, 51, 0.08)' : 'none' }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={detailsBoxSx}>
              <Box sx={detailsInnerSx}>
                <Box sx={detailsColSx}>
                  <Stack spacing={1}>
                    <Box>
                      <Typography sx={detailLabelSx}>Full SMILES</Typography>
                      <Typography sx={smilesSx}>{candidate.smiles}</Typography>
                    </Box>
                    <Box sx={detailGridSx}>
                      <DetailMetric label="Mol. Weight" value={candidate.molecular_weight} />
                      <DetailMetric label="H-Bond Donors" value={candidate.hbd} />
                      <DetailMetric label="H-Bond Acceptors" value={candidate.hba} />
                    </Box>
                    <Box>
                      <Typography sx={detailLabelSx}>Ranking Rationale</Typography>
                      <Typography sx={detailValueSx}>{candidate.rank_reason || 'Balanced descriptor profile.'}</Typography>
                    </Box>
                  </Stack>
                </Box>
                <Box sx={detailsColSx}>
                  <Box>
                    <Typography sx={detailLabelSx}>Generation Trace</Typography>
                    <Box component="ul" sx={traceListSx}>
                      {[...(candidate.mutation_trace || []), ...(candidate.generation_trace || [])].map((trace, i) => (
                        <Box component="li" key={i}>{trace}</Box>
                      ))}
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

const detailsInnerSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
  gap: 3,
} as const;

const detailsColSx = {
  minWidth: 0,
} as const;

function DetailMetric({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <Box>
      <Typography sx={detailLabelSx}>{label}</Typography>
      <Typography sx={detailValueSx}>{typeof value === 'number' ? value.toFixed(2) : 'n/a'}</Typography>
    </Box>
  );
}

function formatNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : 'n/a';
}

const containerSx = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
} as const;

const toolbarSx = {
  p: 1.2,
  bgcolor: '#ffffff',
  border: '1px solid rgba(20, 32, 51, 0.08)',
  borderBottom: 'none',
  borderRadius: '0.75rem 0.75rem 0 0',
  '& > .MuiStack-root': {
    flexWrap: 'wrap',
    rowGap: 1,
  },
} as const;

const controlGroupSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  minWidth: 0,
} as const;

const sortStackSx = {
  flexWrap: 'wrap',
  rowGap: 0.5,
} as const;

const controlLabelSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.66rem',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
} as const;

const selectSx = {
  fontSize: '0.74rem',
  fontWeight: 800,
  height: 28,
  minWidth: 100,
  '& .MuiSelect-select': { py: 0, px: 1 },
} as const;

const sortButtonSx = (active: boolean) => ({
  height: 28,
  px: 1,
  borderRadius: 0.4,
  bgcolor: active ? '#eef4ff' : '#fafbfc',
  color: active ? 'var(--molvis-accent)' : 'var(--molvis-muted)',
  fontSize: '0.7rem',
  fontWeight: 900,
  textTransform: 'none',
  border: active ? '1px solid rgba(49, 93, 255, 0.2)' : '1px solid rgba(20, 32, 51, 0.05)',
  transition: 'all 0.2s ease',
  '&:hover': { bgcolor: active ? '#e5edff' : '#f1f5f9', borderColor: 'rgba(49, 93, 255, 0.15)' },
});

const tableWrapSx = {
  minHeight: 0,
  overflow: 'auto',
  border: '1px solid rgba(20, 32, 51, 0.08)',
  borderRadius: '0 0 0.75rem 0.75rem',
  '& .MuiTableCell-root': {
    borderBottom: '1px solid rgba(20, 32, 51, 0.08)',
  },
} as const;

const headCellSx = {
  bgcolor: '#f1f5f9',
  color: 'var(--molvis-muted)',
  fontSize: '0.62rem',
  fontWeight: 900,
  textTransform: 'uppercase',
  py: 1,
} as const;

const rowSx = (open: boolean, selected?: boolean) => ({
  cursor: 'pointer',
  bgcolor: selected ? '#eef4ff' : open ? '#f8faff' : 'transparent',
  transition: 'background-color 0.15s, border-color 0.15s',
  '&:hover': { bgcolor: selected || open ? '#e8f0ff' : '#fafbfc', borderColor: 'rgba(49, 93, 255, 0.2)' },
  '& .MuiTableCell-root': {
    borderBottom: '1px solid rgba(20, 32, 51, 0.08)',
  }
});

const toggleCellSx = {
  width: 40,
  p: 0,
  textAlign: 'center',
} as const;

const bodyCellSx = {
  color: 'var(--molvis-text)',
  fontSize: '0.8rem',
  fontWeight: 750,
  padding: '12px 8px !important',
} as const;

const rankCellSx = {
  ...bodyCellSx,
  width: 50,
  fontWeight: 900,
  color: 'var(--molvis-muted)',
} as const;

const previewCellSx = {
  width: 100,
  p: 0.75,
  textAlign: 'center',
} as const;

const svgSx = {
  width: 80,
  height: 56,
  bgcolor: '#ffffff',
  borderRadius: 0.4,
  border: '1px solid rgba(20, 32, 51, 0.08)',
  overflow: 'hidden',
  margin: '0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '& svg': { width: '90%', height: '90%', maxWidth: '100%', maxHeight: '100%', display: 'block' },
} as const;

const actionCellSx = {
  width: 240,
  minWidth: 240,
} as const;

const linkButtonSx = {
  minWidth: 0,
  px: 0.8,
  py: 0.4,
  color: 'var(--molvis-accent)',
  fontSize: '0.72rem',
  fontWeight: 900,
  textTransform: 'none',
  transition: 'all 0.2s ease',
  '&:hover': { textDecoration: 'underline', bgcolor: '#f0f4ff', color: 'var(--molvis-accent-strong)' },
} as const;

const detailsBoxSx = {
  p: 2,
  pb: 2.5,
  borderTop: '1px solid rgba(20, 32, 51, 0.08)',
  bgcolor: '#fafbfc',
} as const;

const detailLabelSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.66rem',
  fontWeight: 900,
  textTransform: 'uppercase',
  mb: 0.5,
  letterSpacing: '0.03em',
} as const;

const detailValueSx = {
  color: 'var(--molvis-text)',
  fontSize: '0.82rem',
  fontWeight: 700,
  lineHeight: 1.5,
} as const;

const smilesSx = {
  color: 'var(--molvis-accent)',
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: '0.78rem',
  fontWeight: 700,
  bgcolor: '#f2f6ff',
  p: 0.8,
  borderRadius: 0.4,
  wordBreak: 'break-all',
  border: '1px solid rgba(49, 93, 255, 0.12)',
  lineHeight: 1.6,
} as const;

const detailGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
  gap: 1.5,
  my: 1.2,
  p: 1,
  bgcolor: '#ffffff',
  borderRadius: 0.5,
  border: '1px solid rgba(20, 32, 51, 0.05)',
} as const;

const traceListSx = {
  m: 0,
  p: 0,
  listStyle: 'none',
  '& li': {
    color: 'var(--molvis-text)',
    fontSize: '0.7rem',
    fontWeight: 680,
    mb: 0.4,
    pb: 0.4,
    borderBottom: '1px solid rgba(20, 32, 51, 0.04)',
    '&:last-child': { borderBottom: 'none' },
    '&::before': {
      content: '"•"',
      color: 'var(--molvis-accent)',
      fontWeight: 900,
      display: 'inline-block',
      width: '1em',
      marginLeft: '0.2em',
    }
  },
} as const;

const emptySx = {
  p: 3,
  textAlign: 'center',
  color: 'var(--molvis-muted)',
  fontSize: '0.85rem',
  fontWeight: 700,
} as const;
