import { useMemo, useState } from 'react';
import { sanitizeSvg } from '@/lib/sanitize';
import { Box, Button, Collapse, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded';
import PlaylistAddCheckRoundedIcon from '@mui/icons-material/PlaylistAddCheckRounded';
import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import CompareArrowsRoundedIcon from '@mui/icons-material/CompareArrowsRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';

import type { ArtifactRendererProps } from '@/features/artifacts/artifactRendererRegistry';
import { CandidateDetailsModal } from './CandidateDetailsModal';
import { GeneratedMoleculeCard } from './GeneratedMoleculeCard';
import { GeneratedMoleculeTable, type GeneratedCandidate } from './GeneratedMoleculeTable';

export function GenerationArtifact({ artifact, onCommand }: ArtifactRendererProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedSmiles, setSelectedSmiles] = useState<string>('');
  const [detailsCandidate, setDetailsCandidate] = useState<GeneratedCandidate | null>(null);
  const data = artifact.data || {};
  const engine = String(data.engine || 'generation');
  const engineLabel = typeof data.engine_label === 'string' ? data.engine_label : displayEngine(engine);
  const seedSmiles = typeof data.seed_smiles === 'string' ? data.seed_smiles : '';
  const summary = normalizeSummary(data.summary);
  const candidates = useMemo(
    () => (Array.isArray(data.candidates) ? data.candidates as GeneratedCandidate[] : []),
    [data.candidates],
  );
  const history = useMemo(
    () => (Array.isArray(data.generation_history) ? data.generation_history as GenerationHistoryRow[] : []),
    [data.generation_history],
  );
  const limitations = useMemo(
    () => (Array.isArray(data.limitations) ? data.limitations.map(String) : []),
    [data.limitations],
  );
  const engineMetadata = useMemo(
    () => (data.engine_metadata || {}) as Record<string, any>,
    [data.engine_metadata],
  );
  const objective = useMemo(
    () => (data.objective || {}) as Record<string, any>,
    [data.objective],
  );
  
  const selectedCandidate = useMemo(() => {
    if (!candidates.length) return undefined;
    return candidates.find((candidate) => candidate.smiles === selectedSmiles) || candidates[0];
  }, [candidates, selectedSmiles]);
  const bestCandidate = candidates[0];
  const topCandidates = candidates.slice(1, 5);
  const comparisonCandidate = selectedCandidate || bestCandidate;
  const objectiveLabel = objective.target_property
    ? `${String(objective.target_property)} ${objective.direction ? String(objective.direction) : 'optimization'}`
    : 'Descriptor optimization';

  const handleSelectCandidate = (candidate: GeneratedCandidate) => {
    setSelectedSmiles(candidate.smiles);
  };

  return (
    <Box sx={shellSx}>
      <Box sx={headerSx}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={titleSx}>{artifact.title}</Typography>
          <Typography sx={metaSx}>
            {seedSmiles ? `Seed: ${seedSmiles}` : 'Diverse descriptor-guided exploration'}
            {objective.target_property ? ` · Goal: ${objective.target_property} (${objective.direction})` : ''}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            onClick={() => onCommand?.('Focus result')}
            startIcon={<FullscreenRoundedIcon />}
            sx={focusButtonSx}
          >
            Focus Result
          </Button>
          <Box component="span" sx={badgeSx}>{engineLabel}</Box>
        </Stack>
      </Box>

      <Box sx={scrollContainerSx}>
        <Stack spacing={2} sx={bodySx}>
          <Box sx={summaryGridSx}>
            <SummaryItem label="Requested" value={summary.requested} />
            <SummaryItem label="Valid" value={summary.valid} />
            <SummaryItem label="Unique" value={summary.unique} />
            <SummaryItem label="Objective" value={objectiveLabel} />
            {candidates.length > 0 && <SummaryItem label="Best Score" value={candidates[0].score?.toFixed(3)} highlight />}
          </Box>

          {comparisonCandidate ? (
            <Box sx={workbenchSx}>
              <Box sx={previewPaneSx}>
                <Box sx={paneHeaderSx}>
                  <Box>
                    <Typography sx={sectionTitleSx}>{comparisonCandidate === bestCandidate ? 'Best Candidate' : `Candidate ${comparisonCandidate.rank ?? ''}`}</Typography>
                    <Typography sx={paneSubtleSx}>Rank {comparisonCandidate.rank ?? '-'} · Score {formatMetric(comparisonCandidate.score)}</Typography>
                  </Box>
                  <Tooltip title="Copy SMILES">
                    <IconButton
                      size="small"
                      onClick={() => void navigator.clipboard?.writeText(comparisonCandidate.smiles)}
                      sx={iconButtonSx}
                      aria-label="Copy selected SMILES"
                    >
                      <ContentCopyRoundedIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Box sx={heroSvgContainerSx}>
                  {comparisonCandidate.svg ? (
                    <Box sx={heroSvgSx} dangerouslySetInnerHTML={{ __html: sanitizeSvg(comparisonCandidate.svg) }} />
                  ) : (
                    <Typography sx={mutedTextSx}>SVG Unavailable</Typography>
                  )}
                </Box>
              </Box>

              <Stack spacing={1.35} sx={controlPaneSx}>
                <Box sx={heroMetricsGridSx}>
                  <Metric label="Score" value={comparisonCandidate.score} />
                  <Metric label="LogP" value={comparisonCandidate.logP} />
                  <Metric label="TPSA" value={comparisonCandidate.tpsa} />
                  <Metric label="QED" value={comparisonCandidate.qed} />
                  <Metric label="Similarity" value={comparisonCandidate.similarity_to_seed} />
                </Box>

                <Box sx={readOnlySmilesBoxSx}>
                  <Typography sx={readOnlySmilesLabelSx}>SMILES preview</Typography>
                  <Typography sx={readOnlySmilesSx}>{comparisonCandidate.smiles}</Typography>
                </Box>

                {comparisonCandidate.rank_reason && (
                  <Box sx={heroReasonSx}>
                    <Typography sx={heroReasonLabelSx}>Ranking Insight</Typography>
                    <Typography sx={heroReasonValueSx}>{comparisonCandidate.rank_reason}</Typography>
                  </Box>
                )}

                <Stack direction="row" spacing={1} sx={actionClusterSx}>
                  <Button
                    startIcon={<ScienceRoundedIcon />}
                    onClick={() => onCommand?.(`Load ${comparisonCandidate.smiles}`)}
                    sx={heroActionSx}
                  >
                    Open
                  </Button>
                  {seedSmiles && (
                    <Button
                      startIcon={<PlaylistAddCheckRoundedIcon />}
                      onClick={() => onCommand?.(`Compare ${seedSmiles} with ${comparisonCandidate.smiles}`)}
                      sx={heroActionSx}
                    >
                      Compare with seed
                    </Button>
                  )}
                  <Button
                    startIcon={<TuneRoundedIcon />}
                    onClick={() => onCommand?.(`Optimize analogs of ${comparisonCandidate.smiles} for lower LogP using ${engineLabel}`)}
                    sx={heroRefineSx}
                  >
                    Refine
                  </Button>
                  <Button onClick={() => setDetailsCandidate(comparisonCandidate)} sx={heroActionSx}>
                    Details
                  </Button>
                </Stack>
              </Stack>
            </Box>
          ) : null}

          {topCandidates.length > 0 && (
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                <Typography sx={sectionTitleSx}>Runner-Ups</Typography>
                <Button
                  size="small"
                  startIcon={<CompareArrowsRoundedIcon />}
                  onClick={() => onCommand?.(`compare top generated candidates`)}
                  sx={secondaryActionSx}
                >
                  Compare top candidates
                </Button>
              </Stack>
              <Box sx={cardGridSx}>
                {topCandidates.map((candidate) => (
                  <GeneratedMoleculeCard
                    key={`${candidate.rank}-${candidate.smiles}`}
                    candidate={candidate}
                    onCommand={onCommand}
                    onSelect={handleSelectCandidate}
                    onDetails={setDetailsCandidate}
                    selected={comparisonCandidate?.smiles === candidate.smiles}
                  />
                ))}
              </Box>
            </Box>
          )}

          <Box>
            <Typography sx={sectionTitleSx}>Candidate Comparison</Typography>
            <GeneratedMoleculeTable
              candidates={candidates}
              onCommand={onCommand}
              seedSmiles={seedSmiles}
              selectedSmiles={comparisonCandidate?.smiles}
              onSelectCandidate={handleSelectCandidate}
            />
          </Box>

          <Box sx={advancedSectionSx}>
            <Button
              fullWidth
              onClick={() => setAdvancedOpen(!advancedOpen)}
              endIcon={<ExpandMoreRoundedIcon sx={{ transform: advancedOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />}
              sx={advancedToggleSx}
            >
              Advanced engine details
            </Button>
            <Collapse in={advancedOpen} unmountOnExit>
              <Stack spacing={1.5} sx={{ p: 1, pt: 0.5 }}>
                {engineMetadata.algorithm ? (
                  <Box>
                    <Typography sx={advancedTitleSx}>Method / algorithm</Typography>
                    <Typography sx={advancedTextSx}>{String(engineMetadata.algorithm)}</Typography>
                  </Box>
                ) : null}

                {engineMetadata.operator_stats && (
                  <Box>
                    <Typography sx={advancedTitleSx}>Operator performance</Typography>
                    <Box sx={statsGridSx}>
                      {Object.entries(engineMetadata.operator_stats).map(([label, value]) => (
                        <Box key={label} sx={statItemSx}>
                          <Typography sx={summaryLabelSx}>{label.replace(/_/g, ' ')}</Typography>
                          <Typography sx={statValueSx}>{String(value)}</Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                {history.length ? (
                  <Box>
                    <Typography sx={advancedTitleSx}>Generation progress</Typography>
                    <GenerationHistoryTable history={history} />
                  </Box>
                ) : null}

                <Box>
                  <Typography sx={advancedTitleSx}>Trace explanation</Typography>
                  <Typography sx={advancedTextSx}>
                    Candidate traces show the graph mutation or grammar production steps that produced each structure. Full candidate traces live in Details.
                  </Typography>
                </Box>

                {limitations.length ? (
                  <Box>
                    <Typography sx={advancedTitleSx}>Engine limitations</Typography>
                    <Box component="ul" sx={advancedListSx}>
                      {limitations.map((limitation) => (
                        <Box component="li" key={limitation}>{limitation}</Box>
                      ))}
                    </Box>
                  </Box>
                ) : null}
              </Stack>
            </Collapse>
          </Box>

          <Box sx={warningSx}>
            <Typography sx={warningTitleSx}>Scientific Honesty & Limitations</Typography>
            <Typography sx={warningTextSx}>
              These structures are generated candidates based on descriptor-driven optimization. They do not constitute validated drug leads.
            </Typography>
            {(artifact.warnings?.length ? artifact.warnings : ['Expert review of chemistry is mandatory.']).map((warning) => (
              <Typography key={warning} sx={warningTextSx}>• {warning}</Typography>
            ))}
          </Box>

          <Box sx={actionRowSx}>
            {candidates.length > 0 && (
              <Button startIcon={<FileDownloadRoundedIcon />} onClick={() => exportCandidates(candidates)} sx={secondaryActionSx}>
                Export CSV
              </Button>
            )}
            <Button 
              startIcon={<DescriptionRoundedIcon />}
              onClick={() => onCommand?.('export this session as a report')} 
              sx={secondaryActionSx}
            >
              Generate Report
            </Button>
          </Box>
        </Stack>
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

function SummaryItem({ label, value, highlight }: { label: string; value: unknown; highlight?: boolean }) {
  return (
    <Box sx={summaryItemSx}>
      <Typography sx={summaryLabelSx}>{label}</Typography>
      <Typography sx={{ ...summaryValueSx, color: highlight ? 'var(--molvis-accent)' : 'var(--molvis-text)' }}>
        {String(value ?? '0')}
      </Typography>
    </Box>
  );
}

type GenerationHistoryRow = {
  best_score?: number;
  average_score?: number;
  candidate_count?: number;
  generation?: number;
  generation_best_score?: number;
};

function GenerationHistoryTable({ history }: { history: GenerationHistoryRow[] }) {
  return (
    <Box sx={historyWrapSx}>
      <Box sx={historyGridSx}>
        {history.map((row) => (
          <Box key={row.generation} sx={historyItemSx}>
            <Typography sx={historyGenSx}>Gen {row.generation}</Typography>
            <Typography sx={historyBestSx}>Best {formatHistoryValue(row.best_score)}</Typography>
            <Typography sx={historyMetaSx}>Avg {formatHistoryValue(row.average_score)}</Typography>
            <Typography sx={historyMetaSx}>{row.candidate_count ?? 0} mols</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function formatHistoryValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : 'n/a';
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <Box>
      <Typography sx={metricLabelSx}>{label}</Typography>
      <Typography sx={metricValueSx}>{typeof value === 'number' ? value.toFixed(3) : 'n/a'}</Typography>
    </Box>
  );
}

function formatMetric(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : 'n/a';
}

function normalizeSummary(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { requested: 0, valid: 0, unique: 0 };
  }
  const summary = value as Record<string, unknown>;
  return {
    requested: summary.requested || 0,
    valid: summary.valid || 0,
    unique: summary.unique || 0,
  };
}

function displayEngine(engine: string) {
  if (engine === 'molvis_graph') return 'MolVis Graph';
  if (engine === 'molvis_grammar') return 'MolVis Grammar';
  if (engine === 'molvis_chem_ge') return 'ChemGE (Coupled)';
  return 'MolVis Generation';
}

function exportCandidates(candidates: GeneratedCandidate[]) {
  const headers = ['rank', 'smiles', 'score', 'logP', 'tpsa', 'molecular_weight', 'qed', 'similarity_to_seed'];
  const rows = candidates.map((candidate) => headers.map((header) => csvCell(candidate[header as keyof GeneratedCandidate])).join(','));
  const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `molvis-generation-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

const shellSx = {
  height: '100%',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  bgcolor: '#ffffff',
  overflow: 'hidden',
} as const;

const scrollContainerSx = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  p: { xs: 1.1, md: 1.35 },
  pb: { xs: 19, md: 21 },
  scrollPaddingBottom: { xs: 180, md: 220 },
} as const;

const headerSx = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  p: { xs: 1, md: 1.15 },
  borderBottom: '1px solid rgba(20, 32, 51, 0.08)',
} as const;

const titleSx = {
  color: 'var(--molvis-text)',
  fontSize: '1.1rem',
  fontWeight: 900,
} as const;

const metaSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.74rem',
  fontWeight: 780,
} as const;

const badgeSx = {
  px: 1,
  py: 0.4,
  borderRadius: 0.6,
  bgcolor: '#eef4ff',
  color: 'var(--molvis-accent)',
  fontSize: '0.7rem',
  fontWeight: 900,
} as const;

const focusButtonSx = {
  minWidth: 0,
  height: 32,
  px: 1,
  borderRadius: 0.5,
  color: 'var(--molvis-muted)',
  fontSize: '0.7rem',
  fontWeight: 850,
  textTransform: 'none',
  '&:hover': { color: 'var(--molvis-accent)', bgcolor: '#f5f8ff' },
} as const;

const bodySx = {
  minWidth: 0,
  pb: 1,
} as const;

const summaryGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', lg: 'repeat(5, 1fr)' },
  gap: 1,
} as const;

const summaryItemSx = {
  p: 1,
  border: '1px solid rgba(20, 32, 51, 0.08)',
  borderRadius: 0.75,
  bgcolor: '#fbfcfe',
  transition: 'all 0.2s ease',
  '&:hover': { borderColor: 'rgba(49, 93, 255, 0.2)', boxShadow: '0 2px 8px rgba(49, 93, 255, 0.05)' },
} as const;

const summaryLabelSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.62rem',
  fontWeight: 850,
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
} as const;

const summaryValueSx = {
  color: 'var(--molvis-text)',
  fontSize: '1.1rem',
  fontWeight: 900,
  lineHeight: 1.2,
} as const;

const sectionTitleSx = {
  color: 'var(--molvis-text)',
  fontSize: '0.85rem',
  fontWeight: 880,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
} as const;

const workbenchSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', lg: '320px minmax(0, 1fr)' },
  gap: 1.1,
  p: 1,
  border: '1px solid rgba(49, 93, 255, 0.14)',
  borderRadius: 0.7,
  bgcolor: '#f9fbff',
} as const;

const previewPaneSx = {
  minWidth: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(220px, 1fr)',
  gap: 1,
} as const;

const controlPaneSx = {
  minWidth: 0,
} as const;

const paneHeaderSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 1,
} as const;

const paneSubtleSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.72rem',
  fontWeight: 760,
} as const;

const iconButtonSx = {
  color: 'var(--molvis-muted)',
  border: '1px solid rgba(20, 32, 51, 0.08)',
  borderRadius: 0.6,
  bgcolor: '#ffffff',
  '&:hover': { color: 'var(--molvis-accent)', bgcolor: '#eef4ff' },
} as const;

const heroSvgContainerSx = {
  minHeight: 260,
  display: 'grid',
  placeItems: 'center',
  bgcolor: '#ffffff',
  borderRadius: 0.75,
  border: '2px solid rgba(49, 93, 255, 0.08)',
  overflow: 'hidden',
  position: 'relative',
} as const;

const heroSvgSx = {
  width: '100%',
  height: '100%',
  p: 1.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '& svg': { width: '90%', height: '90%', maxWidth: '100%', maxHeight: '100%', display: 'block' },
} as const;

const heroMetricsGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' },
  gap: 1,
  p: 1,
  bgcolor: '#ffffff',
  borderRadius: 0.75,
  border: '1px solid rgba(20, 32, 51, 0.06)',
} as const;

const metricLabelSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.65rem',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  mb: 0.4,
} as const;

const metricValueSx = {
  color: 'var(--molvis-text)',
  fontSize: '1.05rem',
  fontWeight: 900,
  lineHeight: 1.3,
} as const;

const heroReasonSx = {
  p: 1,
  borderRadius: 0.6,
  bgcolor: '#ffffff',
  border: '1px solid rgba(49, 93, 255, 0.16)',
} as const;

const heroReasonLabelSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.64rem',
  fontWeight: 850,
} as const;

const heroReasonValueSx = {
  color: 'var(--molvis-text)',
  fontSize: '0.82rem',
  fontWeight: 700,
  fontStyle: 'normal',
  lineHeight: 1.5,
} as const;

const readOnlySmilesBoxSx = {
  minWidth: 0,
  p: 1,
  borderRadius: 0.6,
  bgcolor: '#ffffff',
  border: '1px solid rgba(20, 32, 51, 0.08)',
} as const;

const readOnlySmilesLabelSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.64rem',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  mb: 0.45,
} as const;

const readOnlySmilesSx = {
  color: 'var(--molvis-accent)',
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: '0.78rem',
  fontWeight: 750,
  lineHeight: 1.5,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

const mutedTextSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.8rem',
  fontWeight: 600,
} as const;

const heroActionSx = {
  minHeight: 34,
  px: 1.2,
  borderRadius: 0.6,
  bgcolor: '#ffffff',
  border: '1px solid rgba(49, 93, 255, 0.2)',
  color: 'var(--molvis-accent)',
  fontSize: '0.74rem',
  fontWeight: 850,
  textTransform: 'none',
  '&:hover': { bgcolor: '#f0f4ff' },
} as const;

const heroRefineSx = {
  ...heroActionSx,
  bgcolor: '#8b5cf6',
  color: '#ffffff',
  border: 'none',
  fontWeight: 900,
  '&:hover': { bgcolor: '#7c3aed' },
} as const;

const cardGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, minmax(0, 1fr))' },
  gap: 1.2,
} as const;

const actionClusterSx = {
  flexWrap: 'wrap',
  rowGap: 1,
} as const;

const advancedSectionSx = {
  border: '1px solid rgba(20, 32, 51, 0.08)',
  borderRadius: 0.75,
  overflow: 'hidden',
} as const;

const advancedToggleSx = {
  justifyContent: 'space-between',
  p: 1.2,
  color: 'var(--molvis-muted)',
  fontSize: '0.78rem',
  fontWeight: 850,
  textTransform: 'none',
  '&:hover': { bgcolor: '#f8fafc' },
} as const;

const advancedTitleSx = {
  mb: 0.5,
  color: 'var(--molvis-muted)',
  fontSize: '0.64rem',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
} as const;

const advancedTextSx = {
  color: 'var(--molvis-text)',
  fontSize: '0.78rem',
  fontWeight: 680,
  lineHeight: 1.5,
} as const;

const advancedListSx = {
  m: 0,
  pl: 2,
  color: 'var(--molvis-text)',
  fontSize: '0.76rem',
  fontWeight: 680,
  lineHeight: 1.55,
} as const;

const statsGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
  gap: 0.6,
} as const;

const statItemSx = {
  p: 0.6,
  borderRadius: 0.5,
  bgcolor: '#f8fafc',
} as const;

const statValueSx = {
  color: 'var(--molvis-text)',
  fontSize: '0.88rem',
  fontWeight: 900,
} as const;

const historyWrapSx = {
  overflowX: 'auto',
  pb: 0.5,
} as const;

const historyGridSx = {
  display: 'flex',
  gap: 0.6,
} as const;

const historyItemSx = {
  minWidth: 100,
  p: 0.6,
  borderRadius: 0.5,
  border: '1px solid rgba(20, 32, 51, 0.05)',
  bgcolor: '#ffffff',
} as const;

const historyGenSx = {
  color: 'var(--molvis-accent)',
  fontSize: '0.6rem',
  fontWeight: 900,
  textTransform: 'uppercase',
} as const;

const historyBestSx = {
  color: 'var(--molvis-text)',
  fontSize: '0.8rem',
  fontWeight: 900,
} as const;

const historyMetaSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.62rem',
  fontWeight: 720,
} as const;

const warningSx = {
  mt: 1.5,
  p: 1.25,
  borderRadius: 0.75,
  bgcolor: '#fffbf0',
  border: '1.5px solid #ffc869',
} as const;

const warningTitleSx = {
  color: '#8b5707',
  fontSize: '0.7rem',
  fontWeight: 900,
  textTransform: 'uppercase',
  mb: 0.6,
  letterSpacing: '0.03em',
} as const;

const warningTextSx = {
  color: '#704d0a',
  fontSize: '0.74rem',
  fontWeight: 700,
  lineHeight: 1.6,
  mb: 0.4,
} as const;

const actionRowSx = {
  display: 'flex',
  gap: 1,
  pt: 1,
} as const;

const secondaryActionSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.72rem',
  fontWeight: 850,
  textTransform: 'none',
  '&:hover': { color: 'var(--molvis-accent)', textDecoration: 'underline' },
} as const;
