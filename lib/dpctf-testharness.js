function DpctfTest(config) {
  var testInfo = config.testInfo;
  var video = config.videoElement;
  var qrCode = config.qrCodeElement;
  var infoOverlayElement = config.infoOverlayElement;
  var outOfOrderLoading = config.outOfOrderLoading || false;
  var executeTestCallback = config.executeTest || function () {};
  var setupTestCallback = config.setupTest;

  var minBufferDuration = config.minBufferDuration || 30;

  var waveService = null;
  var player = null;
  var ignoreObservations = false;
  var resolveWaitForObservation = null;
  var resolveWaitingForResults = null;

  var ACTION_INITIALIZE = "initialize";
  var ACTION_PLAY = "play";
  var ACTION_PAUSE = "pause";

  var VIDEO_STATE_WAITING = "waiting";
  var VIDEO_STATE_BUFFERING = "buffering";
  var VIDEO_STATE_PLAYING = "playing";
  var VIDEO_STATE_PAUSED = "paused";
  var VIDEO_STATE_ENDED = "ended";

  var _lastAction = ACTION_INITIALIZE;
  var _videoState = VIDEO_STATE_WAITING;

  var EXECUTION_MODE_AUTO = "auto";
  var EXECUTION_MODE_MANUAL = "manual";
  var EXECUTION_MODE_PRGRAMMATIC = "programmatic";

  var _execution_mode = urlParams["mode"] || EXECUTION_MODE_AUTO;

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
    var videoManifest = player.getVideoManifest();
    checkMimeAndCodecSupport(videoManifest);
    var audioManifest = player.getAudioManifest();
    checkMimeAndCodecSupport(audioManifest);
    return Promise.resolve();
  }

  function setupTest(error) {
    if (error) return error;
    log("Setting up test");
    updateQrCode();
    return new Promise(function (resolve) {
      //// Configure Test Harness ////
      setup({
        explicit_timeout: true,
        explicit_done: true,
      });

      video.addEventListener("play", function () {
        _lastAction = ACTION_PLAY;
        _videoState = VIDEO_STATE_PLAYING;
        updateQrCode();
      });

      video.addEventListener("pause", function () {
        _videoState = VIDEO_STATE_PAUSED;
        updateQrCode();
      });

      video.addEventListener("ended", function () {
        _videoState = VIDEO_STATE_ENDED;
        updateQrCode();
      });

      //// Player Setup ////
      player = new Player(video);

      player.on(Player.PLAYER_EVENT_START_BUFFERING, function () {
        _videoState = VIDEO_STATE_BUFFERING;
        updateQrCode();
      });

      player
        .init({
          bufferTime: minBufferDuration,
          numberOfSegmentBeforePlay: 2,
          outOfOrderLoading: outOfOrderLoading,
        })
        .then(() => {
          return Promise.all([
            player.loadVideo(videoContentModel),
            player.loadAudio(audioContentModel),
          ]);
        })
        .then(
          () =>
            new Promise(function (resolve) {
              if (!setupTestCallback) resolve();
              setupTestCallback(player, resolve);
            })
        )
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

          player.on("onTimeUpdate", function (currentTime) {
            infoOverlay.updateOverlayInfo(player, testInfo);
          });

          player.on("onPlayingVideoRepresentationChange", function (
            currentRepresentation
          ) {
            infoOverlay.updateOverlayInfo(player, testInfo);
          });

          if (!player.getVideoManifest()) {
            player.on("onVideoManifestParsed", function (manifest) {
              resolve();
            });
          } else {
            resolve();
          }
        });
    });
  }

  function executeTest(error) {
    if (error) return error;
    log("Executing test");
    return new Promise(function (resolve) {
      executeTestCallback(player, resolve);
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

  function updateQrCode() {
    if (!qrCode) return;
    var content = JSON.stringify({ state: _videoState, action: _lastAction });
    console.log(content);
    qrCode.innerHTML = "";
    new QRCode(qrCode, content);
  }
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
    _rootElement.style.height = "100vh";
    _rootElement.style.left = "0";
    _rootElement.style.top = "0";
    _rootElement.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
    _rootElement.style.fontFamily = "Sans";
    _rootElement.style.display = "none";
    _visible = false;

    var contentElement = document.createElement("div");
    contentElement.style.color = "white";
    contentElement.style.padding = "1em";
    _rootElement.appendChild(contentElement);
    _contentElement = contentElement;

    renderInfo();
  }

  function updateOverlayInfo(player, testInfo) {
    var manifest = player.getVideoManifest();
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

    renderTestInfo(rootElement);
    renderVideoInfo(rootElement);
  }

  function renderTestInfo(rootElement) {
    var testInfo = _info.test;

    var testInfoHeading = document.createElement("h3");
    testInfoHeading.innerText = "Test Information";
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
    for (var i = 0; i < videoInfo.representations.length; i++) {
      var representation = videoInfo.representations[i];
      renderRepresentation(representationsWrapper, representation);
    }
    rootElement.appendChild(representationsWrapper);
  }

  function renderRepresentation(rootElement, representation) {
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
    resolutionValue.innerText = resolution.width + "x" + resolution.height;
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
