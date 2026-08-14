# DSH Marketplace

DSH Marketplace is an external DeepSeek Harness bundle. It adds a **Marketplace** surface and an **Installed** view without modifying DSH upstream.

## Install

Install Marketplace into the DSH Web profile. This also works when the `dsh` CLI is not installed globally:

```bash
npx -y --package @deepseek-ai/dsh dsh plugin --profile web add untr-dsh-marketplace@latest
```

Restart DSH, then click **Marketplace** in the lower-left sidebar. Marketplace deliberately does not restart or hot-unload DSH.

## Registry URL

The host fetches Registry Schema v1 from the public default:

```text
https://untr.github.io/dsh-plugin-marketplace/registry/v1
```

Development environments and mirrors can override it before starting DSH:

```bash
export DSH_MARKETPLACE_REGISTRY_URL=https://mirror.example/registry/v1
```

The URL must serve `meta.json`, `index.json`, and `plugins/<github-database-id>.json`. The browser never calls GitHub and never needs a GitHub token.

## Security model

- The browser sends only a registry plugin ID or an installed package name.
- The host validates the request and derives exact install arguments from the validated registry.
- Commands run through the official DSH CLI with an argument array and `shell: false`.
- Mutation requests are same-origin JSON, limited to 64 KiB, and serialized by one mutex.
- Third-party plugins are executable code. Registry inclusion is not a security review or endorsement.
- Packages that require build scripts are not installed automatically on DSH 0.1.0-rc.6. Follow pnpm's exact `allowBuilds` diagnostic in the current profile's `pnpm-workspace.yaml`, preserving all existing YAML.

## Develop and verify

From the workspace root:

```bash
pnpm --filter untr-dsh-marketplace typecheck
pnpm --filter untr-dsh-marketplace test
pnpm --filter untr-dsh-marketplace build
pnpm --filter untr-dsh-marketplace pack
```

Compatibility details are recorded in [`COMPATIBILITY.md`](./COMPATIBILITY.md).
