# Chem Generator

Chem Generator is a de novo molecule generation module for creating and reviewing candidate structures against configurable property objectives. It includes a standalone Vite app for frontend development, reusable React components for host integration, and a backend generation service layout intended for the broader MolVis FastAPI application.

The module is designed around this workflow:

1. Define one or more molecular property objectives.
2. Choose a generation engine and search settings.
3. Add optional constraints such as maximum molecular weight or SMARTS filters.
4. Start a generation job.
5. Review ranked candidates with descriptors, scores, SVG previews, and synthesizability labels.
6. Hand selected candidates to downstream modules such as retrosynthesis, editing, or docking through host callbacks.

## Current Capability

| Area | Status | Notes |
| --- | --- | --- |
| Standalone React app | Supported | Runs locally with Vite and demo candidate data. |
| Property objectives | Supported | Supports maximize, minimize, and target objectives. |
| Descriptor selection | Supported | Includes LogP, TPSA, QED, molecular weight, HBD, and HBA. |
| Engine selection | Supported | Standalone UI exposes graph and ChemGE-style engines. Backend models include more engines. |
| Candidate count | Supported | `numToGenerate` maps to backend `count`. |
| Search controls | Supported | Iterations, mutation rate, synthesizability weight, and start source. |
| Constraints | Supported | Max MW, required SMARTS, forbidden SMARTS, valid-only filtering, and dedupe toggles. |
| Stock upload | UI supported | Standalone upload flow simulates success; real parsing requires backend integration. |
| Candidate cards | Supported | Show rank, score, structure preview, descriptors, warnings, and actions. |
| Candidate details | Supported | Modal component can show deeper metrics and traces. |
| Async generation jobs | Backend supported | `/jobs`, `/jobs/{id}`, `/jobs/{id}/events`, and `/jobs/{id}/candidates`. |
| CSV/SDF export | Partial | Export helpers/components exist in host-oriented code, but standalone export is not complete. |
| Cross-module handoff | Host-dependent | Card actions use callbacks; routing is handled by the host shell. |

## Repository Layout

```text
chem-generator/
  client/
    CandidateDetailsModal.tsx       Detailed candidate inspection modal.
    GeneratedMoleculeCard.tsx       Ranked candidate card UI.
    GeneratedMoleculeTable.tsx      Candidate table and shared candidate types.
    GenerationArtifact.tsx          Host artifact renderer for result sets.
    GenerationArtifact.test.tsx     Artifact renderer tests.
    GenerationForm.tsx              Objective, engine, upload, and constraint form.
    GenerationJobPanel.tsx          Host job progress renderer.
    GenerationPage.tsx              Host page that calls generation APIs.
    GenerationSettingsPanel.tsx     Settings-oriented panel UI.
    generationApi.ts                Client helpers for backend job endpoints.

  src/
    App.tsx                         Standalone app shell with demo generation.
    main.tsx                        Vite browser entry and MUI theme setup.
    styles.css                      Shared standalone styling tokens.
    lib/sanitize.ts                 SVG sanitizer for molecule previews.
    services/api.ts                 Local API shim.
    services/moleculeService.ts     Local molecule service shim.

  server/
    models/generation.py            Pydantic request, job, and candidate models.
    routes/generation.py            FastAPI generation job routes.
    routes/rl_generation.py         Reinforcement-learning route integration.
    services/generation/            Engine adapters, scoring, filters, runner, and job store.

  docs/
    molvi-generator.md              Additional module contract and extension notes.

  scripts/
    run-tests.sh                    Host-monorepo test runner.
```

## Prerequisites

For frontend-only development:

- Node.js 20 or newer is recommended.
- npm, included with Node.js.

For backend or host integration:

- Python environment from the MolVis host project.
- FastAPI host app with the expected `app.*` package layout.
- RDKit or equivalent chemistry utilities used by the generation adapters.
- Optional model files or runtime dependencies for transformer, VAE, RL, or grammar engines.
- Optional Redis/Celery setup for queued generation jobs.

The standalone app does not require the backend. It uses local demo candidates so UI work can happen independently from model setup.

## Quick Start: Standalone UI

Install dependencies:

```bash
npm install
```

Start the local Vite server:

```bash
npm run dev
```

Open the URL printed by Vite, usually:

```text
http://127.0.0.1:5173/
```

If that port is already busy, Vite automatically selects another port.

Build the standalone app:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## What the Standalone App Does

The standalone app starts at `src/App.tsx`. It renders:

- A header with sample stats.
- `GenerationForm` for objectives, engine settings, stock upload, and constraints.
- A local simulated generation run.
- Ranked candidates rendered with `GeneratedMoleculeCard`.
- A clear action for local results.

Important: standalone generation is demo-only. `startGeneration()` in `src/App.tsx` uses a short timeout and a hard-coded candidate list. It does not run RDKit, model inference, graph search, or backend jobs.

This makes the app useful for UI development, component testing, and visual review without requiring the MolVis host backend.

## Frontend Architecture

### `GenerationForm`

File:

```text
client/GenerationForm.tsx
```

Purpose:

- Collects generation objectives.
- Lets users add or remove weighted property conditions.
- Provides preset objectives.
- Collects engine and search settings.
- Handles stock upload UI.
- Collects constraints such as max MW and SMARTS filters.
- Calls `onStartGeneration(conditions, settings)`.

Condition type:

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

Settings type:

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

Usage:

```tsx
import { GenerationForm } from './client/GenerationForm';
import type { GenerationCondition, GenerationSettings } from './client/GenerationForm';

function GeneratorHost() {
  function startGeneration(
    conditions: GenerationCondition[],
    settings: GenerationSettings,
  ) {
    console.log({ conditions, settings });
  }

  return <GenerationForm onStartGeneration={startGeneration} />;
}
```

Implementation note: preset chips currently start generation immediately after applying preset values. If you want presets to only populate the form, remove the `onStartGeneration(...)` call from the preset click handler.

### `GeneratedMoleculeCard`

File:

```text
client/GeneratedMoleculeCard.tsx
```

Purpose:

- Displays one candidate molecule.
- Shows score, rank, descriptors, SVG preview, synthesizability, and warnings.
- Supports selected state.
- Exposes an `onCommand` callback for host-level actions.

Use this component when users should compare a small or medium number of candidates visually.

### `GeneratedMoleculeTable`

File:

```text
client/GeneratedMoleculeTable.tsx
```

Purpose:

- Defines the shared `GeneratedCandidate` type.
- Displays candidates in a compact tabular layout.
- Useful for larger result sets or scan-heavy review flows.

Candidate type:

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

### `CandidateDetailsModal`

File:

```text
client/CandidateDetailsModal.tsx
```

Purpose:

- Shows full candidate details after selection.
- Displays full SMILES, metrics, generation traces, warnings, and actions.
- Useful when cards or table rows do not provide enough detail.

### Host-Facing Components

| Component | File | Use |
| --- | --- | --- |
| `GenerationPage` | `client/GenerationPage.tsx` | Full host page that connects the form to real backend jobs. |
| `GenerationArtifact` | `client/GenerationArtifact.tsx` | Artifact renderer for saved candidate sets. |
| `GenerationJobPanel` | `client/GenerationJobPanel.tsx` | Displays host-side job progress. |
| `GenerationSettingsPanel` | `client/GenerationSettingsPanel.tsx` | Alternate settings-focused UI. |

Some host-facing components import shared host services and artifact types. The standalone TypeScript build intentionally includes only standalone-safe components. See `tsconfig.json`.

## Backend Architecture

The backend files are intended to be copied or linked into the MolVis FastAPI host.

### Models

File:

```text
server/models/generation.py
```

Main models:

```py
GenerationRequest
GenerationObjective
GeneratedMolecule
GenerationJob
GenerationJobResponse
```

Supported backend engine names:

```py
"molvis_graph"
"molvis_grammar"
"molvis_transformer"
"molvis_fragment_constrained"
"molvis_chem_ge"
```

Backend request model:

```py
class GenerationRequest(BaseModel):
    engine: GenerationEngineName = "molvis_graph"
    seed: Optional[str] = None
    count: int = Field(default=25, ge=1, le=200)
    objective: Optional[GenerationObjective] = None
    constraints: Dict[str, Any] = Field(default_factory=dict)
    locked_scaffold: Optional[str] = None
```

### Routes

File:

```text
server/routes/generation.py
```

API base:

```text
/api/v1/generation
```

Routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/jobs` | Create a generation job. |
| `GET` | `/jobs/{job_id}` | Read current job status and candidates. |
| `GET` | `/jobs/{job_id}/candidates` | Read only candidates for a job. |
| `GET` | `/jobs/{job_id}/events` | Stream progress and final result through SSE. |

The route attempts to enqueue work through Celery/Redis. If Redis is unavailable in certain deployment contexts, it falls back to FastAPI `BackgroundTasks`.

### Services

Directory:

```text
server/services/generation/
```

Important files:

| File | Purpose |
| --- | --- |
| `base.py` | Shared engine adapter contracts. |
| `generation_runner.py` | Creates and runs generation jobs. |
| `job_store.py` | Stores and retrieves job state. |
| `scoring.py` | Candidate scoring helpers. |
| `filters.py` | Validity, dedupe, and constraint filtering. |
| `graph_ga_adapter.py` | Graph genetic algorithm adapter. |
| `chemge_adapter.py` | ChemGE-style adapter. |
| `grammar_adapter.py` | Grammar-based adapter. |
| `transformer_adapter.py` | Transformer-based adapter. |
| `vae_adapter.py` | Variational autoencoder adapter. |
| `fragment_constrained_adapter.py` | Fragment/scaffold constrained adapter. |
| `rl_adapter.py` | Reinforcement-learning adapter. |
| `train_graph_policy.py` | Training helper for graph policy workflows. |

## Intended API Contract

Create a job:

```text
POST /api/v1/generation/jobs
```

Example request:

```json
{
  "engine": "molvis_graph",
  "seed": "CCO",
  "count": 25,
  "objective": {
    "target_property": "qed",
    "direction": "maximize"
  },
  "constraints": {
    "max_mw": 500,
    "required_substructure": "",
    "forbidden_substructure": "",
    "keep_valid_only": true,
    "auto_deduplicate": true,
    "iterations": 50,
    "mutation_rate": 0.2,
    "synthesizability_weight": 0.5
  }
}
```

Example response:

```json
{
  "job": {
    "job_id": "gen_123",
    "engine": "molvis_graph",
    "status": "queued",
    "progress": 0,
    "request": {},
    "candidates": [],
    "errors": [],
    "artifacts": [],
    "created_at": "2026-06-10T00:00:00Z",
    "completed_at": null
  }
}
```

Read a job:

```text
GET /api/v1/generation/jobs/{job_id}
```

Completed jobs return candidates:

```json
{
  "job": {
    "job_id": "gen_123",
    "engine": "molvis_graph",
    "status": "completed",
    "progress": 100,
    "candidates": [
      {
        "rank": 1,
        "smiles": "CC(=O)Oc1ccccc1C(=O)O",
        "score": 0.91,
        "objective_score": 0.88,
        "diversity_score": 0.71,
        "novelty_score": 0.64,
        "molecular_weight": 180.16,
        "logP": 1.19,
        "tpsa": 63.6,
        "hbd": 1,
        "hba": 4,
        "qed": 0.55,
        "sa_score": 3.2,
        "svg": "<svg>...</svg>",
        "valid": true,
        "warnings": []
      }
    ],
    "errors": []
  }
}
```

SSE progress endpoint:

```text
GET /api/v1/generation/jobs/{job_id}/events
```

The stream emits `progress`, `result`, and `error` events.

## Client API Helpers

File:

```text
client/generationApi.ts
```

Helpers:

```ts
createGenerationJob(payload, signal?)
getGenerationJob(jobId, signal?)
waitForGenerationJob(jobId, timeoutMs?, signal?)
```

Example:

```tsx
import {
  createGenerationJob,
  waitForGenerationJob,
} from './client/generationApi';

async function runGeneration() {
  const created = await createGenerationJob({
    engine: 'molvis_graph',
    count: 25,
    objective: {
      target_property: 'qed',
      direction: 'maximize',
    },
    constraints: {
      max_mw: 500,
    },
  });

  const jobId = created.job.job_id;
  const completed = await waitForGenerationJob(jobId, 60000);
  return completed.job.candidates;
}
```

## Mapping Form State to Backend Request

`GenerationForm` returns UI-friendly `conditions` and `settings`. The backend expects a `GenerationRequest`.

Example adapter:

```ts
import type { GenerationCondition, GenerationSettings } from './client/GenerationForm';
import type { GenerationJobRequest } from './client/generationApi';

export function toGenerationRequest(
  conditions: GenerationCondition[],
  settings: GenerationSettings,
): GenerationJobRequest {
  const primary = conditions[0];

  return {
    engine: settings.engine,
    count: settings.numToGenerate,
    objective: primary
      ? {
          target_property: primary.property,
          direction: primary.objective,
          target_value: primary.targetValue,
        }
      : undefined,
    constraints: {
      conditions,
      iterations: settings.iterations,
      mutation_rate: settings.mutationRate,
      synthesizability_weight: settings.synthesizabilityWeight,
      start_source: settings.startSource,
      max_mw: settings.maxMw,
      required_substructure: settings.requiredSubstructure,
      forbidden_substructure: settings.forbiddenSubstructure,
      keep_valid_only: settings.keepValidOnly,
      auto_deduplicate: settings.autoDeduplicate,
    },
  };
}
```

## Connecting the Standalone App to a Real Backend

To replace demo generation in `src/App.tsx`:

1. Keep `GenerationForm` as the input surface.
2. Convert `conditions` and `settings` into a backend `GenerationJobRequest`.
3. Call `createGenerationJob`.
4. Poll with `waitForGenerationJob` or subscribe to `/events`.
5. Store returned candidates in local state.
6. Render them with `GeneratedMoleculeCard`, `GeneratedMoleculeTable`, or both.
7. Add error and cancellation handling.

If your backend runs on a different origin during local development, add a Vite proxy:

```ts
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
});
```

## MolVis Host Integration

### Frontend Alias

Configure the host Vite alias:

```ts
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@generator': path.resolve(__dirname, '../chem-generator/client'),
    },
  },
});
```

Use host imports:

```tsx
import { GenerationForm } from '@generator/GenerationForm';
import { GeneratedMoleculeCard } from '@generator/GeneratedMoleculeCard';
```

### Backend Files

Copy or symlink module files into the host:

```text
server/models/generation.py        -> host server/app/models/generation.py
server/routes/generation.py        -> host server/app/api/routes/generation.py
server/routes/rl_generation.py     -> host server/app/api/routes/rl_generation.py
server/services/generation/        -> host server/app/services/generation/
```

Register the routers in the host API setup according to the host's routing conventions.

## Development Workflow

Frontend-only:

```bash
npm install
npm run dev
npm run build
```

Host integration tests from the MolVis monorepo:

```bash
./scripts/link-feature-modules.sh
./chem-generator/scripts/run-tests.sh
```

The test script expects the MolVis host backend and frontend layout to be available from the parent repository structure.

## Common Tasks

### Add a New Descriptor

1. Add the descriptor to `AVAILABLE_PROPERTIES` in `client/GenerationForm.tsx`.
2. Add descriptor calculation in backend scoring utilities.
3. Include the descriptor in `GeneratedMolecule` if it should be returned.
4. Display the descriptor in `GeneratedMoleculeCard`, `GeneratedMoleculeTable`, and `CandidateDetailsModal`.

### Add a New Engine

1. Add the engine literal to backend `GenerationEngineName`.
2. Create an adapter in `server/services/generation/`.
3. Register the adapter in the generation runner.
4. Add the engine option to `GenerationForm` if it should be user-selectable.
5. Make sure `client/generationApi.ts` accepts the same string literal if used by the host UI.

### Add Candidate Export

Recommended order:

1. Export JSON first from `GeneratedCandidate[]`.
2. Add CSV for descriptors and scores.
3. Add SDF only when molfile generation is available.
4. Add PNG/SVG export from sanitized `candidate.svg`.

Export from structured candidate data rather than scraping rendered cards.

### Add Cross-Module Actions

Use callbacks rather than direct imports between feature modules.

Examples:

- `open-in-editor:{smiles}`
- `send-to-retrosynthesis:{smiles}`
- `dock-candidate:{smiles}`

The host shell should parse the command and route to the correct module.

## Troubleshooting

### Vite starts on a different port

Use the URL printed by Vite. The default port may already be occupied by another feature app.

### TypeScript cannot resolve host imports

Standalone compilation intentionally excludes host-only components. Check `tsconfig.json` includes. Host-facing components may require shared aliases and services from the MolVis app.

### Stock upload does not affect generation

The standalone upload control is UI-only. Wire upload handling to the backend if stock libraries should constrain generation.

### Jobs stay queued or running

Check:

- Redis/Celery connectivity.
- Host background task fallback.
- Job store write permissions.
- Adapter exceptions in backend logs.
- Model files and chemistry dependencies.

### Candidates are invalid or duplicated

Check:

- `keep_valid_only`.
- `auto_deduplicate`.
- RDKit sanitization in filters.
- Engine output quality.
- SMARTS constraints.

## Known Limitations

- Standalone generation uses demo data.
- Standalone stock upload does not parse chemistry files.
- Some backend engines may not be exposed in the standalone selector.
- Backend files assume the MolVis host package layout.
- Export workflows are not complete in the standalone app.
- Cross-module handoff requires a host shell.
- Candidate quality depends on the selected engine, model files, filters, and scoring setup.

## Additional Documentation

More module-level notes are available in:

```text
docs/molvi-generator.md
server/services/generation/README.md
```
