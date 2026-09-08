# Security and privacy

Allowance is a local Windows desktop application. It reads subscription quota
data through installed CLI tools. It does not ask for service API keys, open a
remote web page, send telemetry, or upload usage data. Optional publisher update
checks contact the configured HTTPS server, which receives ordinary connection
information such as an IP address. CLI tools perform their own authentication
and network requests outside Allowance's renderer.

## Data handled by the app

- Codex collection requests quota data from `codex app-server`. The fallback
  streams recent local session logs and extracts quota fields and timestamps;
  it does not copy raw transcripts into Allowance.
- The Claude hook saves recognized quota percentages/reset times, a validated
  version, and an observation timestamp. Unrecognized nested fields are dropped.
  Reinstall the hook from Settings to update an older installed hook.
- Profiles, named coding sessions, usage history, planning settings and custom
  GIFs live in local browser storage. Overlay preferences and the Claude snapshot
  live in the current user's application data directory. These are **not
  encrypted backups** and can be read by software running as the same user.
- JSON/CSV exports are personal data. They include profile/session names and
  usage history; JSON backups can include custom images. Keep them out of public
  repositories and issues. Diagnostic text redacts common tokens, email
  addresses and home-directory names, but review it before sharing.
- Hook installation preserves unrelated Claude settings and makes a local
  settings backup. Installation and removal require native confirmation; removal
  edits only the owned status-line entry, preserving newer unrelated settings.
  These backups may contain private settings and never belong
  in a source repository.

Recent errors are redacted before entering a bounded local log or the Health
report. Logs rotate at 256 KiB and retain one previous file. Redaction is
best-effort; inspect diagnostic material before sharing. Damaged saved profiles
pause autosave, and explicit recovery preserves the damaged original. Capacity
limits may trim older observations; export backups for long-term retention.

Collector and CLI-version child processes are tracked for process-tree cleanup
on completion, timeout and app quit. Codex fallback traversal skips symlinks and
limits depth and directory entries. No unrelated running CLI process is targeted.

## Application boundaries

The renderer is sandboxed, has context isolation and no Node integration. Main
process handlers verify the sending window, main frame and exact local renderer
URL. New windows, document navigation, embedded webviews, downloads and browser
permissions are denied. The production CSP blocks renderer network access,
frames and inline JavaScript. This follows the relevant controls in the
[Electron security guide](https://www.electronjs.org/docs/latest/tutorial/security).

Exports validate format and size and neutralize spreadsheet formula prefixes.
The native file picker chooses import/export locations. The Claude snapshot has
a 1 MB read limit and backups/exports have a 64 MB limit. Error details are
redacted before crossing the privileged boundary.

Packaged executables disable Electron's Node execution, Node environment options
and inspector arguments, require `app.asar`, and verify its embedded integrity.
These are [Electron fuse settings](https://www.electronjs.org/docs/latest/tutorial/fuses);
they supplement code signing and do not make a compromised local account safe.
The app retains its existing local file origin to preserve stored profiles.

## Source and dependency checks

`npm run security:check` scans the public source allowlist, flags personal paths,
local machine identifiers and common credential patterns, and checks that the
Git repository root is the project itself. It also rejects tracked ignored files
and tracked files outside the source allowlist. `npm run release:source` creates
a separate verified source snapshot without `.git`, `.env`, local data or build
artifacts, even when the working directory belongs to an enclosing repository.
Reports stay under ignored `release/security/` and never print matched values.

These checks are heuristic, not a guarantee that every kind of personal data or
secret is detectable. Run an independent scanner against the export and **all
history in the intended Git repository** before publishing. An ignore rule does
not remove already tracked files or past commits. Dependency audit results are
time-specific; rerun `npm audit` when preparing a public build.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository's Security tab
when available. Otherwise, open an issue requesting a private reporting channel
without posting exploit details, credentials, or personal files.

Through the private channel, include the affected Allowance version, Windows
version, reproduction steps, and expected impact. Redact personal information
from any supporting material. This policy describes version 0.3.4; it does not
imply that older binaries receive security updates.
