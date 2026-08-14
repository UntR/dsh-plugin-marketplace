# DSH Marketplace

DSH Marketplace is an external DeepSeek Harness bundle. It adds **Marketplace** and **Installed** tabs to the existing Plugins settings area without modifying DSH upstream.

## Install

After the package is published, add it to the profile that runs DSH Web:

```bash
dsh plugin --profile web add dsh-marketplace@0.1.0
```

Restart DSH after installation or any plugin change. Marketplace deliberately does not restart or hot-unload DSH.

## Registry URL

The host fetches Registry Schema v1 over HTTPS. Until the deployment repository URL is assigned, set the static registry root explicitly before starting DSH:

```bash
export DSH_MARKETPLACE_REGISTRY_URL=https://OWNER.github.io/REPOSITORY/registry/v1
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
pnpm --filter dsh-marketplace typecheck
pnpm --filter dsh-marketplace test
pnpm --filter dsh-marketplace build
pnpm --filter dsh-marketplace pack
```

Compatibility details are recorded in [`COMPATIBILITY.md`](./COMPATIBILITY.md).
