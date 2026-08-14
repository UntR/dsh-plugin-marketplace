# DSH Plugin Marketplace

Discover, filter, and install community plugins for DeepSeek Harness.

## Install Marketplace

```bash
npx -y --package @deepseek-ai/dsh dsh plugin --profile web add untr-dsh-marketplace@latest
```

Restart DSH, then open **Settings → Plugins → Marketplace**.

## Workspace

This workspace implements the two independent parts defined by the product spec:

- `dsh-plugin-registry`: discovers every public GitHub repository carrying the `dsh-plugin` topic and publishes a deterministic Registry Schema v1 snapshot.
- `untr-dsh-marketplace`: an external DeepSeek Harness bundle that browses the static registry and manages the current profile through the official `dsh plugin` CLI.

The browser talks only to the same-origin Marketplace host API. GitHub discovery, npm enrichment, profile inspection, and plugin commands remain outside the browser.

## Development

Requires Node.js 22.19+ (or 24+) and pnpm 11.19.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

See [`dsh-marketplace/README.md`](./dsh-marketplace/README.md) for installation and runtime configuration, and [`docs/upstream-notes.md`](./docs/upstream-notes.md) for the verified DSH integration surface.
