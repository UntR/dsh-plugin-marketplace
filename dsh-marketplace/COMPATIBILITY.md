# Compatibility

| Marketplace | Tested DSH | Registry schema | Status |
| --- | --- | --- | --- |
| 0.1.0 | 0.1.0-rc.6 | 1 | Supported baseline |

The baseline was verified against DeepSeek Harness commit `47f943859bef60e4160492346772ded9b24f765a` and the published `@deepseek-ai/*` 0.1.0-rc.6 packages.

Integration points used by Marketplace:

- `sidebar.footer.action` and `shell.overlay` client slots
- `ctx.webServer.register({ kind: 'prefix', ... })`
- `ctx.baseUrl` as the active profile anchor
- `$DSH_HOME/profiles/<name>` profile layout
- `dsh plugin --profile <name> add|update|remove`
- DSH module-loader client bundle declaration

Known limitations:

- Plugin changes require a DSH restart; live activation and automatic restart are intentionally unsupported.
- Automatic pnpm build-script approval is unavailable in this DSH baseline. Marketplace returns `build-approval-required` with manual guidance.
- Marketplace supports Registry Schema v1 only. A newer incompatible schema falls back to the last-good v1 cache.
- The public Registry URL must be supplied with `DSH_MARKETPLACE_REGISTRY_URL` until the final GitHub Pages repository is assigned.
