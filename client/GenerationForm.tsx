import { useState } from 'react';
import { Box, Button, IconButton, MenuItem, Paper, Select, Stack, TextField, Typography, Slider, Chip, LinearProgress, Tooltip } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
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
    <Paper sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h6" fontWeight="bold" gutterBottom>Generation Conditions</Typography>
      
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 3, mt: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', mr: 0.5 }}>
          Try a preset goal:
        </Typography>
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
            sx={{ cursor: 'pointer' }}
          />
        ))}
      </Stack>

      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>Desired Properties</Typography>
        <Stack spacing={2}>
          {conditions.map((cond) => (
            <Stack key={cond.id} direction="row" spacing={2} alignItems="center">
              <Select
                size="small"
                value={cond.property}
                onChange={(e) => handleConditionChange(cond.id, 'property', e.target.value)}
                sx={{ minWidth: 150 }}
              >
                {AVAILABLE_PROPERTIES.map(p => (
                  <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                ))}
              </Select>

              <Select
                size="small"
                value={cond.objective}
                onChange={(e) => handleConditionChange(cond.id, 'objective', e.target.value)}
                sx={{ minWidth: 120 }}
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
                  sx={{ width: 100 }}
                />
              )}

              <TextField
                size="small"
                type="number"
                label="Weight"
                value={cond.weight}
                onChange={(e) => handleConditionChange(cond.id, 'weight', parseFloat(e.target.value))}
                sx={{ width: 80 }}
              />

              <IconButton color="error" onClick={() => handleRemoveCondition(cond.id)}>
                <DeleteOutlineIcon />
              </IconButton>
            </Stack>
          ))}
          <Button startIcon={<AddIcon />} variant="text" onClick={handleAddCondition} sx={{ alignSelf: 'flex-start' }}>
            Add Property
          </Button>
        </Stack>
      </Box>

      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>Generation Settings</Typography>
        <Stack direction="row" spacing={3}>
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
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="molvis_graph">MolVis Graph</MenuItem>
            <MenuItem value="molvis_chem_ge">ChemGE (Coupled)</MenuItem>
          </Select>
          <Select
            size="small"
            value={settings.startSource}
            onChange={(e) => setSettings({ ...settings, startSource: e.target.value as any })}
          >
            <MenuItem value="random">Random Start</MenuItem>
            <MenuItem value="upload">Upload Molecule File</MenuItem>
            <MenuItem value="drawn">Use Drawn Molecule</MenuItem>
          </Select>
        </Stack>
      </Box>

      {settings.engine === 'molvis_chem_ge' && (
        <Box sx={{ mb: 4, p: 2, bgcolor: '#f5f8ff', borderRadius: 1, border: '1px solid rgba(49, 93, 255, 0.15)' }}>
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
      <Box sx={{ mb: 4, p: 2, bgcolor: '#fafafa', borderRadius: 1, border: '1px solid rgba(0, 0, 0, 0.06)' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5, display: 'flex', alignItems: 'center' }}>
          Custom Building Block Stock
          <Tooltip title="Upload your own catalog of purchasable building blocks. Routes and generation will be restricted to these compounds.">
            <HelpOutlineIcon sx={{ fontSize: 16, ml: 0.5, verticalAlign: 'middle', cursor: 'help' }} />
          </Tooltip>
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          Upload a custom CSV/text file containing starting materials (first column as SMILES) available in your lab.
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="outlined"
            component="label"
            startIcon={<CloudUploadIcon />}
            disabled={uploadStatus === 'uploading'}
            size="small"
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

      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>Advanced Constraints</Typography>
        <Stack spacing={2}>
          <Stack direction="row" spacing={3}>
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
          </Stack>
          <Stack direction="row" spacing={3}>
            <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}>
              <input 
                type="checkbox" 
                checked={settings.keepValidOnly} 
                onChange={(e) => setSettings({ ...settings, keepValidOnly: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              Keep valid molecules only
            </label>
            <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem' }}>
              <input 
                type="checkbox" 
                checked={settings.autoDeduplicate} 
                onChange={(e) => setSettings({ ...settings, autoDeduplicate: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              Auto-deduplicate
            </label>
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button 
          variant="contained" 
          color="primary" 
          size="large"
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
