const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;

// lib/wave-service.js ends with `var WaveService = new WaveService();`, so
// after each eval the WaveService binding is the singleton instance built
// against whatever mocks are in place. Each test re-evals the file to get a
// fresh instance with a fresh location and XHR mock.

function mockXHRClass() {
  class MockXHR {
    constructor() {
      MockXHR.instances.push(this);
      this.status = 0;
      this.readyState = 4;
      this.DONE = 4;
      this.response = null;
      this.responseText = null;
      this.onload = null;
      this.onerror = null;
      this.headers = {};
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(header, value) {
      this.headers[header] = value;
    }
    send(data) {
      this.body = data;
    }
    respond(status, response) {
      this.status = status;
      this.response = response;
      if (this.onload) this.onload();
    }
    fail() {
      if (this.onerror) this.onerror();
    }
  }
  MockXHR.instances = [];
  return MockXHR;
}

function loadWaveService(search) {
  window.location = { search: search || "" };
  const MockXHR = mockXHRClass();
  window.XMLHttpRequest = MockXHR;
  // A previous test's onpopstate accessor may still be installed on the shared
  // window; remove it before re-installing.
  delete window.onpopstate;
  const onpopstates = [];
  Object.defineProperty(window, "onpopstate", {
    configurable: true,
    set(fn) {
      onpopstates.push(fn);
      fn();
    },
    get() {
      return onpopstates[onpopstates.length - 1];
    },
  });

  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "wave-service.js"), "utf8");
  // Eval inside a Function so the trailing `var WaveService = new WaveService()`
  // lands on this Function's scope, not the test module's; the instance is
  // returned explicitly.
  const factory = new Function(
    "window",
    "XMLHttpRequest",
    src +
      "\n;return { waveService: WaveService, constructorRef: window.onpopstate };"
  );
  const { waveService } = factory(window, MockXHR);
  return { waveService, MockXHR };
}

function lastRequest(MockXHR) {
  return MockXHR.instances[MockXHR.instances.length - 1];
}

test("sendLogs posts the test path and logs as JSON to the logs endpoint", async () => {
  const { waveService, MockXHR } = loadWaveService("?web_root=%2Fwave/");
  const promise = waveService.sendLogs("token-1", "/group/test__t1.html", [
    "[INF] a log",
  ]);

  const xhr = lastRequest(MockXHR);
  assert.strictEqual(xhr.method, "POST");
  assert.strictEqual(xhr.url, "/wave/api/tests/token-1/logs");
  assert.deepStrictEqual(JSON.parse(xhr.body), {
    test: "/group/test__t1.html",
    logs: ["[INF] a log"],
  });

  xhr.respond(200);
  await promise;
});

test("sendLogs with no logs sends an empty list", async () => {
  const { waveService, MockXHR } = loadWaveService("?web_root=%2Fwave/");
  const promise = waveService.sendLogs("token-1", "/group/test__t1.html");

  const xhr = lastRequest(MockXHR);
  assert.deepStrictEqual(JSON.parse(xhr.body), {
    test: "/group/test__t1.html",
    logs: [],
  });

  xhr.respond(200);
  await promise;
});

test("sendLogs resolves with the status on a non-200 response", async () => {
  const { waveService, MockXHR } = loadWaveService("?web_root=%2Fwave/");
  const promise = waveService.sendLogs("token-1", "/group/test__t1.html", []);
  lastRequest(MockXHR).respond(500, "server error");
  assert.strictEqual(await promise, 500);
});

test("sendSessionEvent posts the event as JSON to the session events endpoint", async () => {
  const { waveService, MockXHR } = loadWaveService("?web_root=%2Fwave/");
  const promise = waveService.sendSessionEvent("token-1", "state", "playing");

  const xhr = lastRequest(MockXHR);
  assert.strictEqual(xhr.method, "POST");
  assert.strictEqual(xhr.url, "/wave/api/sessions/token-1/events");
  assert.deepStrictEqual(JSON.parse(xhr.body), {
    type: "state",
    data: "playing",
  });

  xhr.respond(200);
  await promise;
});

test("sendSessionEvent defaults missing type and data to null", async () => {
  const { waveService, MockXHR } = loadWaveService("?web_root=%2Fwave/");
  const promise = waveService.sendSessionEvent("token-1");

  assert.deepStrictEqual(JSON.parse(lastRequest(MockXHR).body), {
    type: null,
    data: null,
  });

  lastRequest(MockXHR).respond(200);
  await promise;
});

test("uses web_root from the URL params verbatim as the request prefix", () => {
  // web_root is not normalized: the slash handling in initialize() writes to a
  // local shadow variable, so the request URL is web_root + uri as-is.
  const { waveService, MockXHR } = loadWaveService("?web_root=wave");
  const promise = waveService.sendLogs("token-1", "/group/test__t1.html", []);
  assert.strictEqual(
    lastRequest(MockXHR).url,
    "waveapi/tests/token-1/logs"
  );
  lastRequest(MockXHR).respond(200);
  return promise;
});

test("initialize resolves when the wave config returns 200", async () => {
  const { waveService, MockXHR } = loadWaveService("?web_root=%2Fwave");
  const promise = waveService.initialize("/api/wave-config");

  const xhr = lastRequest(MockXHR);
  assert.strictEqual(xhr.method, "GET");
  assert.strictEqual(xhr.url, "/wave/api/wave-config");
  xhr.respond(200, JSON.stringify({ web_root: "/wave" }));
  assert.strictEqual(await promise, undefined);
});

test("initialize resolves with the error when the wave config fails", async () => {
  const { waveService, MockXHR } = loadWaveService("?web_root=%2Fwave/");
  const promise = waveService.initialize("/api/wave-config");
  lastRequest(MockXHR).respond(404, "not found");
  assert.strictEqual(await promise, 404);
});

test("addSessionEventListener polls the session events endpoint and dispatches events", async () => {
  const { waveService, MockXHR } = loadWaveService("?web_root=%2Fwave/");
  const received = [];
  waveService.addSessionEventListener("token-1", (event) => received.push(event));

  const poll = lastRequest(MockXHR);
  assert.strictEqual(poll.method, "GET");
  // listenHttpPolling appends a unique cache-busting id.
  assert.match(poll.url, /^\/wave\/api\/sessions\/token-1\/events\?id=\d+$/);
  poll.respond(200, JSON.stringify([{ number: 1, type: "state", data: "x" }]));

  assert.deepStrictEqual(received, [{ number: 1, type: "state", data: "x" }]);
});

test("subsequent polls request only events after the last seen number", () => {
  const { waveService, MockXHR } = loadWaveService("?web_root=%2Fwave/");
  waveService.addSessionEventListener("token-1", () => {});

  MockXHR.instances[0].respond(
    200,
    JSON.stringify([{ number: 5, type: "state" }])
  );

  const nextPoll = lastRequest(MockXHR);
  assert.strictEqual(nextPoll, MockXHR.instances[1]);
  assert.match(nextPoll.url, /last_event=5/);
});

test("removeSessionEventListener stops the listener from receiving events", () => {
  const { waveService, MockXHR } = loadWaveService("?web_root=%2Fwave/");
  const received = [];
  const callback = (event) => received.push(event);
  waveService.addSessionEventListener("token-1", callback);
  waveService.removeSessionEventListener(callback);

  MockXHR.instances[0].respond(
    200,
    JSON.stringify([{ number: 1, type: "state" }])
  );

  assert.deepStrictEqual(received, []);
});

test("the same callback is not registered twice for one token", () => {
  const { waveService, MockXHR } = loadWaveService("?web_root=%2Fwave/");
  const callback = () => {};
  waveService.addSessionEventListener("token-1", callback);
  waveService.addSessionEventListener("token-1", callback);

  MockXHR.instances[0].respond(
    200,
    JSON.stringify([{ number: 1, type: "state" }])
  );

  // One listener, one event dispatch — the second registration is ignored.
  assert.strictEqual(lastRequest(MockXHR), MockXHR.instances[1]);
});
