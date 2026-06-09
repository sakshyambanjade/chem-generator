import { useState } from 'react';
import { Box, Button, Typography, Stack, Checkbox } from '@mui/material';

import { sanitizeSvg } from '@/lib/sanitize';
import type { GeneratedCandidate } from './GeneratedMoleculeTable';

export function GeneratedMoleculeCard({
  candidate,
  onCommand,
  onDetails,
  onSelect,
  selected,
  onToggleSelect,
}: {
  candidate: GeneratedCandidate;
  onCommand?: (command: string) => void;
  onDetails?: (candidate: GeneratedCandidate) => void;
  onSelect?: (candidate: GeneratedCandidate) => void;
  selected?: boolean;
  onToggleSelect?: (candidate: GeneratedCandidate, checked: boolean) => void;
}) {
  const [showRoute, setShowRoute] = useState(false);
  const [routeData, setRouteData] = useState<any>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);

  return (
    <Box sx={cardSx(selected)} onClick={() => onSelect?.(candidate)} role="button" tabIndex={0}>
      <Box sx={headerSx}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Checkbox 
            size="small" 
            checked={selected} 
            onChange={(e) => onToggleSelect?.(candidate, e.target.checked)} 
            onClick={(e) => e.stopPropagation()} 
            sx={{ p: 0 }}
          />
          <Typography sx={rankSx}>Rank {candidate.rank ?? '-'}</Typography>
          <Box sx={synthBadgeSx(candidate.synthesizability || 'gray')} title="Synthesizability" />
        </Box>
        <Typography sx={scoreSx}>{candidate.score?.toFixed(3) || '0.000'}</Typography>
      </Box>

      <Box sx={svgContainerSx}>
        <Box sx={svgSx} dangerouslySetInnerHTML={{ __html: sanitizeSvg(candidate.svg || '') }} />
      </Box>

      <Box sx={bodySx}>
        <Box sx={metricsGridSx}>
          <Box>
            <Typography sx={metricLabelSx}>LogP</Typography>
            <Typography sx={metricValueSx}>{candidate.logP?.toFixed(2) || 'n/a'}</Typography>
          </Box>
          <Box>
            <Typography sx={metricLabelSx}>TPSA</Typography>
            <Typography sx={metricValueSx}>{candidate.tpsa?.toFixed(1) || 'n/a'}</Typography>
          </Box>
          <Box>
            <Typography sx={metricLabelSx}>QED</Typography>
            <Typography sx={metricValueSx}>{candidate.qed?.toFixed(2) || 'n/a'}</Typography>
          </Box>
        </Box>
      </Box>

      {candidate.warnings && candidate.warnings.some(w => w.startsWith("Diagnostics:")) && (
        <Typography 
          variant="caption" 
          sx={{ 
            color: '#b91c1c', 
            bgcolor: '#fef2f2', 
            p: 1, 
            borderRadius: 0.5, 
            fontSize: '0.68rem', 
            display: 'block', 
            mb: 1,
            border: '1px solid rgba(185, 28, 28, 0.12)',
            wordBreak: 'break-word'
          }}
        >
          <strong>Diagnostics:</strong> {candidate.warnings.find(w => w.startsWith("Diagnostics:"))?.replace("Diagnostics:", "").trim()}
        </Typography>
      )}

      {showRoute && routeData && (
        <Box sx={{ mb: 1, p: 1, bgcolor: '#f8fafc', borderRadius: 0.5, border: '1px solid rgba(0,0,0,0.05)' }} onClick={(e) => e.stopPropagation()}>
          <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', mb: 0.5 }}>Synthetic Route Preview:</Typography>
          <RouteTreeInlinePreview node={routeData} />
        </Box>
      )}

      <Stack direction="row" spacing={0.5} sx={actionRowSx}>
        <Button onClick={(event) => { event.stopPropagation(); onCommand?.(`Load ${candidate.smiles}`); }} sx={buttonSx}>Open</Button>
        <Button onClick={(event) => { event.stopPropagation(); onDetails?.(candidate); }} sx={buttonSx}>Details</Button>
        <Button 
          onClick={async (event) => { 
            event.stopPropagation(); 
            if (showRoute) {
              setShowRoute(false);
              return;
            }
            setLoadingRoute(true);
            try {
              const { moleculeService } = await import('@/services/moleculeService');
              const res = await moleculeService.getRetrosynthesis({ smiles: candidate.smiles });
              setRouteData(res.tree || res);
              setShowRoute(true);
            } catch (err) {
              console.error(err);
            } finally {
              setLoadingRoute(false);
            }
          }} 
          disabled={loadingRoute}
          sx={{ ...buttonSx, color: '#16a34a', borderColor: 'rgba(22, 163, 74, 0.3)' }}
        >
          {loadingRoute ? 'Loading...' : showRoute ? 'Hide Route' : 'Preview Route'}
        </Button>
      </Stack>
    </Box>
  );
}

function RouteTreeInlinePreview({ node }: { node: any }) {
  if (!node) return null;
  const isSM = node.is_starting_material;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <Box sx={{ pl: 1, borderLeft: '1px dashed rgba(0,0,0,0.1)', mt: 0.5 }}>
      <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.68rem', display: 'block', wordBreak: 'break-all' }}>
        {isSM ? '🟢' : '⚪'} {node.smiles ? node.smiles.substring(0, 18) + '...' : node.title} 
        {isSM && <span style={{ color: '#16a34a', fontWeight: 'bold' }}> (Inventory: {node.availability || 'available'})</span>}
      </Typography>
      {hasChildren && node.children.map((child: any, idx: number) => {
        const rxnChildren = child.children || [];
        return (
          <Box key={idx} sx={{ pl: 1, my: 0.1 }}>
            <Typography variant="caption" sx={{ color: 'var(--molvis-muted)', fontSize: '0.64rem', display: 'block' }}>
              ↳ ⚙️ {child.title || 'Reaction'}
            </Typography>
            {rxnChildren.map((p: any, pIdx: number) => (
              <RouteTreeInlinePreview key={pIdx} node={p} />
            ))}
          </Box>
        );
      })}
    </Box>
  );
}

const cardSx = (selected?: boolean) => ({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  p: 1.2,
  border: selected ? '1px solid rgba(49, 93, 255, 0.55)' : '1px solid rgba(20, 32, 51, 0.08)',
  borderRadius: 0.75,
  bgcolor: selected ? '#f5f8ff' : '#ffffff',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  '&:hover': {
    borderColor: 'rgba(49, 93, 255, 0.3)',
    boxShadow: '0 4px 16px rgba(49, 93, 255, 0.08)',
  }
});

const headerSx = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  mb: 0.8,
} as const;

const svgContainerSx = {
  height: 170,
  display: 'grid',
  placeItems: 'center',
  bgcolor: '#ffffff',
  borderRadius: 0.5,
  mb: 1,
  overflow: 'hidden',
  border: '1px solid rgba(20, 32, 51, 0.06)',
} as const;

const svgSx = {
  width: '100%',
  height: '100%',
  p: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '& svg': {
    width: '100%',
    height: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
    display: 'block',
    overflow: 'visible',
    transform: 'translateY(-8px) scale(0.82)',
    transformOrigin: 'center center',
  },
} as const;

const rankSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.6rem',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
} as const;

const scoreSx = {
  color: 'var(--molvis-accent)',
  fontSize: '0.78rem',
  fontWeight: 900,
} as const;

const bodySx = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 0.6,
  mb: 1,
} as const;

const metricsGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 0.5,
} as const;

const metricLabelSx = {
  color: 'var(--molvis-muted)',
  fontSize: '0.62rem',
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  mb: 0.3,
  display: 'block',
} as const;

const metricValueSx = {
  color: 'var(--molvis-text)',
  fontSize: '0.92rem',
  fontWeight: 900,
  lineHeight: 1.2,
} as const;

const actionRowSx = {
  mt: 'auto',
  pt: 0.8,
  borderTop: '1px solid rgba(20, 32, 51, 0.04)',
} as const;

const buttonSx = {
  flex: 1,
  minHeight: 32,
  color: 'var(--molvis-accent)',
  fontSize: '0.72rem',
  fontWeight: 900,
  textTransform: 'none',
  border: '1px solid rgba(49, 93, 255, 0.3)',
  bgcolor: '#ffffff',
  '&:hover': { bgcolor: '#f0f4ff', borderColor: 'rgba(49, 93, 255, 0.5)' },
} as const;



const synthBadgeSx = (color: 'green' | 'yellow' | 'red' | 'gray') => {
  const bgMap = {
    green: '#22c55e',
    yellow: '#eab308',
    red: '#ef4444',
    gray: '#94a3b8'
  };
  
  return {
    width: 10,
    height: 10,
    borderRadius: '50%',
    backgroundColor: bgMap[color],
    flexShrink: 0,
  };
};
