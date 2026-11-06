const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;

eval(
  fs.readFileSync(
    path.join(__dirname, "..", "lib", "manifest_parser.js"),
    "utf8"
  )
);

function mockXHRClass() {
  class MockXHR {
    constructor() {
      MockXHR.instances.push(this);
      this.status = 0;
      this.readyState = 4;
      this.DONE = 4;
      this.responseText = "";
      this.onload = null;
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    overrideMimeType() {}
    send() {}
    respond(status, responseText) {
      this.status = status;
      this.responseText = responseText;
      if (this.onload) this.onload();
    }
  }
  MockXHR.instances = [];
  return MockXHR;
}

// A parsed-manifest fixture in the shape mpdParser.parse returns. Each
// playlist carries a timeline (the period id), playlist attributes, and
// segments with resolved URIs.
function fixtureParsedManifest() {
  const segment = (i) => ({
    resolvedUri: `video/segment-${i}.m4s`,
    duration: 4,
    map: { resolvedUri: "video/init.mp4" },
    chunks: [],
    timestampOffset: 0,
  });
  return {
    duration: 8,
    playlists: [
      {
        timeline: 0,
        attributes: {
          CODECS: "avc1.640028",
          RESOLUTION: { width: 1920, height: 1080 },
          BANDWIDTH: 5000000,
          NAME: "v0",
        },
        segments: [segment(0), segment(1)],
      },
      {
        timeline: 0,
        attributes: {
          CODECS: "avc1.640029",
          RESOLUTION: { width: 1280, height: 720 },
          BANDWIDTH: 3000000,
          NAME: "v1",
        },
        segments: [segment(0), segment(1)],
      },
    ],
    audioPlaylists: [
      {
        timeline: 1,
        attributes: { CODECS: "mp4a.40.2", BANDWIDTH: 128000 },
        segments: [segment(0), segment(1)],
      },
    ],
  };
}

function setup(mocks = {}) {
  window.mpdParser = {
    parse: () => mocks.parsed || fixtureParsedManifest(),
  };
  window.MediaSource = {
    isTypeSupported: mocks.isTypeSupported || (() => true),
  };
  const MockXHR = mockXHRClass();
  window.XMLHttpRequest = MockXHR;
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (msg) => warnings.push(msg);
  return {
    MockXHR,
    warnings,
    restore: () => {
      console.warn = originalWarn;
    },
  };
}

// Kicks off ManifestParser.parse and returns the promise without awaiting.
// The fetch only settles when the mock XHR's onload fires, so callers must
// call respondOk() before awaiting.
function parse(manifestUrl = "/content/video.mpd", manifestIndex = 0) {
  return ManifestParser.parse(manifestUrl, manifestIndex);
}

function respondOk(MockXHR) {
  MockXHR.instances[0].respond(200, "{}");
}

test("fetchInformation fetches the manifest and parses it with mpdParser", async () => {
  const { MockXHR, restore } = setup();
  try {
    const promise = parse("/content/video.mpd", 2);
    const xhr = MockXHR.instances[0];
    assert.strictEqual(xhr.method, "GET");
    assert.strictEqual(xhr.url, "/content/video.mpd");
    respondOk(MockXHR);
    const manifest = await promise;
    assert.strictEqual(manifest.getDuration(), 8);
  } finally {
    restore();
  }
});

test("fetchInformation rejects on a 404", async () => {
  const { MockXHR, restore } = setup();
  try {
    const promise = parse("/content/missing.mpd", 0);
    MockXHR.instances[0].respond(404, "");
    await assert.rejects(promise, /Could not find manifest/);
  } finally {
    restore();
  }
});

test("video playlists are typed video and audio playlists audio", async () => {
  const { MockXHR, restore } = setup();
  try {
    const promise = parse();
    respondOk(MockXHR);
    const manifest = await promise;
    const representations = manifest.getRepresentations();
    assert.strictEqual(representations.length, 3);
    assert.match(representations[0].getMimeCodec(), /^video\/mp4/);
    assert.match(representations[2].getMimeCodec(), /^audio\/mp4/);
  } finally {
    restore();
  }
});

test("the mime codec carries the playlist's codecs parameter", async () => {
  const { MockXHR, restore } = setup();
  try {
    const promise = parse();
    respondOk(MockXHR);
    const manifest = await promise;
    assert.strictEqual(
      manifest.getRepresentations()[0].getMimeCodec(),
      'video/mp4; codecs="avc1.640028"'
    );
    assert.strictEqual(
      manifest.getRepresentations()[2].getMimeCodec(),
      'audio/mp4; codecs="mp4a.40.2"'
    );
  } finally {
    restore();
  }
});

test("segments are numbered representation-locally, restarting at 0 per playlist", async () => {
  const { MockXHR, restore } = setup();
  try {
    const promise = parse();
    respondOk(MockXHR);
    const manifest = await promise;
    const video = manifest.getRepresentations()[0];
    const audio = manifest.getRepresentations()[2];
    assert.deepStrictEqual(
      video.getSegments().map((s) => s.getNumber()),
      [0, 1]
    );
    assert.deepStrictEqual(
      audio.getSegments().map((s) => s.getNumber()),
      [0, 1]
    );
  } finally {
    restore();
  }
});

test("segments carry their url, duration, init segment, period and manifest index", async () => {
  const { MockXHR, restore } = setup();
  try {
    const promise = parse("/content/video.mpd", 3);
    respondOk(MockXHR);
    const manifest = await promise;
    const segment = manifest.getRepresentations()[0].getSegment(0);
    assert.strictEqual(segment.getUrl(), "video/segment-0.m4s");
    assert.strictEqual(segment.getDuration(), 4);
    assert.strictEqual(segment.getInitSegmentUrl(), "video/init.mp4");
    assert.strictEqual(segment.getPeriodNumber(), 0);
    assert.strictEqual(segment.getManifestIndex(), 3);
    assert.deepStrictEqual(segment.getChunks(), []);
    assert.strictEqual(segment.getTimestampOffset(), 0);
  } finally {
    restore();
  }
});

test("an unsupported codec warns instead of throwing", async () => {
  const { MockXHR, restore, warnings } = setup({
    isTypeSupported: (mime) => !mime.includes("avc1.640029"),
  });
  try {
    const promise = parse();
    respondOk(MockXHR);
    const manifest = await promise;
    const representations = manifest.getRepresentations();
    assert.strictEqual(representations.length, 3);
    assert.match(
      warnings[0],
      /Unsupported MIME type or codec: 'video\/mp4; codecs="avc1.640029"'/
    );
  } finally {
    restore();
  }
});

test("Manifest.getRepresentation looks up by number within a period", async () => {
  const { MockXHR, restore } = setup();
  try {
    const promise = parse();
    respondOk(MockXHR);
    const manifest = await promise;
    const rep = manifest.getRepresentation(1, 0);
    assert.strictEqual(rep.getName(), "v1");
    assert.strictEqual(manifest.getRepresentation(99, 0), null);
    // periodNumber defaults to 0
    assert.strictEqual(manifest.getRepresentation(0).getName(), "v0");
  } finally {
    restore();
  }
});

test("Representation exposes its attributes and segment count", async () => {
  const { MockXHR, restore } = setup();
  try {
    const promise = parse();
    respondOk(MockXHR);
    const manifest = await promise;
    const rep = manifest.getRepresentations()[0];
    assert.strictEqual(rep.getCodecs(), "avc1.640028");
    assert.deepStrictEqual(rep.getResolution(), { width: 1920, height: 1080 });
    assert.strictEqual(rep.getBandwidth(), 5000000);
    assert.strictEqual(rep.getName(), "v0");
    assert.strictEqual(rep.getNumber(), 0);
    assert.strictEqual(rep.getTotalSegmentsCount(), 2);
    assert.strictEqual(rep.getPeriodNumber(), 0);
    assert.strictEqual(rep.getManifestIndex(), 0);
    assert.match(
      rep.toString(),
      /MimeCodec: video\/mp4; codecs="avc1.640028";/
    );
    assert.match(rep.toString(), /TotalSegments: 2;/);
  } finally {
    restore();
  }
});

test("Segment.copy returns an independent segment with the same attributes", async () => {
  const { MockXHR, restore } = setup();
  try {
    const promise = parse();
    respondOk(MockXHR);
    const manifest = await promise;
    const segment = manifest.getRepresentations()[0].getSegment(0);
    const copy = segment.copy();
    assert.notStrictEqual(copy, segment);
    assert.strictEqual(copy.getUrl(), segment.getUrl());
    assert.strictEqual(copy.getNumber(), segment.getNumber());
    assert.strictEqual(
      copy.getRepresentationNumber(),
      segment.getRepresentationNumber()
    );
    copy.setTimestampOffset(12);
    assert.strictEqual(copy.getTimestampOffset(), 12);
    assert.strictEqual(segment.getTimestampOffset(), 0);
  } finally {
    restore();
  }
});

test("sameRepresentationAs compares representation numbers", async () => {
  // sameRepresentationAs reads .representationNumber directly, which Segment
  // instances expose only as a getter (getRepresentationNumber()) — so a
  // Segment argument always compares false. It matches raw attribute objects.
  const { MockXHR, restore } = setup();
  try {
    const promise = parse();
    respondOk(MockXHR);
    const manifest = await promise;
    const segment = manifest.getRepresentations()[0].getSegment(0);
    assert.strictEqual(
      segment.sameRepresentationAs({ representationNumber: 0 }),
      true
    );
    assert.strictEqual(
      segment.sameRepresentationAs({ representationNumber: 1 }),
      false
    );
    assert.strictEqual(
      segment.sameRepresentationAs(
        manifest.getRepresentations()[2].getSegment(0)
      ),
      false
    );
  } finally {
    restore();
  }
});

test("representations are grouped per period timeline", async () => {
  const { MockXHR, restore } = setup();
  try {
    const promise = parse();
    respondOk(MockXHR);
    const manifest = await promise;
    const periods = manifest.getPeriods();
    assert.deepStrictEqual(Object.keys(periods).sort(), ["0", "1"]);
    assert.strictEqual(periods["0"].length, 2);
    assert.strictEqual(periods["1"].length, 1);
  } finally {
    restore();
  }
});
