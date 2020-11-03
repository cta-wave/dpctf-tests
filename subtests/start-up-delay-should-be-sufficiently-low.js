function startUpDelaySmallEnough(tsMax) {
  var playingEventCounter = 0;
  var playbackInitiated = 0.0;
  var presentationTimeOfFirstSample = 0.0;
  var t = async_test(
    "The start-up delay should be sufficiently low (120ms max)."
  );

  player.on("playbackInitiated", function (event) {
    playbackInitiated = new Date().getTime();
  });

  video.addEventListener("playing", function () {
    if (playingEventCounter === 0) {
      presentationTimeOfFirstSample = new Date().getTime();
      t.step(function () {
        delay = presentationTimeOfFirstSample - playbackInitiated;
        assert_less_than(delay, tsMax, "The delay is " + delay + " ms.");
        t.done();
      });
      playingEventCounter++;
    }
  });

  return t;
}

