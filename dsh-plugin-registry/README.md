# DSH Plugin Registry

Static Registry v1 for every public GitHub repository carrying the `dsh-plugin` topic.

The Registry is a factual index. Archived repositories, forks, repositories without a README, malformed packages, and repositories that cannot be installed automatically remain visible.

## Development

```bash
pnpm install
pnpm --filter dsh-plugin-registry typecheck
pnpm --filter dsh-plugin-registry test
pnpm --filter dsh-plugin-registry build
```

Generate the checked-in JSON Schemas with:

```bash
pnpm --filter dsh-plugin-registry generate:schemas
```

Run a live sync with a GitHub Actions token or a personal token that can read public repositories:

```bash
GH_TOKEN=... pnpm --filter dsh-plugin-registry sync
```

Tokens are used only by the sync process and are never written to Registry output.

## Output

```text
registry/v1/
├── meta.json
├── index.json
└── plugins/
```

The sync replaces this directory only after full topic pagination, enrichment, validation, deterministic serialization, and integrity checks succeed. An unchanged revision does not rewrite any file.
