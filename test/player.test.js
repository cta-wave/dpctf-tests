const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;

eval(fs.readFileSync(path.join(__dirname, "..", "lib", "player.js"), "utf8"));

function mockVideo() {
  return {
    onerror: null,
    currentTime: 0,
    playbackRate: 1.0,
    addEventListener: () => {},
    removeEventListener: () => {},
    play: () => Promise.resolve(),
    pause: () => {},
    src: null,
  };
}

function buildPlayer(video) {
  const options = {
    logger: { error: () => {}, info: () => {}, debug: () => {} },
  };
  eval(fs.readFileSync(path.join(__dirname, "..", "lib", "player.js"), "utf8"));
  return Player(video, options);
}

test("getPlaybackRate returns the video element's playbackRate", () => {
  const video = mockVideo();
  video.playbackRate = 1.1;
  const player = buildPlayer(video);
  assert.strictEqual(player.getPlaybackRate(), 1.1);
});

test("setPlaybackRate applies the rate to the video element", () => {
  const video = mockVideo();
  const player = buildPlayer(video);
  player.setPlaybackRate(0.9);
  assert.strictEqual(video.playbackRate, 0.9);
  assert.strictEqual(player.getPlaybackRate(), 0.9);
});

test("setPlaybackRate then getPlaybackRate round-trips through the video element", () => {
  const video = mockVideo();
  const player = buildPlayer(video);
  for (const rate of [1.0, 1.1, 0.9]) {
    player.setPlaybackRate(rate);
    assert.strictEqual(video.playbackRate, rate);
    assert.strictEqual(player.getPlaybackRate(), rate);
  }
});

test("setPlaybackRate dispatches an onPlaybackRateChange event with the rate", () => {
  const video = mockVideo();
  const player = buildPlayer(video);
  const received = [];
  player.on("onPlaybackRateChange", (rate) => received.push(rate));
  player.setPlaybackRate(1.1);
  player.setPlaybackRate(0.9);
  assert.deepStrictEqual(received, [1.1, 0.9]);
});

test("existing player methods remain available unchanged", () => {
  const video = mockVideo();
  const player = buildPlayer(video);
  assert.strictEqual(typeof player.getCurrentTime, "function");
  assert.strictEqual(typeof player.setCurrentTime, "function");
  assert.strictEqual(typeof player.play, "function");
  assert.strictEqual(typeof player.pause, "function");
  assert.strictEqual(typeof player.getVideo, "function");
  player.setCurrentTime(5);
  assert.strictEqual(video.currentTime, 5);
  assert.strictEqual(player.getCurrentTime(), 5);
});

function mockBuffered(ranges) {
  const starts = ranges.map((r) => r.start);
  const ends = ranges.map((r) => r.end);
  return {
    length: ranges.length,
    start: (i) => starts[i],
    end: (i) => ends[i],
  };
}

function buildBufferManager(video) {
  const options = {
    logger: { error: () => {}, info: () => {}, debug: () => {} },
  };
  return new BufferManager([], null, video, options);
}

function managerWithBuffered(currentTime, ranges) {
  return buildBufferManager({
    currentTime,
    addEventListener: () => {},
    buffered: mockBuffered(ranges),
  });
}

test("getPreBufferedTime is forward buffer from current position to buffered end", () => {
  const bm = managerWithBuffered(5, [{ start: 0, end: 20 }]);
  assert.strictEqual(bm.getPreBufferedTime(), 15);
});

test("getPreBufferedTime uses the range containing currentTime", () => {
  const bm = managerWithBuffered(16, [
    { start: 0, end: 10 },
    { start: 15, end: 25 },
  ]);
  assert.strictEqual(bm.getPreBufferedTime(), 9);
});

test("getPreBufferedTime returns undefined when currentTime is in a gap", () => {
  const bm = managerWithBuffered(12, [
    { start: 0, end: 10 },
    { start: 15, end: 25 },
  ]);
  assert.strictEqual(bm.getPreBufferedTime(), undefined);
});

test("getPreBufferedTime returns undefined when nothing is buffered", () => {
  const bm = managerWithBuffered(0, []);
  assert.strictEqual(bm.getPreBufferedTime(), undefined);
});

test("getPreBufferedTime returns 0 when currentTime is at the buffered end", () => {
  const bm = managerWithBuffered(20, [{ start: 0, end: 20 }]);
  assert.strictEqual(bm.getPreBufferedTime(), 0);
});
