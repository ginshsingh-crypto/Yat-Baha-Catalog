// Run: node artifacts/yat-biha/tests/recovery.cjs
// Protect private note isolation, persistence and corrupt-record recovery boundaries.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const source = ts.transpileModule(
  fs.readFileSync(path.resolve(__dirname, "../utils/recovery.ts"), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  },
).outputText;
const map = new Map();
let writes = 0;
const storage = {
  getItem: async (key) => map.get(key) ?? null,
  setItem: async (key, value) => {
    writes++;
    map.set(key, value);
  },
  removeItem: async (key) => {
    map.delete(key);
  },
};
function load(preview) {
  const module = { exports: {} };
  new Function("module", "exports", "require", source)(
    module,
    module.exports,
    (name) => {
      if (name === "@react-native-async-storage/async-storage") return storage;
      if (name === "@/config/runtime") return { IS_PREVIEW: preview };
      throw Error(`Unexpected dependency: ${name}`);
    },
  );
  return module.exports;
}
(async () => {
  const preview = load(true),
    production = load(false);
  assert.notEqual(
    preview.recoveryKey("report-a"),
    production.recoveryKey("report-a"),
  );
  const record = {
    ...preview.emptyRecovery("report-a"),
    notes: "علامة داخلية خاصة",
    evidenceChecked: true,
    updatedAt: 1,
  };
  await preview.saveRecovery(record);
  assert.deepEqual(await preview.loadRecovery("report-a"), record);
  assert.equal((await production.loadRecovery("report-a")).notes, "");
  assert.equal((await preview.loadRecovery("report-b")).notes, "");
  assert.throws(() =>
    preview.parseRecovery(JSON.stringify(record), "report-b"),
  );
  assert.throws(() => preview.parseRecovery("{broken", "report-a"));
  assert.throws(() =>
    preview.parseRecovery(
      JSON.stringify({ ...record, notes: "x".repeat(1601) }),
      "report-a",
    ),
  );
  assert.throws(() =>
    preview.parseRecovery(
      JSON.stringify({ ...record, evidenceChecked: "yes" }),
      "report-a",
    ),
  );
  const before = writes;
  await assert.rejects(() =>
    preview.saveRecovery({ ...record, notes: "x".repeat(1601) }),
  );
  assert.equal(
    writes,
    before,
    "Invalid private notes must never overwrite the stored record",
  );
  await preview.deleteRecovery("report-a");
  assert.equal((await preview.loadRecovery("report-a")).notes, "");
  assert.equal((await preview.loadRecovery("report-a")).evidenceChecked, false);
  console.log(
    "Recovery persistence: isolation, round trip, corruption guard, bounded notes and deletion passed.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
