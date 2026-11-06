const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;

eval(
  fs.readFileSync(
    path.join(__dirname, "..", "lib", "dpctf-testharness.js"),
    "utf8"
  )
);

function mockManifest(mimeCodecs) {
  return {
    getRepresentations: () =>
      mimeCodecs.map((mimeCodec) => ({ getMimeCodec: () => mimeCodec })),
  };
}

test("checkMseSupport does not throw when MediaSource exists", () => {
  window.MediaSource = {};
  assert.doesNotThrow(() => checkMseSupport());
});

test("checkMseSupport throws when MediaSource is missing", () => {
  const hadMediaSource = delete window.MediaSource;
  try {
    assert.throws(() => checkMseSupport(), /Media Source Extensions API not supported/);
  } finally {
    if (hadMediaSource) window.MediaSource = {};
  }
});

test("checkMimeAndCodecSupport does not throw when all codecs are supported", () => {
  window.MediaSource = { isTypeSupported: () => true };
  assert.doesNotThrow(() =>
    checkMimeAndCodecSupport(mockManifest(['video/mp4; codecs="avc1"', 'audio/mp4; codecs="mp4a"']))
  );
});

test("checkMimeAndCodecSupport does nothing for a missing manifest", () => {
  window.MediaSource = { isTypeSupported: () => false };
  assert.doesNotThrow(() => checkMimeAndCodecSupport(undefined));
  assert.doesNotThrow(() => checkMimeAndCodecSupport(null));
});

test("checkMimeAndCodecSupport throws listing every unsupported mime codec", () => {
  window.MediaSource = {
    isTypeSupported: (mime) => mime.includes("avc1"),
  };
  assert.throws(
    () =>
      checkMimeAndCodecSupport(
        mockManifest([
          'video/mp4; codecs="avc1.640028"',
          'audio/mp4; codecs="mp4a.40.2"',
        ])
      ),
    (error) => {
      assert.match(error.message, /Unsupported MIME types or codecs/);
      assert.match(error.message, /audio\/mp4; codecs="mp4a\.40\.2"/);
      assert.doesNotMatch(error.message, /avc1\.640028 \|/);
      return true;
    }
  );
});

test("getUrlParams decodes URL params from the location search", () => {
  window.location = { search: "?web_root=%2Fwave&min_buffer_duration=100" };
  const params = getUrlParams();
  assert.strictEqual(params.web_root, "/wave");
  assert.strictEqual(params.min_buffer_duration, "100");
});

test("getUrlParams decodes + as space", () => {
  window.location = { search: "?duration=PT8S&label=a+b" };
  const params = getUrlParams();
  assert.strictEqual(params.label, "a b");
});

test("getUrlParams returns an empty object for a missing search", () => {
  window.location = { search: "" };
  assert.deepStrictEqual(getUrlParams(), {});
});
