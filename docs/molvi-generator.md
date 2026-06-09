# MolVis Generator Module

## 1. Module Overview

The MolVis Generator module creates new drug-like molecule candidates from a seed structure or random initialization, guided by configurable property objectives (LogP, TPSA, QED, etc.). It accepts a generation job request via REST API, runs one of several cheminformatics engines asynchronously, scores and ranks the results with RDKit descriptors, and returns a list of validated candidate SMILES with 2D SVG renderings and synthesizability hints. It does not perform retrosynthesis planning, docking, or clinical assessment.

## 2. Interface Definition

### REST API

Base path (when mounted in host MolVis server): `/api/v1/generation`

| Method | Path | Request body | Response |
|--------|------|--------------|----------|
| `POST` | `/jobs` | `GenerationRequest` | `GenerationJobResponse` |
| `GET` | `/jobs/{job_id}` | — | `GenerationJobResponse` |
| `GET` | `/jobs/{job_id}/candidates` | — | `{ job_id, candidates[] }` |
| `GET` | `/jobs/{job_id}/events` | — | SSE stream of progress updates |

Additional RL endpoint (separate router): `/generation/rl/*` — see `server/routes/rl_generation.py`.

#### `GenerationRequest`

```json
{
  "engine": "molvis_graph",
  "seed": "CC(=O)Oc1ccccc1C(=O)O",
  "count": 25,
  "objective": {
    "target_property": "qed",
    "direction": "maximize",
    "target_value": null
  },
  "constraints": {
    "generations": 5,
    "population_size": 20,
    "mutation_rate": 0.3
  },
  "locked_scaffold": null
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `engine` | `"molvis_graph" \| "molvis_grammar" \| "molvis_transformer" \| "molvis_fragment_constrained" \| "molvis_chem_ge"` | `"molvis_graph"` | Generation engine to use |
| `seed` | `string \| null` | `null` | Seed SMILES; required for graph/fragment engines |
| `count` | `int` (1–200) | `25` | Number of candidates to return |
| `objective` | `GenerationObjective \| null` | `null` | Property optimization target |
| `constraints` | `object` | `{}` | Engine-specific parameters (generations, population, filters) |
| `locked_scaffold` | `string \| null` | `null` | Substructure SMILES that must be preserved |

#### `GenerationObjective`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `target_property` | `string` | `"logP"` | Descriptor name (`logP`, `tpsa`, `qed`, `mw`, `hbd`, `hba`) |
| `direction` | `"minimize" \| "maximize" \| "target"` | `"target"` | Optimization direction |
| `target_value` | `float \| null` | `null` | Target value when `direction` is `"target"` |

#### `GeneratedMolecule` (each candidate)

| Field | Type | Description |
|-------|------|-------------|
| `rank` | `int` | Rank after scoring |
| `smiles` | `string` | Canonical SMILES |
| `score` | `float` | Combined score |
| `objective_score` | `float` | Objective-specific score |
| `molecular_weight`, `logP`, `tpsa`, `hbd`, `hba` | numbers | RDKit descriptors |
| `qed`, `sa_score`, `fsp3` | `float \| null` | Drug-likeness metrics |
| `svg` | `string` | 2D structure SVG |
| `valid` | `bool` | Passed structural validation |
| `warnings` | `string[]` | Filter/alert messages |

#### Job lifecycle

```
queued → running → completed | failed
```

Progress is available via SSE (`/jobs/{id}/events`) or polling (`GET /jobs/{id}`).

### Frontend API (`client/generationApi.ts`)

| Function | Parameters | Returns |
|----------|------------|---------|
| `createGenerationJob(payload, signal?)` | `GenerationJobRequest` | Job creation response with `job.job_id` |
| `getGenerationJob(jobId, signal?)` | Job ID string | Full job status + candidates |
| `waitForGenerationJob(jobId, timeoutMs?, signal?)` | Job ID, timeout (default 60 s) | Job when `completed` or `failed` |

#### `GenerationJobRequest` (client-side subset)

```typescript
{
  engine: 'molvis_graph' | 'molvis_grammar' | 'molvis_chem_ge';
  seed?: string;
  count?: number;
  objective?: { direction?, target_property?, target_value? };
  constraints?: Record<string, unknown>;
}
```

### Frontend components

| Export | File | Purpose |
|--------|------|---------|
| `GenerationPage` | `client/GenerationPage.tsx` | Full-page generator UI at `/generation` |
| `GenerationForm` | `client/GenerationForm.tsx` | Job configuration form |
| `GeneratedMoleculeCard` | `client/GeneratedMoleculeCard.tsx` | Single candidate card with actions |
| `GeneratedMoleculeTable` | `client/GeneratedMoleculeTable.tsx` | Tabular candidate list |
| `GenerationArtifact` | `client/GenerationArtifact.tsx` | Copilot artifact renderer for result sets |
| `GenerationJobPanel` | `client/GenerationJobPanel.tsx` | Copilot artifact renderer for job status |
| `CandidateDetailsModal` | `client/CandidateDetailsModal.tsx` | Detailed candidate inspection modal |

### Server engines (`server/services/generation/`)

| Engine class | Name constant | Requires seed | Description |
|--------------|---------------|---------------|-------------|
| `GraphGAAdapter` | `molvis_graph` | Yes | RDKit graph mutation / crossover |
| `GrammarExplorerAdapter` | `molvis_grammar` | No | SMILES grammar exploration |
| `ChemGEAdapter` | `molvis_chem_ge` | Yes | Descriptor-guided with synthesizability scoring |
| `TransformerAdapter` | `molvis_transformer` | No | ChemGPT-style generation |
| `FragmentConstrainedAdapter` | `molvis_fragment_constrained` | Yes | Fragment-library constrained mutation |
| `RLAdapter` | (via RL router) | Yes | Reinforcement-learning guided generation |

All engines implement `GenerationEngine.generate(request, on_progress)` in `server/services/generation/base.py`.

### Host-app dependencies

| Dependency | Used for |
|------------|----------|
| `@/services/api` | Optional host HTTP client |
| `@/store/workspace`, `@/store/molecule` | Workspace state on `GenerationPage` |
| `@/components/shared/TaskProgress`, `VirtualGrid` | UI on `GenerationPage` |
| `@/features/artifacts/artifactRendererRegistry` | Artifact rendering registration in host |
| Host `app.core.celery_app`, `app.services.generation.job_store` | Job queue and persistence (when symlinked into host server) |

## 3. Usage Example

### API — generate QED-optimized analogs of aspirin

```bash
# 1. Create job
curl -X POST http://localhost:8000/api/v1/generation/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "engine": "molvis_graph",
    "seed": "CC(=O)Oc1ccccc1C(=O)O",
    "count": 10,
    "objective": { "target_property": "qed", "direction": "maximize" },
    "constraints": { "generations": 3, "population_size": 15 }
  }'

# Response: { "job": { "job_id": "gen_abc123", "status": "queued", ... } }

# 2. Poll until complete
curl http://localhost:8000/api/v1/generation/jobs/gen_abc123

# 3. Read candidates
curl http://localhost:8000/api/v1/generation/jobs/gen_abc123/candidates
```

**Expected result:** Response contains up to 10 `GeneratedMolecule` objects, each with a valid SMILES, descriptor values, an SVG string, and a rank. Invalid structures are filtered out or marked `valid: false`.

### Frontend — start generation from React

```tsx
import { createGenerationJob, waitForGenerationJob } from '@generator/generationApi';

const { job } = await createGenerationJob({
  engine: 'molvis_graph',
  seed: 'c1ccccc1',
  count: 5,
  objective: { target_property: 'logP', direction: 'minimize' },
});
const result = await waitForGenerationJob(job.job_id);
console.log(result.job.candidates); // array of GeneratedMolecule
```

**Expected result:** After ~10–60 seconds, `result.job.status === 'completed'` and `candidates` contains ranked molecules with SVG previews.

## 4. How to Extend

### Add a new generation engine

1. Create `server/services/generation/my_engine_adapter.py` implementing `GenerationEngine`.
2. Register the adapter in `server/services/generation/generation_runner.py` inside the engine dispatch map.
3. Add the engine name to `GenerationEngineName` in `server/models/generation.py`.
4. Add the engine option to `GenerationForm.tsx` engine selector.
5. Update this documentation's engine table.

**Do not modify** `job_store.py` or the route handlers unless your engine requires a new async execution model.

### Add a new scoring property

1. Add descriptor calculation in `server/services/generation/scoring.py`.
2. Expose the property name in `GenerationForm.tsx` → `AVAILABLE_PROPERTIES`.
3. Handle the property in `score_molecule()` objective evaluation.

### Add a new UI filter or sort

1. Edit `client/GenerationPage.tsx` for page-level filters (synthesizability, sort).
2. Edit `client/GeneratedMoleculeCard.tsx` for per-card actions (e.g. "Send to Retrosynthesis").

### Conventions

- All generated SMILES must pass through RDKit sanitization before returning.
- Engine adapters must call `on_progress(fraction)` during long runs so SSE clients receive updates.
- Frontend engine names must match backend `GenerationEngineName` literals exactly.

## 5. Known Limitations

- **Not standalone.** Server code expects the MolVis host FastAPI app (`app.*` imports for config, Celery, RDKit utils, job store DB). Mount via symlink or copy into `server/app/`.
- **Job persistence** uses the host database through `job_store.py`; jobs are lost if the host DB is not configured.
- **Redis/Celery optional.** Jobs fall back to in-process `BackgroundTasks` when Redis is unavailable (common in local dev).
- **Synthesizability scoring** in `ChemGEAdapter` calls the retrosynthesis service; if AiZynthFinder is not installed, scores use a heuristic fallback.
- **SSE progress** reports job-level progress, not per-molecule streaming.
- **Frontend `GenerationForm`** exposes only `molvis_graph` and `molvis_chem_ge` in the UI; other engines are API-only unless the form selector is extended.
- **No guaranteed uniqueness** across runs; deduplication is best-effort within a single job.
- **Export to SDF/CSV** on `GenerationPage` depends on host `moleculeService.downloadBlob`; bulk export formats are not implemented inside this module.
- **Clinical/toxicity claims** are explicitly out of scope per engine README.
