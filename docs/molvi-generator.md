# Chem Generator Module

## 1. Module Overview

The Chem Generator module creates candidate molecule structures from configurable generation goals. It accepts generation settings such as engine, target property, candidate count, constraints, and optional seed structure, then produces ranked candidate molecules with SMILES strings, scores, descriptor values, 2D SVG previews, and synthesizability labels. The module is responsible for candidate generation and result inspection only; editing, 3D visualization, retrosynthesis planning, and docking are separate module concerns.

## 2. Interface Definition

### Feature Requirements Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| Configure generation objective | Supported | `GenerationForm` supports maximize, minimize, and target objectives. |
| Configure descriptor target | Supported | Built-in descriptors: LogP, TPSA, QED, molecular weight, HBD, HBA. |
| Configure engine | Supported | Standalone UI exposes graph and ChemGE-style modes. Backend includes additional adapters. |
| Configure candidate count | Supported | `numToGenerate` maps to request `count`. |
| Configure constraints | Supported | Max molecular weight, required SMARTS, forbidden SMARTS, validity filter, and dedupe toggle. |
| Upload custom stock file | UI only | Upload control exists; standalone shim marks upload as successful without processing chemistry. |
| Display ranked candidates | Supported | Candidate cards show rank, score, SVG, descriptors, and synthesizability. |
| Show candidate details | Supported | `CandidateDetailsModal` displays full SMILES, metrics, and traces. |
| Export results | Partial | CSV helper exists in page-level code; standalone app does not expose a full export workflow. |
| Send candidate to retrosynthesis | Partial | Card actions expose a command hook; cross-app routing must be wired by the host shell. |

### Standalone App

| Item | Value |
|------|-------|
| Root component | `src/App.tsx` |
| Browser entry | `src/main.tsx` |
| Local API shim | `src/services/api.ts` |
| Local molecule service shim | `src/services/moleculeService.ts` |
| Dev command | `npm run dev` |
| Default local URL | `http://127.0.0.1:5175` |
| Build command | `npm run build` |

The standalone app opens directly to the generator and uses demo candidate data so the UI can be exercised without a backend.

### React Components

| Export | File | Purpose |
|--------|------|---------|
| `GenerationForm` | `client/GenerationForm.tsx` | Collects objectives, engine settings, stock upload, and constraints. |
| `GeneratedMoleculeCard` | `client/GeneratedMoleculeCard.tsx` | Displays one ranked molecule candidate and action buttons. |
| `GeneratedMoleculeTable` | `client/GeneratedMoleculeTable.tsx` | Displays candidates in sortable table form. |
| `CandidateDetailsModal` | `client/CandidateDetailsModal.tsx` | Shows full SMILES, metrics, traces, and actions for one candidate. |
| `GenerationPage` | `client/GenerationPage.tsx` | Host-page implementation that expects shared app services. |
| `GenerationArtifact` | `client/GenerationArtifact.tsx` | Host artifact renderer for generated result sets. |
| `GenerationJobPanel` | `client/GenerationJobPanel.tsx` | Host artifact renderer for job progress. |

### `GenerationCondition`

```ts
export type PropertyObjective = 'maximize' | 'minimize' | 'target';

export interface GenerationCondition {
  id: string;
  property: string;
  objective: PropertyObjective;
  targetValue?: number;
  weight: number;
}
```

| Field | Meaning |
|-------|---------|
| `id` | Stable UI identifier for the condition row. |
| `property` | Descriptor to optimize, such as `logP`, `tpsa`, `qed`, `mw`, `hbd`, or `hba`. |
| `objective` | Optimization direction. |
| `targetValue` | Required only when `objective` is `target`. |
| `weight` | Relative importance of this condition. |

### `GenerationSettings`

```ts
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
```

| Field | Meaning |
|-------|---------|
| `engine` | Generation strategy selected by the user. |
| `numToGenerate` | Number of candidates requested. |
| `iterations` | Search iterations for iterative engines. |
| `mutationRate` | Mutation probability for graph-style engines. |
| `synthesizabilityWeight` | Weight applied to synthesizability in ChemGE-style scoring. |
| `startSource` | Whether generation starts from random, upload, or drawn molecule context. |
| `maxMw` | Maximum molecular weight filter. |
| `requiredSubstructure` | SMARTS pattern that candidates should contain. |
| `forbiddenSubstructure` | SMARTS pattern that candidates should avoid. |
| `keepValidOnly` | Whether invalid candidates should be filtered. |
| `autoDeduplicate` | Whether duplicate SMILES should be removed. |

### `GeneratedCandidate`

```ts
export type GeneratedCandidate = {
  smiles: string;
  rank?: number;
  score?: number;
  logP?: number;
  tpsa?: number;
  qed?: number | null;
  molecular_weight?: number;
  hbd?: number;
  hba?: number;
  similarity_to_seed?: number | null;
  svg?: string;
  synthesizability?: 'green' | 'yellow' | 'red' | 'gray';
  warnings?: string[];
  mutation_trace?: string[];
  generation_trace?: string[];
  sa_score?: number;
};
```

### Backend API Contract

When mounted in a host FastAPI server, the intended API base path is:

```text
/api/v1/generation
```

| Method | Path | Body | Output |
|--------|------|------|--------|
| `POST` | `/jobs` | `GenerationJobRequest` | Job metadata with `job.job_id`. |
| `GET` | `/jobs/{job_id}` | None | Current job status and candidates when available. |
| `GET` | `/jobs/{job_id}/events` | None | Server-sent progress events. |

Client helper functions in `client/generationApi.ts`:

| Function | Input | Output |
|----------|-------|--------|
| `createGenerationJob(payload, signal?)` | Generation request | Job creation response. |
| `getGenerationJob(jobId, signal?)` | Job ID | Job state response. |
| `waitForGenerationJob(jobId, timeoutMs?, signal?)` | Job ID and timeout | Completed or failed job response. |

## 3. Usage Example

### Run the standalone generator

```bash
npm install
npm run dev -- --port 5175
```

Open:

```text
http://127.0.0.1:5175
```

Expected result: the page displays `Chem Generator`, a generation conditions form, generation settings, advanced constraints, and a candidate section. Selecting a preset or pressing `Start Generation` produces demo ranked candidates with SVG previews.

### Embed the form and consume generated candidates

```tsx
import { useState } from 'react';
import { GenerationForm } from './client/GenerationForm';
import type { GenerationCondition, GenerationSettings } from './client/GenerationForm';
import type { GeneratedCandidate } from './client/GeneratedMoleculeTable';

export function GeneratorHost() {
  const [candidates, setCandidates] = useState<GeneratedCandidate[]>([]);

  function startGeneration(
    conditions: GenerationCondition[],
    settings: GenerationSettings,
  ) {
    console.log({ conditions, settings });
    setCandidates([
      {
        rank: 1,
        smiles: 'CC(=O)Oc1ccccc1C(=O)O',
        score: 0.91,
        logP: 1.19,
        tpsa: 63.6,
        qed: 0.55,
        synthesizability: 'green',
      },
    ]);
  }

  return <GenerationForm onStartGeneration={startGeneration} />;
}
```

Expected result: the form calls `startGeneration` with one or more `GenerationCondition` objects and a complete `GenerationSettings` object. The host can then call a backend, use a local engine, or display demo candidates.

## 4. How to Extend

### Add a new objective property

Touch `client/GenerationForm.tsx` and add the descriptor to `AVAILABLE_PROPERTIES`. If a backend is used, also add descriptor calculation and scoring support in the generation service before returning the property in `GeneratedCandidate`.

### Add a new generation engine

Touch `client/GenerationForm.tsx` to expose the new engine in the selector. If the engine runs server-side, add an adapter under `server/services/generation/`, register it in the generation runner, and keep the engine string literal identical between frontend and backend.

### Add a candidate action

Touch `client/GeneratedMoleculeCard.tsx` for card-level actions or `client/CandidateDetailsModal.tsx` for detailed actions. Use the existing `onCommand` callback for cross-module handoff so the card does not directly depend on another app.

### Replace demo generation with real generation

Touch `src/App.tsx` and replace the demo `startGeneration` implementation with calls to `client/generationApi.ts` or another service. Keep `GenerationForm` unchanged unless the UI contract itself changes.

### Add export support

Add export controls in `src/App.tsx` or a dedicated utility. Use the `GeneratedCandidate` shape as the export source so card, table, and export workflows stay consistent.

## 5. Known Limitations

- The standalone app uses demo candidate data; it does not run RDKit or model-based generation by itself.
- The standalone stock upload control does not parse uploaded chemistry files.
- Server adapters depend on a host FastAPI application when used outside the standalone UI.
- Additional backend engines may exist but are not all exposed in the standalone selector.
- Candidate uniqueness and chemical validity are only as strong as the generation service connected to the UI.
- Cross-app actions such as opening a candidate in retrosynthesis require a host shell or router to handle `onCommand`.
- CSV/SDF export is not exposed in the standalone app.
