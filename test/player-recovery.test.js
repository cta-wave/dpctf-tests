const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;

function mockVideo() {
  const handlers = {};
  const video = {
    onerror: null,
    currentTime: 0,
    playbackRate: 1.0,
    buffered: null,
    src: null,
    playCalls: 0,
    addEventListener: (event, handler) => {
      (handlers[event] = handlers[event] || []).push(handler);
    },
    removeEventListener: () => {},
    play: () => {
      video.playCalls++;
      return Promise.resolve();
    },
    pause: () => {},
    fire(event) {
      (handlers[event] || []).forEach((handler) => handler());
    },
  };
  return video;
}

function buildPlayer(video) {
  const options = {
    logger: { error: () => {}, info: () => {}, debug: () => {} },
  };
  eval(fs.readFileSync(path.join(__dirname, "..", "lib", "player.js"), "utf8"));
  return Player(video, options);
}

// Issue #1: after a plain buffer underrun (no MSE reset armed), the player has
// no recovery path. The `waiting` listener is wired only to the 8.15 reinit
// gate (handleResetWaiting is a no-op unless _mseResetPending && _mseResetArmed),
// so once the playhead catches up to the buffered data, playback stalls
// forever: buffering is driven off timeupdate, which the browser stops firing
// while stalled.
//
// This test pins the expected recovery behavior. Unskip it when the recovery
// fix lands; adjust the observation to however the recovery is implemented
// (re-invoked bufferVideo(), a re-seek/currentTime nudge onto buffered data,
// or a re-invoked play()).
test("recovers playback after a plain buffer underrun", { skip: "no buffering→playback recovery after waiting/stalled yet" }, () => {
  const video = mockVideo();
  const player = buildPlayer(video);

  // The playhead caught up to the buffered data: underrun, nothing armed.
  video.currentTime = 4;
  video.fire("waiting");
  video.fire("stalled");

  // Expected: the player detects the underrun and recovers instead of
  // stalling forever.
  assert.ok(
    video.currentTime < 4 || video.playCalls > 0,
    "player should recover after a plain underrun: nudge currentTime back onto buffered data or resume playback"
  );
});
