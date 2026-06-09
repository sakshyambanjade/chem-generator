# molvi-generator

**Changed the project settings!**

MolVis molecule generator module — de novo candidate generation with multi-engine scoring.

## Documentation

Full module documentation (interface, usage, extension guide, limitations):

**[docs/molvi-generator.md](docs/molvi-generator.md)**

## Layout

```
client/   React UI (GenerationPage, forms, cards, artifacts)
server/   FastAPI routes, Pydantic models, generation engines
docs/     Module documentation
```

## Host integration

Symlink or copy `server/` into the MolVis host at `server/app/services/generation/`, `server/app/models/generation.py`, and `server/app/api/routes/generation.py`.

Configure the host Vite alias:

```ts
'@generator': path.resolve(__dirname, '../generator/client')
```

## Route

`/generation` — API base: `/api/v1/generation`

## Testing

From the MolVis monorepo:

```bash
./scripts/link-feature-modules.sh   # link server symlinks first
./generator/scripts/run-tests.sh      # 5 frontend + 8 backend tests
```
