# User guide

[Back to Allowance](../README.md)

## Connect your tools

Install and sign in to the Windows version of Codex CLI and/or Claude Code
before connecting it to Allowance. Only providers that return subscription
quota data can show allowance. API billing is outside the app's scope.

**Codex** connects automatically through the installed CLI. If the live request
is unavailable, Allowance can display the most recent quota observation from
local Codex session logs. The reading identifies its source and freshness.

**Claude Code** requires the optional local status-line hook. Open
**Settings > Connections > Install local hook**, confirm the change, then
start or resume a Claude Code session. The hook saves quota percentages, reset
times, the CLI version, and an observation timestamp for Allowance to read.
Reopening Allowance alone does not create a new Claude observation.

Installation preserves unrelated Claude settings and creates local settings
backups. Allowance refuses to overwrite an unrelated custom status line.
If you already use one, review that configuration before choosing which
integration to keep. **Update local hook** updates an existing Allowance hook;
**Remove local hook** removes only its owned entry and script.

You can repeat the setup wizard from **Settings > Connections > Run setup again**.

## Read your allowance

**Overview** shows each provider's reported quota windows. The headline uses
the lowest remaining percentage among fresh windows and pairs it with that
window's reset time. One window resetting does not reset the others.

Snapshots older than 15 minutes, with invalid timestamps, or with a reset that
has already passed are treated as stale. Stale readings remain visible as
last-known data and do not contribute to current totals, alerts, or planning.
Refresh or resume the relevant CLI to obtain a new observation.

Keep Allowance running in the tray for continuous observations. The default
refresh interval is 30 seconds; **Settings > General** offers 15, 30, 60, or
120 seconds. Closing the dashboard keeps monitoring active. The tray menu
provides the quit action.

## Sessions, planning, and history

Select **Start coding** to begin a session, optionally with a name. Select
**Finish session** to save its receipt in **Activity**. Active sessions survive
restarts. Receipts measure observed account-wide changes, including usage from
other tools; they do not attribute usage to a repository or inspect your code.
Changes are shown per quota window in percentage points.

In **Plan**, set your working days and allowance reserve. Daily budgets divide
spendable allowance over the remaining working dates. Usage scenarios model
lighter or heavier use based on recent pace. They need at least 15 minutes of
comparable observations; longer observation periods can provide a pace range.
Each window is compared with its own reset. These estimates do not enforce
limits or switch tools for you.

In **Activity**, choose a provider and quota window, then select a day in the
90-day heatmap to inspect usage and sessions. Gaps, resets, and intervals that
cannot be assigned reliably to a day can make totals partial. Allowance only
knows what it observed while running.

## Notifications and profiles

Configure notifications under **Settings > Alerts**. Thresholds can warn at
70%, 80%, and/or 90% used. Reset reminders, spike alerts, and quiet hours are
also available. Windows notification settings still apply.

Use **Settings > Profiles** to create, rename, switch, or delete local profiles.
Names must be nonblank and unique. The header switcher appears when there are
multiple profiles. Finish an active coding session before creating, switching,
or deleting a profile. Profiles organize local history and preferences; CLI
account selection remains with Codex and Claude Code.

## Desktop overlay and companions

Enable **Show desktop overlay** in the Companion view or in Settings. The
overlay starts locked and click-through.

1. Select **Edit position and size** in Settings, or
   **Edit overlay position and size** from the tray menu.
2. Drag the edit bar to move the overlay and use an edge or corner to resize it.
   Keyboard users can Tab to a handle and press arrow keys to adjust by 10 pixels;
   hold Shift for 40-pixel steps.
3. Set opacity from 20% to 100% with the slider.
4. Select **Done** or **Finish editing overlay** to restore click-through behavior.

Position, size, opacity, and lock state persist across restarts. Resetting the
overlay restores its default size and position on the monitor.

The **Companion** view offers Cat, Robot, Plant, or Off. Built-in companions
respond to remaining allowance and detected resets. **Choose GIF** imports
your own character. Use **Overlay size** and **Play animation** to adjust it;
**Replace GIF** and **Remove GIF** manage the selection. Custom GIFs retain
their aspect ratio and animation; they do not change characters with usage.
System reduced-motion settings display a still frame.

GIFs can be up to 20 MB and 2048 by 2048 pixels. Imported images are copied into
local app storage, so moving the original file does not break the companion.
Replaced or removed images may remain in the local image cache; backups include
only images referenced by profiles.

## Backups and recovery

Open **Settings > Data** to export a full JSON backup, export history as CSV,
or import a backup. JSON includes profiles, settings, history, budgets, sessions,
and selected GIFs. Import lists the affected profile count and asks before
replacing local data. Backups are limited to 64 MB, including up to 40 MB of
companion image data.

If saved profiles are damaged or use an unsupported version, Allowance pauses
autosaving and shows recovery options. Export the original for safekeeping,
use **Use recovery copy** when offered, or restore a valid JSON backup.
Recovery preserves the damaged original separately.

History is retained for up to 90 days, subject to a shared storage budget.
Older observations and inactive receipts may be trimmed when storage is tight.
A notice explains trimming or failed writes. Export a backup if saving fails;
automatic recovery copies do not replace your own backups.

## Updating and uninstalling

Version 0.3.4 has no configured automatic-update feed. For an update, export a
backup, quit Allowance from the tray, and use the newer installer or portable
download from [Releases](https://github.com/calavera16/Allowance/releases).

The Windows uninstaller removes the owned Claude hook while preserving unrelated
current settings. **Portable users:** select **Remove local hook** under
**Settings > Connections** before deleting the executable permanently. A portable
executable still writes local app data; it does not keep everything beside itself.

If hook cleanup reports malformed Claude settings, back up and repair the
current `.claude/settings.json` before retrying. For manual cleanup, remove
only the `statusLine` entry whose command points to
`.claude/allowance-statusline.ps1`, then remove that script. Preserve any
unrelated settings or replacement status line. Settings backups stay local.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Codex is unavailable | Confirm `codex` runs and is signed in from a Windows terminal. Restart Allowance after installing the CLI, then refresh. |
| Claude has no reading | Install or update the local hook, then start or resume Claude Code. An idle CLI may not produce a new observation. |
| A provider is stale | Refresh or resume that CLI. A passed reset or a snapshot older than 15 minutes needs a new observation. |
| A hook cannot be installed | Check for an existing custom status line or malformed Claude settings. Unrelated status lines are preserved. |
| No forecast is available | Allow time for fresh, comparable observations. Forecasts need a recent usage history. |
| Notifications do not appear | Check Allowance's Alerts settings, quiet hours, and Windows notification permissions. |
| Profile changes are disabled | Finish the active coding session first. |
| A save or export fails | Keep the app open, review its error message, and try a writable location. Export a backup if local saving fails. |

For diagnostics, open **Settings > Health > Recheck**. **Copy safe report**
redacts common sensitive values, but inspect it before sharing. Do not post raw
snapshots, personal backups, or Claude settings files in public issues. See
[Security and privacy](../SECURITY.md) for data handling and private reports.
