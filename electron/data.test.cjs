const test = require("node:test"), assert = require("node:assert/strict");
const { loadTypeScript } = require("./test-typescript.cjs");
const { DATA_KEY, newProfile, normalizeData } = loadTypeScript("../src/data/schema.ts");
const { loadStoredData, persistData, compactStoredData, recoverStoredData, PREVIOUS_KEY, RECOVERY_KEY } = loadTypeScript("../src/data/storage.ts");
const { evaluateAlerts } = loadTypeScript("../src/data/alerts.ts");
const { recordHistory } = loadTypeScript("../src/data/history.ts");
function data() { const profile = newProfile("Work"); return { schemaVersion: 2, setupComplete: true, activeProfileId: profile.id, profiles: [profile] }; }
function storage(initial = {}, limit = Infinity) {
  const values = new Map(Object.entries(initial)); let writes = 0;
  return { getItem: key => values.get(key) ?? null, removeItem: key => values.delete(key), get writes() { return writes; },
    setItem(key, value) { const length = [...values].filter(([name]) => name !== key).reduce((n, [, item]) => n + item.length, value.length);
      if (length > limit) { const error = new Error("quota"); error.name = "QuotaExceededError"; throw error; }
      writes++; values.set(key, value);
    } };
}
test("corrupt-but-present data never becomes an automatic fresh profile overwrite", () => {
  for (const raw of ["{broken", "{}", '{"schemaVersion":2,"profiles":[]}', '{"schemaVersion":9,"profiles":[{}]}']) {
    const disk = storage({ [DATA_KEY]: raw }); const loaded = loadStoredData(disk);
    assert.equal(loaded.blocked, true); assert.equal(disk.getItem(DATA_KEY), raw); assert.equal(disk.writes, 0);
  }
});
test("recovery requires an explicit action and preserves the damaged original", () => {
  const saved = data(), raw = "damaged bytes", disk = storage({ [DATA_KEY]: raw, [PREVIOUS_KEY]: JSON.stringify(saved) });
  const loaded = loadStoredData(disk); assert.equal(loaded.recovery, true); assert.equal(loaded.blocked, true);
  assert.equal(disk.writes, 0); assert.equal(recoverStoredData(disk).activeProfileId, saved.activeProfileId);
  assert.equal(disk.getItem(RECOVERY_KEY), raw); assert.equal(loadStoredData(disk).blocked, false);
});
test("legacy history migrates only when the primary is absent and normalizes values", () => {
  const disk = storage({ "allowance.history.v1": JSON.stringify([{ at: 100, codex: 120, secret: "discard" }, { at: "wrong", codex: 50 }]), "allowance.notification-threshold": "90" });
  const loaded = loadStoredData(disk); assert.equal(loaded.blocked, false);
  assert.deepEqual(loaded.data.profiles[0].history, [{ at: 100, codex: 100 }]); assert.deepEqual(loaded.data.profiles[0].settings.thresholds, [90]);
  assert.equal(disk.writes, 0);
});
test("schema rejects duplicate profiles instead of losing one during persistence", () => {
  const saved = data(); saved.profiles.push(saved.profiles[0]); assert.throws(() => normalizeData(saved), /duplicate/);
});
test("global storage budget prunes old observations while keeping every profile and active session", () => {
  const saved = data(); saved.profiles = Array.from({ length: 20 }, (_, i) => ({ ...newProfile("Profile " + i), history: Array.from({ length: 26000 }, (_, n) => ({ at: 1000 + n, codex: n % 100 })) }));
  const active = { id: "active", name: "Do not discard", startedAt: Date.now() / 1000, endedAt: null, usage: [], partial: false }; saved.profiles[0].insights.active = active;
  const result = compactStoredData(saved); assert.equal(result.trimmed, true); assert.equal(result.data.profiles.length, 20);
  assert.ok(JSON.stringify(result.data).length <= 900000); assert.deepEqual(result.data.profiles[0].insights.active, active);
  assert.ok(result.data.profiles.every(profile => profile.history.at(-1).at === 26999));
});
test("quota failure retries with less history and keeps the last saved primary on unrecoverable errors", () => {
  const saved = data(), disk = storage({}, 6000); saved.profiles[0].history = Array.from({ length: 1000 }, (_, n) => ({ at: 100 + n, codex: n % 100 }));
  const result = persistData(disk, saved); assert.equal(result.saved, true); assert.ok(result.data.profiles[0].history.length < 1000);
  const previous = disk.getItem(DATA_KEY), broken = { ...disk, setItem() { throw new Error("storage disabled"); } };
  saved.profiles[0].name = "Changed"; assert.equal(persistData(broken, saved).saved, false); assert.equal(disk.getItem(DATA_KEY), previous);
});
test("unchanged profiles cause no repeated storage writes", () => {
  const saved = data(), disk = storage(); persistData(disk, saved); const count = disk.writes; persistData(disk, saved); assert.equal(disk.writes, count);
});
test("alerts deduplicate across polls and ignore stale data and quiet hours", async () => {
  const profile = newProfile("Alerts"), at = Date.now() / 1000, calls = [];
  const snapshot = { refreshedAt: at, providers: [{ provider: "codex", displayName: "Codex", observedAt: at, stale: false, status: "connected", windows: [{ id: "week", label: "7-day", usedPercent: 85, remainingPercent: 15, resetsAt: at + 7200 }] }] };
  const notify = async (...args) => calls.push(args);
  profile.notified = await evaluateAlerts(snapshot, profile, notify); await evaluateAlerts(snapshot, profile, notify); assert.equal(calls.length, 1);
  snapshot.providers[0].stale = true; profile.notified = {}; await evaluateAlerts(snapshot, profile, notify); assert.equal(calls.length, 1);
  snapshot.providers[0].stale = false; profile.settings.quietHours = { enabled: true, start: 22, end: 8 };
  await evaluateAlerts(snapshot, profile, notify, new Date(2026, 8, 8, 23)); assert.equal(calls.length, 1);
  assert.equal(recordHistory(snapshot, []).length, 1);
});
