const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;

// The template's assertion helper, as provided by the test harness in the
// browser. WaitingStateSubTest calls it with (value, message); it is recorded
// rather than thrown so the discarded promise returned by the subtest's
// .then() never rejects.
const assertTrueCalls = [];
global.assert_true = (value, message) => {
  assertTrueCalls.push({ value, message });
  return value;
};

function resetAssertions() {
  assertTrueCalls.length = 0;
}

eval(
  fs.readFileSync(
    path.join(__dirname, "..", "lib", "waiting-state-subtest.js"),
    "utf8"
  )
);

function mockVideo() {
  const handlers = {};
  return {
    addEventListener: (event, handler) => {
      (handlers[event] = handlers[event] || []).push(handler);
    },
    fire(event) {
      (handlers[event] || []).forEach((handler) => handler());
    },
  };
}

function mockAsyncTest() {
  const registered = [];
  return {
    registered,
    asyncTest(callback, name) {
      registered.push({ callback, name });
    },
  };
}

function mockSubtest() {
  const subtest = {
    message: null,
    doneCount: 0,
    step_func(fn) {
      return () => fn();
    },
    done() {
      subtest.doneCount++;
    },
  };
  return subtest;
}

// Invokes the registered asyncTest callback the way the harness does when the
// test's executeTest runs, creating the subtest's promise. Returns the mock
// subtest the template's assertion will run against.
function activate(asyncTestMock) {
  assert.strictEqual(asyncTestMock.registered.length, 1);
  const subtest = mockSubtest();
  asyncTestMock.registered[0].callback(subtest);
  return subtest;
}

// Lets the subtest's promise fulfillment (the template's assertion) run.
async function flush() {
  await new Promise(setImmediate);
}

test("registers exactly one async subtest named after the limit", () => {
  const video = mockVideo();
  const asyncTest = mockAsyncTest();
  new WaitingStateSubTest(video, 4, asyncTest.asyncTest).start();
  assert.strictEqual(asyncTest.registered.length, 1);
  assert.strictEqual(
    asyncTest.registered[0].name,
    "waiting states count should not exceed 4"
  );
});

test("counts waiting events and reports the count against the limit on ended", async () => {
  const video = mockVideo();
  const asyncTest = mockAsyncTest();
  new WaitingStateSubTest(video, 4, asyncTest.asyncTest).start();
  const subtest = activate(asyncTest);

  video.fire("waiting");
  video.fire("waiting");
  video.fire("waiting");
  video.fire("ended");
  await flush();

  assert.strictEqual(subtest.message, "waiting states count: 3 (limit 4)");
  assert.strictEqual(subtest.doneCount, 1);
});

test("zero waiting events still resolves on ended with count 0", async () => {
  const video = mockVideo();
  const asyncTest = mockAsyncTest();
  new WaitingStateSubTest(video, 4, asyncTest.asyncTest).start();
  const subtest = activate(asyncTest);

  video.fire("ended");
  await flush();

  assert.strictEqual(subtest.message, "waiting states count: 0 (limit 4)");
  assert.strictEqual(subtest.doneCount, 1);
});

test("asserts false when the waiting count exceeds the limit", async () => {
  resetAssertions();
  const video = mockVideo();
  const asyncTest = mockAsyncTest();
  new WaitingStateSubTest(video, 2, asyncTest.asyncTest).start();
  activate(asyncTest);

  video.fire("waiting");
  video.fire("waiting");
  video.fire("waiting");
  video.fire("ended");
  await flush();

  assert.strictEqual(assertTrueCalls.length, 1);
  assert.strictEqual(assertTrueCalls[0].value, false);
  assert.strictEqual(
    assertTrueCalls[0].message,
    "waiting states count: 3 (limit 2)"
  );
});

test("asserts true when the waiting count is within the limit", async () => {
  resetAssertions();
  const video = mockVideo();
  const asyncTest = mockAsyncTest();
  new WaitingStateSubTest(video, 4, asyncTest.asyncTest).start();
  activate(asyncTest);

  video.fire("waiting");
  video.fire("ended");
  await flush();

  assert.strictEqual(assertTrueCalls.length, 1);
  assert.strictEqual(assertTrueCalls[0].value, true);
});

test("start() is idempotent — waiting events are not double-counted", async () => {
  const video = mockVideo();
  const asyncTest = mockAsyncTest();
  const subTest = new WaitingStateSubTest(video, 4, asyncTest.asyncTest);

  subTest.start();
  subTest.start();
  subTest.start();

  const subtest = activate(asyncTest);
  video.fire("waiting");
  video.fire("ended");
  await flush();

  assert.strictEqual(subtest.message, "waiting states count: 1 (limit 4)");
  assert.strictEqual(subtest.doneCount, 1);
});

test("finish() resolves the subtest without needing ended", async () => {
  const video = mockVideo();
  const asyncTest = mockAsyncTest();
  const subTest = new WaitingStateSubTest(video, 4, asyncTest.asyncTest);
  subTest.start();
  const subtest = activate(asyncTest);

  video.fire("waiting");
  subTest.finish();
  await flush();

  assert.strictEqual(subtest.message, "waiting states count: 1 (limit 4)");
  assert.strictEqual(subtest.doneCount, 1);
});

test("finish() before the subtest is activated is a no-op", () => {
  const video = mockVideo();
  const asyncTest = mockAsyncTest();
  const subTest = new WaitingStateSubTest(video, 4, asyncTest.asyncTest);
  subTest.start();

  video.fire("waiting");
  // resolveWaitingStateSubTest is only set once the harness invokes the
  // asyncTest callback; finishing before that must not throw.
  assert.doesNotThrow(() => subTest.finish());
});

test("finish() after ended does not complete the subtest twice", async () => {
  const video = mockVideo();
  const asyncTest = mockAsyncTest();
  const subTest = new WaitingStateSubTest(video, 4, asyncTest.asyncTest);
  subTest.start();
  const subtest = activate(asyncTest);

  video.fire("ended");
  await flush();
  subTest.finish();
  await flush();

  assert.strictEqual(subtest.doneCount, 1);
});
