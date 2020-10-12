function playlistPlaysUntilEnd() {
  async_test(function (test) {
    player.video.addEventListener(
      "ended",
      test.step_func(function () {
        assert_equals(
          player.getCurrentTime(),
          player.getManifest().duration,
          "Current time equals mpd-duration"
        );
        test.done();
      })
    );
  }, "Playlist plays until the end");
}

