// Global variables
var TEST_INFO = {
  title: "Example Test",
  description: "This is an example test",
  path: location.pathname,
  params: urlParams,
  observations: [],
};

var waveService = null;
var video = null;
var player = null;
var ignoreObservations = false;
var resolveWaitForObservation = null;
var resolveWaitingForResults = null;

var token = urlParams["token"];
var contentModel =
  urlParams["content_model"] ||
  "http://dash.akamaized.net/WAVE/ContentModel/SinglePeriod/Fragmented/ToS_MultiRate_fragmented.mpd"; // Temporary fix

// Specify workflow
setupTest()
  .then(checkMseAvailable)
  .then(checkCodecs)
  .then(initializeWaveService)
  .then(sendTestReadyEvent)
  .then(waitForObservationReady)
  .then(executeTest)
  .then(waitForObservationResults)
  .then(handleError)
  .then(finishTest);

function handleError(error) {
  if (!error) return;
  throw new Error(error);
}

function checkMseAvailable(error) {
  if (error) return error;
  log("Checking MSE API support");
  checkMseSupport();
  return Promise.resolve();
}

function checkCodecs(error) {
  if (error) return error;
  log("Checking Codec support");
  var manifest = player.getManifest();
  checkMimeAndCodecSupport(manifest);
  return Promise.resolve();
}

function setupTest(error) {
  if (error) return error;
  log("Setting up test");
  return new Promise(function (resolve) {
    //// Meta Info ////
    document.getElementsByTagName("title")[0].innerText = TEST_INFO.title;

    //// Configure Test Harness ////
    setup({
      explicit_timeout: true,
      explicit_done: true,
    });

    //// Player Setup ////
    video = document.querySelector("video");

    video.addEventListener("play", function (event) {
      var eventData = { type: "play" };
      waveService.sendSessionEvent(
        token,
        WaveService.PLAYBACK_EVENT,
        eventData
      );
    });

    video.addEventListener("ended", function (event) {
      var eventData = { type: "ended" };
      waveService.sendSessionEvent(
        token,
        WaveService.PLAYBACK_EVENT,
        eventData
      );
    });

    player = new Player(video);
    player.init({
      bufferTime: 30,
      numberOfSegmentBeforePlay: 2,
      parallelLoading: false,
    });

    player.load(contentModel);

    player.addEventListener("onManifestParsed", function (manifest) {
      var totalSegmentsCount = manifest
        .getRepresentation(1)
        .getTotalSegmentsCount();
      player.setVideoSegments({
        representationNumber: 1,
        startSegment: 10,
        endSegment: totalSegmentsCount - 1,
      });
      player.setCurrentTime(300);
      player.startBuffering();
    });

    player.addEventListener("onSegmentLoaded", function (event) {
      if (event.totalSegmentsLoaded >= 2) {
        // Finish setup
        resolve();
      }
    });

    player.addEventListener("onPlayingSegmentChange", function (segment) {
      //console.log(segment);
    });

    //// Info Overlay Setup ////
    var infoOverlayElement = document.getElementById("info-overlay");
    var infoOverlay = new InfoOverlay(infoOverlayElement);
    infoOverlay.init();

    document.addEventListener("keydown", function (event) {
      if (event.keyCode === 38) {
        infoOverlay.show();
      }
      if (event.keyCode === 40) {
        infoOverlay.hide();
      }
      if (event.keyCode === 13) {
        ignoreObservations = true;
        if (resolveWaitForObservation) resolveWaitForObservation();
        if (resolveWaitingForResults) resolveWaitingForResults();
      }
    });

    player.addEventListener("onManifestParsed", function (manifest) {
      infoOverlay.updateOverlayInfo(player, TEST_INFO);
    });

    player.addEventListener("onTimeUpdate", function (currentTime) {
      infoOverlay.updateOverlayInfo(player, TEST_INFO);
    });

    player.addEventListener("onPlayingRepresentationChange", function (
      currentRepresentation
    ) {
      infoOverlay.updateOverlayInfo(player, TEST_INFO);
    });
  });
}

function executeTest(error) {
  if (error) return error;
  log("Executing test");
  return new Promise(function (resolve) {
    // Start video playback
    player.play();

    // Placeholder test
    async_test(function (test) {
      video.addEventListener(
        "play",
        test.step_func(function (event) {
          if (video.paused) return;
          assert_true(true);
          test.done();
        })
      );
    }, "Playback starts");

    async_test(function (test) {
      var count = 0;
      video.addEventListener(
        "timeupdate",
        test.step_func(function (event) {
          count += 1;
          if (count < 5) return;
          assert_true(true);
          test.done();
        })
      );
    }, "5 time update events fired");

    // Finish test execution
    resolve();
  });
}

function initializeWaveService(error) {
  if (error) return error;
  log("Initializing WAVE service");
  return new Promise(function (resolve) {
    waveService = new WaveService();
    waveService.initialize("resources/wave-config").then(function (error) {
      if (error) resolve("Failed to initialize wave service: " + error);
      resolve();
    });
  });
}

function sendTestReadyEvent(error) {
  if (error) return error;
  log("Sending test ready event");
  return new Promise(function (resolve) {
    if (!token) {
      resolve("No session token provided");
      return;
    }
    var testInfo = {
      test_path: TEST_INFO.path,
      test_name: TEST_INFO.title,
      test_description: TEST_INFO.description,
    };
    waveService
      .sendSessionEvent(token, WaveService.TEST_READY_EVENT, testInfo)
      .then(function () {
        resolve();
      });
  });
}

function waitForObservationReady(error) {
  if (error) return error;
  if (ignoreObservations) return Promise.resolve();
  log("Waiting for observation framework to be ready");
  return new Promise(function (resolve) {
    resolveWaitForObservation = resolve;
    var listener = function (event) {
      if (event.type !== WaveService.OBSERVATION_READY_EVENT) return;
      if (event.data.test_path !== TEST_INFO.path) return;
      waveService.removeSessionEventListener(listener);
      resolve();
    };
    if (!token) {
      resolve("No session token provided");
      return;
    }
    waveService.addSessionEventListener(token, listener);
  });
}

function waitForObservationResults(error) {
  if (error) return error;
  if (ignoreObservations) return Promise.resolve();
  log("Waiting for observation results");
  return new Promise(function (resolve) {
    resolveWaitingForResults = resolve;
    var observations = TEST_INFO.observations;
    var observationResults = [];
    var listener = function (event) {
      if (event.type !== WaveService.OBSERVATION_COMPLETED_EVENT) return;
      observationResults = observationResults.concat(event.data);
      var allResultsReceived = true;
      for (var observation of observations) {
        var hasResult = false;
        for (var observationResult of observationResults) {
          if (observation.id !== observationResult.id) continue;
          hasResult = true;
          break;
        }
        if (hasResult) continue;
        allResultsReceived = false;
        break;
      }
      if (!allResultsReceived) return;
      waveService.removeSessionEventListener(listener);
      //tests.tests = tests.tests.concat(observationResults);
      resolve();
    };
    waveService.addSessionEventListener(token, listener);
  });
}

function finishTest() {
  done();
}

function log() {
  var text = "";
  for (var i = 0; i < arguments.length; i++) {
    text += arguments[i] + " ";
  }
  if (console && console.log) {
    console.log(text);
  }
}
