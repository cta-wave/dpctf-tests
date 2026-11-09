const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;

eval(fs.readFileSync(path.join(__dirname, "..", "lib", "event-emitter.js"), "utf8"));

function buildEmitter() {
  eval(fs.readFileSync(path.join(__dirname, "..", "lib", "event-emitter.js"), "utf8"));
  return new EventEmitter();
}

test("emit calls every listener registered for the event", () => {
  const emitter = buildEmitter();
  const received = [];
  emitter.on("log", (data) => received.push("a:" + data));
  emitter.on("log", (data) => received.push("b:" + data));
  emitter.emit("log", "hello");
  assert.deepStrictEqual(received, ["a:hello", "b:hello"]);
});

test("emit passes the data payload to each listener", () => {
  const emitter = buildEmitter();
  const received = [];
  emitter.on("event", (data) => received.push(data));
  emitter.emit("event", { number: 1 });
  emitter.emit("event", { number: 2 });
  assert.deepStrictEqual(received, [{ number: 1 }, { number: 2 }]);
});

test("listeners on one event are not called for another event", () => {
  const emitter = buildEmitter();
  const received = [];
  emitter.on("log", () => received.push("log"));
  emitter.on("play", () => received.push("play"));
  emitter.emit("log");
  assert.deepStrictEqual(received, ["log"]);
});

test("emit for an event with no listeners is a no-op", () => {
  const emitter = buildEmitter();
  assert.doesNotThrow(() => emitter.emit("unknown", "data"));
});

test("off removes only the matching listener", () => {
  const emitter = buildEmitter();
  const received = [];
  const listenerA = () => received.push("a");
  const listenerB = () => received.push("b");
  emitter.on("log", listenerA);
  emitter.on("log", listenerB);
  emitter.off("log", listenerA);
  emitter.emit("log", "x");
  assert.deepStrictEqual(received, ["b"]);
});

test("off for a listener that was never registered is a no-op", () => {
  const emitter = buildEmitter();
  assert.doesNotThrow(() => emitter.off("log", () => {}));
  assert.doesNotThrow(() => emitter.off("unknown", () => {}));
});

test("a listener removed with off can be re-registered with on", () => {
  const emitter = buildEmitter();
  const received = [];
  const listener = (data) => received.push(data);
  emitter.on("log", listener);
  emitter.off("log", listener);
  emitter.on("log", listener);
  emitter.emit("log", "again");
  assert.deepStrictEqual(received, ["again"]);
});
