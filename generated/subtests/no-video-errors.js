function noVideoError(player) {
  var test = async_test("No video error occured.");
  player.addEventListener("onVideoError", function (error) {
    test.step(function () {
      assert_false(true, error.message);
      test.done();
    });
    abortRunningTests();
  });

  player.getVideo().addEventListener(
    "ended",
    test.step_func(function () {
      assert_true(true);
      test.done();
    })
  );
  return test;
}
