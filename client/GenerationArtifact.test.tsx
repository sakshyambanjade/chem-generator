import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceArtifact } from '@/lib/commandTypes';
import { CandidateDetailsModal } from './CandidateDetailsModal';
import { GenerationArtifact } from './GenerationArtifact';
import { GeneratedMoleculeTable, type GeneratedCandidate } from './GeneratedMoleculeTable';

const artifact: WorkspaceArtifact = {
  id: 'artifact-generation',
  kind: 'generated_molecule_set',
  title: 'MolVis Graph descriptor-guided candidates',
  summary: 'Generated candidates.',
  source_tool: 'generate_molecules',
  data: {
    engine: 'molvis_graph',
    engine_label: 'MolVis Graph',
    seed_smiles: 'CCO',
    summary: { requested: 2, valid: 2, unique: 2, invalid: 0 },
    candidates: [
      {
        rank: 1,
        smiles: 'CCCO',
        score: 0.9,
        logP: 0.4,
        tpsa: 20.2,
        molecular_weight: 60.1,
        qed: 0.45,
        similarity_to_seed: 0.7,
        rank_reason: 'logP objective 0.91; diversity 0.40',
        mutation_trace: ['generation=1', 'operator=mutation'],
        generation_trace: ['head=C', 'core=c1ccccc1'],
        svg: '<svg aria-label="candidate"></svg>',
      },
    ],
    generation_history: [
      { generation: 1, best_score: 0.7, candidate_count: 4 },
      { generation: 2, best_score: 0.9, candidate_count: 5 },
    ],
    engine_metadata: {
      algorithm: 'GB_GA-inspired graph mutation',
      operator_stats: { mutations: 2 },
    },
    limitations: ['Descriptor-guided candidate generation only.'],
  },
  warnings: ['Expert review of chemistry is mandatory.'],
};

const candidate = (artifact.data as any).candidates[0] as GeneratedCandidate;

describe('CandidateDetailsModal', () => {
  it('renders full SMILES, metrics, mutation trace, and generation trace', () => {
    render(<CandidateDetailsModal open candidate={candidate} seedSmiles="CCO" onClose={vi.fn()} />);

    expect(screen.getByText('Candidate 1 Details')).toBeInTheDocument();
    expect(screen.getByText('CCCO')).toBeInTheDocument();
    expect(screen.getByText('0.900')).toBeInTheDocument();
    expect(screen.getByText('20.200')).toBeInTheDocument();
    expect(screen.getByText('operator=mutation')).toBeInTheDocument();
    expect(screen.getByText('head=C')).toBeInTheDocument();
  });

  it('sends modal action commands', () => {
    const onCommand = vi.fn();
    render(<CandidateDetailsModal open candidate={candidate} seedSmiles="CCO" onClose={vi.fn()} onCommand={onCommand} />);

    fireEvent.click(screen.getByRole('button', { name: /^Open$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Compare with seed/i }));
    fireEvent.click(screen.getByRole('button', { name: /Refine/i }));

    expect(onCommand).toHaveBeenCalledWith('Load CCCO');
    expect(onCommand).toHaveBeenCalledWith('Compare CCO with CCCO');
    expect(onCommand).toHaveBeenCalledWith('Optimize analogs of CCCO');
  });
});

describe('GenerationArtifact', () => {
  it('renders summary metrics and best candidate hero', () => {
    render(<GenerationArtifact artifact={artifact} />);

    expect(screen.getByText('MolVis Graph descriptor-guided candidates')).toBeInTheDocument();
    expect(screen.getByText('MolVis Graph')).toBeInTheDocument();
    expect(screen.getByText('Best Candidate')).toBeInTheDocument();
    expect(screen.getByText('CCCO')).toBeInTheDocument(); // Hero SMILES
    expect(screen.getByText('logP objective 0.91; diversity 0.40')).toBeInTheDocument();
    expect(screen.getByText(/Scientific Honesty & Limitations/i)).toBeInTheDocument();
  });

  it('does not render an editable SMILES textarea', () => {
    render(<GenerationArtifact artifact={artifact} />);

    expect(screen.queryByLabelText(/Editable SMILES/i)).not.toBeInTheDocument();
    expect(screen.getByText('SMILES preview')).toBeInTheDocument();
  });

  it('toggles advanced engine details', () => {
    render(<GenerationArtifact artifact={artifact} />);

    expect(screen.queryByText('Generation progress')).not.toBeInTheDocument();
    expect(screen.queryByText('GB_GA-inspired graph mutation')).not.toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Advanced engine details'));
    
    expect(screen.getByText('Generation progress')).toBeInTheDocument();
    expect(screen.getByText('Gen 2')).toBeInTheDocument();
    expect(screen.getByText('GB_GA-inspired graph mutation')).toBeInTheDocument();
  });

  it('sends open and compare commands from hero', () => {
    const onCommand = vi.fn();
    render(<GenerationArtifact artifact={artifact} onCommand={onCommand} />);

    fireEvent.click(screen.getAllByText('Open')[0]);
    fireEvent.click(screen.getByText('Compare with seed'));

    expect(onCommand).toHaveBeenCalledWith('Load CCCO');
    expect(onCommand).toHaveBeenCalledWith('Compare CCO with CCCO');
  });

  it('sends focus command', () => {
    const onCommand = vi.fn();
    render(<GenerationArtifact artifact={artifact} onCommand={onCommand} />);

    fireEvent.click(screen.getByText('Focus Result'));
    expect(onCommand).toHaveBeenCalledWith('Focus result');
  });
});

describe('GeneratedMoleculeTable', () => {
  it('renders compact columns and expandable rows', () => {
    render(<GeneratedMoleculeTable candidates={[candidate]} seedSmiles="CCO" />);

    expect(screen.getByText('Score')).toBeInTheDocument();
    expect(screen.getByText('LogP')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
    
    // SMILES and Trace are hidden by default in compact mode (only in expanded row)
    expect(screen.queryByText('operator=mutation')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('row', { name: /1/ })); // Click rank 1 row to expand
    
    expect(screen.getByText('operator=mutation')).toBeInTheDocument();
    expect(screen.getByText('Full SMILES')).toBeInTheDocument();
  });

  it('opens candidate details from the table', () => {
    render(<GeneratedMoleculeTable candidates={[candidate]} seedSmiles="CCO" />);

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));

    expect(screen.getByText('Candidate 1 Details')).toBeInTheDocument();
    expect(screen.getByText('head=C')).toBeInTheDocument();
  });

  it('handles sort changes', () => {
    render(<GeneratedMoleculeTable candidates={artifact.data?.candidates as any} />);
    
    fireEvent.click(screen.getByText('score'));
    // No crash, and button indicates active sort (visual check in live app, here just verify click works)
  });
});
