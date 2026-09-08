const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const source = fs.readFileSync(path.join(__dirname, "../src/insights.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const api = import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const epoch = Math.floor(new Date(2026, 8, 7, 12).getTime() / 1000);
const reset = epoch + 86400 * 5;
function state(at, remaining, extra = {}) {
  return { refreshedAt: at, providers: [{ provider: "codex", displayName: "Codex", status: "connected", stale: false, observedAt: at,
    windows: [{ id: "week", label: "7-day", remainingPercent: remaining, usedPercent: 100 - remaining, resetsAt: reset, windowMinutes: 10080 }], ...extra }] };
}

test("summary pairs the lowest allowance with that window's own reset", async () => {
  const { usageSummary } = await api;
  const provider = state(epoch, 20).providers[0];
  provider.windows.unshift({ id: "short", label: "5-hour", remainingPercent: 80, usedPercent: 20, resetsAt: epoch + 300 });
  const summary = usageSummary([provider], epoch);
  assert.equal(summary.remaining, 20);
  assert.equal(summary.nextReset, reset);
  assert.equal(summary.label, "Codex 7-day");
});

test("stale, unknown-time, future, and expired providers cannot drive current totals or budgets", async () => {
  const { usageSummary, budgetFor, freshInsights } = await api;
  const fresh = state(epoch, 70).providers[0];
  for (const patch of [{ stale: true }, { observedAt: 0 }, { observedAt: epoch - 901 }, { observedAt: epoch + 61 },
    { windows: [{ id: "expired", remainingPercent: 1, resetsAt: epoch }] }]) {
    const old = { ...state(epoch, 1).providers[0], ...patch };
    assert.equal(usageSummary([old, fresh], epoch).remaining, 70);
    assert.equal(usageSummary([old], epoch).remaining, null);
    assert.equal(budgetFor(old, freshInsights(), epoch), null);
  }
});

test("migrates old profiles with independent defaults and rejects malformed imported values", async () => {
  const { normalizeInsights } = await api;
  const a = normalizeInsights(undefined, epoch);
  assert.deepEqual(a.workingDays, [1, 2, 3, 4, 5]);
  assert.equal(a.active, null);
  const b = normalizeInsights({ reserve: Infinity, workingDays: [9, -1, 2.5], companion: "invalid", active: { startedAt: epoch, endedAt: epoch - 1 },
    series: [{ key: "codex:week", provider: "codex", points: [[epoch, NaN, reset], [epoch, 90, reset], [epoch, 80, reset], [epoch + 999, 50, reset]] }] }, epoch);
  assert.equal(b.reserve, 10); assert.equal(b.companion, "none"); assert.equal(b.active, null);
  assert.deepEqual(b.series[0].points, [[epoch, 90, reset]]);
});
test("session receipts measure per-window deltas and survive JSON round trips", async () => {
  const { freshInsights, startSession, recordInsights, finishSession, normalizeInsights } = await api;
  let data = startSession(freshInsights(), state(epoch, 80), "  Ship feature  ");
  data = recordInsights(data, state(epoch + 300, 75));
  data = normalizeInsights(JSON.parse(JSON.stringify(data)), epoch + 300);
  data = finishSession(data, state(epoch + 600, 72));
  assert.equal(data.active, null); assert.equal(data.sessions[0].name, "Ship feature");
  assert.equal(data.sessions[0].usage[0].used, 8); assert.equal(data.sessions[0].endedAt - epoch, 600);
  assert.equal(data.sessions[0].partial, false);
});
test("custom companion metadata survives backups without storing image bytes in profile data", async () => {
  const { normalizeInsights } = await api;
  const custom = { id: "a".repeat(64), name: "My character.gif", width: 32, height: 32, bytes: 1600 };
  const data = normalizeInsights({ companion: "custom", customCompanion: custom, companionSize: 88, companionAnimated: false }, epoch);
  assert.deepEqual(data.customCompanion, custom);
  assert.equal(data.companion, "custom"); assert.equal(data.companionSize, 88); assert.equal(data.companionAnimated, false);
  assert.deepEqual(normalizeInsights(JSON.parse(JSON.stringify(data)), epoch), data);
  const invalid = normalizeInsights({ companion: "custom", customCompanion: { id: "../../secret" }, companionSize: 999 }, epoch);
  assert.equal(invalid.customCompanion, null); assert.equal(invalid.companionSize, 96);
});
test("repeated and out-of-order observations cannot double count usage", async () => {
  const { freshInsights, startSession, recordInsights } = await api;
  let data = startSession(freshInsights(), state(epoch, 80), "Test");
  data = recordInsights(data, state(epoch + 300, 75));
  data = recordInsights(data, state(epoch + 300, 75));
  data = recordInsights(data, state(epoch + 200, 70));
  assert.equal(data.active.usage[0].used, 5); assert.equal(data.series[0].points.length, 2);
});
test("reset transitions cannot create phantom consumption or mix quota windows", async () => {
  const { freshInsights, startSession, recordInsights } = await api;
  const initial = state(epoch, 10);
  initial.providers[0].windows.push({ id: "five", label: "5-hour", remainingPercent: 70, resetsAt: epoch + 3600, windowMinutes: 300 });
  let data = startSession(freshInsights(), initial, "Reset test");
  const next = state(epoch + 300, 90);
  next.providers[0].windows[0].resetsAt = reset + 86400;
  next.providers[0].windows.push({ ...initial.providers[0].windows[1], remainingPercent: 65 });
  data = recordInsights(data, next);
  assert.equal(data.active.partial, true);
  assert.deepEqual(data.active.usage.map(u => [u.key, u.used]), [["codex:five", 5]]);
  assert.equal(data.lastResetAt, epoch + 300);
});
test("a reset with a lower new balance also skips the unobserved transition", async () => {
  const { freshInsights, startSession, recordInsights } = await api;
  let data = startSession(freshInsights(), state(epoch, 80), "");
  const next = state(epoch + 300, 50); next.providers[0].windows[0].resetsAt += 86400;
  data = recordInsights(data, next);
  assert.equal(data.active.usage.length, 0); assert.equal(data.active.partial, true);
});
test("long gaps are marked partial and excluded; tracking resumes at the next interval", async () => {
  const { freshInsights, startSession, recordInsights } = await api;
  let data = startSession(freshInsights(), state(epoch, 80), "Gap");
  data = recordInsights(data, state(epoch + 3600, 40));
  data = recordInsights(data, state(epoch + 3900, 38));
  assert.equal(data.active.usage[0].used, 2); assert.equal(data.active.partial, true);
});
test("stale providers do not create consumption; an unconfigured provider does not spoil a session", async () => {
  const { freshInsights, startSession, recordInsights } = await api;
  let data = startSession(freshInsights(), state(epoch, 80), "Fresh only");
  const next = state(epoch + 300, 75);
  next.providers.push({ provider: "claude", status: "setup-required", windows: [], observedAt: 0, stale: true });
  data = recordInsights(data, next);
  assert.equal(data.active.partial, false);
  data = recordInsights(data, state(epoch + 600, 30, { stale: true }));
  assert.equal(data.active.usage[0].used, 5); assert.equal(data.active.partial, true);
});
test("session boundaries exclude consumption from before the start observation", async () => {
  const { freshInsights, recordInsights, startSession, finishSession } = await api;
  let data = recordInsights(freshInsights(), state(epoch, 90));
  data = startSession(data, state(epoch + 300, 70), "Boundary");
  data = finishSession(data, state(epoch + 600, 65));
  assert.equal(data.sessions[0].usage[0].used, 5);
  assert.equal(data.days[0].usage[0].used, 25);
});
test("calendar uses local dates and does not invent a midnight allocation", async () => {
  const { freshInsights, recordInsights, dateKey } = await api;
  const midnight = new Date(2026, 8, 7, 23, 59).getTime() / 1000;
  let data = recordInsights(freshInsights(), state(midnight, 80));
  data = recordInsights(data, state(midnight + 120, 75));
  assert.equal(dateKey(midnight), "2026-09-07");
  assert.equal(data.days.at(-1).date, "2026-09-08");
  assert.equal(data.days.at(-1).partial, true); assert.equal(data.days.at(-1).usage.length, 0);
});
test("pace learns a measured hourly rate and needs fresh observations from this cycle", async () => {
  const { paceFor } = await api;
  const series = { points: Array.from({ length: 13 }, (_, i) => [epoch + i * 300, 90 - i, reset]) };
  const pace = paceFor(series, epoch + 3600, reset);
  assert.equal(pace.rate, 12); assert.equal(pace.intervals, 4);
  assert.equal(paceFor(series, epoch + 3600, reset + 1), null);
  assert.equal(paceFor(series, epoch + 7200, reset), null);
  assert.equal(paceFor({ points: series.points.slice(0, 2) }, epoch + 300, reset), null);
});
test("pace ranges widen when observed consumption varies", async () => {
  const { paceFor } = await api;
  const values = [100, 99, 98, 97, 94, 91, 88, 87, 86, 85, 80, 75, 70];
  const pace = paceFor({ points: values.map((v, i) => [epoch + i * 300, v, reset]) }, epoch + 3600, reset);
  assert.ok(pace.low < pace.rate); assert.ok(pace.high > pace.rate);
});
test("provider suggestions account for a weekly bottleneck even when the short window resets soon", async () => {
  const { freshInsights, recommendProvider } = await api;
  const data = freshInsights();
  const codex = state(epoch + 3600, 50).providers[0];
  codex.windows.push({ id: "five", label: "5-hour", remainingPercent: 80, resetsAt: epoch + 3900, windowMinutes: 300 });
  data.series.push({ key: "codex:week", provider: "codex", points: Array.from({ length: 13 }, (_, i) => [epoch + i * 300, 86 - 3 * i, reset]) });
  const claude = { ...state(epoch + 3600, 45).providers[0], provider: "claude", displayName: "Claude" };
  assert.equal(recommendProvider([codex, claude], data, epoch + 3600).name, "Use Claude");
  assert.equal(recommendProvider([{ ...claude, stale: true }], data, epoch + 3600).name, "Waiting for headroom");
});
test("budgets reserve capacity and distribute it across selected workdays", async () => {
  const { freshInsights, budgetFor } = await api;
  const data = freshInsights();
  const budget = budgetFor(state(epoch, 60).providers[0], data, epoch);
  assert.equal(budget.workdays, 5); assert.equal(budget.daily, 10);
  assert.equal(budget.left, 10); assert.equal(budget.todayWorking, true);
});
test("budget excludes usage from an earlier reset cycle on the same day", async () => {
  const { freshInsights, recordInsights, budgetFor } = await api;
  let data = recordInsights(freshInsights(), state(epoch, 80));
  data = recordInsights(data, state(epoch + 300, 60));
  const next = state(epoch + 600, 100); next.providers[0].windows[0].resetsAt += 86400;
  data = recordInsights(data, next);
  assert.equal(budgetFor(next.providers[0], data, epoch + 600).used, 0);
  assert.equal(data.days[0].usage[0].used, 20);
});
