function playbackDurationMatchesCMAFTrackDuration() {
  var sumTime = 0;
  var expectedResult = 0;

  var videoSegments = player.getVideoSegments();
  videoSegments = Object.keys(videoSegments).map(function (key) {
    return videoSegments[key];
  });

  expectedResult = videoSegments
    .map(function (segment) {
      return segment.duration;
    })
    .reduce(function (sum, value) {
      return sum + value;
    });

  //add first segment (number:0)
  sumTime += player.getPlayingVideoSegment().duration;

  player.on("onPlayingVideoSegmentChange", function (segment) {
    sumTime += segment.duration;
  });

  var test = async_test("Playback-Duration matches CMAF-Track-Duration");
  player.getVideo().addEventListener(
    "ended",
    test.step_func(function () {
      assert_equals(
        sumTime,
        expectedResult,
        "Sum of duration matches playback duration"
      );
      assert_equals(
        player.getVideo().currentTime,
        expectedResult,
        "Current time matches playback duration"
      );
      test.done();
    })
  );
  return test;
}

function playbackDurationMatchesCMAFTrackDurationIncludingRandomAccessTime() {
  var sumTime = 0;
  var startSegment = null;
  var videoSegments = [];
  var pastTime = 0;
  var passedTimeInSegment = 0;
  var expectedResult = 0;
  var remainingTimeInSegment = 0;
  var cmafTackLength = 0;

  var test = async_test(
    "Playback-Duration matches CMAF-Track-Duration by random access time"
  );

  videoSegments = Object.keys(player.videoSegments).map(function (key) {
    return player.videoSegments[key];
  });
  cmafTackLength = videoSegments
    .map(function (segment) {
      return segment.duration;
    })
    .reduce(function (sum, value) {
      return sum + value;
    });

  assert_between_exclusive(
    randomAccessTime,
    0,
    cmafTackLength,
    "random access time is in the range of video duration"
  );

  if (randomAccessTime > cmafTackLength || randomAccessTime < 0) {
    test.done();
  }
  startSegment = player.getPlayingSegment();

  for (var i = 0; i < videoSegments.length; i++) {
    if (videoSegments[i] === startSegment) break;
    pastTime += videoSegments[i].duration;
  }

  passedTimeInSegment = randomAccessTime - pastTime;
  expectedResult = cmafTackLength - randomAccessTime;
  remainingTimeInSegment = startSegment.duration - passedTimeInSegment;

  var result;
  player.addEventListener(
    "onPlayingSegmentChange",
    test.step_func(function () {
      if (!startSegment) return;
      sumTime += player.getPlayingSegment().duration;
    })
  );

  player.video.addEventListener(
    "ended",
    test.step_func(function () {
      assert_equals(
        sumTime + remainingTimeInSegment,
        expectedResult,
        "playing duration equals CMAF Track duration."
      );
      assert_equals(
        player.video.currentTime,
        cmafTackLength,
        "current time equals CMAF Track duration."
      );
      test.done();
    })
  );
  return test;
}

function playbackDurationMatchesCMAFTrackDurationIncludingRandomAccessFragment(
  randomAccessFragmentIndex
) {
  var sumTime = 0;
  var videoSegments = player.getVideoSegments();
  var expectedResult = 0;
  var randomAccessFragment = null;

  var test = async_test(
    "Playback-Duration matches CMAF-Track-Duration by random access fragment"
  );

  videoSegments = Object.keys(videoSegments).map(function (key) {
    return videoSegments[key];
  });
  randomAccessFragment = player.getPlayingSegment();

  var cmafTackLength = videoSegments
    .map(function (segment) {
      return segment.duration;
    })
    .reduce(function (sum, value) {
      return sum + value;
    });

  expectedResult = cmafTackLength - player.getCurrentTime();

  if (randomAccessFragmentIndex === 0)
    sumTime += player.getPlayingSegment().duration;

  player.addEventListener(
    "onPlayingSegmentChange",
    test.step_func(function (segment) {
      if (isEqual(segment, randomAccessFragment)) return;
      sumTime += player.getPlayingSegment().duration;
    })
  );

  player.getVideo().addEventListener(
    "ended",
    test.step_func(function () {
      assert_equals(
        sumTime,
        expectedResult,
        "Sum of fragment duration matches cmaf duration"
      );

      assert_equals(
        player.video.currentTime,
        cmafTackLength,
        "playback duration matches cmaf track duration"
      );

      test.done();
    })
  );
  return test;
}

function isEqual(a, b) {
  if ((a == null && b !== null) || (b == null && a !== null)) return false;
  var aProps = Object.getOwnPropertyNames(a);
  var bProps = Object.getOwnPropertyNames(b);

  if (aProps.length !== bProps.length) {
    return false;
  }

  for (var i = 0; i < aProps.length; i++) {
    var propName = aProps[i];
    if (a[propName] !== b[propName]) {
      return false;
    }
  }
  return true;
}
