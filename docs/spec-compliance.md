# SPEC compliance record

Date: 2026-08-14

## Current status

The v1 implementation and release artifact are published at `https://github.com/UntR/dsh-plugin-marketplace`. Registry Schema v1 is deployed through GitHub Pages at `https://untr.github.io/dsh-plugin-marketplace/registry/v1`.

## Registry evidence

| SPEC area | Evidence |
|---|---|
| Canonical full discovery | `src/discovery.ts` uses `topic(name: "dsh-plugin").repositories`, follows every cursor, filters only non-public repositories, and never uses Search. The synthetic test collects 25 pages and 2,500 repositories. |
| Complete factual collection | The seven-condition sync fixture retains normal, archived, fork, README-missing, package-missing, malformed-package, and non-bundle repositories. |
| Stable identity and lifecycle | IDs and detail filenames derive from GitHub database IDs. Protocol checks enforce unique IDs, database IDs, active slugs, and exact detail paths. Sync tests explicitly cover rename/transfer without a new ID or filename, plus removal only after successful discovery. |
| Incremental enrichment | Unchanged HEADs reuse README/package/bundle facts. A 24-hour npm refresh updates only npm/install facts and does not reread README or package.json. Failed existing enrichment retains prior derived facts as stale; new failures receive a minimal record. |
| Atomic deterministic publication | Revision hashes canonical index and detail facts. No-op builds preserve revision, generatedAt, and bytes. Publication uses a staging directory and rename; the workflow commits only a changed `registry/v1` tree. |
| Protocol and security boundaries | Zod and generated JSON Schemas validate meta/index/detail. Private repositories are filtered before publication. Registry artifacts contain no credential field or user token flow. |
| Automation | The workflow supports manual dispatch and `17 */2 * * *`, uses the dedicated secret with `github.token` fallback, publishes a summary, and is configured for GitHub Pages. |

Verification: Registry typecheck and build succeeded; 34 tests passed; regenerated schemas produced no Git diff. GitHub Actions run `31799255745` discovered and deployed 1,830 public repositories. The published meta, index, and a plugin detail were loaded and validated through the production Marketplace `RegistryService` with `stale=false`.

## Marketplace evidence

| SPEC area | Evidence |
|---|---|
| External DSH integration | The package is an external Cordis/DSH bundle with host and client exports, no upstream source modification, and verified peer dependencies. Marketplace and Installed tabs use the official settings slot. |
| Registry boundary | The browser calls only same-origin `/dsh-marketplace/api`. Host loading is lazy, schema-validated, timeout-bounded, memory-cached, disk-cached, and atomically replaced. Invalid remote data cannot replace last-good data. |
| Browsing UI | Component tests cover loading, search, Stars sorting, 48-item pagination, archived/fork/stale/unavailable states, detail loading, cover failure fallback, external links, and install dialogs. |
| Installed UI | Current-profile dependency-managed bundles are shown, including Registry-missing bundles, known/unknown update states, restart notices, and a dedicated Marketplace self-removal confirmation. |
| Safe mutation path | Install/update/remove use the official `dsh plugin --profile ...` CLI through argument arrays with `shell:false`. Requests cannot provide commands or install specs. Mutations share one mutex, have a five-minute timeout, and retain at most 64 KiB of output. |
| Build approval and restart | Build-script installs require an explicit checkbox and the current DSH limitation is surfaced as manual `allowBuilds` work. Successful mutations require a user restart; the plugin never restarts DSH automatically. |
| HTTP and observability | Same-origin mutation checks, strict bodies, query validation, input validation, and body limits are tested. Logs cover Registry refresh/revision/fallback and mutation lifecycle without dumping Registry, environment, credentials, or command output. |
| Localization and accessibility | English and Chinese locales are present. Dialogs provide labels, focus entry/return, Tab containment, Escape handling, disabled states, and external-link protections. |

Verification: Marketplace typecheck and build succeeded; 32 tests passed. The packed `dsh-marketplace-0.1.0.tgz` contained 30 files and passed the release artifact verifier.

The published `@deepseek-ai/dsh@0.1.0-rc.6` integration was also exercised with a temporary DSH home and profile. Install, update, remove, client bundle loading, both settings tabs, and host APIs succeeded; see `docs/e2e-verification.md`.

## Remaining live verification

The repository, Actions workflow, Pages deployment, production Registry URL, and Marketplace HTTPS loading path are complete. One destructive external-state Definition-of-Done check remains intentionally pending:

1. Create or designate a disposable public repository, add the `dsh-plugin` topic, run Registry sync, and confirm the deployed Marketplace observes the addition.
2. Remove the topic, run Registry sync again, and confirm the plugin disappears without changing its historical GitHub identity.

This check requires authorization to mutate a public test repository. It is not inferred from fixture tests or from the successful production deployment.
