function low_startup_delay(max_delay, numberOfSegmentBeforePlay) {
  if (!max_delay) max_delay = 120;
  var load_time = null;
  var numberOfAppendedVideoSegment = 0;
  var t = {
    low_startup: async_test(
      "The start-up delay is sufficiently low (120ms max)"
    ),
  };
  video.addEventListener("play", handleEvent);
  video.addEventListener("canplay", handleEvent);
  video.addEventListener("oncanplay", handleEvent);

  function onSourceBufferAdded(sourceBuffer) {
    var video = document.querySelector("video");
    if (sourceBuffer) {
      sourceBuffer.addEventListener("updateend", function () {
        var segmentsNumber = player.getCurrentManifest().playlists[0].segments
          .length;
        if (numberOfAppendedVideoSegment == numberOfSegmentBeforePlay - 1) {
          load_time = new Date();
        }
        numberOfAppendedVideoSegment++;
      });
    }
  }

  var callbacks = [onSourceBufferAdded];
  player.registerCallbacks(callbacks);

  function handleEvent(event) {
    console.log(event.name);
    var video = document.querySelector("video");
    switch (event.type) {
      case "play":
        var playback_time = new Date();
        console.log("startup delay: ", playback_time - load_time);
        t.low_startup.step(function () {
          assert_true(playback_time - load_time < max_delay);
        });
        t.low_startup.done();
        break;
      default:
        console.log("video: ", event.type);
    }
  }
}
