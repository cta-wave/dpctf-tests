function DpctfTest(config) {
  var testInfo = config.testInfo;
  var video = config.videoElement;
  var qrCode = config.qrCodeElement;
  var statusText = config.statusTextElement;
  var infoOverlayElement = config.infoOverlayElement;
  var outOfOrderLoading = config.outOfOrderLoading || false;
  var executeTestCallback = config.executeTest || function () {};
  var setupTestCallback = config.setupTest;
  var initCallback = config.initCallback;
  var usePlayout = !!config.usePlayout;
  var useChangeType = !!config.useChangeType;
  if (!("useChangeType" in config)) useChangeType = true;
  var videoContentModels = config.videoContentModel || [];
  var audioContentModels = config.audioContentModel || [];
  var autoCloseStream = true;
  if ("autoCloseStream" in config) {
    autoCloseStream = !!config.autoCloseStream;
  }

  testInfo.path = location.pathname.substring(1);

  var parameters = null;

  var waveService = null;
  var player = null;
  var ignoreObservations = false;
  var resolveWaitForObservation = null;
  var resolveWaitingForResults = null;
  var lastQrTime = null;

  var ACTION_INITIALIZE = "initialize";
  var ACTION_PLAY = "play";
  var ACTION_PAUSE = "pause";
  var ACTION_REPRESENTATION_CHANGE = "representation_change";
  var ACTION_CLOSE_BUFFER = "close";

  var VIDEO_STATE_WAITING = "waiting";
  var VIDEO_STATE_BUFFERING = "buffering";
  var VIDEO_STATE_READY = "ready";
  var VIDEO_STATE_PLAYING = "playing";
  var VIDEO_STATE_PAUSED = "paused";
  var VIDEO_STATE_ENDED = "ended";
  var VIDEO_STATE_ERROR = "error";
  var VIDEO_STATE_STALLED = "stalled";
  var VIDEO_STATE_FINISHED = "finished";

  var _lastAction = ACTION_INITIALIZE;
  var _videoState = VIDEO_STATE_WAITING;

  var EXECUTION_MODE_AUTO = "auto";
  var EXECUTION_MODE_MANUAL = "manual";
  var EXECUTION_MODE_PRGRAMMATIC = "programmatic";

  var PLAYBACK_MODE_VOD = "vod";
  var PLAYBACK_MODE_LIVE = "live";

  var token = urlParams["token"];
  var _execution_mode = urlParams["mode"] || EXECUTION_MODE_AUTO;
  var _redirect_time = urlParams["redirect_time"] || 5;
  var _isEncryptedContent = !!config.isEncryptedContent;

  var _runningTests = [];

  updateVideoWrapperSize();

  var screenConsole = document.createElement("div");
  screenConsole.setAttribute("id", "console");
  screenConsole.style.display = "none";
  var contentWrapper = document.getElementById("content-wrapper");
  contentWrapper.appendChild(screenConsole);

  HbbTV.setLogger(getLogger());

  promise_test(function () {
    // Specify workflow
    return loadParameters()
      .then(setupTest)
      .then(checkMseAvailable)
      .then(checkCodecs)
      .then(initializeWaveService)
      .then(sendTestReadyEvent)
      .then(waitForObservationReady)
      .then(HbbTV.stopBroadcast)
      .then(executeTest)
      .then(waitForObservationResults)
      .then(handleError)
      .then(finishTest)
      .catch((error) => handleError(error));
  }, "Test workflow");

  function handleError(error) {
    if (!error) return;
    done();
    _videoState = VIDEO_STATE_ERROR;
    var currentTime = player.getCurrentTime();
    updateQrCode(currentTime);
    updateStatusText();
    abortTests();
    console.error(error);
    return Promise.reject(error);
  }

  function checkMseAvailable(error) {
    if (error) return error;
    log("Checking MSE API support");
    try {
      checkMseSupport();
    } catch (error) {
      return Promise.resolve(error);
    }
    return Promise.resolve();
  }

  function checkCodecs(error) {
    if (error) return error;
    log("Checking Codec support");
    try {
      var videoManifests = player.getVideoManifests();
      for (var videoManifest of videoManifests) {
        checkMimeAndCodecSupport(videoManifest);
      }
      var audioManifests = player.getAudioManifests();
      for (var audioManifest of audioManifests) {
        checkMimeAndCodecSupport(audioManifest);
      }
    } catch (error) {
      return Promise.resolve(error);
    }
    return Promise.resolve();
  }

  function setupTest(error) {
    if (error) return error;
    log("Setting up test");
    updateQrCode();
    updateStatusText();
    return new Promise(function (resolve) {
      //// Configure Test Harness ////
      setup({
        explicit_timeout: true,
        explicit_done: true,
      });

      if (parameters.testTimeout) {
        setTestTimeout(parameters.testTimeout);
      }

      video.addEventListener("play", function () {
        log("video play");
        if (_videoState === VIDEO_STATE_ERROR) return;
        _lastAction = ACTION_PLAY;
        _videoState = VIDEO_STATE_PLAYING;
        var currentTime = player.getCurrentTime();
        updateQrCode(currentTime);
        updateVideoWrapperSize();
      });

      video.addEventListener("pause", function () {
        log("video pause");
        if (_videoState === VIDEO_STATE_ERROR) return;
        _lastAction = ACTION_PAUSE;
        _videoState = VIDEO_STATE_PAUSED;
        var currentTime = player.getCurrentTime();
        updateQrCode(currentTime);
        updateVideoWrapperSize();
      });

      video.addEventListener("playing", function () {
        log("video is playing");
        if (_videoState === VIDEO_STATE_ERROR) return;
        _videoState = VIDEO_STATE_PLAYING;
        var currentTime = player.getCurrentTime();
        updateQrCode(currentTime);
        updateVideoWrapperSize();
      });

      video.addEventListener("waiting", function () {
        log("video is waiting");
        if (_videoState === VIDEO_STATE_ERROR) return;
        _videoState = VIDEO_STATE_WAITING;
        var currentTime = player.getCurrentTime();
        updateQrCode(currentTime);
        updateStatusText();
      });

      video.addEventListener("stalled", function () {
        log("video is stalled");
        if (_videoState === VIDEO_STATE_ERROR) return;
        _videoState = VIDEO_STATE_STALLED;
        var currentTime = player.getCurrentTime();
        updateQrCode(currentTime);
        updateStatusText();
      });

      video.addEventListener("pause", function () {
        log("video is paused");
        if (_videoState === VIDEO_STATE_ERROR) return;
        _videoState = VIDEO_STATE_PAUSED;
        var currentTime = player.getCurrentTime();
        updateQrCode(currentTime);
        updateStatusText();
      });

      video.addEventListener("ended", function () {
        log("video ended");
        if (_videoState === VIDEO_STATE_ERROR) return;
        _videoState = VIDEO_STATE_ENDED;
        var currentTime = player.getCurrentTime();
        updateQrCode(currentTime);
        updateVideoWrapperSize();
      });

      video.addEventListener("error", function () {
        _videoState = VIDEO_STATE_ERROR;
        var currentTime = player.getCurrentTime();
        updateQrCode(currentTime);
        updateStatusText();
        abortTests();
        throw new Error(video.error.message);
      });

      video.addEventListener("canplay", function () {
        log("video can play");
        updateQrCodePosition();
      });

      window.addEventListener("resize", function () {
        updateVideoWrapperSize();
      });

      //// Player Setup ////
      player = new Player(video, { logger: getLogger() });

      player.on(Player.PLAYER_EVENT_START_BUFFERING, function () {
        log("start buffering");
        _videoState = VIDEO_STATE_BUFFERING;
        var currentTime = player.getCurrentTime();
        updateQrCode(currentTime);
        updateStatusText();
      });

      player.on(Player.PLAYER_EVENT_TRIGGER_PLAY, function () {
        log("play triggered");
        _videoState = VIDEO_STATE_PLAYING;
        _lastAction = ACTION_PLAY;
        var currentTime = player.getCurrentTime();
        updateQrCode(currentTime);
        updateStatusText();
      });

      function makeInitCallback(initCallback) {
        if (!initCallback) return null;
        return function (done) {
          try {
            initCallback(player, done, parameters);
          } catch (error) {
            handleError(error);
          }
        };
      }

      player
        .init({
          bufferTime: parameters.minBufferDuration / 1000,
          numberOfSegmentBeforePlay: 2,
          outOfOrderLoading: outOfOrderLoading,
          loading: parameters.loading,
          useChangeType: useChangeType,
          initCallback: makeInitCallback(initCallback),
          maxBackwardBuffer: parameters.maxBackwardBuffer,
          timestampOffsets: parameters.timestampOffsets,
          appendWindowBoundaries: parameters.appendWindowBoundaries,
          autoCloseStream: autoCloseStream,
        })
        .then(function () {
          return Promise.all([
            player.loadVideo(videoContentModels),
            player.loadAudio(audioContentModels),
          ]);
        })
        .then(function () {
          return new Promise(function (resolve) {
            if (_isEncryptedContent) {
              try {
                player.setProtectionData({
                  keyId: parameters.keyId,
                  contentKey: parameters.contentKey,
                });
              } catch (error) {
                return error;
              }
            }
            calculateMissingParameters();

            if (usePlayout) {
              if (parameters.playout) {
                applyVideoPlayout(parameters.playout);
              }
              if (parameters.audioPlayout) {
                applyAudioPlayout(parameters.audioPlayout);
              } else {
                applyAudioPlayout(parameters.playout);
              }
            }

            if (parameters.gapDuration && parameters.gapLocationFragment) {
              player.setVideoGaps([
                {
                  gapDuration: parameters.gapDuration,
                  gapLocationFragment: parameters.gapLocationFragment,
                },
              ]);
            }

            if (parameters.duration && player.getDuration()) {
              const duration = parseInt(player.getDuration() * 100) / 100;
              if (parameters.duration !== duration) {
                throw new Error(
                  "Provided duration does not match MPD duration of " +
                    duration +
                    " seconds."
                );
              }
            }

            if (parameters.playbackDuration) {
              player.setDuration(parameters.playbackDuration);
            }
            //if (parameters.totalRepresentations) {
            //if (
            //parameters.totalRepresentations !==
            //player.getVideoManifest().getRepresentations().length
            //) {
            //throw new Error(
            //"Provided total representations do not match MPD total representations of " +
            //player.getVideoManifest().getRepresentations().length
            //);
            //}
            //}

            if (!setupTestCallback) resolve();
            setupTestCallback(player, resolve, parameters);
          });
        })
        .then(function () {
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

          //// Info Overlay Setup ////
          var infoOverlay = new InfoOverlay(infoOverlayElement);
          infoOverlay.init();
          infoOverlay.updateOverlayInfo(player, testInfo);

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

          var debugButton = document.getElementById("debug-button");
          if (debugButton) {
            debugButton.addEventListener("click", function () {
              infoOverlay.show();
            });
          }

          player.on("onTimeUpdate", function (currentTime) {
            infoOverlay.updateOverlayInfo(player, testInfo);
            updateQrCode(currentTime);
            updateStatusText();
          });

          player.on(
            "onPlayingVideoRepresentationChange",
            function (representation) {
              log("representation change: " + representation.toString());
              infoOverlay.updateOverlayInfo(player, testInfo);
              var eventData = { type: "representation_changed" };
              waveService.sendSessionEvent(
                token,
                WaveService.PLAYBACK_EVENT,
                eventData
              );
              _lastAction = ACTION_REPRESENTATION_CHANGE;
              updateQrCode(player.getCurrentTime());
              updateStatusText();
            }
          );

          player
            .getVideoBufferManager()
            .on(Player.EVENT_CLOSE_BUFFER, function () {
              log("close buffer");
              _lastAction = ACTION_CLOSE_BUFFER;
              var currentTime = player.getCurrentTime();
              updateQrCode(currentTime);
              updateStatusText();
            });

          if (!player.getVideoManifests()) {
            player.on("onVideoManifestParsed", function () {
              log("video manifest parsed");
              resolve();
            });
          } else {
            resolve();
          }
          updateQrCodePosition();
          _videoState = VIDEO_STATE_READY;
          updateStatusText();
        })
        .catch(function (error) {
          resolve(error);
        });
    });
  }

  function executeTest(error) {
    if (error) return error;
    log("Executing test");
    return new Promise(function (resolve) {
      try {
        executeTestCallback(player, resolve, parameters);
      } catch (error) {
        resolve(error);
      }
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
    if (_execution_mode !== EXECUTION_MODE_PRGRAMMATIC) return;
    log("Sending test ready event");
    return new Promise(function (resolve) {
      if (!token) {
        resolve("No session token provided");
        return;
      }
      waveService
        .sendSessionEvent(token, WaveService.TEST_READY_EVENT, testInfo)
        .then(function () {
          resolve();
        });
    });
  }

  function waitForObservationReady(error) {
    if (error) return error;
    if (_execution_mode !== EXECUTION_MODE_PRGRAMMATIC) return;
    if (ignoreObservations) return Promise.resolve();
    log("Waiting for observation framework to be ready");
    return new Promise(function (resolve) {
      resolveWaitForObservation = resolve;
      var listener = function (event) {
        if (event.type !== WaveService.OBSERVATION_READY_EVENT) return;
        if (event.data.test_path !== testInfo.path) return;
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
    if (_execution_mode !== EXECUTION_MODE_PRGRAMMATIC) return;
    if (ignoreObservations) return Promise.resolve();
    log("Waiting for observation results");
    return new Promise(function (resolve) {
      resolveWaitingForResults = resolve;
      var observations = testInfo.observations;
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

  function loadParameters(error) {
    if (error) return error;
    log("Loading test parameters ...");
    return new Promise((resolve) => {
      fetchParameters().then(function (fetchedParameters) {
        parameters = fetchedParameters;
        testInfo.params = parameters;
        resolve();
      });
    });
  }

  function applyPlayout(playout, clearSegments, setSegments) {
    clearSegments();
    var ranges = Object.keys(playout);
    var promises = [];
    for (var range of ranges) {
      var config = playout[range];
      var manifestIndex = config.manifestIndex;
      var representationNumber = config.representationNumber;
      var offset = config.offset;
      var rangeParts = range.split("-");
      var segmentConfig = {
        manifestIndex: manifestIndex,
        representationNumber: representationNumber,
        segmentOffset: offset,
        startSegment: rangeParts[0],
        endSegment: rangeParts[1],
      };
      var videoPromise = setSegments(segmentConfig);
      promises.push(videoPromise);
    }

    return Promise.all(promises);
  }

  function applyVideoPlayout(playout) {
    applyPlayout(
      playout,
      player.clearVideoSegments,
      player.setVideoSegments
    ).then(function () {
      if (parameters.playbackDuration) {
        player.setDuration(parameters.playbackDuration);
      }
    });
  }

  function applyAudioPlayout(playout) {
    applyPlayout(
      playout,
      player.clearAudioSegments,
      player.setAudioSegments
    ).then(function () {
      if (parameters.playbackDuration) {
        player.setDuration(parameters.playbackDuration);
      }
    });
  }

  function finishTest() {
    done();
  }

  function asyncTest(testFunc, testName) {
    var test = async_test(function (test) {
      var doneCallback = test.done.bind(test);
      test.done = function () {
        finishSubTest(test);
        doneCallback();
      };
      testFunc(test);
    }, testName);
    _runningTests.push(test);
  }

  function syncTest(testFunc, testName) {
    test(testFunc, testName);
  }

  function finishSubTest(test) {
    var index = _runningTests.indexOf(test);
    if (index === -1) return;
    _runningTests.splice(index, 1);

    if (_runningTests.length > 0) return;
    _videoState = VIDEO_STATE_FINISHED;
    var currentTime = player.getCurrentTime();
    updateQrCode(currentTime);
    updateVideoWrapperSize();
  }

  function abortTests() {
    setTimeout(function () {
      for (var test of _runningTests) {
        test.done();
      }
    }, _redirect_time * 1000);
  }

  function log() {
    var text = "";
    for (var i = 0; i < arguments.length; i++) {
      text += arguments[i] + " ";
    }
    var prefix = "[" + new Date(Date.now()).toISOString() + "] ";
    if (console && console.log) {
      console.log(prefix + text);
    }
  }

  function updateQrCode(currentTime) {
    if (!qrCode) return;
    var object = { s: _videoState, a: _lastAction };
    if (typeof currentTime === "number") object.ct = currentTime;
    if (lastQrTime) object.d = lastQrTime;
    var start = new Date().getTime();
    var content = JSON.stringify(object);
    qrCode.innerHTML = "";
    new QRCode(qrCode, {
      text: content,
      colorDark: "#ffffff",
      colorLight: "#000000",
    });
    lastQrTime = new Date().getTime() - start;
  }

  function updateQrCodePosition() {
    var qrCode = document.getElementById("qr-code");
    var top = 0.3;
    var left = 0.7;
    var rect = video.getBoundingClientRect();
    var elementWidth = rect.width;
    var elementHeight = rect.height;
    var videoWidth = video.videoWidth || elementWidth;
    var videoHeight = video.videoHeight || elementHeight;
    var videoRatio = videoWidth / videoHeight;
    var elementRatio = elementWidth / elementHeight;
    var width;
    var height;
    var offsetLeft;
    var offsetTop;
    var scale = 1;
    if (videoRatio < elementRatio) {
      // Video element is wider
      var actualVideoWidth = elementHeight * videoRatio;
      var borderWidth = (elementWidth - actualVideoWidth) / 2;
      height = elementHeight;
      width = actualVideoWidth;
      offsetTop = 0;
      offsetLeft = borderWidth;
      scale = elementHeight / 1000;
    } else {
      // Video element is taller
      var actualVideoHeight = elementWidth / videoRatio;
      var borderHeight = (elementHeight - actualVideoHeight) / 2;
      width = elementWidth;
      height = actualVideoHeight;
      offsetLeft = 0;
      offsetTop = borderHeight;
      scale = elementWidth / 1800;
    }
    qrCode.style.top = top * height + offsetTop + "px";
    qrCode.style.left = left * width + offsetLeft + "px";
    qrCode.style.width = 350 * scale + "px";
    qrCode.style.height = 350 * scale + "px";
    qrCode.style.padding = 20 * scale + "px";
  }

  function updateVideoWrapperSize() {
    var height = window.innerHeight;
    var width = window.innerWidth;
    var videoWrapper = document.getElementById("video-wrapper");
    videoWrapper.style.height = height + "px";
    videoWrapper.style.width = width + "px";
    updateQrCodePosition();
    updateStatusText();
  }

  function updateStatusText() {
    if (!statusText) return;
    var text = "";
    text = text + "s: " + _videoState + "; ";
    text = text + "a: " + _lastAction + ";";
    if (player) {
      var ct = player.getCurrentTime();
      ct = parseInt(ct * 1000) / 1000.0;
      text = text + " ct: " + ct + ";";
    }
    statusText.innerText = text;
    updateStatusTextPosition();
  }

  function updateStatusTextPosition() {
    if (!statusText) return;
    var qrCode = statusText;
    var top = 0.13;
    var left = 0.5;
    var rect = video.getBoundingClientRect();
    var elementWidth = rect.width;
    var elementHeight = rect.height;
    var videoWidth = video.videoWidth || elementWidth;
    var videoHeight = video.videoHeight || elementHeight;
    var videoRatio = videoWidth / videoHeight;
    var elementRatio = elementWidth / elementHeight;
    var width;
    var height;
    var offsetLeft;
    var offsetTop;
    var scale = 1;
    if (videoRatio < elementRatio) {
      // Video element is wider
      var actualVideoWidth = elementHeight * videoRatio;
      var borderWidth = (elementWidth - actualVideoWidth) / 2;
      height = elementHeight;
      width = actualVideoWidth;
      var rect = statusText.getBoundingClientRect();
      offsetTop = 0;
      offsetLeft = borderWidth - rect.width / 2;
      scale = elementHeight / 1000;
    } else {
      // Video element is taller
      var actualVideoHeight = elementWidth / videoRatio;
      var borderHeight = (elementHeight - actualVideoHeight) / 2;
      width = elementWidth;
      height = actualVideoHeight;
      var rect = statusText.getBoundingClientRect();
      offsetLeft = 0 - rect.width / 2;
      offsetTop = borderHeight;
      scale = elementWidth / 1800;
    }
    qrCode.style.top = top * height + offsetTop + "px";
    qrCode.style.left = left * width + offsetLeft + "px";
    qrCode.style.fontSize = 35 * scale + "px";
    qrCode.style.padding = 5 * scale + "px";
  }

  function fetchParameters() {
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.addEventListener("load", function () {
        var response = this.responseText;
        var testConfig = JSON.parse(response);
        var defaultParameters = testConfig.all;
        var templateParameters = testConfig[testInfo.code];
        var testParameters = testConfig[testInfo.path];

        function determineValue(parameter) {
          if (testParameters && testParameters[parameter]) {
            return testParameters[parameter];
          }
          if (templateParameters && templateParameters[parameter]) {
            return templateParameters[parameter];
          }
          if (defaultParameters && defaultParameters[parameter]) {
            return defaultParameters[parameter];
          }
        }

        var parameters = {
          minBufferDuration: determineValue("min_buffer_duration") || 30000,
          maxBufferDuration: determineValue("max_buffer_duration") || 30000,
          tsMax: determineValue("ts_max") || 120,
          randomAccessFragment: determineValue("random_access_fragment"),
          randomAccessTime: determineValue("random_access_time"),
          duration: determineValue("duration"),
          totalRepresentations: determineValue("total_representations"),
          keyId: determineValue("key_id"),
          contentKey: determineValue("content_key"),
          loading: determineValue("loading"),
          playout: determineValue("playout"),
          audioPlayout: determineValue("audio_playout"),
          gapLocationFragment: determineValue("gap_location_fragment"),
          gapDuration: determineValue("gap_duration"),
          randomAccessTo: determineValue("random_access_to"),
          randomAccessFrom: determineValue("random_access_from"),
          maximumForwardBuffer: determineValue("maximum_forward_buffer"),
          waitingTime: determineValue("waiting_time"),
          waitingDuration: determineValue("waiting_duration"),
          appendWindowBoundaries: determineValue("append_window_boundaries"),
          playbackMode: determineValue("playback_mode"),
          stallToleranceMargin: determineValue("stall_tolerance_margin"),
          maxBackwardBuffer: determineValue("max_backward_buffer"),
          playbackDuration: determineValue("playback_duration"),
          timestampOffsets: determineValue("timestamp_offsets"),
          secondPlayoutSwitchingTime:
            determineValue("second_playout_switching_time") || 5,
          testTimeout: determineValue("test_timeout"),
        };

        function calcPlayout(playout) {
          var objectPlayout = {};
          var start = 0;
          var currentManifest = playout[0][0] - 1;
          var currentRep = playout[0][1] - 1;
          var segmentNumber = playout[0][2] - 1;
          var currentOffset = segmentNumber;
          for (var i = 0; i < playout.length; i++) {
            var manifestIndex = playout[i][0] - 1;
            var representationNumber = playout[i][1] - 1;
            var segmentNumber = playout[i][2] - 1;
            var segmentOffset = segmentNumber - i;
            if (
              currentManifest === manifestIndex &&
              currentRep === representationNumber &&
              currentOffset === segmentOffset &&
              i + 1 !== playout.length
            )
              continue;
            var range = start + "-" + (i - 1);
            if (i + 1 === playout.length) {
              range = start + "-" + i;
            }
            objectPlayout[range] = {
              manifestIndex: currentManifest,
              representationNumber: currentRep,
              offset: currentOffset,
            };
            currentManifest = manifestIndex;
            currentRep = representationNumber;
            currentOffset = segmentOffset;
            start = i;
          }
          return objectPlayout;
        }

        var playout = determineValue("playout");
        if (playout) {
          playout = calcPlayout(playout);
        }
        parameters.playout = playout;

        var secondPlayout = determineValue("second_playout");
        if (secondPlayout) {
          secondPlayout = calcPlayout(secondPlayout);
        }
        parameters.secondPlayout = secondPlayout;

        var audioPlayout = determineValue("playout");
        if (audioPlayout) {
          audioPlayout = calcPlayout(audioPlayout);
        }
        parameters.audioPlayout = audioPlayout;

        resolve(parameters);
      });
      xhr.open("GET", "/test-config.json");
      xhr.send();
    });
  }

  function calculateMissingParameters() {
    //var totalSegments = player.getVideoSegmentsCount();
    //var manifest = player.getVideoManifest();
    //var representations = manifest.getRepresentations();
    //var totalRepresentations = representations.length;
    //var totalVideoRepresentations = 0;
    //for (var representation of representations) {
    //if (representation.getMimeCodec().indexOf("video") === -1) continue;
    //totalVideoRepresentations++;
    //}

    if (!parameters.randomAccessFragment) {
      var totalSegments = player.getVideoSegmentsCount();
      var variance = totalSegments * 0.5;
      var randomAccessFragment =
        totalSegments * 0.5 + (Math.random() * variance - variance * 0.5);
      parameters.randomAccessFragment = randomAccessFragment;
    }

    if (!parameters.randomAccessTime) {
      var cmafTrackLength = player.getDuration();
      var variance = cmafTrackLength * 0.5;
      var randomAccessTime =
        cmafTrackLength * 0.5 + (Math.random() * variance - variance * 0.5);
      parameters.randomAccessTime = randomAccessTime;
    }

    //if (!parameters.playout) {
    //var playout = {};
    //var representationLength = parseInt(
    //totalSegments / totalVideoRepresentations
    //);
    //var currentSegment = 0;

    //for (var i = 1; i <= totalRepresentations; i++) {
    //if (representations[i - 1].getMimeCodec().indexOf("video") === -1)
    //continue;
    //var range;
    //if (i === totalRepresentations) {
    //range = currentSegment + "-" + (totalSegments - 1);
    //} else {
    //range = currentSegment + "-" + (representationLength * i - 1);
    //}
    //currentSegment = representationLength * i;
    //playout[range] = i - 1;
    //}
    //parameters.playout = playout;
    //}
  }

  function getPlayout() {
    return parameters.playout;
  }

  function setPlayout(playout) {
    parameters.playout = playout;
    if (!usePlayout) return;
    applyPlayout(playout);
  }

  function getMinBufferDuration() {
    return parameters.minBufferDuration;
  }

  function setMinBufferDuration(minBufferDuration) {
    parameters.minBufferDuration = minBufferDuration;
    player.setBufferTime(minBufferDuration);
  }

  function setGap(gapStart, gapDuration) {
    parameters.gapDuration = gapDuration;
    player.setVideoGaps([
      {
        gapDuration: parameters.gapDuration / 1000.0,
        gapStart: gapStart,
      },
    ]);
  }

  function setVideoState(state) {
    _videoState = state;
    var currentTime = player.getCurrentTime();
    updateQrCode(currentTime);
    updateStatusText();
  }

  function getLogger() {
    return {
      log: log,
    };
  }

  return {
    PLAYBACK_MODE_VOD: PLAYBACK_MODE_VOD,
    PLAYBACK_MODE_LIVE: PLAYBACK_MODE_LIVE,
    VIDEO_STATE_ENDED: VIDEO_STATE_ENDED,
    VIDEO_STATE_FINISHED: VIDEO_STATE_FINISHED,
    asyncTest: asyncTest,
    test: syncTest,
    getPlayout: getPlayout,
    setPlayout: setPlayout,
    setMinBufferDuration: setMinBufferDuration,
    setGap: setGap,
    setVideoState: setVideoState,
    applyPlayout: applyPlayout,
    getLogger: getLogger,
  };
}

function checkMimeAndCodecSupport(manifest) {
  if (!manifest) return;
  var representations = manifest.getRepresentations();
  var unsupportedMimeCodecs = "";
  var allMimeCodecsSupported = true;

  for (var r of representations) {
    var mimeCodec = r.getMimeCodec();
    var supported = MediaSource.isTypeSupported(mimeCodec);
    if (!supported) {
      allMimeCodecsSupported = false;
      unsupportedMimeCodecs += " | " + mimeCodec;
    }
  }

  if (!allMimeCodecsSupported) {
    throw new Error(
      "Unsupported MIME types or codecs: " + unsupportedMimeCodecs
    );
  }
}

function checkMseSupport() {
  if ("MediaSource" in window) return;
  throw new Error("Media Source Extensions API not supported!");
}

function InfoOverlay(element) {
  var _visible = false;
  var _rootElement = element;
  var _contentElement;

  var _info = {
    test: {
      title: "unknown",
      description: "unknown",
    },
    video: {
      representations: [],
      playingRepresentation: "unknown",
      currentTime: "unknown",
      playingSegment: "unknown",
    },
  };

  var instance;

  function init() {
    _rootElement.innerHtml = "";
    _rootElement.style.position = "fixed";
    _rootElement.style.width = "100vw";
    _rootElement.style.height = "110vh";
    _rootElement.style.left = "0";
    _rootElement.style.top = "0";
    _rootElement.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
    _rootElement.style.fontFamily = "Sans";
    _rootElement.style.display = "none";
    _rootElement.style.overflow = "scroll";

    _visible = false;

    var contentElement = document.createElement("div");
    contentElement.style.color = "white";
    contentElement.style.padding = "1em";
    _rootElement.appendChild(contentElement);
    _contentElement = contentElement;

    renderInfo();
  }

  function updateOverlayInfo(player, testInfo) {
    var manifest =
      player.getVideoManifests()[0] || player.getAudioManifests()[0];
    var playingRepresentation = player.getPlayingVideoRepresentation();
    var playingSegment = player.getPlayingVideoSegment();
    var number = "none";
    if (playingRepresentation) number = playingRepresentation.getNumber();
    var playingSegmentNumber = "none";
    if (playingSegment) playingSegmentNumber = playingSegment.getNumber();
    setInfo({
      test: testInfo,
      video: {
        representations: manifest.getRepresentations(),
        playingRepresentation: number,
        currentTime: player.getCurrentTime(),
        playingSegment: playingSegmentNumber,
        duration: manifest.getDuration(),
      },
    });
    renderInfo();
  }

  function setInfo(info) {
    _info = info;
  }

  function show() {
    if (_visible) return;
    _visible = true;
    _rootElement.style.display = "block";
  }

  function hide() {
    if (!_visible) return;
    _visible = false;
    _rootElement.style.display = "none";
  }

  function toggle() {
    if (_visible) {
      hide();
    } else {
      show();
    }
  }

  function renderInfo() {
    var rootElement = _contentElement;
    rootElement.innerHTML = "";

    renderCloseButton(rootElement);
    renderTestInfo(rootElement);
    renderVideoInfo(rootElement);
  }

  function renderCloseButton(rootElement) {
    var buttonElement = document.createElement("div");
    buttonElement.className = "button";
    buttonElement.style.color = "white";
    buttonElement.style.borderColor = "white";
    buttonElement.style.position = "absolute";
    buttonElement.style.right = "0";
    buttonElement.innerText = "Close";
    buttonElement.addEventListener("click", function () {
      hide();
    });
    rootElement.appendChild(buttonElement);
  }

  function renderTestInfo(rootElement) {
    var testInfo = _info.test;

    var testInfoHeading = document.createElement("h3");
    testInfoHeading.innerText = "Test Information";
    testInfoHeading.style.marginTop = "3em";
    rootElement.appendChild(testInfoHeading);

    var testInfoTable = document.createElement("table");
    testInfoTable.className = "test-info-table";
    rootElement.appendChild(testInfoTable);

    var testTitleRow = document.createElement("tr");
    testInfoTable.appendChild(testTitleRow);

    var testTitleName = document.createElement("td");
    testTitleName.innerText = "Title: ";
    testTitleName.style.fontWeight = "bold";
    testTitleRow.appendChild(testTitleName);

    var testTitle = document.createElement("td");
    testTitle.innerText = testInfo.title;
    testTitleRow.appendChild(testTitle);

    var testDescriptionRow = document.createElement("tr");
    testInfoTable.appendChild(testDescriptionRow);

    var testDescriptionName = document.createElement("td");
    testDescriptionName.innerText = "Description: ";
    testDescriptionName.style.fontWeight = "bold";
    testDescriptionRow.appendChild(testDescriptionName);

    var testDescription = document.createElement("td");
    testDescription.innerText = testInfo.description;
    testDescriptionRow.appendChild(testDescription);

    var testInfoTableRows = document.querySelectorAll(".test-info-table tr");
    for (var testInfoTableRow of testInfoTableRows) {
      testInfoTableRow.style.verticalAlign = "top";
    }
  }

  function renderVideoInfo(rootElement) {
    var videoInfo = _info.video;

    var videoInfoHeading = document.createElement("h3");
    videoInfoHeading.innerText = "Video Information";
    rootElement.appendChild(videoInfoHeading);

    var videoInfoTable = document.createElement("table");
    rootElement.appendChild(videoInfoTable);

    var playingRepresentationRow = document.createElement("tr");
    videoInfoTable.appendChild(playingRepresentationRow);

    var playingRepresentationName = document.createElement("td");
    playingRepresentationName.innerText = "Current Representation:";
    playingRepresentationRow.appendChild(playingRepresentationName);

    var playingRepresentationValue = document.createElement("td");
    playingRepresentationValue.innerText = videoInfo.playingRepresentation;
    playingRepresentationRow.appendChild(playingRepresentationValue);

    var playingSegmentRow = document.createElement("tr");
    videoInfoTable.appendChild(playingSegmentRow);

    var playingSegmentName = document.createElement("td");
    playingSegmentName.innerText = "Current Segment:";
    playingSegmentRow.appendChild(playingSegmentName);

    var playingSegmentValue = document.createElement("td");
    playingSegmentValue.innerText = videoInfo.playingSegment;
    playingSegmentRow.appendChild(playingSegmentValue);

    var currentTimeRow = document.createElement("tr");
    videoInfoTable.appendChild(currentTimeRow);

    var currentTimeName = document.createElement("td");
    currentTimeName.innerText = "Current Time:";
    videoInfoTable.appendChild(currentTimeName);

    var currentTimeValue = document.createElement("td");
    currentTimeValue.innerText = InfoOverlay.parseTimeStampFromSeconds(
      videoInfo.currentTime
    );
    videoInfoTable.appendChild(currentTimeValue);

    var durationRow = document.createElement("tr");
    videoInfoTable.appendChild(durationRow);

    var durationName = document.createElement("td");
    durationName.innerText = "Duration:";
    durationRow.appendChild(durationName);

    var durationValue = document.createElement("td");
    durationValue.innerText = InfoOverlay.parseTimeStampFromSeconds(
      videoInfo.duration
    );
    durationRow.appendChild(durationValue);

    var representationsWrapper = document.createElement("div");
    representationsWrapper.style.marginBottom = "10em";
    for (var i = 0; i < videoInfo.representations.length; i++) {
      var representation = videoInfo.representations[i];
      renderRepresentation(representationsWrapper, representation);
    }
    rootElement.appendChild(representationsWrapper);
  }

  function renderRepresentation(rootElement, representation) {
    if (!representation) return;
    var representationTitle = document.createElement("h4");
    representationTitle.innerText =
      "Representation " + representation.getNumber();
    rootElement.appendChild(representationTitle);

    var representationTable = document.createElement("table");
    representationTable.className = "represent-table";
    rootElement.appendChild(representationTable);

    var nameRow = document.createElement("tr");
    representationTable.appendChild(nameRow);

    var nameName = document.createElement("td");
    nameName.innerText = "Name:";
    nameRow.appendChild(nameName);

    var nameValue = document.createElement("td");
    nameValue.innerText = representation.getName();
    nameRow.appendChild(nameValue);

    var codecRow = document.createElement("tr");
    representationTable.appendChild(codecRow);

    var codecName = document.createElement("td");
    codecName.innerText = "Codecs:";
    codecRow.appendChild(codecName);

    var codecValue = document.createElement("td");
    codecValue.innerText = representation.getCodecs();
    codecRow.appendChild(codecValue);

    var resolutionRow = document.createElement("tr");
    representationTable.appendChild(resolutionRow);

    var resolutionName = document.createElement("td");
    resolutionName.innerText = "Resolution:";
    resolutionRow.appendChild(resolutionName);

    var resolution = representation.getResolution();
    var resolutionValue = document.createElement("td");
    if (resolution) {
      resolutionValue.innerText = resolution.width + "x" + resolution.height;
    }
    resolutionRow.appendChild(resolutionValue);

    var bandwidthRow = document.createElement("tr");
    representationTable.appendChild(bandwidthRow);

    var bandwidthName = document.createElement("td");
    bandwidthName.innerText = "Bandwidth:";
    bandwidthRow.appendChild(bandwidthName);

    var bandwidthValue = document.createElement("td");
    bandwidthValue.innerText = representation.getBandwidth();
    bandwidthRow.appendChild(bandwidthValue);

    var segmentsRow = document.createElement("tr");
    representationTable.appendChild(segmentsRow);

    var segmentsName = document.createElement("td");
    segmentsName.innerText = "Segments:";
    segmentsRow.appendChild(segmentsName);

    var segmentsValue = document.createElement("td");
    segmentsValue.innerText = representation.getTotalSegmentsCount();
    segmentsRow.appendChild(segmentsValue);
  }

  instance = {
    init: init,
    updateOverlayInfo: updateOverlayInfo,
    show: show,
    hide: hide,
  };

  return instance;
}

InfoOverlay.parseTimeStampFromSeconds = function (seconds) {
  function pad(number, length) {
    var string = "0000000000" + number;
    return string.substr(string.length - length);
  }

  var parsedSeconds = Math.floor(seconds) % 60;
  var parsedMinutes = Math.floor(seconds / 60) % 60;
  var parsedHours = Math.floor(seconds / 60 / 60);

  return (
    pad(parsedHours, 2) +
    ":" +
    pad(parsedMinutes, 2) +
    ":" +
    pad(parsedSeconds, 2)
  );
};

//https://stackoverflow.com/questions/979975/how-to-get-the-value-from-the-get-parameters
var urlParams;
(window.onpopstate = function () {
  var match,
    pl = /\+/g, // Regex for replacing addition symbol with a space
    search = /([^&=]+)=?([^&]*)/g,
    decode = function (s) {
      return decodeURIComponent(s.replace(pl, " "));
    },
    query = window.location.search.substring(1);

  urlParams = {};
  while ((match = search.exec(query)))
    urlParams[decode(match[1])] = decode(match[2]);
})();
