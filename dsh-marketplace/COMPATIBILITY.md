# Compatibility

| Marketplace | Tested DSH | Registry schema | Status |
| --- | --- | --- | --- |
| 0.1.4 | 0.1.1-rc.2 | 1 | Current verified baseline |
| 0.1.0 | 0.1.0-rc.6 | 1 | Historical verified baseline |

Marketplace accepts both verified prerelease lines in its peer dependencies and develops against the current `@deepseek-ai/*` 0.1.1-rc.2 packages.

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
- Plugin mutations are restricted to pages opened on the DSH server's loopback address. LAN origins can browse the Registry but cannot install, update, or remove plugins.
- Agent-assisted handling of unavailable entries starts with a read-only repository assessment and requires explicit approval in the Agent conversation before any change.
