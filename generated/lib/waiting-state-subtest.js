function WaitingStateSubTest(video, maxWaitingStates, asyncTest) {
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
      waitingStateCount++;
    });

    video.addEventListener("ended", function () {
      finish();
    });

    asyncTest(function (test) {
      new Promise(function (resolve) {
        resolveWaitingStateSubTest = resolve;
      }).then(
        test.step_func(function () {
          var message =
            "waiting states count: " +
            waitingStateCount +
            " (limit " +
            maxWaitingStates +
            ")";
          test.message = message;
          assert_true(waitingStateCount <= maxWaitingStates, message);
          test.done();
        })
      );
    }, "waiting states count should not exceed " + maxWaitingStates);

    return this;
  };

  this.finish = finish;
}
