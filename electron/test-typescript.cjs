const fs = require("node:fs"), path = require("node:path"), Module = require("node:module"), ts = require("typescript");
const cache = new Map();
function loadTypeScript(file) {
  const full = path.resolve(__dirname, file);
  if (cache.has(full)) return cache.get(full).exports;
  const module = new Module(full, moduleParent()); cache.set(full, module);
  module.filename = full; module.paths = Module._nodeModulePaths(path.dirname(full));
  const original = module.require.bind(module);
  module.require = name => {
    if (name.startsWith(".")) {
      const target = path.resolve(path.dirname(full), name);
      if (fs.existsSync(target + ".ts")) return loadTypeScript(target + ".ts");
    }
    return original(name);
  };
  const compiled = ts.transpileModule(fs.readFileSync(full, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  module._compile(compiled.outputText, full);
  return module.exports;
}
function moduleParent() { return module; }
module.exports = { loadTypeScript };
