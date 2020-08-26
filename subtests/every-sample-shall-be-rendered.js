function sampleShallBeRenderedInIncreasingTimeTest(player) {
  var test = async_test(
    "Every Sample shall be rendered in increasing time order"
  );
  var preSegment = null;
  var segmentList = []; // stores segments which were played

  player.addEventListener(
    "onPlayingSegmentChange",
    test.step_func(function (segment) {
      var currentTime = player.getCurrentTime();
      if (segmentList === []) {
        preSegment = { segment: segment, time: currentTime };
        segmentList.push(preSegment);
      } else {
        var highestTime = 0;
        //get highest Time
        segmentList.forEach(function (segment) {
          if (highestTime < segment.time) highestTime = segment.time;
        });

        //check if played time increased
        if (highestTime >= currentTime) {
          assert_true(
            highestTime < currentTime,
            "current Segment has highest played time"
          );
          test.done();
        }
        //check if segment is already played
        if (segmentList.indexOf(segment) !== -1) {
          assert_true(false, "Each Segment is played once");
          test.done();
        } else {
          segmentList.push({ segment: segment, time: currentTime });
        }
        //check if all segments were played
        if (
          Object.keys(player.videoSegments).length - 1 ===
          segmentList.length
        ) {
          assert_true(true);
          test.done();
        }
        //check for last segment -> if test entered this clause, than some segments were not played
        if (
          player.playingSegment ===
          player.videoSegments[Object.keys(player.videoSegments).length - 1]
        ) {
          assert_true(false, "All Segments were played");
          test.done();
        }
      }
    })
  );
  return test;
}
