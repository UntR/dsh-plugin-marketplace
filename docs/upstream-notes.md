# DeepSeek Harness upstream notes

Inspection date: 2026-08-14

Upstream: `deepseek-ai/deepseek-harness`

Default branch: `master`

Inspected commit: `47f943859bef60e4160492346772ded9b24f765a`

Commit date: `2026-08-13T19:38:46+08:00`

Package version: `0.1.0-rc.5`

## Compatibility result

The product architecture in the marketplace specification remains compatible with the current upstream. No official Marketplace or static Registry protocol exists in the inspected source. The integration names and paths in the specification still exist, with the adapter details recorded below.

## Client slot API

`@deepseek-ai/dsh-client-ui-settings-plugins` declares the `settings.plugins.tab` list slot. Its `configurable` contribution uses order `0`, and `@deepseek-ai/dsh-client-ui-settings-plugin-inventory` contributes `all` at order `10`.

Marketplace can therefore contribute `marketplace` at order `20` and `installed` at order `30` through:

```ts
ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register(...))
```

The browser entry uses `ClientContext` from `@deepseek-ai/dsh-client-runtime/client`, registers locale dictionaries through `ctx.locale`, and declares its runtime dependencies in `dsh.client.inject`.

## Client bundle declaration

The client module host still discovers packages from `package.json` metadata:

```json
{
  "exports": {
    "./client": {
      "types": "./lib/types/client/index.d.ts",
      "default": "./lib/client.js"
    }
  },
  "dsh": {
    "client": {
      "platform": "web",
      "inject": []
    }
  }
}
```

The node half resolves package metadata from `ctx.baseUrl`, requires a web platform declaration, and rejects a declaration without an exported `./client` bundle.

## Web server route API

`@deepseek-ai/dsh-host-webserver` provides `ctx.webServer`. Routes are registered with:

```ts
ctx.webServer.register({
  kind: 'prefix',
  path: '/dsh-marketplace',
  handler,
})
```

The handler owns the complete Node `IncomingMessage` and `ServerResponse` lifecycle. Exact and prefix routes are supported, duplicate registrations throw, and longest-prefix matching is used after exact matching.

## Plugin CLI API

The published CLI package is `@deepseek-ai/dsh` version `0.1.0-rc.5`, and its executable is `lib/bin.js` through the `dsh` package bin entry.

The supported command form remains:

```text
dsh plugin --profile <profile> add <spec>
dsh plugin --profile <profile> update <packageName>
dsh plugin --profile <profile> remove <packageName>
```

The current implementation is deliberately a thin pnpm forwarder. It initializes the profile when necessary, runs pnpm in the profile directory, and reconciles dependency-managed packages that declare `dsh.bundle` into `dsh.profile.bundles`. The marketplace adapter must invoke the official CLI with an argument array and must not implement package-manager reconciliation itself.

## Profile path resolution

`resolveDshHome()` is exported by `@deepseek-ai/dsh-home-paths`. It resolves an explicit configured path, then `DSH_HOME`, then `~/.dsh`.

`resolveProfileDir(name)` is exported by `@deepseek-ai/dsh-app-boot` and resolves:

```text
<DSH_HOME>/profiles/<name>
```

It rejects empty, nested, `.` and `..` profile names. The profile launcher creates the Loader root at `<profile>/cordis.yml`; the current client module host explicitly documents `ctx.baseUrl` as this config-tree anchor. Marketplace will verify that the resolved runtime directory is an immediate child of the profiles root before using it.

## Bundle patch declaration

The external bundle format still uses:

```json
{
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

The current patch format accepts a top-level patch list with an `insert` entry. The marketplace bundle can insert one host/client package row whose package metadata exposes both node and browser faces.

## Build approval

Profiles currently use `pnpm-workspace.yaml`. For git-hosted packages with a prepare script, pnpm uses the `allowBuilds` map. The DSH CLI reports the manual path after pnpm rejects an unapproved build, but upstream exposes no stable API for editing that map.

The v1 adapter will therefore fail with `build-approval-required` and accurate manual guidance for Registry entries that require build scripts. It will not rewrite `pnpm-workspace.yaml`. This is the explicit fallback allowed by section 89 of the marketplace specification.

## Adapter decisions

- Keep Registry Schema v1 unchanged.
- Use `@deepseek-ai/dsh-host-webserver` for the `/dsh-marketplace` prefix route.
- Use the published `@deepseek-ai/dsh` bin entry for mutations.
- Use `@deepseek-ai/dsh-home-paths` and `@deepseek-ai/dsh-app-boot` for home and profile resolution when available through the tested peer range.
- Register browser tabs through `settings.plugins.tab` at orders 20 and 30.
- Treat the DSH release as a tested peer range and record it in `COMPATIBILITY.md`; do not depend on an upstream source checkout or `workspace:^` in the packed artifact.

## Inspected upstream files

- `apps/cli/src/args.ts`
- `apps/cli/src/bin.ts`
- `apps/cli/src/plugin.ts`
- `apps/cli/src/profile-boot.ts`
- `apps/cli/package.json`
- `packages/boot/app-boot/src/profile.ts`
- `packages/bundle/web-app/cordis.patch.yml`
- `packages/client/modules/src/index.ts`
- `packages/client/ui-settings-plugins/src/client/index.ts`
- `packages/client/ui-settings-plugin-inventory/src/client/index.ts`
- `packages/client/ui-settings/src/client/contract/slots.ts`
- `packages/host/webserver/src/index.ts`
- `packages/util/home-paths/src/index.ts`
