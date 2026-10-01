const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;

eval(fs.readFileSync(path.join(__dirname, "..", "lib", "player.js"), "utf8"));

// ---------------------------------------------------------------------------
// Minimal mock media stack for the real BufferManager append pipeline.
//
// The spliced playout is the exact 3-range main->ad->main scenario that the
// buffering-cursor bug (Bug B / splice spinner 2a) reproduces: three ranges
// of three segments each, single codec, no codec change / no reinit. The main
// clip and the ad clip both number their segments locally as 0,1,2, so they
// collide at different *global* indexes in the flattened `_segments` map. A
// cursor advanced by the representation-local `getNumber() + 1` rewinds at the
// first ad segment and stalls in a main->ad->main loop; the object-identity
// cursor walks straight through to `ended`.
// ---------------------------------------------------------------------------

const CODEC = 'video/mp4; codecs="avc1.64002A"';
const INIT_URL = "__INIT__";

function makeSegment(localNumber, repNumber, manifestIndex, url) {
  return {
    _local: localNumber,
    _rep: repNumber,
    _mani: manifestIndex,
    _url: url,
    startTime: 0,
    endTime: 0,
    getNumber: () => localNumber,
    getRepresentationNumber: () => repNumber,
    getPeriodNumber: () => 0,
    getManifestIndex: () => manifestIndex,
    getDuration: () => 4,
    getUrl: () => url,
    getChunks: () => [],
    getInitSegmentUrl: () => INIT_URL,
    getTimestampOffset: () => 0,
    copy: function () {
      return makeSegment(localNumber, repNumber, manifestIndex, url);
    },
    setTimestampOffset: () => {},
    setManifestIndex: () => {},
  };
}

function makeRepresentation(number, manifestIndex, segments) {
  return {
    _segments: segments,
    getNumber: () => number,
    getManifestIndex: () => manifestIndex,
    getPeriodNumber: () => 0,
    getMimeCodec: () => CODEC,
    getTotalSegmentsCount: () => segments.length,
    getSegment: (i) => segments[i],
  };
}

function makeManifest(manifestIndex, segments) {
  const rep = makeRepresentation(0, manifestIndex, segments);
  return {
    getRepresentation: () => rep,
    getPeriods: () => ({ "0": [rep] }),
  };
}

// Build a 3-range spliced playout: main clip part 1 (segments labeled m1-N),
// ad clip (ad-N), main clip part 2 (m2-N). The label records MANIFEST + LOCAL
// segment number, so duplicate local numbers across ranges are distinguishable.
// The manifestIndex is the array position (0,1,2); the GLOBAL buffer offset
// (0,3,6) is applied separately by runSplicedPlayout via setSegments.
function buildSplicedPlayout() {
  const manifests = [];
  const prefixes = ["m1", "ad", "m2"];
  for (let manifestIndex = 0; manifestIndex < prefixes.length; manifestIndex++) {
    const segments = [0, 1, 2].map((local) =>
      makeSegment(local, 0, manifestIndex, `${prefixes[manifestIndex]}-${local}`),
    );
    manifests.push(makeManifest(manifestIndex, segments));
  }
  return manifests;
}

function makeVideo() {
  return {
    currentTime: 0,
    error: null,
    duration: 0,
    buffered: { length: 0, start: () => 0, end: () => 0 },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

function makeMediaSource() {
  const sourceBuffer = {
    updating: false,
    timestampOffset: 0,
    buffered: { length: 0, start: () => 0, end: () => 0 },
    listeners: {},
    appendBuffer: () => {},
    remove: () => {},
    changeType: () => {},
    addEventListener: (name, cb) => {
      (sourceBuffer.listeners[name] = sourceBuffer.listeners[name] || []).push(
        cb,
      );
    },
    removeEventListener: () => {},
  };
  return {
    duration: undefined,
    addEventListener: () => {},
    addSourceBuffer: () => sourceBuffer,
    _sourceBuffer: sourceBuffer,
  };
}

// XMLHttpRequest stand-in that records every fetched URL. The player's
// BufferManager resolves segment/init fetches through it.
function installXhrRecorder() {
  const urls = [];
  class MockXHR {
    open(method, url, async) {
      this.url = url;
      urls.push(url);
    }
    send() {
      this.status = 200;
      this.response = new Uint8Array([1, 2, 3, 4]).buffer;
      // A real XHR fires `load` asynchronously (the player assigns `xhr.onload`
      // right after calling `send()`), so defer the callback.
      setImmediate(() => {
        if (this.onload) this.onload();
      });
    }
    addEventListener() {}
  }
  global.XMLHttpRequest = MockXHR;
  return urls;
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

// Drive the real BufferManager append pipeline over the spliced playout until
// every segment has been buffered (or the cursor loop never terminates).
async function runSplicedPlayout() {
  const manifests = buildSplicedPlayout();
  const mediaSource = makeMediaSource();
  const video = makeVideo();
  const logger = { error: () => {}, info: () => {}, debug: () => {} };
  const bufferManager = new BufferManager(manifests, mediaSource, video, {
    logger,
  });

  // Load the three ranges into the flattened global `_segments` map, with each
  // range landing at a distinct global base offset (0, 3, 6).
  let bufferOffset = 0;
  for (let i = 0; i < manifests.length; i++) {
    await bufferManager.setSegments({
      representationNumber: 0,
      startSegment: 0,
      endSegment: 2,
      periodNumber: 0,
      bufferOffset,
      manifestIndex: i,
    });
    bufferOffset += 3;
  }

  await new Promise((resolve) => {
    bufferManager.on("onAllSegmentsLoaded", resolve);
    bufferManager.startBuffering();
  });
  await flush();

  return { bufferManager, mediaSource };
}

test("buffering cursor walks the spliced main->ad->main playout in order with no rewind", async () => {
  const urls = installXhrRecorder();
  const { bufferManager } = await runSplicedPlayout();

  const mediaUrls = urls.filter((u) => u !== INIT_URL);

  // All nine segments buffered, in true playout (global) order. The ad clip's
  // local 0 must land after the main clip's local 2, and the playout must
  // reach the last main range rather than rewinding into the ad clip.
  assert.deepStrictEqual(mediaUrls, [
    "m1-0",
    "m1-1",
    "m1-2",
    "ad-0",
    "ad-1",
    "ad-2",
    "m2-0",
    "m2-1",
    "m2-2",
  ]);

  // And the buffer manager must report that playback buffered through to the
  // end (the `ended`-reaching condition) — no stall on the cursor loop.
  assert.strictEqual(bufferManager.hasLoadedAllSegments(), true);
});

