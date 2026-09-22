const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;
global.navigator = global.navigator || {};

eval(fs.readFileSync(path.join(__dirname, "..", "lib", "player.js"), "utf8"));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function buildMockEme(record) {
  const setMediaKeysDeferred = deferred();
  const mediaKeys = {
    createSession: () => {
      record.push("createSession");
      const session = {
        addEventListener: () => {},
        keyStatuses: { forEach: () => {} },
        generateRequest: () => {
          record.push("generateRequest");
          return Promise.resolve();
        },
        update: () => Promise.resolve(),
      };
      return session;
    },
  };
  const keySystemAccess = {
    createMediaKeys: () => {
      record.push("createMediaKeys");
      return Promise.resolve(mediaKeys);
    },
  };
  navigator.requestMediaKeySystemAccess = () => {
    record.push("requestMediaKeySystemAccess");
    return Promise.resolve(keySystemAccess);
  };
  return { mediaKeys, setMediaKeysDeferred };
}

function buildMockVideo(record, setMediaKeysDeferred) {
  return {
    onerror: null,
    currentTime: 0,
    playbackRate: 1.0,
    src: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    play: () => Promise.resolve(),
    pause: () => {},
    setMediaKeys: () => {
      record.push("setMediaKeys");
      return setMediaKeysDeferred.promise;
    },
  };
}

function buildPlayer(video, logger) {
  const options = {
    logger: logger || {
      error: () => {},
      info: () => {},
      debug: () => {},
      warn: () => {},
    },
  };
  return Player(video, options);
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("key session is created only after setMediaKeys resolves", async () => {
  const record = [];
  const mockEme = buildMockEme(record);
  const video = buildMockVideo(record, mockEme.setMediaKeysDeferred);
  const player = buildPlayer(video);

  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  await flush();

  assert.deepStrictEqual(record, [
    "requestMediaKeySystemAccess",
    "createMediaKeys",
    "setMediaKeys",
  ]);

  mockEme.setMediaKeysDeferred.resolve();
  await flush();

  assert.deepStrictEqual(record, [
    "requestMediaKeySystemAccess",
    "createMediaKeys",
    "setMediaKeys",
    "createSession",
    "generateRequest",
  ]);
});

test("encrypted events while setMediaKeys is pending are dropped", async () => {
  const record = [];
  const mockEme = buildMockEme(record);
  const video = buildMockVideo(record, mockEme.setMediaKeysDeferred);
  const player = buildPlayer(video);

  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  await flush();
  player.setProtectionData({ keyId: "key2", contentKey: "secret" });
  player.setProtectionData({ keyId: "key3", contentKey: "secret" });
  await flush();

  assert.deepStrictEqual(record, [
    "requestMediaKeySystemAccess",
    "createMediaKeys",
    "setMediaKeys",
  ]);

  mockEme.setMediaKeysDeferred.resolve();
  await flush();

  assert.deepStrictEqual(record, [
    "requestMediaKeySystemAccess",
    "createMediaKeys",
    "setMediaKeys",
    "createSession",
    "generateRequest",
  ]);
});

test("once associated, a new session is created without re-calling setMediaKeys", async () => {
  const record = [];
  const mockEme = buildMockEme(record);
  const video = buildMockVideo(record, mockEme.setMediaKeysDeferred);
  const player = buildPlayer(video);

  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  await flush();
  mockEme.setMediaKeysDeferred.resolve();
  await flush();

  player.setProtectionData({ keyId: "key2", contentKey: "secret" });
  await flush();

  assert.deepStrictEqual(record, [
    "requestMediaKeySystemAccess",
    "createMediaKeys",
    "setMediaKeys",
    "createSession",
    "generateRequest",
    "createSession",
    "generateRequest",
  ]);
});

test("setMediaKeys rejection is logged once and stops retrying", async () => {
  const record = [];
  const mockEme = buildMockEme(record);
  const video = buildMockVideo(record, mockEme.setMediaKeysDeferred);
  const errors = [];
  const logger = {
    error: (msg) => errors.push(msg),
    info: () => {},
    debug: () => {},
    warn: () => {},
  };
  const player = buildPlayer(video, logger);

  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  await flush();
  mockEme.setMediaKeysDeferred.reject(new Error("association failed"));
  await flush();

  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /association failed/);

  player.setProtectionData({ keyId: "key2", contentKey: "secret" });
  await flush();

  assert.deepStrictEqual(record, [
    "requestMediaKeySystemAccess",
    "createMediaKeys",
    "setMediaKeys",
  ]);
  assert.ok(!record.includes("createSession"));
});
