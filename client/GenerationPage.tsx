import { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Typography, Container, Stack, Button, Select, MenuItem } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { GenerationForm } from './GenerationForm';
import type { GenerationCondition, GenerationSettings } from './GenerationForm';
import { TaskProgress } from '@/components/shared/TaskProgress';
import { VirtualGrid } from '@/components/shared/VirtualGrid';
import { GeneratedMoleculeCard } from './GeneratedMoleculeCard';
import type { GeneratedCandidate } from './GeneratedMoleculeTable';
import DownloadIcon from '@mui/icons-material/Download';
import ScienceIcon from '@mui/icons-material/Science';
import { createGenerationJob } from './generationApi';
import { API_BASE_URL } from '@/services/api';
import { downloadBlob } from '@/services/moleculeService';
import { CandidateDetailsModal } from './CandidateDetailsModal';
import { useWorkspaceStore } from '@/store/workspace';
import { useMoleculeStore } from '@/store/molecule';

export function GenerationPage() {
  const navigate = useNavigate();
  const { setCurrentMolecule } = useWorkspaceStore();
  const { setSelectedMolecule } = useMoleculeStore();
  const [status, setStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [results, setResults] = useState<GeneratedCandidate[]>([]);
  const [chartData, setChartData] = useState<{ x: number; y: number }[]>([]);
  const [selectedSmiles, setSelectedSmiles] = useState<Set<string>>(new Set());
  const [filterSynth, setFilterSynth] = useState<'all' | 'green' | 'yellow' | 'red'>('all');
  const [sortBy, setSortBy] = useState<'none' | 'score' | 'synthesizability'>('none');
  const [detailedCandidate, setDetailedCandidate] = useState<GeneratedCandidate | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  async function handleStart(conditions: GenerationCondition[], settings: GenerationSettings) {
    setProgress(0);
    setChartData([]);
    setStatus('running');
    setResults([]);
    
    const primaryCondition = conditions[0];
    const objective = primaryCondition ? {
      direction: primaryCondition.objective,
      target_property: primaryCondition.property,
      target_value: primaryCondition.targetValue
    } : undefined;

    try {
      const response = await createGenerationJob({
        engine: settings.engine,
        count: settings.numToGenerate,
        objective: objective as any,
        seed: 'CC(=O)Oc1ccccc1C(=O)O', // Default seed molecule to satisfy graph generation engine requirements
        constraints: {
          maxMw: settings.maxMw,
          requiredSubstructure: settings.requiredSubstructure,
          forbiddenSubstructure: settings.forbiddenSubstructure,
          keepValidOnly: settings.keepValidOnly,
          autoDeduplicate: settings.autoDeduplicate,
          synthesizability_weight: settings.synthesizabilityWeight
        }
      });

      const newJobId = response.job.job_id;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const source = new EventSource(`${API_BASE_URL}/generation/jobs/${newJobId}/events`);
      eventSourceRef.current = source;

      source.addEventListener('progress', (e) => {
        const data = JSON.parse(e.data);
        setProgress(data.progress * 100);
        setStatusText(`Generating... ${Math.floor(data.progress * 100)}% (${data.candidates_count || 0} candidates)`);
        if (data.candidates_count) {
          setChartData(prev => [...prev, { x: prev.length, y: data.progress * 10 }]);
        }
      });

      source.addEventListener('result', (e) => {
        const data = JSON.parse(e.data);
        setResults(data.candidates);
        setStatus('done');
        source.close();
      });

      source.addEventListener('error', (e) => {
        console.error("SSE Error:", e);
        source.close();
        setStatus('idle');
      });

    } catch (err) {
      console.error(err);
      setStatus('idle');
    }
  };

  function handleCancel() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setStatus('idle');
  };

  function handleCommand(command: string) {
    if (command.startsWith('Retrosynthesis ')) {
      const smiles = command.replace('Retrosynthesis ', '');
      setSelectedMolecule(smiles, null);
      navigate('/retrosynthesis', { state: { targetSmiles: smiles } });
    } else if (command.startsWith('Load ')) {
      const smiles = command.replace('Load ', '');
      setCurrentMolecule({ smiles });
      setSelectedMolecule(smiles, null);
      navigate('/dashboard');
    }
  };

  function handleToggleSelect(candidate: GeneratedCandidate, checked: boolean) {
    setSelectedSmiles(prev => {
      const next = new Set(prev);
      if (checked) next.add(candidate.smiles);
      else next.delete(candidate.smiles);
      return next;
    });
  };

  function handleSelectAll() {
    if (selectedSmiles.size === results.length) {
      setSelectedSmiles(new Set());
    } else {
      setSelectedSmiles(new Set(results.map(r => r.smiles)));
    }
  };

  async function handleBatchRetrosynthesis() {
    setStatusText(`Running Batch Retrosynthesis on ${selectedSmiles.size} molecules...`);
    setProgress(0);
    setStatus('running');

    try {
        const promises = Array.from(selectedSmiles).map(async (smiles) => {
            try {
                // moleculeService is not imported yet in this file, we must import it. I'll just use createGenerationJob import logic. Wait, no. I'll import it above if not already done.
                // Ah, I already imported `downloadBlob` from `moleculeService` earlier, I'll need to use `moleculeService.getRetrosynthesis`.
                const { moleculeService } = await import('@/services/moleculeService');
                const response = await moleculeService.getRetrosynthesis({ smiles });
                
                // Color heuristic based on SA Score from backend (1=easy, 10=hard)
                let color: 'green' | 'yellow' | 'red' = 'yellow';
                if (response.sa_score < 3.0) {
                    color = 'green';
                } else if (response.sa_score > 6.0) {
                    color = 'red';
                }
                return { smiles, color };
            } catch (err) {
                return { smiles, color: 'red' as const };
            }
        });

        const completed = await Promise.all(promises);
        
        const colorMap = new Map();
        for (const res of completed) {
            colorMap.set(res.smiles, res.color);
        }

        setResults(prev => prev.map(cand => {
            if (colorMap.has(cand.smiles)) {
                return { ...cand, synthesizability: colorMap.get(cand.smiles) };
            }
            return cand;
        }));
        
        setSelectedSmiles(new Set());
        setStatus('done');
    } catch (err) {
        console.error(err);
        setStatus('idle');
    }
  };

  function handleExportCsv() {
    if (results.length === 0) return;
    
    const headers = ['SMILES', 'Rank', 'Score', 'LogP', 'TPSA', 'QED', 'Synthesizability'];
    const rows = results.map(r => [
      r.smiles,
      r.rank ?? '',
      r.score ?? '',
      r.logP ?? '',
      r.tpsa ?? '',
      r.qed ?? '',
      r.synthesizability ?? 'gray'
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob('generation_results.csv', blob);
  }

  const filteredAndSortedResults = useMemo(() => {
    let res = [...results];
    
    if (filterSynth !== 'all') {
      res = res.filter(r => r.synthesizability === filterSynth);
    }
    
    if (sortBy === 'score') {
      res.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else if (sortBy === 'synthesizability') {
      const order: Record<string, number> = { 'green': 1, 'yellow': 2, 'red': 3, 'gray': 4 };
      res.sort((a, b) => (order[a.synthesizability as string] || 4) - (order[b.synthesizability as string] || 4));
    }
    
    return res;
  }, [results, filterSynth, sortBy]);

  return (
    <Container maxWidth="xl" sx={{ py: 4, display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Molecule Generation
      </Typography>

      {status === 'idle' && (
        <GenerationForm onStartGeneration={handleStart} />
      )}

      {status === 'running' && (
        <TaskProgress 
          title="Generating Molecules..." 
          progress={progress} 
          statusText={statusText || 'Initializing...'}
          chartData={chartData}
          onCancel={handleCancel}
        />
      )}

      {status === 'done' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Results ({filteredAndSortedResults.length} candidates)</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button size="small" onClick={handleSelectAll}>
                {selectedSmiles.size === filteredAndSortedResults.length && filteredAndSortedResults.length > 0 ? 'Deselect All' : 'Select All'}
              </Button>
              <Button 
                startIcon={<ScienceIcon />} 
                variant="contained" 
                size="small" 
                color="primary"
                disabled={selectedSmiles.size === 0}
                onClick={handleBatchRetrosynthesis}
              >
                Batch Retrosynthesis ({selectedSmiles.size})
              </Button>
              <Select
                size="small"
                value={filterSynth}
                onChange={(e) => setFilterSynth(e.target.value as any)}
                displayEmpty
                sx={{ minWidth: 120, height: 32, fontSize: '0.875rem' }}
              >
                <MenuItem value="all">All Synthesizability</MenuItem>
                <MenuItem value="green">Green (Purchasable Route)</MenuItem>
                <MenuItem value="yellow">Yellow (Has Route)</MenuItem>
                <MenuItem value="red">Red (No Route)</MenuItem>
              </Select>
              <Select
                size="small"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                displayEmpty
                sx={{ minWidth: 120, height: 32, fontSize: '0.875rem' }}
              >
                <MenuItem value="none">Sort: None</MenuItem>
                <MenuItem value="score">Sort: Score</MenuItem>
                <MenuItem value="synthesizability">Sort: Synthesizability</MenuItem>
              </Select>
              <Button startIcon={<DownloadIcon />} variant="outlined" size="small" onClick={handleExportCsv}>Export CSV</Button>
              <Button variant="outlined" color="secondary" size="small" onClick={() => setStatus('idle')}>New Generation</Button>
            </Stack>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, bgcolor: '#fbfaf6', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 1 }}>
            <VirtualGrid
              data={filteredAndSortedResults}
              renderItem={(_index, item) => (
                <GeneratedMoleculeCard
                  key={item.smiles}
                  candidate={item}
                  selected={selectedSmiles.has(item.smiles)}
                  onToggleSelect={handleToggleSelect}
                  onCommand={handleCommand}
                  onDetails={(c) => setDetailedCandidate(c)}
                />
              )}
            />
          </Box>
        </Box>
      )}

      <CandidateDetailsModal
        open={detailedCandidate !== null}
        candidate={detailedCandidate}
        onClose={() => setDetailedCandidate(null)}
        onCommand={handleCommand}
      />
    </Container>
  );
}
