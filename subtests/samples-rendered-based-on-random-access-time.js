function allSamplesRenderedBasedOnRandomAccessTime(player, randomTime) {
  async_test(function (test) {
    if (randomTime === null || randomTime === undefined) {
      assert_true(false, "Random time is given");
      test.done();
      return;
    }

    player.video.currentTime = randomTime;
    var segmentList = [];

    player.video.addEventListener(
      "play",
      test.step_func(function (event) {
        player.handleTimeUpdate();
        var currentSegment = player.getPlayingSegment();
        var allSegments = Object.values(player.videoSegments);
        var reducedTime = 0;
        for (var i = 0; allSegments[i] !== currentSegment; i++) {
          var preSegment = allSegments[i];
          if (preSegment.number > currentSegment.number) {
            assert_true(false, "Current segment is in the right position");
            test.done();
          }
          reducedTime += preSegment.duration;
        }
        //check if started segment is the right segment based on random time and past time
        if (reducedTime > player.getCurrentTime()) {
          assert_true(false, "Past time is less than current time");
          test.done();
        }

        segmentList.push({
          segment: currentSegment,
          time: player.getCurrentTime(),
        });
        var start = allSegments.indexOf(currentSegment);
        var expectedResult = allSegments.slice(start, allSegments.length);

        player.addEventListener(
          "onPlayingSegmentChange",
          test.step_func(function (segment) {
            //check if segment is in expected result
            if (expectedResult.indexOf(segment) === -1) {
              assert_true(false, "Current Segment is in the expected Result");
              test.done();
            }

            var highestTime = 0;
            //get highest currentTime of Segment
            segmentList.forEach(function (segment) {
              if (highestTime < segment.time) highestTime = segment.time;
            });
            //check time if time increases
            if (highestTime >= player.getCurrentTime()) {
              assert_true(false, "current Segment has highest played time");
              test.done();
            }

            //check for duplicate segments
            if (segmentList.indexOf(segment) !== -1) {
              assert_true(false, "Each Segment is played once");
              test.done();
            } else {
              segmentList.push({
                segment: segment,
                time: player.getCurrentTime(),
              });
            }

            //check if all segments were played after last segment
            if (
              player.getPlayingSegment() ===
              player.videoSegments[Object.keys(player.videoSegments).length - 1]
            ) {
              segmentList = segmentList.map((segment) => segment.segment);

              for (var i = 0; i < expectedResult.length; i++) {
                if (expectedResult[i] !== segmentList[i]) {
                  assert_true(
                    false,
                    "All Segments were played in the right order"
                  );
                  test.done();
                }
              }

              assert_true(true);
              test.done();
            }
          })
        );
      })
    );
  }, "Every sample with presentation time larger or equal to random_access_time shall be rendered and the samples shall be rendered in increasing presentation time order");
}

