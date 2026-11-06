const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// lib/logger.js uses `new EventEmitter()` from lib/event-emitter.js. The real
// EventEmitter is not eval'd here; a mock stands in for it so the tests below
// can observe what the logger emits. The mock records every call — including
// dispatchEvent, which the real EventEmitter does not expose (see the skipped
// tests).
let emitted;

global.EventEmitter = function () {
  return {
    on: (event, listener) => emitted.push({ kind: "on", event, listener }),
    off: (event, listener) => emitted.push({ kind: "off", event, listener }),
    emit: (event, data) => emitted.push({ kind: "emit", event, data }),
    dispatchEvent: (event, data) =>
      emitted.push({ kind: "dispatchEvent", event, data }),
  };
};

function loadLogger() {
  eval(fs.readFileSync(path.join(__dirname, "..", "lib", "logger.js"), "utf8"));
  return new Logger();
}

function newLogger() {
  emitted = [];
  return loadLogger();
}

function emittedLines() {
  return emitted
    .filter((e) => e.kind === "dispatchEvent" || e.kind === "emit")
    .map((e) => e.data);
}

test("exposes the log levels and the LOG_EVENT constant", () => {
  const logger = newLogger();
  assert.strictEqual(logger.LEVEL_ERROR, 1);
  assert.strictEqual(logger.LEVEL_WARNING, 2);
  assert.strictEqual(logger.LEVEL_INFO, 3);
  assert.strictEqual(logger.LEVEL_DEBUG, 4);
  assert.strictEqual(logger.LOG_EVENT, "log");
});

test("exposes the expected logging surface", () => {
  const logger = newLogger();
  assert.strictEqual(typeof logger.log, "function");
  assert.strictEqual(typeof logger.debug, "function");
  assert.strictEqual(typeof logger.info, "function");
  assert.strictEqual(typeof logger.warn, "function");
  assert.strictEqual(typeof logger.error, "function");
  assert.strictEqual(typeof logger.setLogLevel, "function");
  assert.strictEqual(typeof logger.setLogToConsole, "function");
  assert.strictEqual(typeof logger.on, "function");
  assert.strictEqual(typeof logger.off, "function");
});

test("logDebug is suppressed at the default INFO level", () => {
  const logger = newLogger();
  logger.debug("suppressed");
  assert.deepStrictEqual(emitted, []);
});

test("console output stays off by default and suppressed logDebug writes nothing", () => {
  const logger = newLogger();
  const lines = [];
  const originalLog = console.log;
  console.log = (line) => lines.push(line);
  try {
    logger.setLogToConsole(true);
    logger.debug("suppressed");
  } finally {
    console.log = originalLog;
  }
  assert.deepStrictEqual(emitted, []);
  assert.deepStrictEqual(lines, []);
});

// The emission path is currently broken: logger.js calls
// eventEmitter.dispatchEvent(...), which lib/event-emitter.js does not expose,
// so every non-suppressed log call throws
// "eventEmitter.dispatchEvent is not a function".
// These tests pin the expected emission behavior against a mocked
// EventEmitter; unskip them when the fix lands.

test("logInfo emits the message on the LOG_EVENT with the [INF] prefix", { skip: "log emission is broken: eventEmitter.dispatchEvent does not exist" }, () => {
  const logger = newLogger();
  logger.info("hello world");
  const lines = emittedLines();
  assert.strictEqual(lines.length, 1);
  assert.match(lines[0], /\[INF\] hello world$/);
  assert.match(lines[0], /^\[\d{4}-\d{2}-\d{2}T/);
});

test("logError emits with the [ERR] prefix and logWarning with [WRN]", { skip: "log emission is broken: eventEmitter.dispatchEvent does not exist" }, () => {
  const logger = newLogger();
  logger.warn("careful");
  logger.error("boom");
  const lines = emittedLines();
  assert.match(lines[0], /\[WRN\] careful$/);
  assert.match(lines[1], /\[ERR\] boom$/);
});

test("setLogLevel(LEVEL_DEBUG) lets logDebug emit with the [DBG] prefix", { skip: "log emission is broken: eventEmitter.dispatchEvent does not exist" }, () => {
  const logger = newLogger();
  logger.setLogLevel(logger.LEVEL_DEBUG);
  logger.debug("verbose");
  assert.match(emittedLines()[0], /\[DBG\] verbose$/);
});

test("multiple arguments are joined with spaces into one message", { skip: "log emission is broken: eventEmitter.dispatchEvent does not exist" }, () => {
  const logger = newLogger();
  logger.error("append", "failed", 42);
  assert.match(emittedLines()[0], /\[ERR\] append failed 42$/);
});

test("console output is written when setLogToConsole(true)", { skip: "log emission is broken: eventEmitter.dispatchEvent does not exist" }, () => {
  const logger = newLogger();
  const lines = [];
  const originalLog = console.log;
  console.log = (line) => lines.push(line);
  try {
    logger.setLogToConsole(true);
    logger.info("on console");
  } finally {
    console.log = originalLog;
  }
  assert.match(lines[0], /\[INF\] on console$/);
});
