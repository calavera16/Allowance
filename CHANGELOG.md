# Changelog

## 0.3.4 ? design review improvements, unpublished

- Focused Overview, Plan, Activity and Companion views; compact quota comparison
  and a collapsed reset timeline.
- One canonical stylesheet, consistent type/control tokens, stronger interactive
  borders, and clearer current versus last-known readings.
- Grouped Settings with Connections, Planning and Companion controls; setup
  skip/reopen, custom backup confirmation, and keyboard overlay move/resize.
- Separate lazily loaded window roots and independently testable data modules;
  memoized expensive planning/history work and a leaf session timer.
- Session actions survive concurrent refreshes; compact refresh shares its result.
- Corrupt-data recovery with preserved originals; global storage budgeting,
  quota retry, explicit save failures, and strict profile validation.
- Tracked process-tree cleanup, bounded fallback scans and redacted rotating logs.
- Native confirmation and atomic Claude hook updates, current-settings-preserving
  removal, and Windows uninstaller cleanup that skips app updates.
- Regression coverage for persistence, notification deduplication, process trees,
  hook lifecycle, IPC drift, session concurrency, restore and overlay keyboard use.

## 0.3.3 — release candidate, unpublished

- Shared app logo and Windows icons; clearer Settings and refresh controls.
- In-app profile creation, renaming, duplication and deletion; no single-option
  profile dropdown; active coding sessions guard profile changes.
- Refined setup, keyboard focus, feedback, scrolling and narrow Settings layouts.
- IPC sender validation, restrictive navigation/permissions and production CSP.
- Redacted errors and diagnostics, protected CSV exports, bounded snapshots and
  a Claude hook that retains only recognized quota fields.
- Local environment template, explicit packaging allowlist, Electron fuse
  hardening, source audit/export tools and manual GitHub build checks.
- Packaging never publishes automatically; signed packaging requires signing.

## 0.3.2

- Snapshot freshness, accurate pairing of quota balances with their reset times,
  stale-data exclusions and compact-view refresh recovery.
- Navy/slate UI throughout dashboard, Settings, setup and overlays.

## 0.3.1

- Custom GIF companions, animation and size controls, persistent image storage
  and backup restoration.

## 0.3.0

- Coding sessions, provider suggestions, workday budgets, usage forecasts,
  history heatmap, reset timeline and animated companions.
