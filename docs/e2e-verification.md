# Marketplace v0.1.0 E2E verification

Date: 2026-08-14  
Runtime: published `@deepseek-ai/dsh@0.1.0-rc.6` in an isolated pnpm dlx environment  
Marketplace artifact: `dsh-marketplace-0.1.0.tgz` verified by `scripts/verify-pack.ts`

## Official CLI lifecycle

A temporary `DSH_HOME` and `web` profile were used.

1. `dsh plugin --profile web add <absolute-tarball>` succeeded.
   - `dependencies.dsh-marketplace` pointed at the tarball.
   - `dsh.profile.bundles` contained `dsh-marketplace`.
   - `lib/index.js` and `lib/client.js` resolved from the installed package.
2. `dsh plugin --profile web update dsh-marketplace` succeeded.
3. `dsh plugin --profile web remove dsh-marketplace` succeeded.
   - The dependency and bundle layer were both removed.
   - The profile manifest remained valid JSON.

## Web integration

The tarball was reinstalled and DSH Web was started on `127.0.0.1:43891`. A read-only Registry Schema v1 fixture was served on `127.0.0.1:43892`.

- DSH boot metadata included the `dsh-marketplace` client entry and its three declared injections.
- `/plugins/dsh-marketplace/client.js` returned the built module-loader bundle.
- `/dsh-marketplace/api/status`, `/catalog`, and `/installed` returned HTTP 200.
- The browser Settings → Plugins view displayed the `Marketplace` and `Installed` tabs.
- Marketplace rendered the fixture catalog with search, sorting, and pagination controls.
- Installed rendered the current `web` profile and the registry-missing Marketplace bundle.
- The browser console contained no warnings or errors during the flow.

This local E2E verifies the package and integration contract. Schema v1 is deployed at `https://untr.github.io/dsh-plugin-marketplace/registry/v1`, and the production Marketplace `RegistryService` loads it with `stale=false`.

## Production topic lifecycle

An authorized disposable public repository, `UntR/dsh-plugin-marketplace-e2e-verification` (GitHub database ID `1334185509`), completed the external lifecycle check.

1. With `dsh-plugin` present, Registry run `31804353272` published `gh:1334185509`; a fresh production Marketplace cache found the entry and loaded its detail with `stale=false`.
2. After the topic was removed, Registry run `31805631288` reported one removal, committed `7c0d9a6`, and deployed Pages. The production index no longer contained the database ID, its detail file was deleted, and a fresh Marketplace cache returned `found=false` with `stale=false`.
3. The temporary repository was then deleted; the GitHub API returned HTTP 404.

The lifecycle is therefore verified through actual GitHub topic mutation, automated Registry publication, deployed Pages content, and the Marketplace service path.
