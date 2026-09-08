const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { startProcess, stopProcesses } = require("./processes.cjs");
const { hookStatus, installHook, uninstallHook } = require("./claude-hook.cjs");
const { logError } = require("./logger.cjs");
const { redactText } = require("./security.cjs");
const { version: appVersion } = require("../package.json");

const CLAUDE_SNAPSHOT_FILE = "claude-status.json";

function nowEpoch() {
  return Math.floor(Date.now() / 1000);
}

function number(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function field(value, camel, snake) {
  return value?.[camel] ?? value?.[snake];
}

function timestamp(value) {
  const numeric = number(value);
  if (numeric !== undefined) {
    const seconds = numeric >= 100_000_000_000 ? numeric / 1000 : numeric;
    return seconds > 0 ? Math.floor(seconds) : undefined;
  }
  // Only parse explicit ISO dates, never locale-dependent or empty strings.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const seconds = Date.parse(value) / 1000;
    if (Number.isFinite(seconds) && seconds > 0) return Math.floor(seconds);
  }
  return undefined;
}

function snapshotStale(observedAt, windows, now) {
  return !observedAt || observedAt > now + 60 || now - observedAt > 900 ||
    windows.some(window => window.resetsAt && window.resetsAt <= now);
}

function humanWindowLabel(minutes, fallback) {
  if (minutes === 300) return "5-hour";
  if (minutes === 10_080) return "7-day";
  if (minutes && minutes % 10_080 === 0) return `${minutes / 10_080}-week`;
  if (minutes && minutes % 1_440 === 0) return `${minutes / 1_440}-day`;
  if (minutes && minutes % 60 === 0) return `${minutes / 60}-hour`;
  if (minutes) return `${minutes}-minute`;
  return fallback;
}

function parseWindow(value, id, fallbackLabel) {
  const rawUsed = number(field(value, "usedPercent", "used_percent"));
  if (rawUsed === undefined) return null;
  const usedPercent = Math.max(0, Math.min(100, rawUsed));
  const windowMinutes = number(
    field(value, "windowDurationMins", "window_minutes"),
  );
  const resetsAt = timestamp(field(value, "resetsAt", "resets_at"));
  return {
    id,
    label: humanWindowLabel(windowMinutes, fallbackLabel),
    usedPercent,
    remainingPercent: Math.max(0, Math.min(100, 100 - usedPercent)),
    resetsAt,
    windowMinutes,
  };
}

function parseBucketWindows(bucket, bucketId, displayPrefix) {
  const windows = [];
  for (const [kind, fallback] of [
    ["primary", "Primary"],
    ["secondary", "Secondary"],
  ]) {
    if (!bucket?.[kind]) continue;
    const window = parseWindow(bucket[kind], `${bucketId}:${kind}`, fallback);
    if (!window) continue;
    if (displayPrefix) window.label = `${displayPrefix} · ${window.label}`;
    windows.push(window);
  }
  return windows;
}

function parseCredits(value) {
  if (!value || typeof value !== "object") return null;
  const balance = number(value.balance);
  const hasCredits = field(value, "hasCredits", "has_credits");
  const unlimited = value.unlimited;
  if (
    balance === undefined &&
    typeof hasCredits !== "boolean" &&
    typeof unlimited !== "boolean"
  ) {
    return null;
  }
  return { balance, hasCredits, unlimited };
}

function planFrom(...values) {
  for (const value of values) {
    const plan = field(value, "planType", "plan_type");
    if (typeof plan === "string") return redactText(plan).slice(0, 100);
  }
  return null;
}

function providerFromCodexResult(message) {
  if (message.error) {
    throw new Error(message.error.message ?? "Codex app-server returned an error");
  }
  const result = message.result;
  if (!result) throw new Error("Codex app-server returned no result");
  let windows = [];
  let credits = parseCredits(result.credits);
  let plan = planFrom(result);
  const buckets = result.rateLimitsByLimitId;

  if (buckets && Object.keys(buckets).length) {
    const entries = Object.entries(buckets).slice(0, 16);
    for (const [bucketId, bucket] of entries) {
      const prefix = bucket.limitName || (entries.length > 1 ? bucketId : null);
      windows = windows.concat(parseBucketWindows(bucket, bucketId, prefix));
      credits ||= parseCredits(bucket.credits);
      plan ||= planFrom(bucket);
    }
  } else if (result.rateLimits) {
    windows = parseBucketWindows(result.rateLimits, "codex", null);
    credits ||= parseCredits(result.rateLimits.credits);
    plan ||= planFrom(result.rateLimits);
  }

  if (!windows.length) {
    throw new Error(
      "Codex is connected but returned no subscription rate-limit windows",
    );
  }
  return {
    provider: "codex",
    displayName: "Codex",
    status: "connected",
    source: "codex-app-server",
    plan,
    version: null,
    observedAt: nowEpoch(),
    stale: false,
    windows,
    credits,
    error: null,
  };
}

function queryCodexAppServer(timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    // npm-installed CLIs are `.cmd` shims on Windows and must be started by cmd.exe.
    // The command is a fixed literal; no user input is passed to the shell.
    const managed = startProcess(
      process.platform === "win32" ? "codex app-server" : "codex",
      process.platform === "win32" ? [] : ["app-server"],
      {
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"],
      },
    );
    const child = managed.child;
    const lines = readline.createInterface({ input: child.stdout });
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      lines.close();
      void managed.stop().finally(() => callback(value));
    };
    const timeout = setTimeout(
      () => finish(reject, new Error("Codex app-server did not answer within 10 seconds")),
      timeoutMs,
    );

    child.once("error", (error) =>
      finish(reject, new Error(`Could not start codex app-server: ${error.message}`)),
    );
    child.once("close", () => finish(reject, new Error("Codex app-server exited before reporting usage. Open Codex and check its sign-in.")));
    child.stdin.once("error", (error) =>
      finish(reject, new Error(`Could not request Codex limits: ${error.message}`)),
    );
    lines.on("line", (line) => {
      try {
        const message = JSON.parse(line);
        if (message.id === 2) finish(resolve, providerFromCodexResult(message));
      } catch (error) {
        finish(reject, error);
      }
    });

    const requests = [
      {
        method: "initialize",
        id: 1,
        params: {
          clientInfo: {
            name: "allowance_usage_tracker",
            title: "Allowance",
            version: appVersion,
          },
        },
      },
      { method: "initialized", params: {} },
      { method: "account/rateLimits/read", id: 2 },
    ];
    for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`);
  });
}

function walkFiles(directory, output = [], depth = 0, budget = { left: 10000 }) {
  if (depth > 12 || budget.left <= 0 || !fs.existsSync(directory)) return output;
  let entries;
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return output; }
  for (const entry of entries) {
    if (--budget.left < 0) break;
    if (entry.isSymbolicLink()) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, output, depth + 1, budget);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) output.push(fullPath);
  }
  return output;
}

async function queryCodexSessionFallback(reason, sessions = path.join(os.homedir(), ".codex", "sessions"), now = nowEpoch()) {
  const candidates = walkFiles(sessions)
    .flatMap(file => {
      try { return [{ file, modified: fs.statSync(file).mtimeMs }]; }
      catch { return []; } // A session may be removed while the CLI is running.
    })
    .sort((left, right) => right.modified - left.modified).slice(0, 20);
  if (!candidates.length) throw new Error(`${reason}. No local Codex sessions were found either`);

  let latest = null;
  for (const { file } of candidates) {
    // Stream a bounded set of recent files; do not retain whole conversation logs.
    const input = fs.createReadStream(file, { encoding: "utf8" });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        if (!line.includes('"rate_limits"')) continue;
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        const rateLimits = event?.payload?.rate_limits;
        if (!rateLimits) continue;
        const windows = parseBucketWindows(rateLimits, "codex", null);
        if (!windows.length) continue;
        const eventTime = timestamp(event.timestamp);
        // Unknown/future timestamps never become fresh because a file was touched.
        const observedAt = eventTime && eventTime <= now + 60 ? eventTime : 0;
        if (latest && observedAt <= latest.observedAt) continue;
        latest = {
          provider: "codex",
          displayName: "Codex",
          status: "fallback",
          source: "codex-session-fallback",
          plan: planFrom(rateLimits),
          version: null,
          observedAt,
          stale: snapshotStale(observedAt, windows, now),
          windows,
          credits: parseCredits(rateLimits.credits),
          error: `Using a local session snapshot${observedAt ? "" : " with unknown observation time"}: ${reason}`,
        };
      }
    } catch {
      // An unreadable or partially written file must not hide another usable snapshot.
    } finally {
      lines.close();
      input.destroy();
    }
  }
  if (latest) return latest;
  throw new Error(`${reason}. Recent local sessions had no rate-limit snapshot`);
}

function unavailableProvider(provider, displayName, error) {
  return {
    provider,
    displayName,
    status: "setup-required",
    source: "none",
    plan: null,
    version: null,
    observedAt: nowEpoch(),
    stale: true,
    windows: [],
    credits: null,
    error: redactText(error instanceof Error ? error.message : String(error)),
  };
}

async function queryCodex() {
  try {
    return await queryCodexAppServer();
  } catch (error) {
    try {
      return await queryCodexSessionFallback(error.message);
    } catch (fallbackError) {
      logError("Codex collection", fallbackError);
      return unavailableProvider("codex", "Codex", fallbackError);
    }
  }
}

function queryClaude(dataDirectory, now = nowEpoch()) {
  try {
    const snapshotPath = path.join(dataDirectory, CLAUDE_SNAPSHOT_FILE);
    if (!fs.existsSync(snapshotPath)) {
      throw new Error(
        "Install the Claude status-line hook, then start or resume a Claude Code session",
      );
    }
    if (fs.statSync(snapshotPath).size > 1024 * 1024) throw new Error("Claude usage snapshot exceeds the 1 MB limit.");
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
    const rateLimits = snapshot.rate_limits;
    if (!rateLimits) throw new Error("Claude has not reported rate-limit data yet");
    const observedAt = timestamp(snapshot.observed_at) ?? 0;
    const windows = [];
    for (const [key, label, minutes] of [
      ["five_hour", "5-hour", 300],
      ["seven_day", "7-day", 10_080],
      ["spend_limit", "Spend limit", null],
    ]) {
      const value = rateLimits[key];
      const rawUsed = number(field(value, "usedPercentage", "used_percentage"));
      if (rawUsed === undefined) continue;
      const usedPercent = Math.max(0, Math.min(100, rawUsed));
      windows.push({
        id: `claude:${key}`,
        label,
        usedPercent,
        remainingPercent: Math.max(0, Math.min(100, 100 - usedPercent)),
        resetsAt: timestamp(field(value, "resetsAt", "resets_at")),
        windowMinutes: minutes,
      });
    }
    if (!windows.length) {
      throw new Error(
        "Claude is connected, but this session has not reported plan limits yet",
      );
    }
    const stale = snapshotStale(observedAt, windows, now);
    return {
      provider: "claude",
      displayName: "Claude",
      status: stale ? "stale" : "connected",
      source: "claude-status-line",
      plan: null,
      version: typeof snapshot.version === "string" ? redactText(snapshot.version).slice(0, 100) : null,
      observedAt,
      stale,
      windows,
      credits: null,
      error: !observedAt || observedAt > now + 60
        ? "Snapshot time is missing or invalid. Start or resume Claude Code to report fresh usage."
        : null,
    };
  } catch (error) {
    return unavailableProvider("claude", "Claude", error);
  }
}

function claudeHookInstalled() { return hookStatus().installed; }

const POWERSHELL_HOOK = String.raw`# Managed by Allowance
$ErrorActionPreference = 'Stop'
$raw = [Console]::In.ReadToEnd()
$data = $raw | ConvertFrom-Json
$limits = [ordered]@{}
foreach ($key in @('five_hour', 'seven_day', 'spend_limit')) {
  $window = $data.rate_limits.$key
  if ($null -eq $window) { continue }
  $used = 0.0
  $rawUsed = $window.used_percentage
  if ($null -eq $rawUsed) { $rawUsed = $window.usedPercentage }
  if (-not [double]::TryParse([string]$rawUsed, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$used)) { continue }
  if ([double]::IsNaN($used) -or [double]::IsInfinity($used)) { continue }
  $reset = $null
  $rawReset = $window.resets_at
  if ($null -eq $rawReset) { $rawReset = $window.resetsAt }
  $numericReset = 0.0
  $dateReset = [DateTimeOffset]::MinValue
  if ([double]::TryParse([string]$rawReset, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$numericReset)) {
    if (-not [double]::IsNaN($numericReset) -and -not [double]::IsInfinity($numericReset)) { $reset = $numericReset }
  } elseif ([string]$rawReset -match '^\d{4}-\d{2}-\d{2}T' -and [DateTimeOffset]::TryParse([string]$rawReset, [ref]$dateReset)) {
    $reset = $dateReset.ToUnixTimeSeconds()
  }
  $limits[$key] = [ordered]@{ used_percentage = [Math]::Max(0, [Math]::Min(100, $used)); resets_at = $reset }
}
$version = $null
if ([string]$data.version -match '^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$' -and ([string]$data.version).Length -le 100) { $version = [string]$data.version }
$snapshot = [ordered]@{
  rate_limits = $limits
  version = $version
  observed_at = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
}
$dataDirectory = Join-Path $env:LOCALAPPDATA 'Allowance'
New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
$destination = Join-Path $dataDirectory 'claude-status.json'
$temporary = Join-Path $dataDirectory ("claude-status.$PID.tmp")
$json = $snapshot | ConvertTo-Json -Depth 12 -Compress
[IO.File]::WriteAllText($temporary, $json, (New-Object Text.UTF8Encoding($false)))
Move-Item -LiteralPath $temporary -Destination $destination -Force
$segments = @()
if ($null -ne $data.rate_limits.five_hour.used_percentage) {
  $remaining = [Math]::Max(0, 100 - [Math]::Round($data.rate_limits.five_hour.used_percentage))
  $segments += "5h $remaining% left"
}
if ($null -ne $data.rate_limits.seven_day.used_percentage) {
  $remaining = [Math]::Max(0, 100 - [Math]::Round($data.rate_limits.seven_day.used_percentage))
  $segments += "7d $remaining% left"
}
if ($segments.Count -eq 0) { 'Allowance - waiting for plan limits' }
else { 'Allowance - ' + ($segments -join ' - ') }
`;

function installClaudeHook() {
  if (process.platform !== "win32") throw new Error("Automatic Claude hook installation is currently available on Windows");
  return installHook(POWERSHELL_HOOK);
}
function uninstallClaudeHook() { return uninstallHook(); }

module.exports = {
  CLAUDE_SNAPSHOT_FILE,
  queryCodex,
  queryCodexAppServer,
  queryClaude,
  claudeHookInstalled,
  installClaudeHook,
  uninstallClaudeHook,
  stopCollectors: stopProcesses,
  _test: {
    POWERSHELL_HOOK,
    parseWindow,
    providerFromCodexResult,
    parseBucketWindows,
    queryCodexSessionFallback,
    timestamp,
    walkFiles,
  },
};
