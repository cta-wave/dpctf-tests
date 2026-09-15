function WaitingStateSubTest(video, maxWaitingStates, asyncTest, shouldCount) {
  var waitingStateCount = 0;
  var resolveWaitingStateSubTest = null;
  var started = false;

  function finish() {
    if (!resolveWaitingStateSubTest) return;
    resolveWaitingStateSubTest();
  }

  this.start = function () {
    if (started) return this;
    started = true;

    video.addEventListener("waiting", function () {
      if (!shouldCount()) return;
      waitingStateCount++;
    });

    video.addEventListener("ended", function () {
      finish();
    });

    asyncTest(function (test) {
      new Promise(function (resolve) {
        resolveWaitingStateSubTest = resolve;
      }).then(function () {
        assert_true(
          waitingStateCount <= maxWaitingStates,
          "waiting states count (" +
            waitingStateCount +
            ") should not exceed " +
            maxWaitingStates
        );
        test.done();
      });
    }, "waiting states count should not exceed " + maxWaitingStates);

    return this;
  };

  this.finish = finish;
}
