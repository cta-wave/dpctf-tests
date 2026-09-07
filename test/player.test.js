const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;

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
