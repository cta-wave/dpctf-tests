const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;

eval(fs.readFileSync(path.join(__dirname, "..", "lib", "player.js"), "utf8"));

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

async function runSplicedPlayout() {
  const manifests = buildSplicedPlayout();
  const mediaSource = makeMediaSource();
  const video = makeVideo();
  const logger = { error: () => {}, info: () => {}, debug: () => {} };
  const bufferManager = new BufferManager(manifests, mediaSource, video, {
    logger,
  });

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

  assert.strictEqual(bufferManager.hasLoadedAllSegments(), true);
});

