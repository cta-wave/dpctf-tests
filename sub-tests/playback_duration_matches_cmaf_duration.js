function playback_duration_matches_cmaf_duration () {
  var numberOfAppendedVideoSegment = 0;
  var t = {
    "video_duration": async_test("Video duration equals to cmaf mpd duration"),
    "current_time": async_test("CurrentTime when ended is equal to duration in MPD")
  };

  var onSourceBufferAdded = function(sourceBuffer) {
    var video = document.querySelector('video');
    if (sourceBuffer) {
      sourceBuffer.addEventListener('updateend', function() {
        var segmentsNumber = player.getCurrentManifest().playlists[0].segments.length;
        if (numberOfAppendedVideoSegment >= segmentsNumber) {
          console.log("ALL SEGMENT APPENDED")

          t.video_duration.step(function() {
            assert_equals(video.buffered.end(0), player.getCurrentManifest().duration);
          });
          t.video_duration.done();
        }
        numberOfAppendedVideoSegment++;
      });
    }
  }

  video.addEventListener('loadstart', handleEvent);
  video.addEventListener('play', handleEvent);
  video.addEventListener('progress', handleEvent);
  video.addEventListener('canplay', handleEvent);
  video.addEventListener('canplaythrough', handleEvent);
  video.addEventListener('ended', handleEvent);
  var callbacks = [onSourceBufferAdded];
  player.registerCallbacks(callbacks);


  function handleEvent(event) {
    var video = document.querySelector('video');
    switch (event.type) {
      case "ended":
        onEnded();
        break;
      default:
        console.log("video: ", event.type);
    }
  }

  function onEnded() {
    console.log("video: endedd - " + video.currentTime + "  " + player.getCurrentManifest().duration);
    t.current_time.step(function() {
      assert_equals(video.currentTime, player.getCurrentManifest().duration);
    });
    t.current_time.done();
  }

};
