const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// `hbbtv.js` schedules a 1s `HbbTV.activate` timer at load. In a unit test
// there is no real OIPF/broadcast environment, so we stub `setTimeout` to a
// no-op: `stopBroadcast`'s error path and the non-HbbTV path both resolve
// before scheduling any real timeout, and this keeps the activation timer from
// keeping the test process alive.
global.setTimeout = () => 0;
global.clearTimeout = () => {};

// Force a non-HbbTV user agent so `stopBroadcast` with no error never touches
// `document`. The error short-circuit is what we want to exercise.
Object.defineProperty(global, "navigator", {
  value: { userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" },
  configurable: true,
});

eval(fs.readFileSync(path.join(__dirname, "..", "lib", "hbbtv.js"), "utf8"));

// Regression: `stopBroadcast` was the only step in the test workflow chain
// that dropped the propagated error. The fix adds `if (error) return resolve(error);`
// so the fail-fast error reaches `handleError` -> `done()` -> FAIL instead of
// being swallowed and the test hanging to a server timeout.
test("stopBroadcast(error) resolves with that same error, never dropping it", async () => {
  const error = new Error("Unsupported MIME types or codecs");
  assert.strictEqual(
    await HbbTV.stopBroadcast(error),
    error,
    "the exact error object must be propagated, not lost"
  );
});

test("stopBroadcast(error) propagates even when the error is a non-Error truthy value", async () => {
  const error = "checking codec support failed";
  assert.strictEqual(
    await HbbTV.stopBroadcast(error),
    error,
    "truthy string errors must also be passed through untouched"
  );
});

test("stopBroadcast() with no error in a non-HbbTV context still resolves to undefined", async () => {
  assert.strictEqual(await HbbTV.stopBroadcast(), undefined);
});
