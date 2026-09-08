# Development

[Back to Allowance](../README.md)

## Requirements

- Windows 10 or 11, x64, for the Electron app and Windows packages.
- Node.js 22.17 or newer with npm. The build workflow uses Node.js 22.
- Installed, signed-in Windows CLIs for live Codex or Claude collection.
  Automated tests use isolated fixtures and do not require provider accounts.

## Run locally

From the repository root:

```powershell
npm ci
npm run dev
```

This starts Vite and Electron together. `npm start` builds the renderer and
opens the built app. A browser-only Vite preview uses example data; live
collection requires the Electron bridge.

Local development can connect to your installed CLIs. Use the automated test
commands below when you need isolated storage and synthetic usage data.

The optional `.env` configures the desktop launcher:

```powershell
Copy-Item .env.example .env
```

No service API keys are needed. Shell variables take precedence over `.env`.
Environment values are not automatically exposed to the renderer. Leave the
update URL blank for the default build; keep credentials and certificates
outside the repository.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | React dashboard, compact popup, overlay, data handling, and planning. |
| `electron/` | Main process, preload bridge, collectors, hook lifecycle, and tests. |
| `assets/` | Application icon sources and generated Windows icons. |
| `build/` | Windows installer integration. |
| `scripts/` | Desktop launcher and source audit/export tooling. |
| `docs/` | User and developer documentation. |
| `.github/workflows/` | Manual Windows validation and packaging workflow. |

`dist/`, `node_modules/`, and `release/` are generated and ignored. Run
`npm run icons` after changing `assets/icon.svg` to regenerate PNG/ICO assets.

## Validate changes

```powershell
npm test
npm run test:ui
npm run test:security
npm run security:check
npm audit
```

The UI command builds the renderer and runs hidden Electron windows with
temporary storage and synthetic IPC data. It covers the dashboard, planning,
profiles, recovery, compact view, and overlays. Screenshots stay in ignored
`release/smoke/`. The security smoke uses the production main process with
isolated fixtures to check IPC and window boundaries.

The source audit checks the allowed public files and Git repository boundary.
It also rejects ignored files that are already tracked. Stage or commit
intentional removals before expecting the tracked-file checks to pass.
See [SECURITY.md](../SECURITY.md#source-and-dependency-checks) for scope and limits.

## Package for Windows

```powershell
npm run dist
```

The command creates an installer and a portable executable under `release/`.
It never publishes automatically. Version 0.3.4 uses unsigned downloads and
manual updates; describe signing status accurately in release notes.

For a signed build, supply `CSC_LINK` and `CSC_KEY_PASSWORD` through a secure
environment and run `npm run dist:signed`. Keep the certificate outside the
repository. This command requires signing and fails if signing cannot finish.
Verify the resulting executable signatures before distributing them.

The manual **Release candidate checks** workflow runs validation on Windows
and uploads the two unsigned executables. It does not create a GitHub release.
Before distributing a new version, also check installation, upgrade, uninstall,
tray behavior, startup, notifications, and live CLI connections on Windows.

## Source archives and releases

```powershell
npm run release:source
```

This creates a verified source snapshot in `release/source/`. Only explicitly
allowed source files, documentation, and assets are included. Git metadata,
environment files, personal data, dependencies, and generated build output are
excluded. Independently scan the source and Git history for secrets before
publishing; a clean working tree does not erase earlier commits.

Upload only the intended executables, an optional reviewed source archive,
and matching SHA-256 checksums. Do not upload the entire `release/` directory:
it also contains local logs, audit reports, test screenshots, and unpacked builds.

Documentation images use synthetic data. Review images and other binary assets
manually; text scanners cannot establish that their contents are private-data free.

## Optional update feed

The default package has no update feed. A publisher can configure a public
HTTPS generic feed using Electron Builder's `extraMetadata.allowanceUpdateUrl`
and `publish` settings. The feed needs the installer, its blockmap, and
`latest.yml`. `ALLOWANCE_UPDATE_URL` can override the URL at runtime.
Authenticated URLs, HTTP, local IP addresses, query strings, and fragments
are rejected. Never embed a token in package metadata or a feed URL.

A configured production feed must accompany a signed build and a tested upgrade
from the preceding version. Update downloads require an explicit restart/install
action to apply; ordinary app exit does not install them.
