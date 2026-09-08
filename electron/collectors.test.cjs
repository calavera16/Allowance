const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { _test, queryClaude } = require("./collectors.cjs");

function fixtureDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "allowance-collector-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function limitEvent(at, used = 25) {
  return JSON.stringify({ timestamp: at, payload: { rate_limits: {
    primary: { used_percent: used, window_minutes: 300, resets_at: 1_800_010_000 },
  } } });
}

test("touching a Codex log cannot turn an old observation into fresh usage", async t => {
  const directory = fixtureDirectory(t), now = 1_800_000_000;
  const file = path.join(directory, "session.jsonl");
  fs.writeFileSync(file, limitEvent(new Date((now - 3600) * 1000).toISOString()));
  fs.utimesSync(file, now, now);
  const provider = await _test.queryCodexSessionFallback("offline", directory, now);
  assert.equal(provider.observedAt, now - 3600);
  assert.equal(provider.stale, true);
  assert.equal(provider.windows[0].remainingPercent, 75);
});

test("fallback selects the newest rate-limit event across recent files despite empty logs and partial writes", async t => {
  const directory = fixtureDirectory(t), now = 1_800_000_000;
  fs.writeFileSync(path.join(directory, "empty.jsonl"), '{"timestamp":"recent","payload":{}}\n');
  fs.writeFileSync(path.join(directory, "a.jsonl"), limitEvent(now - 100, 55) + "\n" + limitEvent(now - 200, 10) + '\n{"rate_limits":');
  fs.writeFileSync(path.join(directory, "b.jsonl"), limitEvent(now - 300, 80));
  const provider = await _test.queryCodexSessionFallback("offline", directory, now);
  assert.equal(provider.observedAt, now - 100);
  assert.equal(provider.windows[0].remainingPercent, 45);
  assert.equal(provider.stale, false);
});

test("missing or future Codex event times stay unknown and stale", async t => {
  const directory = fixtureDirectory(t), now = 1_800_000_000;
  for (const at of [undefined, "", "nonsense", now + 3600]) {
    fs.writeFileSync(path.join(directory, "session.jsonl"), limitEvent(at));
    const provider = await _test.queryCodexSessionFallback("offline", directory, now);
    assert.equal(provider.observedAt, 0);
    assert.equal(provider.stale, true);
  }
});

test("Claude accepts ISO reset dates but never invents an observation timestamp", t => {
  const directory = fixtureDirectory(t), now = 1_800_000_000;
  const snapshot = { rate_limits: { five_hour: { used_percentage: 35, resets_at: new Date((now + 600) * 1000).toISOString() } } };
  for (const observed_at of [undefined, "", "bad", now + 3600, now - 3600]) {
    fs.writeFileSync(path.join(directory, "claude-status.json"), JSON.stringify({ ...snapshot, observed_at }));
    const provider = queryClaude(directory, now);
    assert.equal(provider.stale, true);
    assert.equal(provider.windows[0].resetsAt, now + 600);
  }
  fs.writeFileSync(path.join(directory, "claude-status.json"), JSON.stringify({ ...snapshot, observed_at: now * 1000 }));
  assert.equal(queryClaude(directory, now).stale, false);
  assert.equal(queryClaude(directory, now).observedAt, now);
});

test("an expired reset keeps the old Claude balance out of current totals", t => {
  const directory = fixtureDirectory(t), now = 1_800_000_000;
  fs.writeFileSync(path.join(directory, "claude-status.json"), JSON.stringify({ observed_at: now - 10,
    rate_limits: { five_hour: { used_percentage: 99, resets_at: now - 1 } } }));
  const provider = queryClaude(directory, now);
  assert.equal(provider.stale, true);
  assert.equal(provider.windows[0].remainingPercent, 1);
});

test("blank numeric fields are not interpreted as unused quota", () => {
  assert.equal(_test.parseWindow({ used_percent: " " }, "test", "Primary"), null);
  assert.equal(_test.timestamp(""), undefined);
  assert.equal(_test.timestamp("2026-09-08T00:00:00Z"), 1788825600);
});

test("parses Codex app-server multi-window responses", () => {
  const provider = _test.providerFromCodexResult({
    id: 2,
    result: {
      rateLimitsByLimitId: {
        codex: {
          planType: "pro",
          primary: {
            usedPercent: 25,
            windowDurationMins: 300,
            resetsAt: 1_800_000_000,
          },
          secondary: {
            usedPercent: 40,
            windowDurationMins: 10_080,
            resetsAt: 1_800_100_000,
          },
        },
      },
    },
  });
  assert.equal(provider.windows.length, 2);
  assert.equal(provider.windows[0].label, "5-hour");
  assert.equal(provider.windows[0].remainingPercent, 75);
  assert.equal(provider.windows[1].label, "7-day");
  assert.equal(provider.plan, "pro");
});

test("parses the snake-case Codex session fallback", () => {
  const window = _test.parseWindow(
    { used_percent: 12.5, window_minutes: 10_080, resets_at: 1_800_000_000 },
    "test",
    "Primary",
  );
  assert.equal(window.label, "7-day");
  assert.equal(window.remainingPercent, 87.5);
});

test("Claude PowerShell hook writes a minimal local snapshot", { skip: process.platform !== "win32" }, () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "allowance-hook-"));
  const script = path.join(temporary, "hook.ps1");
  fs.writeFileSync(script, _test.POWERSHELL_HOOK, "utf8");
  const payload = JSON.stringify({
    version: "2.1.140",
    transcript: "PRIVATE_TEST_TRANSCRIPT",
    rate_limits: {
      five_hour: { used_percentage: 20, resets_at: 1_800_000_000, secret: "PRIVATE_TEST_FIELD" },
      seven_day: { used_percentage: 45, resets_at: 1_800_100_000 },
      other: { secret: "PRIVATE_TEST_OTHER" },
    },
  });
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
    { input: payload, encoding: "utf8", env: { ...process.env, LOCALAPPDATA: temporary } },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /5h 80% left/);
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(temporary, "Allowance", "claude-status.json"), "utf8"),
  );
  assert.equal(snapshot.rate_limits.seven_day.used_percentage, 45);
  assert.equal(snapshot.version, "2.1.140");
  assert.deepEqual(Object.keys(snapshot.rate_limits), ["five_hour", "seven_day"]);
  assert.equal(JSON.stringify(snapshot).includes("PRIVATE_TEST"), false);
  fs.rmSync(temporary, { recursive: true, force: true });
});

test("oversized Claude snapshots are rejected before parsing", t => {
  const directory = fixtureDirectory(t);
  fs.writeFileSync(path.join(directory, "claude-status.json"), "x".repeat(1024 * 1024 + 1));
  assert.match(queryClaude(directory).error, /1 MB/);
});
