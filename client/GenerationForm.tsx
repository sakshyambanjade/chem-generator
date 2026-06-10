import { useState } from 'react';
import { Box, Button, FormControlLabel, IconButton, MenuItem, Paper, Select, Stack, Switch, TextField, Typography, Slider, Chip, LinearProgress, Tooltip } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import api from '@/services/api';

export type PropertyObjective = 'maximize' | 'minimize' | 'target';

export interface GenerationCondition {
  id: string;
  property: string;
  objective: PropertyObjective;
  targetValue?: number;
  weight: number;
}

export interface GenerationSettings {
  engine: 'molvis_graph' | 'molvis_chem_ge';
  numToGenerate: number;
  iterations: number;
  mutationRate: number;
  synthesizabilityWeight: number;
  startSource: 'random' | 'upload' | 'drawn';
  maxMw: number;
  requiredSubstructure: string;
  forbiddenSubstructure: string;
  keepValidOnly: boolean;
  autoDeduplicate: boolean;
}

export interface GenerationFormProps {
  onStartGeneration: (conditions: GenerationCondition[], settings: GenerationSettings) => void;
}

const AVAILABLE_PROPERTIES = [
  { value: 'logP', label: 'LogP' },
  { value: 'tpsa', label: 'TPSA' },
  { value: 'qed', label: 'QED' },
  { value: 'mw', label: 'Molecular Weight' },
  { value: 'hbd', label: 'H-Bond Donors' },
  { value: 'hba', label: 'H-Bond Acceptors' },
];

const PRESETS = [
  {
    label: 'Optimize QED (Druglikeness)',
    conditions: [
      { id: '1', property: 'qed', objective: 'maximize' as PropertyObjective, weight: 1.0 }
    ],
    settings: {
      engine: 'molvis_graph' as const,
      numToGenerate: 25,
      iterations: 50,
      mutationRate: 0.2,
      synthesizabilityWeight: 0.5,
      startSource: 'random' as const,
      maxMw: 500,
      requiredSubstructure: '',
      forbiddenSubstructure: '',
      keepValidOnly: true,
      autoDeduplicate: true,
    }
  },
  {
    label: 'Minimize TPSA (CNS penetration)',
    conditions: [
      { id: '1', property: 'tpsa', objective: 'minimize' as PropertyObjective, weight: 1.0 }
    ],
    settings: {
      engine: 'molvis_graph' as const,
      numToGenerate: 25,
      iterations: 50,
      mutationRate: 0.2,
      synthesizabilityWeight: 0.5,
      startSource: 'random' as const,
      maxMw: 400,
      requiredSubstructure: '',
      forbiddenSubstructure: '',
      keepValidOnly: true,
      autoDeduplicate: true,
    }
  },
  {
    label: 'Target Molecular Weight (250 Da)',
    conditions: [
      { id: '1', property: 'mw', objective: 'target' as PropertyObjective, targetValue: 250, weight: 1.0 }
    ],
    settings: {
      engine: 'molvis_graph' as const,
      numToGenerate: 25,
      iterations: 50,
      mutationRate: 0.2,
      synthesizabilityWeight: 0.5,
      startSource: 'random' as const,
      maxMw: 350,
      requiredSubstructure: '',
      forbiddenSubstructure: '',
      keepValidOnly: true,
      autoDeduplicate: true,
    }
  }
];

export function GenerationForm({ onStartGeneration }: GenerationFormProps) {
  const [conditions, setConditions] = useState<GenerationCondition[]>([
    { id: '1', property: 'logP', objective: 'maximize', weight: 1.0 }
  ]);
  const [settings, setSettings] = useState<GenerationSettings>({
    engine: 'molvis_graph',
    numToGenerate: 25,
    iterations: 50,
    mutationRate: 0.2,
    synthesizabilityWeight: 0.5,
    startSource: 'random',
    maxMw: 500,
    requiredSubstructure: '',
    forbiddenSubstructure: '',
    keepValidOnly: true,
    autoDeduplicate: true,
  });
  const [stockLibraryFile, setStockLibraryFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleAddCondition = () => {
    setConditions([...conditions, {
      id: Date.now().toString(),
      property: 'qed',
      objective: 'maximize',
      weight: 1.0
    }]);
  };

  const handleRemoveCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  const handleConditionChange = (id: string, field: keyof GenerationCondition, value: any) => {
    setConditions(conditions.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  return (
    <Paper elevation={0} sx={formShellSx}>
      <Stack direction="row" spacing={1.4} alignItems="center" sx={{ mb: 2.5 }}>
        <Box sx={sectionIconSx}>
          <TuneRoundedIcon />
        </Box>
        <Box>
          <Typography variant="h5" sx={formTitleSx}>Generation Conditions</Typography>
          <Typography variant="body2" sx={{ color: 'var(--molvis-muted)' }}>Set objectives, engines, and molecular constraints.</Typography>
        </Box>
      </Stack>
      
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
        {PRESETS.map((preset) => (
          <Chip 
            key={preset.label} 
            label={preset.label} 
            onClick={() => {
              setConditions(preset.conditions);
              setSettings(prev => {
                const updatedSettings = {
                  ...prev,
                  ...preset.settings
                };
                // Start generation immediately with the selected preset
                onStartGeneration(preset.conditions, updatedSettings);
                return updatedSettings;
              });
            }}
            variant="outlined"
            size="small"
            color="primary"
            sx={presetChipSx}
          />
        ))}
      </Stack>

      <Box sx={sectionSx}>
        <Typography sx={sectionTitleSx}>Desired Properties</Typography>
        <Stack spacing={2}>
          {conditions.map((cond) => (
            <Box key={cond.id} sx={conditionRowSx}>
              <Select
                size="small"
                value={cond.property}
                onChange={(e) => handleConditionChange(cond.id, 'property', e.target.value)}
                sx={fieldSx}
              >
                {AVAILABLE_PROPERTIES.map(p => (
                  <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                ))}
              </Select>

              <Select
                size="small"
                value={cond.objective}
                onChange={(e) => handleConditionChange(cond.id, 'objective', e.target.value)}
                sx={fieldSx}
              >
                <MenuItem value="maximize">Maximize</MenuItem>
                <MenuItem value="minimize">Minimize</MenuItem>
                <MenuItem value="target">Target</MenuItem>
              </Select>

              {cond.objective === 'target' && (
                <TextField
                  size="small"
                  type="number"
                  placeholder="Target Value"
                  value={cond.targetValue || ''}
                  onChange={(e) => handleConditionChange(cond.id, 'targetValue', parseFloat(e.target.value))}
                  sx={fieldSx}
                />
              )}

              <TextField
                size="small"
                type="number"
                label="Weight"
                value={cond.weight}
                onChange={(e) => handleConditionChange(cond.id, 'weight', parseFloat(e.target.value))}
                sx={{ ...fieldSx, minWidth: 96 }}
              />

              <IconButton color="error" onClick={() => handleRemoveCondition(cond.id)} sx={{ justifySelf: { xs: 'end', sm: 'center' } }}>
                <DeleteOutlineIcon />
              </IconButton>
            </Box>
          ))}
          <Button startIcon={<AddIcon />} variant="outlined" onClick={handleAddCondition} sx={addButtonSx}>
            Add Property
          </Button>
        </Stack>
      </Box>

      <Box sx={sectionSx}>
        <Typography sx={sectionTitleSx}>Generation Settings</Typography>
        <Box sx={settingsGridSx}>
          <TextField
            size="small"
            type="number"
            label="Number to generate"
            value={settings.numToGenerate}
            onChange={(e) => setSettings({ ...settings, numToGenerate: parseInt(e.target.value) || 0 })}
          />
          <TextField
            size="small"
            type="number"
            label="Iterations"
            value={settings.iterations}
            onChange={(e) => setSettings({ ...settings, iterations: parseInt(e.target.value) || 0 })}
          />
          <TextField
            size="small"
            type="number"
            label="Mutation Rate"
            inputProps={{ step: 0.1, min: 0, max: 1 }}
            value={settings.mutationRate}
            onChange={(e) => setSettings({ ...settings, mutationRate: parseFloat(e.target.value) || 0 })}
          />
          <Select
            size="small"
            value={settings.engine}
            onChange={(e) => setSettings({ ...settings, engine: e.target.value as any })}
            sx={fieldSx}
          >
            <MenuItem value="molvis_graph">MolVis Graph</MenuItem>
            <MenuItem value="molvis_chem_ge">ChemGE (Coupled)</MenuItem>
          </Select>
          <Select
            size="small"
            value={settings.startSource}
            onChange={(e) => setSettings({ ...settings, startSource: e.target.value as any })}
            sx={fieldSx}
          >
            <MenuItem value="random">Random Start</MenuItem>
            <MenuItem value="upload">Upload Molecule File</MenuItem>
            <MenuItem value="drawn">Use Drawn Molecule</MenuItem>
          </Select>
        </Box>
      </Box>

      {settings.engine === 'molvis_chem_ge' && (
        <Box sx={highlightSectionSx}>
          <Typography variant="subtitle2" color="primary" fontWeight="bold" gutterBottom>
            Synthesizability Coupling Weight
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            Higher weight = more realistic, easier-to-make molecules. Lower weight = explores novel chemical space.
          </Typography>
          <Stack direction="row" spacing={3} alignItems="center">
            <Slider
              value={settings.synthesizabilityWeight}
              min={0.0}
              max={1.0}
              step={0.05}
              onChange={(_, val) => setSettings({ ...settings, synthesizabilityWeight: val as number })}
              valueLabelDisplay="auto"
              sx={{ flex: 1, maxWidth: 300 }}
            />
            <Typography variant="body2" fontWeight="bold" color="primary">
              {(settings.synthesizabilityWeight * 100).toFixed(0)}% Weight
            </Typography>
          </Stack>
        </Box>
      )}

      {/* Custom Building Block Stock Upload */}
      <Box sx={uploadSx}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5, display: 'flex', alignItems: 'center' }}>
          Custom Building Block Stock
          <Tooltip title="Upload your own catalog of purchasable building blocks. Routes and generation will be restricted to these compounds.">
            <HelpOutlineIcon sx={{ fontSize: 16, ml: 0.5, verticalAlign: 'middle', cursor: 'help' }} />
          </Tooltip>
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          Upload a custom CSV/text file containing starting materials (first column as SMILES) available in your lab.
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            component="label"
            startIcon={<CloudUploadIcon />}
            disabled={uploadStatus === 'uploading'}
            size="small"
            sx={uploadButtonSx}
          >
            {uploadStatus === 'uploading' ? 'Uploading...' : 'Upload CSV/SDF'}
            <input
              type="file"
              hidden
              accept=".csv,.sdf,.txt"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setStockLibraryFile(file);
                setUploadStatus('uploading');
                setUploadProgress(0);
                
                const formData = new FormData();
                formData.append('file', file);
                
                try {
                  await api.post('/stock/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    onUploadProgress: (progressEvent) => {
                      if (progressEvent.total) {
                        setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
                      }
                    }
                  });
                  setUploadStatus('success');
                  setTimeout(() => setUploadStatus('idle'), 3000);
                } catch (err) {
                  console.error('Upload failed:', err);
                  setUploadStatus('error');
                  setTimeout(() => setUploadStatus('idle'), 3000);
                }
              }}
            />
          </Button>
          {uploadStatus === 'uploading' && (
            <Box sx={{ flexGrow: 1, maxWidth: 200 }}>
              <LinearProgress variant="determinate" value={uploadProgress} />
              <Typography variant="caption">{uploadProgress}% uploaded...</Typography>
            </Box>
          )}
          {uploadStatus === 'success' && (
            <Chip label="Uploaded successfully" color="success" size="small" />
          )}
          {uploadStatus === 'error' && (
            <Chip label="Upload failed" color="error" size="small" />
          )}
          {stockLibraryFile && uploadStatus !== 'uploading' && (
            <Chip
              label={`Active: ${stockLibraryFile.name}`}
              color="primary"
              size="small"
              onDelete={() => setStockLibraryFile(null)}
            />
          )}
        </Box>
      </Box>

      <Box sx={sectionSx}>
        <Typography sx={sectionTitleSx}>Advanced Constraints</Typography>
        <Stack spacing={2}>
          <Box sx={constraintsGridSx}>
            <TextField
              size="small"
              type="number"
              label="Max Molecular Weight"
              value={settings.maxMw}
              onChange={(e) => setSettings({ ...settings, maxMw: parseInt(e.target.value) || 500 })}
            />
            <TextField
              size="small"
              label="Required Substructure (SMARTS)"
              placeholder="e.g. [cX3]1[cX3][cX3][cX3][cX3][cX3]1"
              value={settings.requiredSubstructure}
              onChange={(e) => setSettings({ ...settings, requiredSubstructure: e.target.value })}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label="Forbidden Substructure (SMARTS)"
              placeholder="e.g. [#6]=O"
              value={settings.forbiddenSubstructure}
              onChange={(e) => setSettings({ ...settings, forbiddenSubstructure: e.target.value })}
              sx={{ flex: 1 }}
            />
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2}>
            <FormControlLabel
              sx={switchLabelSx}
              control={
                <Switch
                  checked={settings.keepValidOnly}
                  onChange={(e) => setSettings({ ...settings, keepValidOnly: e.target.checked })}
                />
              }
              label="Keep valid molecules only"
            />
            <FormControlLabel
              sx={switchLabelSx}
              control={
                <Switch
                  checked={settings.autoDeduplicate}
                  onChange={(e) => setSettings({ ...settings, autoDeduplicate: e.target.checked })}
                />
              }
              label="Auto-deduplicate"
            />
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button 
          variant="contained" 
          color="primary" 
          size="large"
          startIcon={<PlayArrowRoundedIcon />}
          onClick={() => onStartGeneration(conditions, {
            ...settings,
            customStockId: stockLibraryFile ? 'custom' : undefined
          } as any)}
        >
          Start Generation
        </Button>
      </Box>
    </Paper>
  );
}

const formShellSx = {
  p: { xs: 2, md: 3 },
  width: '100%',
  maxWidth: 860,
  justifySelf: 'center',
  border: '1px solid var(--molvis-border-soft)',
  borderRadius: 2,
  bgcolor: 'rgba(255, 255, 255, 0.9)',
  boxShadow: 'var(--molvis-shadow)',
} as const;

const formTitleSx = {
  color: 'var(--molvis-text)',
  fontWeight: 950,
  lineHeight: 1.1,
} as const;

const sectionIconSx = {
  width: 44,
  height: 44,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 1.5,
  bgcolor: 'rgba(41, 88, 255, 0.1)',
  color: 'var(--molvis-accent)',
  flex: '0 0 auto',
} as const;

const presetChipSx = {
  cursor: 'pointer',
  height: 32,
  borderRadius: 1.2,
  bgcolor: '#fff',
  fontWeight: 800,
  '&:hover': { bgcolor: '#f4f7ff' },
} as const;

const sectionSx = {
  mb: 3,
  p: { xs: 1.5, md: 2 },
  border: '1px solid var(--molvis-border-soft)',
  borderRadius: 1.5,
  bgcolor: 'var(--molvis-surface-soft)',
} as const;

const sectionTitleSx = {
  color: 'var(--molvis-text)',
  fontSize: '0.78rem',
  fontWeight: 950,
  textTransform: 'uppercase',
  mb: 1.5,
} as const;

const conditionRowSx = {
  display: 'grid',
  gridTemplateColumns: {
    xs: '1fr',
    sm: 'minmax(140px, 1fr) minmax(130px, 0.8fr) minmax(90px, 0.45fr) auto',
  },
  gap: 1.2,
  alignItems: 'center',
} as const;

const settingsGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(5, minmax(0, 1fr))' },
  gap: 1.4,
} as const;

const constraintsGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: '0.7fr 1fr 1fr' },
  gap: 1.4,
} as const;

const fieldSx = {
  minWidth: 0,
  width: '100%',
  bgcolor: '#fff',
} as const;

const addButtonSx = {
  alignSelf: 'flex-start',
  textTransform: 'none',
  fontWeight: 850,
  borderRadius: 1.2,
  bgcolor: '#fff',
} as const;

const highlightSectionSx = {
  mb: 3,
  p: 2,
  bgcolor: '#f4f7ff',
  borderRadius: 1.5,
  border: '1px solid rgba(41, 88, 255, 0.16)',
} as const;

const uploadSx = {
  mb: 3,
  p: 2,
  bgcolor: '#fbfcfe',
  borderRadius: 1.5,
  border: '1px solid var(--molvis-border-soft)',
} as const;

const uploadButtonSx = {
  textTransform: 'none',
  fontWeight: 850,
  borderRadius: 1.2,
  bgcolor: '#fff',
} as const;

const switchLabelSx = {
  m: 0,
  px: 1.25,
  py: 0.75,
  border: '1px solid var(--molvis-border-soft)',
  borderRadius: 1.25,
  bgcolor: '#fff',
  '& .MuiFormControlLabel-label': {
    color: 'var(--molvis-text)',
    fontSize: '0.92rem',
    fontWeight: 750,
  },
} as const;
