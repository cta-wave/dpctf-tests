const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;

eval(fs.readFileSync(path.join(__dirname, "..", "lib", "dpctf-testharness.js"), "utf8"));

function allConfig(extra) {
  return Object.assign(
    {
      min_buffer_duration: 5000,
      ts_max: 1000,
    },
    extra,
  );
}

test("exposes the playback-rates parameters from the 'all' scope", () => {
  const params = buildParameters(
    {
      all: allConfig({
        rates: [1.0, 1.1, 0.9],
        rate_step: 5,
        frame_presented_tolerance: 0.2,
      }),
    },
    { code: "playback-rates.html", path: "group/playback-rates__t1.html" },
  );
  assert.deepStrictEqual(params.rates, [1.0, 1.1, 0.9]);
  assert.strictEqual(params.rateStep, 5);
  assert.strictEqual(params.framePresentedTolerance, 0.2);
});

test("still exposes minBufferDuration and tsMax", () => {
  const params = buildParameters(
    { all: allConfig() },
    { code: "playback-rates.html", path: "group/playback-rates__t1.html" },
  );
  assert.strictEqual(params.minBufferDuration, 5000);
  assert.strictEqual(params.tsMax, 1000);
});

test("scope resolution: test-specific overrides template overrides 'all'", () => {
  const params = buildParameters(
    {
      all: allConfig({ rate_step: 5 }),
      "playback-rates.html": { rate_step: 6 },
      "group/playback-rates__t1.html": { rate_step: 7 },
    },
    { code: "playback-rates.html", path: "group/playback-rates__t1.html" },
  );
  assert.strictEqual(params.rateStep, 7);

  const withoutTest = buildParameters(
    {
      all: allConfig({ rate_step: 5 }),
      "playback-rates.html": { rate_step: 6 },
    },
    { code: "playback-rates.html", path: "other/playback-rates__t2.html" },
  );
  assert.strictEqual(withoutTest.rateStep, 6);
});

test("rates default to undefined when not declared", () => {
  const params = buildParameters(
    { all: allConfig() },
    { code: "some-other-test.html", path: "group/some-other-test__t1.html" },
  );
  assert.strictEqual(params.rates, undefined);
  assert.strictEqual(params.rateStep, undefined);
  assert.strictEqual(params.framePresentedTolerance, undefined);
});
