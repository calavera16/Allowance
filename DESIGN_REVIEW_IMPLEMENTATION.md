# Design review implementation — 0.3.4

Implemented 2026-09-08 against the 0.3.3 review. This is an unpublished local
candidate. No Git initialization, staging, commit, configuration, push, pull or
release publication was performed. The original local review is excluded from
public source because it contains machine-specific paths.

## Product and visual changes

| Review finding | Result |
| --- | --- |
| Dashboard mixes monitoring, planning, history and customization | Overview keeps quota comparisons, sessions and a collapsed reset timeline. Plan, Activity and Companion have their own views. |
| Old styles survive beneath a new override layer | Consolidated layout, tokens and responsive rules into `src/styles.css`; removed `planning.css`, `theme.css`, unused glow selectors and duplicate declarations. |
| Weak control boundaries, flattened type and provider colors | Dedicated control-border token, shared type scale, distinct secondary text, provider tokens, and semantic warning/stale colors. Dashed Claude chart and reduced motion remain. |
| Native popup starts in the old color | All native opaque windows use the navy background. |
| Responsive layouts below 800 px are unreachable | Main window permits 480 px width. UI smoke checks cover default, small and narrow layouts. |
| Hero hides all stale readings | Explicit last-known value with provider/window, age and stale explanation. It remains excluded from current totals, alerts and planning. |
| Overlay number has no context | Overlay carries the provider/window label for the minimum remaining allowance. |
| Overlay editing is hard to discover and pointer-only | Settings explains editing; move bar and eight resize handles are keyboard accessible with arrow/Shift-arrow steps. Native bounds changes are tested. |
| Live hero is silent to assistive technology | Polite, atomic live announcement for the main reading. |
| Settings scattered across different surfaces | General has clear groups; Connections, Planning and Companion expose the relevant shared controls. |
| Setup cannot be skipped/reopened; import confirmation is inconsistent | Explicit Skip setup and Escape; reopen from Connections. Backup restore uses a focus-trapped confirmation with Cancel focused first. |
| Session receipts use unexplained units | Receipts spell out percentage points. |

## Reliability and architecture

| Review finding | Result |
| --- | --- |
| Shell termination can leave Codex descendants running | Shared process manager stops the exact spawned process tree on completion, timeout and app quit. A real shell/child/grandchild regression verifies cleanup. |
| Hook installer has no safe removal path | Native confirmation, exact ownership matching, atomic script/settings replacement, first and latest backups, and removal that preserves current unrelated settings. Malformed settings remain untouched with a repair message. |
| Windows uninstall leaves the Claude hook behind | NSIS cleanup runs the packaged executable's narrow hook-removal mode before deleting the executable; app updates skip removal. Portable users can remove through Settings. |
| No useful runtime errors | Redacted rotating local logs, renderer/process failure events and recent errors in Health diagnostics. |
| Fallback traversal is unbounded | Depth/entry limits, symlink skipping and tolerance of unreadable directories. |
| `App.tsx` contains all windows, storage and UI | Mode switch only; lazy dashboard/compact/overlay roots; pure schema/history/alerts modules, recovery-aware storage, focused components and dialog hook. |
| Session clicks disappear during refresh | Separate refresh/session guards; session actions remain usable during background collection. Concurrent-click regression exercises the real renderer/preload. |
| Corrupt storage silently resets all data | Autosave pauses; original survives startup and storage events. Explicit recovery preserves the damaged copy. Valid exported backups remain an alternative. |
| Per-profile caps can exceed shared storage quota | Global size budget, oldest-observation trimming, quota-specific retry, unchanged-write avoidance and visible persistence failures. Settings, profiles and active sessions are retained. |
| History/planning redo heavy work each second | Memoized components and stable callbacks; planning uses a 15-second cadence plus freshness boundaries; literal session elapsed time ticks in a leaf. |
| Hidden dashboard must keep monitoring | Background collection and freshness checks remain for tray/overlay accuracy. Heavy history/planning processing no longer follows the one-second dashboard clock. |
| IPC interface can drift silently | Test compares the actual exposed bridge, TypeScript declaration and main-process channels; it also checks event subscription cleanup. |
| Opening compact can sequentially collect twice | Main broadcasts the computed snapshot instead of bouncing a new refresh request to the dashboard. |
| Missing failure-path renderer tests | Added runtime checks for session/refresh overlap, corrupt-data restart/recovery, cancellable restoration, new Settings controls and overlay keyboard behavior. |
| Generated release directory and legacy scaffold accumulated | Older artifacts and the empty Tauri scaffold moved to a private backup outside the project. The in-use 0.3.2 portable executable was retained; current and previous candidates remain available. |

The process cleanup uses Windows [`taskkill /T`](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill)
for descendants of a tracked PID. This does not target unrelated CLI processes.
Hook backups and local error logs are private data, not public source.

## Verification and remaining release work

The 52 unit tests, production TypeScript/Vite build, planning/usage UI suites,
and real-main security smoke pass. The latter checks all 25 invoke handlers,
sandbox, navigation, permissions, CSP, native hook confirmation and keyboard
overlay controls. Packaged startup and hook-cleanup checks use isolated profiles
and synthetic CLI fixtures. Private artifact hashes and security scan evidence
are saved under the ignored `release/security/` directory.

The source export, executable contents and dependency audit must be checked for
every final build. The provided candidate is unsigned and has no update feed.
A signed installer upgrade/uninstall and installer/portable single-instance
behavior still need validation on a clean Windows VM. Live CLI account accuracy,
tray placement, Windows startup and native notifications need real-use acceptance
testing. No live account credentials or user settings are modified by the tests.

Version control remains a manual user task. Use the reviewed project-only source
export and follow `RELEASING.md`; the enclosing repository and unrelated history
are outside this review. Preserve the private source backup until that repository
is established. No automated scan proves that all future edits are safe to publish.
