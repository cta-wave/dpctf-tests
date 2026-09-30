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

function initDataText(initData) {
  return String.fromCharCode.apply(null, new Uint8Array(initData));
}

// Configurable mock EME.
// - options.failGenerate: boolean, or a function (initData) -> boolean deciding
//   per-key failure.
// - options.generateError: Error, or a function (initData) -> Error.
// - Exposes mediaKeys.sessions so tests can inspect/fire keystatuseschange.
function buildMockEme(record, options) {
  options = options || {};
  const setMediaKeysDeferred = deferred();
  const mediaKeys = {
    sessions: [],
    createSession: () => {
      record.push("createSession");
      const session = {
        listeners: {},
        keyStatuses: { current: "status-pending", forEach: () => {} },
        addEventListener: (name, cb) => {
          session.listeners[name] = cb;
        },
        fireStatus: (status) => {
          session.keyStatuses.current = status;
          session.keyStatuses.forEach = (cb) => cb(status, "kid");
          if (session.listeners.keystatuseschange) {
            session.listeners.keystatuseschange({ target: session });
          }
        },
        generateRequest: (type, initData) => {
          record.push("generateRequest");
          // Reproduce the real-world race: the session reports itself usable
          // via keystatuseschange, yet the generateRequest promise still
          // rejects afterwards. This used to cause a false give-up even
          // though the key was usable.
          const failAfterUsable =
            typeof options.failGenerateAfterUsable === "function"
              ? options.failGenerateAfterUsable(initData)
              : !!options.failGenerateAfterUsable;
          if (failAfterUsable) {
            const error =
              typeof options.generateError === "function"
                ? options.generateError(initData)
                : options.generateError;
            return Promise.resolve().then(() => {
              session.fireStatus("usable");
              throw error || new Error("generate failed after usable");
            });
          }
          const shouldFail =
            typeof options.failGenerate === "function"
              ? options.failGenerate(initData)
              : !!options.failGenerate;
          if (shouldFail) {
            const error =
              typeof options.generateError === "function"
                ? options.generateError(initData)
                : options.generateError;
            return Promise.resolve().then(() => {
              throw error || new Error("generate failed");
            });
          }
          return Promise.resolve().then(() => {
            session.fireStatus("usable");
          });
        },
        fireMessage: (messageBytes) => {
          if (session.listeners.message) {
            session.listeners.message({ target: session, message: messageBytes });
          }
        },
        update: (data) => {
          record.push("update");
          if (options.failUpdate) {
            const e = options.failUpdateError || new Error("license exchange failed");
            return Promise.reject(e);
          }
          return Promise.resolve();
        },
      };
      mediaKeys.sessions.push(session);
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

  // Association work happens, but no CDM session work runs while setMediaKeys
  // is still pending (the "attaching operation" window).
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

test("distinct keys each get their own session after association", async () => {
  const record = [];
  const mockEme = buildMockEme(record);
  const video = buildMockVideo(record, mockEme.setMediaKeysDeferred);
  const player = buildPlayer(video);

  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  player.setProtectionData({ keyId: "key2", contentKey: "secret" });
  player.setProtectionData({ keyId: "key3", contentKey: "secret" });
  await flush();

  // All jobs queue behind one association gate; no session work yet.
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
    "createSession",
    "generateRequest",
    "createSession",
    "generateRequest",
  ]);
});

test("repeating the same key while processing is deduped (one in flight)", async () => {
  const record = [];
  const mockEme = buildMockEme(record);
  const video = buildMockVideo(record, mockEme.setMediaKeysDeferred);
  const player = buildPlayer(video);

  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  await flush();

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

test("a usable key is reused without a second session-init", async () => {
  const record = [];
  const mockEme = buildMockEme(record);
  const video = buildMockVideo(record, mockEme.setMediaKeysDeferred);
  const player = buildPlayer(video);

  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  await flush();
  mockEme.setMediaKeysDeferred.resolve();
  await flush();

  // First session became usable (mock fires keystatuseschange).
  assert.strictEqual(mockEme.mediaKeys.sessions[0].keyStatuses.current, "usable");

  // Re-encountering the same key reuses the session: no new session-init.
  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  await flush();

  assert.deepStrictEqual(record, [
    "requestMediaKeySystemAccess",
    "createMediaKeys",
    "setMediaKeys",
    "createSession",
    "generateRequest",
  ]);
});

test("a failing key surfaces the real error but does not give up under cap", async () => {
  const record = [];
  const errors = [];
  const logger = {
    error: (msg) => errors.push(msg),
    info: () => {},
    debug: () => {},
    warn: () => {},
  };
  const mockEme = buildMockEme(record, {
    failGenerate: true,
    generateError: new Error("bogus license failure"),
  });
  const video = buildMockVideo(record, mockEme.setMediaKeysDeferred);
  const player = buildPlayer(video, logger);
  let encryptionError = null;
  player.on("onEncryptionError", (payload) => {
    encryptionError = payload;
  });

  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  await flush();
  mockEme.setMediaKeysDeferred.resolve();
  await flush();

  // First failure -> under cap -> no give-up yet, and no onEncryptionError.
  assert.strictEqual(encryptionError, null);
  assert.ok(
    errors.some((msg) => msg.indexOf("bogus license failure") !== -1),
    "real error message should be logged",
  );
  // AC2: the stack is routed through to the logger, not just the message.
  assert.ok(
    errors.some(
      (msg) => msg.indexOf("bogus license failure") !== -1 && msg.indexOf("\n") !== -1,
    ),
    "real error stack should be logged with the message",
  );

  // Re-encountering the key drives the second (and final) part of the cap.
  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  await flush();

  // Cap exhausted -> gave-up -> onEncryptionError emitted.
  assert.ok(encryptionError, "onEncryptionError should fire after cap");
  assert.strictEqual(encryptionError.keyId, "key1");
  assert.match(encryptionError.error.message, /bogus license failure/);
  assert.ok(
    errors.some((msg) => msg.indexOf("gave up after 2 attempts") !== -1),
    "should log give-up after the second attempt",
  );
});

test("a key that turns usable is never given up on, even if generateRequest rejects after firing usable (race)", async () => {
  const record = [];
  const errors = [];
  const logger = {
    error: (msg) => errors.push(msg),
    info: () => {},
    debug: () => {},
    warn: () => {},
  };
  const mockEme = buildMockEme(record, {
    failGenerateAfterUsable: true,
    generateError: new Error("stale generateRequest rejection"),
  });
  const video = buildMockVideo(record, mockEme.setMediaKeysDeferred);
  const player = buildPlayer(video, logger);
  let encryptionError = null;
  player.on("onEncryptionError", (payload) => {
    encryptionError = payload;
  });

  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  await flush();
  mockEme.setMediaKeysDeferred.resolve();
  await flush();

  // The session fired usable even though generateRequest rejects. No
  // give-up, no onEncryptionError, no attempt counted against the cap.
  assert.strictEqual(mockEme.mediaKeys.sessions[0].keyStatuses.current, "usable");
  assert.strictEqual(encryptionError, null);
  assert.ok(
    !errors.some((msg) => msg.indexOf("gave up") !== -1),
    "must not give up on a usable key despite the stale rejection",
  );

  // Re-encountering the key reuses the usable session: no new session-init,
  // and certainly no false give-up even though it rejects again.
  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  await flush();

  assert.deepStrictEqual(record, [
    "requestMediaKeySystemAccess",
    "createMediaKeys",
    "setMediaKeys",
    "createSession",
    "generateRequest",
  ]);
  assert.strictEqual(encryptionError, null);
  assert.ok(
    !errors.some((msg) => msg.indexOf("gave up") !== -1),
    "usable key must remain usable and never reach gave-up",
  );
});

test("give-up on one key does not poison another key", async () => {
  const record = [];
  const errors = [];
  const logger = {
    error: (msg) => errors.push(msg),
    info: () => {},
    debug: () => {},
    warn: () => {},
  };
  // Only the key whose initData mentions "key1" fails; key2 works.
  const mockEme = buildMockEme(record, {
    failGenerate: (initData) => initDataText(initData).indexOf("key1") !== -1,
    generateError: new Error("key1 broken"),
  });
  const video = buildMockVideo(record, mockEme.setMediaKeysDeferred);
  const player = buildPlayer(video, logger);
  let erroredKey = null;
  player.on("onEncryptionError", (payload) => {
    erroredKey = payload.keyId;
  });

  // Drive key1 through its cap (attempt 1 then attempt 2 -> gave-up).
  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  await flush();
  mockEme.setMediaKeysDeferred.resolve();
  await flush();
  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  await flush();

  assert.strictEqual(erroredKey, "key1", "key1 should surface the error");

  // A distinct key2 must still work (no cross-key poison).
  player.setProtectionData({ keyId: "key2", contentKey: "secret" });
  await flush();

  const key2Sessions = mockEme.mediaKeys.sessions.filter(
    (s) => s.keyStatuses.current === "usable",
  );
  assert.ok(key2Sessions.length >= 1, "key2 should still get a usable session");
  assert.strictEqual(erroredKey, "key1", "key2 success must not re-emit error");
});

test("setMediaKeys rejection is logged once and stops session-init", async () => {
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

test("a rejected ClearKey update() is surfaced via the logger only (no cap, no onEncryptionError)", async () => {
  const record = [];
  const errors = [];
  const logger = {
    error: (msg) => errors.push(msg),
    info: () => {},
    debug: () => {},
    warn: () => {},
  };
  const mockEme = buildMockEme(record, {
    failUpdate: true,
    failUpdateError: new Error("license exchange rejected"),
  });
  const video = buildMockVideo(record, mockEme.setMediaKeysDeferred);
  const player = buildPlayer(video, logger);
  let encryptionError = null;
  player.on("onEncryptionError", (payload) => {
    encryptionError = payload;
  });

  // Drive a key session to the point where the ClearKey license exchange
  // (update()) runs and rejects.
  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  await flush();
  mockEme.setMediaKeysDeferred.resolve();
  await flush();

  const session = mockEme.mediaKeys.sessions[0];
  // Fire a license-request "message" event so licenseRequestReady calls
  // update() with a fake ClearKey JWK license request.
  const message = String.fromCharCode
    .apply(null, [123, 34, 107, 105, 100, 115, 34, 58, 91, 34, 107, 105, 100, 49, 34, 93, 125]) // {"kids":["kid1"]}
    .split("")
    .map((c) => c.charCodeAt(0));
  session.fireMessage(new Uint8Array(message));
  await flush();

  // Surfaced via the logger (with the real error), not swallowed and not
  // routed to raw console.error.
  assert.ok(
    errors.some((msg) => msg.indexOf("license exchange rejected") !== -1),
    "rejected update() should be logged with its real error",
  );
  assert.ok(
    errors.some((msg) => msg.indexOf("update") !== -1),
    "log should mention the update()/license exchange step",
  );

  // Not counted against the retry cap: re-encountering the key reuses the
  // session (no new createSession) and never gives up / emits the error.
  player.setProtectionData({ keyId: "key1", contentKey: "secret" });
  await flush();

  const sessionInits = record.filter(
    (r) => r === "createSession" || r === "generateRequest",
  );
  assert.strictEqual(sessionInits.length, 2, "only one session-init for the key");
  assert.strictEqual(
    errors.filter((m) => m.indexOf("gave up") !== -1).length,
    0,
    "update() failure must not count against the retry cap",
  );
  assert.strictEqual(encryptionError, null, "no onEncryptionError for update() failure");
});
