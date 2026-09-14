const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;
// Capture the periodic flush callback instead of letting the real interval run.
let periodicFlush;
global.setInterval = (callback) => {
  periodicFlush = callback;
  return 0;
};

eval(fs.readFileSync(path.join(__dirname, "..", "lib", "dpctf-testharness.js"), "utf8"));

function mockLogger() {
  const listeners = [];
  return {
    on: (event, listener) => {
      if (event === "log") listeners.push(listener);
    },
    emitLog: (log) => listeners.forEach((listener) => listener(log)),
  };
}

function mockWaveService() {
  const sent = [];
  return {
    sent,
    sendLogs: (token, test, logs) => {
      sent.push({ token, test, logs });
    },
  };
}

function buildLogBuffer() {
  periodicFlush = undefined;
  const logger = mockLogger();
  const waveService = mockWaveService();
  global.WaveService = waveService;
  return {
    logger,
    waveService,
    logBuffer: new LogBuffer(logger, "/group/some-test__t1.html", "token-1"),
  };
}

test("completion flush drains the remaining buffered logs and submits them", () => {
  const { logger, waveService, logBuffer } = buildLogBuffer();
  logger.emitLog("log one");
  logger.emitLog("log two");

  logBuffer.flush();

  assert.deepStrictEqual(waveService.sent, [
    {
      token: "token-1",
      test: "/group/some-test__t1.html",
      logs: ["log one", "log two"],
    },
  ]);
});

test("after completion flush the buffer is drained", () => {
  const { logger, waveService, logBuffer } = buildLogBuffer();
  logger.emitLog("log one");

  logBuffer.flush();
  assert.strictEqual(waveService.sent.length, 1);

  logBuffer.flush();
  assert.strictEqual(waveService.sent.length, 1);
});

test("the 3-second periodic flush submits buffered logs", () => {
  const { logger, waveService, logBuffer } = buildLogBuffer();
  assert.ok(periodicFlush, "LogBuffer should register a periodic flush");

  logger.emitLog("periodic log");

  periodicFlush();

  assert.deepStrictEqual(waveService.sent, [
    {
      token: "token-1",
      test: "/group/some-test__t1.html",
      logs: ["periodic log"],
    },
  ]);
});

test("the periodic flush submits nothing when the buffer is empty", () => {
  const { waveService, logBuffer } = buildLogBuffer();

  periodicFlush();

  assert.strictEqual(waveService.sent.length, 0);
});
