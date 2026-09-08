const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('the exposed bridge, renderer types and registered IPC handlers stay in sync', () => {
  let bridge;
  const calls = [], listeners = new Map();
  vm.runInNewContext(read('electron/preload.cjs'), {
    process: { platform: 'win32' },
    require: name => {
      assert.equal(name, 'electron');
      return {
        contextBridge: { exposeInMainWorld: (name, api) => { assert.equal(name, 'allowance'); bridge = api; } },
        ipcRenderer: {
          invoke: (channel, ...args) => { calls.push({ channel, args }); return Promise.resolve(); },
          sendSync: channel => { assert.equal(channel, 'allowance:get-app-version'); return 'test'; },
          on: (channel, callback) => { assert.ok(!listeners.has(channel)); listeners.set(channel, callback); },
          removeListener: (channel, callback) => { assert.equal(listeners.get(channel), callback); listeners.delete(channel); },
        },
      };
    },
  });
  let declared;
  const types = ts.createSourceFile('electron.d.ts', read('src/electron.d.ts'), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isPropertySignature(node) && node.name.getText(types) === 'allowance') declared = node.type.members.map(member => member.name.getText(types));
    ts.forEachChild(node, visit);
  }
  visit(types);
  assert.deepEqual(Object.keys(bridge).sort(), declared.sort());
  for (const [name, fn] of Object.entries(bridge)) {
    if (typeof fn !== 'function') continue;
    if (name.startsWith('on')) {
      let payload;
      const remove = fn(value => { payload = value; });
      const [channel, listener] = [...listeners.entries()][0];
      listener({ sender: 'private event' }, 'snapshot');
      assert.equal(payload, name === 'onRefresh' ? undefined : 'snapshot', channel);
      remove(); assert.equal(listeners.size, 0);
    } else fn();
  }
  const registered = [...read('electron/main.cjs').matchAll(/\bhandle\(\s*"(allowance:[^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(calls.map(call => call.channel)).size, calls.length, 'Each method owns one distinct channel');
  assert.deepEqual(calls.map(call => call.channel).sort(), registered.sort());
  bridge.moveOverlay({ x: 10, y: -10 });
  assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify({ channel: 'allowance:move-overlay', args: [{ x: 10, y: -10 }] }));
});

test('compact and overlay entry points cannot persist profile data', () => {
  for (const name of ['CompactApp.tsx', 'OverlayApp.tsx']) {
    assert.doesNotMatch(read('src/' + name), /persistData|recoverStoredData|localStorage\.(?:setItem|removeItem|clear)/);
  }
  for (const name of ['schema.ts', 'history.ts', 'alerts.ts']) assert.doesNotMatch(read('src/data/' + name), /\bwindow\.|\blocalStorage\./);
});
