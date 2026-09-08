# Allowance: Project Overview

Reviewed 2026-09-08. Version 0.3.4 is a release candidate, combining collection
accuracy, the navy/slate UI, the logo and profile-management polish, and a
security pass plus the design-review improvements. Overview keeps quota comparisons
central while Plan, Activity and Companion have separate views. Release preparation does not publish anything. See README.md
for features, SECURITY.md for data boundaries, and RELEASING.md for the
project-only source export, checks, signing and manual GitHub release steps.

## What we are building

Allowance is a private Windows desktop app that puts Codex and Claude Code subscription usage in one place. It is meant to answer a simple question without making the user open multiple tools or guess from error messages:

> How much AI coding allowance do I have left, and when does it reset?

The app lives in the Windows system tray, refreshes usage automatically, and presents the most restrictive active quota as the user's current runway. Its working name in the codebase is **UsageTracker**, while the user-facing product name is **Allowance**.

## What we are trying to achieve

The goal is a dependable, low-friction allowance monitor that:

- shows all available usage windows for Codex and Claude Code;
- displays used and remaining percentages with reset countdowns;
- warns the user before an allowance is exhausted;
- stays useful as a tray app instead of requiring another browser tab;
- keeps usage history on the user's own computer;
- leaves credentials with the CLIs and does not retain prompts, transcripts, or source code in its usage model;
- works with the user's existing CLI logins instead of introducing a separate account system.

The intended experience is: install Allowance, connect the locally installed tools, leave it running in the tray, and glance at it whenever capacity matters.

## Current state

The core monitoring path is implemented:

- The Electron app and React dashboard run on Windows.
- Codex usage is requested through `codex app-server` using `account/rateLimits/read`.
- If the Codex app server is unavailable, the app streams up to 20 recently modified session files and selects the newest timestamped quota observation. Unknown or future event times do not become fresh from a file modification.
- Claude Code usage is received through an optional local PowerShell status-line hook.
- Five-hour, seven-day, and any additional reported windows are normalized into a shared data model.
- The dashboard shows remaining allowance, reset times, connection state, plan/version metadata, and Codex credits when available.
- Data refreshes every 30 seconds by default, configurable from 15 to 120 seconds. Concurrent window requests share one collection operation.
- Local history retains up to 90 days and 26,000 points per profile. Stale observations do not enter current summaries, new history points, alerts, or planning.
- Windows notifications can fire at 70%, 80%, or 90% used and are deduplicated per quota window/reset.
- Closing the main window hides the app in the system tray.
- NSIS installer and portable Windows builds are configured.

The renderer includes the compact tray popup, startup settings, diagnostics,
JSON backup/restore, CSV export, update controls, profiles, coding sessions,
budgets, forecasts, activity heatmap, reset timeline, and editable desktop
overlay with built-in or custom GIF companions. Settings supports keyboard
focus containment and Escape dismissal; failed exports remain visible and
retryable. The compact popup shows last-known readings, freshness, and refresh
errors, and receives dashboard updates without overwriting its tray state.

## How it works

```text
Codex CLI/app-server -----> Codex collector -----+
       |                     (session fallback)   |
       |                                          v
       |                                  normalized provider state
       |                                          |
Claude Code -------------> local status hook -----+
                                                   |
                                                   v
                                      Electron IPC/preload bridge
                                                   |
                                                   v
                                           React dashboard
                                      / history / notifications
```

### Codex data path

1. Electron starts `codex app-server` locally.
2. It initializes a JSON-RPC session and calls `account/rateLimits/read`.
3. The collector converts returned buckets into consistent usage windows.
4. If that request fails, it scans `%USERPROFILE%\.codex\sessions` for the latest locally recorded rate-limit snapshot.
5. Fallback data is clearly labeled so the user can distinguish live data from a local snapshot.

### Claude Code data path

1. The user selects **Install local hook** in Allowance.
2. A native confirmation gates the write. Allowance preserves existing settings,
   keeps the first backup and updates a latest backup before atomic replacement.
3. It installs `%USERPROFILE%\.claude\allowance-statusline.ps1` and registers it as Claude Code's status line.
4. Claude Code passes its status payload to that script during an active session.
5. The script saves only rate limits, the Claude Code version, and an observation timestamp to `%LOCALAPPDATA%\Allowance\claude-status.json`.
6. Allowance reads that file locally and marks snapshots older than 15 minutes as stale.

Settings supports removal of only the owned hook, preserving newer preferences.
The Windows uninstaller performs the same cleanup except during app updates.
The installer refuses to overwrite an unrelated custom Claude status line. A user with an existing status line must merge the commands manually or remove the old one first.

## Privacy and security boundaries

Privacy is part of the product, not an optional feature.

- Service credentials stay with the Codex and Claude CLIs.
- Prompts, responses, transcripts, and source files are outside the data model.
- Claude's helper stores only the small usage snapshot described above.
- Chart history and notification state stay in the renderer's local storage.
- Renderer windows use context isolation, disable Node integration, enable the Electron sandbox, deny new windows, and block navigation outside the packaged app or local development server.
- The application does not currently require a cloud backend or an Allowance account.

## Main parts of the repository

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | Lazy mode switch for dashboard, compact and overlay roots |
| `src/DashboardApp.tsx` | Main-window polling, session actions and the sole profile persistence owner |
| `src/data/` | Schema, normalization, storage/recovery, history, alerts and preview data |
| `src/components/`, `src/hooks/` | Focused UI components and dialog focus management |
| `src/PlanningHub.tsx` | Secondary planning/activity views and overview session controls |
| `src/types.ts` | Shared TypeScript models for providers, windows, diagnostics, updates, and tray state |
| `src/styles.css` | Dashboard visual design and responsive styling |
| `electron/collectors.cjs` | Codex/Claude collection, normalization and bounded fallback traversal |
| `electron/processes.cjs` | Tracked subprocess lifecycle and process-tree cleanup |
| `electron/claude-hook.cjs`, `electron/local-files.cjs` | Owned hook lifecycle, backups and atomic file writes |
| `electron/logger.cjs` | Bounded redacted local error logs and recent diagnostics |
| `electron/main.cjs` | Electron windows, tray, IPC handlers, startup behavior, diagnostics, file dialogs, and updater |
| `electron/preload.cjs` | Narrow bridge between the sandboxed React renderer and Electron |
| `electron/collectors.test.cjs` | Collector parsing and Claude hook tests |
| `electron/verify-build.cjs` | Check that packaged Vite assets use valid relative paths |
| `package.json` | Development, test, build, and Windows packaging configuration |

The active desktop runtime is Electron. The unused Tauri scaffold has been removed.

## What still needs work

The former UI integration backlog is implemented. Remaining work is validation
and release preparation:

1. Establish a separate project-only Git repository manually; no Git state was changed.
2. Check real Codex/Claude connections and freshness against the active CLI accounts; this session's collector tests use synthetic files.
3. Exercise native tray, startup, notifications, and full backup restoration on a packaged Windows build.
4. Sign public artifacts and validate a signed installer upgrade/uninstall on a clean Windows VM before enabling an update channel. Local candidates remain unsigned.
5. Extend targeted coverage as new failures are found. Current automated checks cover collector timestamps, insights, tray icons, planning/overlay flows, and compact/Settings error recovery.

Forecasts and session receipts describe observed account-wide allowance changes;
they do not enforce budgets or attribute usage to individual repositories.

## Deliberate non-goals

For the current version, Allowance is not intended to:

- monitor organization-wide API token usage or billing;
- send usage telemetry to an external analytics service;
- store or proxy Codex/Claude credentials;
- inspect coding conversations or repositories;
- replace the official provider account and billing pages.

API cost reporting is a separate problem because it involves different credentials, permissions, and accounting semantics from subscription allowance.

## Development workflow

Requirements: Windows 10 or newer and Node.js 22.17 or newer.

```powershell
npm ci
npm run dev
```

The development command starts Vite and Electron together. A browser-only Vite view uses preview data because live collection requires the Electron bridge.

Before packaging:

```powershell
npm test
npm run build
npm run dist
```

The installer and portable executable are written to `release\`.

## Definition of success

Allowance is successful when a Windows user with Codex and/or Claude Code installed can set it up quickly, always understand which quota window is closest to exhaustion, receive a useful warning before disruption, and trust that the monitoring remains local and private.
