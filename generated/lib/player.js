var sessions = [];
var messageFormat = "utf8";

const VIDEO = "video";
const AUDIO = "audio";

var PLAYER_EVENT_START_BUFFERING = "onPlayerStartBuffering";
var PLAYER_EVENT_TRIGGER_PLAY = "onPlayerTriggerPlay";
var PLAYER_EVENT_TRIGGER_PAUSE = "onPlayerTriggerPause";
var CLOSE_BUFFER_EVENT = "close_buffer";
var ALL_SEGMENTS_LOADED_EVENT = "onAllSegmentsLoaded";
var MEDIA_SOURCE_SHOULD_REINITIALIZE = "media_source_should_reinitialize";
var MEDIA_SOURCE_REINITIALIZED = "media_source_reinitialized";

function Player(video, options) {
  let instance;
  let _settings;
  let _video = video;
  _video.onerror = function (error) {
    console.error("Error " + JSON.stringify(error));
  };
  _video.addEventListener("timeupdate", handleTimeUpdate);
  let _duration;
  let _mediaSource;
  let _eventEmitter = new EventEmitter();

  let _videoBufferManager;
  let _audioBufferManager;
  let _protectionController;
  let _mimeCodecChanges = {};

  var logger = options.logger;

  function init(settings) {
    if (_mediaSource) throw new Error("Player already initialized");
    if (!settings.bufferTime) settings.bufferTime = 30;
    if (!settings.parallelLoading) settings.parallelLoading = false;
    if (!settings.concatAndSplit) settings.concatAndSplit = false;
    if (!settings.outOfOrderLoading) settings.outOfOrderLoading = false;
    if (!settings.loading) settings.loading = null;
    if (!settings.useChangeType) settings.useChangeType = false;
    if (!"autoCloseStream" in settings) {
      settings.autoCloseStream = true;
    }
    _settings = settings;
    _settings.logger = logger;

    video.addEventListener("encrypted", function (event) {
      if (event.type !== "encrypted") return;
      var config = {
        initData: event.initData,
        initDataType: event.initDataType,
      };
      _protectionController.handleEncryption(config);
    });
    video.addEventListener("waiting", function (event) {
      handleBufferUnderrun(event);
    });
    video.addEventListener("playing", function (event) {
      video.autoplay = true;
    });
    video.addEventListener("error", function (event) {
      var error = video.error;
      logger.error("video error: " + error);
    });
    _eventEmitter.on(MEDIA_SOURCE_SHOULD_REINITIALIZE, function () {
      reinitializeMediaSource();
    });
    return new Promise((resolve) => {
      createMediaSource().then(function (mediaSource) {
        _mediaSource = mediaSource;
        resolve();
      });
    });
  }

  function getCurrentTime() {
    return _video.currentTime;
  }

  function setCurrentTime(currentTime) {
    _video.currentTime = currentTime;
    if (_videoBufferManager)
      _videoBufferManager.handleCurrentTimeChange(currentTime);
    if (_audioBufferManager)
      _audioBufferManager.handleCurrentTimeChange(currentTime);
  }

  function getDuration() {
    return _duration;
  }

  function setDuration(duration) {
    _duration = duration;
    if (_mediaSource) {
      _mediaSource.duration = duration;
    }
    if (_videoBufferManager) _videoBufferManager.setDuration(duration);
    if (_audioBufferManager) _audioBufferManager.setDuration(duration);
  }

  function getVideo() {
    return _video;
  }

  function setBufferTime(bufferTime) {
    _settings.bufferTime = bufferTime;
    if (_videoBufferManager) _videoBufferManager.setBufferTime(bufferTime);
    if (_audioBufferManager) _audioBufferManager.setBufferTime(bufferTime);
  }

  function getBufferTime() {
    return _settings.bufferTime;
  }

  function setAppendWindow(appendWindow) {
    if (_videoBufferManager) _videoBufferManager.setAppendWindow(appendWindow);
    if (_audioBufferManager) _audioBufferManager.setAppendWindow(appendWindow);
  }

  function setMaxBackwardBuffer(maxBackwardBuffer) {
    if (_videoBufferManager)
      _videoBufferManager.setMaxBackwardBuffer(maxBackwardBuffer);
    if (_audioBufferManager)
      _audioBufferManager.setMaxBackwardBuffer(maxBackwardBuffer);
  }

  function play() {
    _eventEmitter.dispatchEvent(PLAYER_EVENT_TRIGGER_PLAY);
    return _video.play();
  }

  function playOnBufferLoaded(duration) {
    return new Promise(function (done) {
      if (
        getPreBufferedTime() >= duration ||
        getPreBufferedTime() >= getDuration()
      ) {
        play()
          .then(function () {
            done();
          })
          .catch(function (error) {
            done(error);
          });
      } else {
        var handler = function (event) {
          if (
            getPreBufferedTime() >= duration ||
            getPreBufferedTime() >= getDuration()
          ) {
            play()
              .then(function () {
                done();
              })
              .catch(function (error) {
                done(error);
              })
              .finally(function () {
                off(handler);
              });
          }
        };
        if (
          _videoBufferManager &&
          _videoBufferManager.getManifests().length > 0
        )
          on("onVideoSegmentLoaded", handler);
        if (
          _audioBufferManager &&
          _audioBufferManager.getManifests().length > 0
        )
          on("onAudioSegmentLoaded", handler);
      }
    });
  }

  function pause() {
    return new Promise(function (resolve) {
      var handlePausingFinished = function () {
        _video.removeEventListener("pause", handlePausingFinished);
        resolve();
      };
      _eventEmitter.dispatchEvent(PLAYER_EVENT_TRIGGER_PAUSE);
      _video.addEventListener("pause", handlePausingFinished);
      _video.pause();
    });
  }

  function on(eventName, callback) {
    if (
      _videoBufferManager &&
      eventName !== "onVideoManifestParsed" &&
      eventName.indexOf("Video") !== -1
    ) {
      _videoBufferManager.on(eventName.replace("Video", ""), callback);
      return;
    }
    if (
      _audioBufferManager &&
      eventName !== "onAudioManifestParsed" &&
      eventName.indexOf("Audio") !== -1
    ) {
      _audioBufferManager.on(eventName.replace("Audio", ""), callback);
      return;
    }
    _eventEmitter.on(eventName, callback);
  }

  function off(callback) {
    _eventEmitter.off(callback);
    if (_videoBufferManager) _videoBufferManager.off(callback);
    if (_audioBufferManager) _audioBufferManager.off(callback);
  }

  function loadVideo(vectorUrls) {
    if (!vectorUrls || vectorUrls.length === 0) {
      logger.warn("no video mpd provided!");
      return;
    }
    return loadMedia({ vectorUrls, mediaType: VIDEO }).then(
      ({ bufferManager, manifests }) => {
        _videoBufferManager = bufferManager;
        _videoBufferManager.setRole("video");
        _eventEmitter.dispatchEvent("onVideoManifestParsed", manifests);
      }
    );
  }

  function loadAudio(vectorUrls) {
    if (!vectorUrls || vectorUrls.length === 0) {
      logger.warn("no audio mpd provided!");
      return;
    }
    return loadMedia({ vectorUrls, mediaType: AUDIO }).then(
      ({ bufferManager, manifests }) => {
        _audioBufferManager = bufferManager;
        _audioBufferManager.setRole("audio");
        _eventEmitter.dispatchEvent("onAudioManifestParsed", manifests);
      }
    );
  }

  function loadMedia({ vectorUrls, mediaType }) {
    if (!_mediaSource) throw new Error("Player not initialized");
    return Promise.all(
      vectorUrls.map((vectorUrl, index) =>
        ManifestParser.parse(vectorUrl, index)
      )
    ).then(function (manifests) {
      _settings.registerMimeCodecChange = function (timestamp, mimeCodec) {
        registerMimeCodecChange(mediaType, timestamp, mimeCodec);
      };
      let bufferManager = new BufferManager(
        manifests,
        _mediaSource,
        _video,
        _settings
      );
      bufferManager.on(ALL_SEGMENTS_LOADED_EVENT, function () {
        closeStream();
      });
      bufferManager.on(MEDIA_SOURCE_SHOULD_REINITIALIZE, function () {
        _eventEmitter.dispatchEvent(MEDIA_SOURCE_SHOULD_REINITIALIZE);
      });
      var promises = [];
      for (let manifest of manifests) {
        var bufferOffset = 0;
        for (var periodId in manifest.getPeriods()) {
          var period = manifest.getPeriods()[periodId];
          var representation;
          for (var nextRepresentation of period) {
            if (nextRepresentation.getMimeCodec().indexOf(mediaType) === -1)
              continue;
            representation = nextRepresentation;
            break;
          }
          if (!representation) {
            throw new Error(
              "No representation of type " + mediaType + " found!"
            );
          }
          var periodNumber = representation.getPeriodNumber();

          var totalSegmentsCount = manifest
            .getRepresentation(representation.getNumber(), periodNumber)
            .getTotalSegmentsCount();
          var promise = bufferManager
            .setSegments({
              representationNumber: representation.getNumber(),
              startSegment: 0,
              endSegment: totalSegmentsCount - 1,
              bufferOffset: bufferOffset,
              periodNumber: periodNumber,
            })
            .then(function (duration) {
              bufferOffset += totalSegmentsCount;
              setDuration(duration);
            });
          promises.push(promise);
          return Promise.all(promises).then(() => ({
            bufferManager,
            manifests,
          }));
        }
      }
    });
  }

  function initializeProtectionController() {
    var videoMimeCodec = "";
    if (_videoBufferManager) {
      var representation = _videoBufferManager
        .getManifests()
        .reduce(function (representations, manifest) {
          return representations.concat(manifest.getRepresentations());
        }, [])
        .find(function (representation) {
          return representation.getMimeCodec().indexOf("video") !== -1;
        });
      videoMimeCodec = representation.getMimeCodec();
    }
    var audioMimeCodec = "";
    if (_audioBufferManager) {
      var representation = _audioBufferManager
        .getManifests()
        .reduce(function (representations, manifest) {
          return representations.concat(manifest.getRepresentations());
        }, [])
        .find(function (representation) {
          return representation.getMimeCodec().indexOf("audio") !== -1;
        });
      audioMimeCodec = representation.getMimeCodec();
    }
    _protectionController = new EncryptionController(
      video,
      videoMimeCodec,
      audioMimeCodec,
      { logger: logger }
    );
  }

  function setProtectionData(config) {
    if (!_protectionController) initializeProtectionController();
    var keyId = config.keyId;
    var contentKey = config.contentKey;
    var initData = new TextEncoder().encode(JSON.stringify({ kids: [keyId] }));
    var initDataType = "keyids";
    _protectionController.handleEncryption({
      initData,
      initDataType,
      contentKey,
    });
  }

  function createMediaSource() {
    logger.debug("creating media source");
    return new Promise(function (resolve) {
      var mediaSource = new MediaSource();
      _video.src = URL.createObjectURL(mediaSource);
      var handleMediaSourceOpened = function () {
        mediaSource.removeEventListener("sourceopen", handleMediaSourceOpened);
        if (self.duration) {
          mediaSource.duration = self.duration;
        }
        resolve(mediaSource);
      };
      mediaSource.addEventListener("sourceopen", handleMediaSourceOpened);
    });
  }

  function reinitializeMediaSource() {
    logger.debug("reinitializing media source");
    var currentTime = video.currentTime;
    video.removeAttribute("src");
    video.load();
    createMediaSource().then(function (mediaSource) {
      setCurrentTime(currentTime);
      if (_videoBufferManager) {
        _videoBufferManager.setMediaSource(mediaSource);
      }
      if (_audioBufferManager) {
        _audioBufferManager.setMediaSource(mediaSource);
      }
    });
  }

  function handleTimeUpdate(event) {
    _eventEmitter.dispatchEvent("onTimeUpdate", _video.currentTime);
  }

  function getPreBufferedTime() {
    let bufferedTime;

    if (_videoBufferManager) {
      bufferedTime = _videoBufferManager.getPreBufferedTime();
    }

    if (_audioBufferManager) {
      let bufferedAudioTime = _audioBufferManager.getPreBufferedTime();
      if (!bufferedTime) {
        bufferedTime = bufferedAudioTime;
      } else {
        bufferedTime =
          bufferedTime > bufferedAudioTime ? bufferedAudioTime : bufferedTime;
      }
    }

    return bufferedTime;
  }

  function startBuffering() {
    if (!_protectionController) initializeProtectionController();
    if (_videoBufferManager) _videoBufferManager.startBuffering();
    if (_audioBufferManager) _audioBufferManager.startBuffering();
    _eventEmitter.dispatchEvent(PLAYER_EVENT_START_BUFFERING);
  }

  function pauseBuffering() {
    if (_videoBufferManager) _videoBufferManager.pauseBuffering();
    if (_audioBufferManager) _audioBufferManager.pauseBuffering();
  }

  function registerMimeCodecChange(type, timestamp, mimeCodec) {
    _mimeCodecChanges[timestamp] = { mimeCodec, type };
  }

  function handleBufferUnderrun(event) {
    let videoMimeCodec = null;
    if (_videoBufferManager) {
      videoMimeCodec = _videoBufferManager.getCurrentMimeCodec();
    }
    let audioMimeCodec = null;
    if (_audioBufferManager) {
      audioMimeCodec = _audioBufferManager.getCurrentMimeCodec();
    }
    var isChangeType = false;
    for (let timestamp of Object.keys(_mimeCodecChanges).sort()) {
      if (timestamp < video.currentTime) continue;
      let change = _mimeCodecChanges[timestamp];
      switch (change.type) {
        case VIDEO:
          videoMimeCodec = change.mimeCodec;
          break;
        case AUDIO:
          audioMimeCodec = change.mimeCodec;
          break;
      }
      isChangeType = true;
      break;
    }
    if (!isChangeType) return;
    let currentTime = 0;
    let bufferManager = _videoBufferManager || _audioBufferManager;
    let currentSegment = bufferManager.getPlayingSegment();
    for (let segment of bufferManager.getSegments()) {
      currentTime += segment.getDuration();
      if (segment === currentSegment) break;
    }
    video.removeAttribute("src");
    video.load();
    createMediaSource().then(function (mediaSource) {
      setCurrentTime(currentTime);
      if (_videoBufferManager) {
        _videoBufferManager.setMediaSource(mediaSource);
        _videoBufferManager.startBuffering();
      }
      if (_audioBufferManager) {
        _audioBufferManager.setMediaSource(mediaSource);
        _audioBufferManager.startBuffering();
      }
    });
  }

  function closeStream() {
    logger.debug("attempting to close stream");
    if (_videoBufferManager && !_videoBufferManager.hasLoadedAllSegments()) {
      logger.debug("cannot close stream, video segments still loading");
      return;
    }
    if (_audioBufferManager && !_audioBufferManager.hasLoadedAllSegments()) {
      logger.debug("cannot close stream, audio segments still loading");
      return;
    }

    logger.debug("closing stream");
    return Promise.resolve()
      .then(function () {
        if (!_videoBufferManager) return Promise.resolve();
        return _videoBufferManager.waitForSourceBufferUpdate();
      })
      .then(function () {
        if (!_audioBufferManager) return Promise.resolve();
        return _audioBufferManager.waitForSourceBufferUpdate();
      })
      .then(function () {
        try {
          _mediaSource.endOfStream();
        } catch (error) {
          logger.error("error closing media source: " + error);
          return;
        }
      });
  }

  function truncateBuffer() {
    var promises = [];
    if (_videoBufferManager)
      promises.push(_videoBufferManager.truncateBuffer());
    if (_audioBufferManager)
      promises.push(_audioBufferManager.truncateBuffer());
    return Promise.all(promises);
  }

  //function getRepresentations() {
  //let videoRepresentations = [];
  //let audioRepresentations = [];

  //if (_videoBufferManager)
  //videoRepresentations = _videoBufferManager.getRepresentations();
  //if (_audioBufferManager)
  //audioRepresentations = _audioBufferManager.getRepresentations();

  //return videoRepresentations.concat(audioRepresentations);
  //}

  function getVideoManifests() {
    if (_videoBufferManager) return _videoBufferManager.getManifests();
    return [];
  }

  function getAudioManifests() {
    if (_audioBufferManager) return _audioBufferManager.getManifests();
    return [];
  }

  function getPlayingVideoSegment() {
    if (!_videoBufferManager) return;
    return _videoBufferManager.getPlayingSegment();
  }

  function getPlayingVideoRepresentation() {
    if (!_videoBufferManager) return;
    return _videoBufferManager.getPlayingRepresentation();
  }

  function setVideoSegments(segmentsInfo) {
    if (!_videoBufferManager) return;
    return _videoBufferManager
      .setSegments(segmentsInfo)
      .then(function (duration) {
        setDuration(duration);
      });
  }

  function getVideoSegments() {
    if (!_videoBufferManager) return;
    return _videoBufferManager.getSegments();
  }

  function setAudioSegments(segmentsInfo) {
    if (!_audioBufferManager) return;
    return _audioBufferManager
      .setSegments(segmentsInfo)
      .then(function (duration) {
        setDuration(duration);
      });
  }

  function getAudioSegments() {
    if (!_audioBufferManager) return;
    return _audioBufferManager.getSegments();
  }

  function getVideoSegmentsCount() {
    if (!_videoBufferManager) return;
    return _videoBufferManager.getSegmentsCount();
  }

  function getAudioSegmentsCount() {
    if (!_audioBufferManager) return;
    return _audioBufferManager.getSegmentsCount();
  }

  function clearVideoSegments() {
    if (!_videoBufferManager) return;
    return _videoBufferManager.clearSegments();
  }

  function clearAudioSegments() {
    if (!_audioBufferManager) return;
    return _audioBufferManager.clearSegments();
  }

  function setVideoGaps(gaps) {
    if (!_videoBufferManager) return;
    return _videoBufferManager.setGaps(gaps);
  }

  function getVideoBufferManager() {
    return _videoBufferManager;
  }

  instance = {
    init,
    getVideoManifests,
    getAudioManifests,
    getCurrentTime,
    setCurrentTime,
    getDuration,
    setDuration,
    getVideo,
    getPlayingVideoSegment,
    getPlayingVideoRepresentation,
    setVideoSegments,
    getVideoSegments,
    setAudioSegments,
    getAudioSegments,
    getVideoSegmentsCount,
    getAudioSegmentsCount,
    setVideoGaps,
    clearAudioSegments,
    clearVideoSegments,
    setBufferTime,
    getBufferTime,
    setAppendWindow,
    setMaxBackwardBuffer,
    on,
    off,
    startBuffering,
    pauseBuffering,
    play,
    playOnBufferLoaded,
    pause,
    loadVideo,
    loadAudio,
    getPreBufferedTime,
    setProtectionData,
    closeStream,
    truncateBuffer,
    getVideoBufferManager,
  };

  return instance;
}

Player.PLAYER_EVENT_START_BUFFERING = PLAYER_EVENT_START_BUFFERING;
Player.PLAYER_EVENT_TRIGGER_PLAY = PLAYER_EVENT_TRIGGER_PLAY;
Player.EVENT_CLOSE_BUFFER = CLOSE_BUFFER_EVENT;

function BufferManager(manifests, mediaSource, video, options) {
  let instance;

  let _manifests = manifests || [];
  let _mediaSource = mediaSource;
  let _video = video;
  _video.addEventListener("timeupdate", handleTimeUpdate);
  _video.addEventListener("seeking", handleSeeking);
  let _segments = {};
  let _playingSegment;
  let _gaps = [];
  let _playingRepresentation;
  let _bufferingSegment = 0;
  let _isBuffering;
  let _isBufferingSegment;
  let _isAppendingBuffer;
  let _bufferTime = options.bufferTime || 30;
  let _concatAndSplit = options.concatAndSplit || false;
  let _parallelLoading = options.parallelLoading || false;
  let _outOfOrderLoading = options.outOfOrderLoading || false;
  let _loading = options.loading || null;
  let _useChangeType = options.useChangeType;
  let _sourceBuffer;
  let _bufferQueue;
  let _bufferingPeriodNumber;
  let _lastInitSegmentUrl;
  let _currentMimeCodec;
  let _registerMimeCodecChange = options.registerMimeCodecChange;
  let _initCallback = options.initCallback;
  let _maxBackwardBuffer = options.maxBackwardBuffer;
  let _appendWindowBoundaries = options.appendWindowBoundaries;
  let _currentAppendWindow = 0;
  let _timestampOffsets = options.timestampOffsets;
  let _maxBufferSizeReached = false;
  let _loadedAllSegments = false;
  var _role = options.role || "";
  var logger = getLogger();

  let _eventEmitter = new EventEmitter();

  function getSegments() {
    return _segments;
  }

  function setSegments(segmentsInfo) {
    var representationNumber = segmentsInfo.representationNumber;
    var startSegment = parseInt(segmentsInfo.startSegment);
    var endSegment = parseInt(segmentsInfo.endSegment);
    var periodNumber = segmentsInfo.periodNumber || 0;
    var offset = segmentsInfo.segmentOffset || 0;
    var bufferOffset = segmentsInfo.bufferOffset || 0;
    var manifestIndex = segmentsInfo.manifestIndex || 0;
    var representation = _manifests[manifestIndex].getRepresentation(
      representationNumber,
      periodNumber
    );
    if (!representation) {
      throw new Error(
        "Representation not found! m:" +
          manifestIndex +
          ", r:" +
          representationNumber +
          ", p:" +
          periodNumber
      );
    }
    var timestampOffset = 0;
    if (offset !== 0) {
      var regularTimestamp = 0;
      for (var i = 0; i < startSegment; i++) {
        var segment = _segments[i];
        regularTimestamp += segment.getDuration();
      }
      var actualTimestamp = 0;
      for (var i = 0; i < startSegment + offset; i++) {
        var segment = representation.getSegment(i);
        actualTimestamp += segment.getDuration();
      }
      timestampOffset = regularTimestamp - actualTimestamp;
    }

    for (var i = startSegment; i <= endSegment; i++) {
      if (representation.getTotalSegmentsCount() <= i + offset)
        throw new Error(
          "Segment index in playout out of bounds: " +
            (i + offset + 1) +
            ", but only got " +
            representation.getTotalSegmentsCount()
        );
      var segment = representation.getSegment(i + offset).copy();
      segment.setTimestampOffset(timestampOffset);
      segment.setManifestIndex(manifestIndex);
      _segments[i + bufferOffset] = segment;
    }
    updatePlayingSegment();

    var playingSegment = _playingSegment.getNumber();
    var bufferingSegment = _bufferingSegment;
    if (playingSegment < endSegment && bufferingSegment > startSegment) {
      if (playingSegment < startSegment) {
        setBufferingSegment(startSegment);
      } else {
        setBufferingSegment(playingSegment);
      }
    }

    var totalDuration = 0;
    for (var segment of Object.values(_segments)) {
      if (!segment) continue;
      totalDuration += segment.getDuration();
    }
    setDuration(totalDuration);
    return waitForSourceBufferUpdate().then(function () {
      return Promise.resolve(totalDuration);
    });
  }

  function clearSegments() {
    _segments = {};
  }

  function getSegmentsCount() {
    return Object.keys(_segments).length;
  }

  function updatePlayingSegment() {
    var segmentTime = 0;
    for (var i = 0; i < Object.keys(_segments).length; i++) {
      var segment = _segments[i];
      segmentTime += segment.getDuration();
      if (segmentTime <= _video.currentTime) continue;
      var manifestIndex = segment.getManifestIndex();
      var representation = _manifests[manifestIndex].getRepresentation(
        segment.getRepresentationNumber(),
        segment.getPeriodNumber()
      );
      setPlayingRepresentation(representation);
      setPlayingSegment(segment);
      break;
    }
  }

  function getPlayingSegment() {
    return _playingSegment;
  }

  function setPlayingSegment(segment) {
    var segmentNumber = segment.getNumber();
    var representationNumber = segment.getRepresentationNumber();
    if (
      _playingSegment &&
      _playingRepresentation.getNumber() === representationNumber &&
      _playingSegment.getNumber() === segmentNumber
    )
      return;
    _playingSegment = segment;
    _eventEmitter.dispatchEvent("onPlayingSegmentChange", segment);
  }

  function getPlayingRepresentation() {
    return _playingRepresentation;
  }

  function setPlayingRepresentation(representation) {
    if (
      _playingRepresentation &&
      _playingRepresentation.getNumber() === representation.getNumber() &&
      _playingRepresentation.getManifestIndex() ===
        representation.getManifestIndex()
    )
      return;
    _playingRepresentation = representation;
    _eventEmitter.dispatchEvent(
      "onPlayingRepresentationChange",
      _playingRepresentation
    );
  }

  function setGaps(gaps) {
    _gaps = [];
    for (var gap of gaps) {
      _gaps.push({
        start: gap.gapStart,
        duration: gap.gapDuration,
      });
    }
  }

  function startBuffering() {
    if (_isBuffering) {
      logger.debug("start buffering: already buffering");
      return;
    }
    if (!_segments) {
      logger.debug("start buffering: no segments to buffer");
      return;
    }
    if (_parallelLoading) {
      logger.info("start buffering in parallel");
    } else {
      logger.info("start buffering sequentially");
    }
    _isBuffering = true;
    bufferVideo();
  }

  function pauseBuffering() {
    _isBuffering = false;
  }

  function bufferVideo() {
    if (!_isBuffering) return;
    var preBufferedTime = getPreBufferedTime();
    if (preBufferedTime >= _bufferTime) {
      if (!_maxBufferSizeReached) {
        _maxBufferSizeReached = true;
        logger.debug(
          "forward buffer has 'min_buffer_duration', stop buffering (ct: " +
            video.currentTime +
            ")"
        );
      }
      return;
    }
    _maxBufferSizeReached = false;
    if (_isBufferingSegment) {
      logger.debug("already buffering segment");
      return;
    }
    _isBufferingSegment = true;

    var segment = getNextBufferSegment();
    if (!segment) {
      logger.info("no more segments to buffer");
      _isBuffering = false;
      _isBufferingSegment = false;
      var updating = _sourceBuffer.updating;
      _loadedAllSegments = true;
      _eventEmitter.dispatchEvent(ALL_SEGMENTS_LOADED_EVENT);
      return;
    }
    logger.debug("next segment to buffer: " + segment.getNumber());
    bufferSegment(segment).then(function () {
      _isBufferingSegment = false;
      bufferVideo();
    });
  }

  function getPreBufferedTime() {
    var bufferedTime = 0;
    if (_bufferingSegment >= _segments.length) return;
    for (var i = 0; i < _bufferingSegment; i++) {
      var segment = _segments[i];
      bufferedTime += segment.getDuration();
    }

    return bufferedTime - _video.currentTime;
  }

  function getNextBufferSegment() {
    if (!_bufferingSegment && _bufferingSegment !== 0) {
      setBufferingSegment(0);
    }
    var segment = _segments[_bufferingSegment];
    if (_outOfOrderLoading && _loading) {
      var nextSegmentIndex = _loading[_bufferingSegment] - 1;
      segment = _segments[nextSegmentIndex];
    }
    return segment;
  }

  function bufferSegment(segment) {
    var segmentNumber = segment.getNumber();
    var representationNumber = segment.getRepresentationNumber();
    var manifestIndex = segment.getManifestIndex();
    var representation = _manifests[manifestIndex].getRepresentation(
      representationNumber,
      segment.getPeriodNumber()
    );
    var mimeCodec = representation.getMimeCodec();
    logger.debug(
      "buffering segment [" +
        manifestIndex +
        ", " +
        representationNumber +
        ", " +
        segmentNumber +
        "] (" +
        mimeCodec +
        ") (ct: " +
        video.currentTime +
        ")"
    );

    return new Promise(function (resolve) {
      var fetchJobs = [];

      if (segment.getChunks().length === 0) {
        fetchJobs.push({
          url: segment.getUrl(),
        });
      } else {
        logger.debug("segment has " + segment.getChunks().length + " chunks");
        for (var chunk of segment.getChunks()) {
          fetchJobs.push({
            url: chunk.resolvedUri,
            chunkNumber: chunk.number,
          });
        }
        fetchJobs.sort(function (j1, j2) {
          return j1.chunkNumber - j2.chunkNumber;
        });
      }

      if (_concatAndSplit && fetchJobs.length > 1) {
        logger.debug("concatenate and split segment chunks");
        Promise.all(
          fetchJobs.map(function (job) {
            return fetchSegment(job.url).then(function (arrayBuffer) {
              return { buffer: arrayBuffer, number: job.chunkNumber };
            });
          })
        ).then(function (chunks) {
          chunks.sort(function (c1, c2) {
            return c1.number - c2.number;
          });

          var concatenatedBuffer = concatenateBuffers(
            chunks.map(function (chunk) {
              return chunk.buffer;
            })
          );

          var newArrayBuffers = randomSplitBuffer(
            concatenatedBuffer,
            chunks.length * 2
          );

          Promise.all(
            newArrayBuffers.map(function (arrayBuffer) {
              return queueBuffer({
                arrayBuffer: arrayBuffer,
                segment: segment,
              });
            })
          ).then(resolve);
          return;
        });
      }

      var currentJob = 0;
      function bufferSegment() {
        return new Promise(function (resolveJob) {
          var fetchJob = fetchJobs[currentJob];
          var promise = fetchSegment(fetchJob.url).then(function (arrayBuffer) {
            return queueBuffer({
              arrayBuffer: arrayBuffer,
              segment: segment,
              chunkNumber: fetchJob.chunkNumber,
              lastChunk: fetchJob.chunkNumber == fetchJobs.length,
            });
          });
          if (_parallelLoading) {
            resolveJob();
          }
          promise.then(resolveJob);
        });
      }

      function bufferNextSegment() {
        bufferSegment().then(function () {
          currentJob++;
          if (currentJob === fetchJobs.length) {
            resolve();
            return;
          }
          bufferNextSegment();
        });
      }

      bufferNextSegment();
    });
  }

  function queueBuffer(bufferInfo) {
    if (!_bufferQueue) {
      _bufferQueue = [];
    }
    return new Promise(function (resolve) {
      bufferInfo.resolve = resolve;
      logger.debug("queueing segment " + bufferInfo.segment.getNumber());
      _bufferQueue.push(bufferInfo);
      appendQueuedBuffers();
    });
  }

  function appendQueuedBuffers() {
    if (_isAppendingBuffer) return;
    var bufferInfo = _bufferQueue.shift();
    if (!bufferInfo) return;

    for (var gap of _gaps) {
      var currentSegment = bufferInfo.segment;
      var segmentTime = 0;
      for (var index in _segments) {
        var segment = _segments[index];
        if (segment.getNumber() === currentSegment.getNumber()) break;
        segmentTime += segment.getDuration();
      }
      var gapStart = gap.start;
      var gapEnd = gapStart + gap.duration;
      if (segmentTime >= gapStart && segmentTime < gapEnd) {
        logger.debug(
          "discarding buffer for segment [" +
            currentSegment.getManifestIndex() +
            ", " +
            currentSegment.getRepresentationNumber() +
            ", " +
            currentSegment.getNumber() +
            "] to create gap"
        );
        bufferInfo.resolve();
        appendQueuedBuffers();
        setBufferingSegment(_bufferingSegment + 1);
        return Promise.resolve();
      }
    }

    var arrayBuffer = bufferInfo.arrayBuffer;
    var representationNumber = bufferInfo.segment.getRepresentationNumber();
    var periodNumber = bufferInfo.segment.getPeriodNumber();
    var manifestIndex = bufferInfo.segment.getManifestIndex();

    var representation = _manifests[manifestIndex].getRepresentation(
      representationNumber,
      periodNumber
    );
    var nextMimeCodec = representation.getMimeCodec();

    if (!_sourceBuffer) {
      var mimeCodec = nextMimeCodec;
      _sourceBuffer = createSourceBuffer(_mediaSource, mimeCodec);
      _currentMimeCodec = mimeCodec;
      if (_appendWindowBoundaries) {
        for (var i = 0; i < _appendWindowBoundaries.length; i++) {
          if (
            _bufferingSegment <=
            _appendWindowBoundaries[i].lastPlayoutEntry - 1
          ) {
            _currentAppendWindow = i;
            setAppendWindow(_appendWindowBoundaries[i]);
            break;
          }
        }
      }
    }

    _isAppendingBuffer = true;

    if (_appendWindowBoundaries) {
      if (
        _bufferingSegment >
        _appendWindowBoundaries[_currentAppendWindow].lastPlayoutEntry - 1
      ) {
        _currentAppendWindow++;
        setAppendWindow(_appendWindowBoundaries[_currentAppendWindow]);
      }
    }

    var isCodecChange = nextMimeCodec !== _currentMimeCodec;
    if (!_useChangeType && isCodecChange) {
      _bufferQueue.unshift(bufferInfo);
      _isAppendingBuffer = false;
      let timestamp = 0;
      for (let i = 1; i <= bufferInfo.segment.getNumber(); i++) {
        timestamp += _segments[i].getDuration();
      }
      logger.debug(
        "signaling external codec change at " +
          timestamp +
          " to " +
          nextMimeCodec
      );
      logger.debug("next segment codec change detected, pausing buffering");
      _isBuffering = false;
      _isBufferingSegment = false;
      video.addEventListener("waiting", function handleBufferUnderrun() {
        video.removeEventListener("waiting", handleBufferUnderrun);
        logger.debug("initiating media source reinitialization");
        _sourceBuffer = null;
        _eventEmitter.dispatchEvent(MEDIA_SOURCE_SHOULD_REINITIALIZE);
        _eventEmitter.on(
          MEDIA_SOURCE_REINITIALIZED,
          function handleMediaSourceReinitialized() {
            _eventEmitter.off(handleMediaSourceReinitialized);
            logger.debug("media source reinitialized, resuming buffering");
            _eventEmitter.on("onSegmentLoaded", function handleSegmentLoaded() {
              _eventEmitter.off(handleSegmentLoaded);
              setBufferingSegment(bufferInfo.segment.getNumber() + 1);
              startBuffering();
            });
            appendQueuedBuffers();
          }
        );
      });
      return;
    }

    var isPeriodChange = periodNumber !== _bufferingPeriodNumber;

    var initSegmentUrl = bufferInfo.segment.getInitSegmentUrl();
    var isInitSegmentChange = initSegmentUrl !== _lastInitSegmentUrl;
    _lastInitSegmentUrl = initSegmentUrl;

    var timestampOffset = bufferInfo.segment.getTimestampOffset();
    var segmentNumber = bufferInfo.segment.getNumber();
    if (_timestampOffsets && _timestampOffsets[segmentNumber]) {
      timestampOffset += _timestampOffsets[segmentNumber] / 1000.0;
    }

    if (_sourceBuffer.timestampOffset !== timestampOffset) {
      _sourceBuffer.timestampOffset = timestampOffset;
    }

    new Promise(function (resolve) {
      if (!isCodecChange && !isInitSegmentChange && !isPeriodChange) {
        resolve();
        return;
      }
      _bufferingRepresentationNumber = representationNumber;
      _bufferingPeriodNumber = periodNumber;

      if (isCodecChange && _useChangeType) {
        logger.debug("changing source buffer type to: " + nextMimeCodec);
        _currentMimeCodec = nextMimeCodec;
        _sourceBuffer.changeType(nextMimeCodec);
      }

      logger.debug("fetching init segment");
      return fetchSegment(initSegmentUrl)
        .then(function (arrayBuffer) {
          return appendBuffer(arrayBuffer);
        })
        .then(function () {
          if (!_initCallback) return;
          return new Promise(function (resolve) {
            _initCallback(resolve);
          });
        })
        .then(resolve);
    })
      .then(function () {
        return appendBuffer(arrayBuffer);
      })
      .then(function () {
        _isAppendingBuffer = false;
        bufferInfo.resolve();
        appendQueuedBuffers();

        if (
          !bufferInfo.chunkNumber ||
          (bufferInfo.chunkNumber && bufferInfo.lastChunk)
        ) {
          setBufferingSegment(bufferInfo.segment.getNumber() + 1);
        }

        _eventEmitter.dispatchEvent("onSegmentLoaded", {
          totalSegmentsLoaded: _bufferingSegment,
        });
        handleMaxBackwardBuffer();
      });
  }

  function handleMaxBackwardBuffer() {
    if (_maxBackwardBuffer) {
      var end = video.currentTime - _maxBackwardBuffer;
      if (end <= 0) return;
      _sourceBuffer.remove(0, end);
    }
  }

  function truncateBuffer() {
    return waitForSourceBufferUpdate().then(function () {
      _sourceBuffer.remove(0, video.duration);
      updateBufferingSegment();
      return waitForSourceBufferUpdate();
    });
  }

  function waitForSourceBufferUpdate() {
    if (!_sourceBuffer) return Promise.resolve();
    if (!_sourceBuffer.updating) return Promise.resolve();
    logger.debug("waiting for source buffer update");
    return new Promise(function (resolve) {
      _sourceBuffer.addEventListener(
        "updateend",
        function handleBufferAppended() {
          _sourceBuffer.removeEventListener("updateend", handleBufferAppended);
          resolve();
        }
      );
    });
  }

  function updateBufferingSegment() {
    var currentTime = video.currentTime;
    var segments = _segments;

    var bufferEdge = currentTime;
    if (_sourceBuffer) {
      var bufferedRanges = _sourceBuffer.buffered;
      var currentRange = null;
      for (var range in bufferedRanges) {
        if (range.start > currentTime || range.end < currentTime) continue;
        currentRange = range;
        break;
      }
      if (currentRange) bufferEdge = currentRange.end;
    }

    var segmentTime = 0;
    var bufferEdgeSegment = null;
    for (var i = 0; i < Object.keys(segments).length; i++) {
      var segment = segments[i];
      segmentTime += segment.getDuration();
      if (segmentTime <= bufferEdge) continue;
      bufferEdgeSegment = segment;
      break;
    }

    if (bufferEdgeSegment) setBufferingSegment(bufferEdgeSegment.getNumber());
  }

  function handleCurrentTimeChange(currentTime) {
    updateBufferingSegment();
  }

  function appendBuffer(arrayBuffer) {
    if (_video.error) {
      dispatchVideoErrorEvent(
        new Error("Video Error: " + _video.error.message)
      );
      return;
    }
    var start = null;
    return waitForSourceBufferUpdate()
      .then(function () {
        logger.debug(
          "appending buffer, size: " +
            arrayBuffer.byteLength +
            " (ct: " +
            video.currentTime +
            ")"
        );
        start = performance.now();
        try {
          _sourceBuffer.appendBuffer(arrayBuffer);
        } catch (error) {
          logger.error("source buffer append error: " + error);
          dispatchVideoErrorEvent(error);
          return Promise.reject(error);
        }
        return Promise.resolve();
      })
      .then(waitForSourceBufferUpdate)
      .then(function () {
        var duration = performance.now() - start;
        logger.debug(
          "source buffer updated, buffered ranges: " +
            JSON.stringify(getBufferedRange(_sourceBuffer)) +
            " (ct: " +
            video.currentTime +
            ") (dur: " +
            duration +
            " ms)"
        );
      });
  }

  function getBufferedRange(sourceBuffer) {
    if (!sourceBuffer) return [];
    var buffered = sourceBuffer.buffered;
    var ranges = [];
    for (var i = 0; i < buffered.length; i++) {
      ranges.push({
        start: buffered.start(i),
        end: buffered.end(i),
      });
    }
    return ranges;
  }

  function fetchSegment(url) {
    logger.debug(
      "fetching segment " + url + " (ct: " + video.currentTime + ")"
    );
    var start = performance.now();
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.responseType = "arraybuffer";
      xhr.send();

      xhr.onload = function () {
        var duration = performance.now() - start;
        logger.debug(
          "finished fetch request: " +
            xhr.status +
            " " +
            url +
            " (ct: " +
            video.currentTime +
            ") (dur: " +
            duration +
            " ms)"
        );
        if (xhr.status !== 200) {
          return false;
        }
        resolve(xhr.response);
      };
    });
  }

  function createSourceBuffer(mediaSource, mimeCodec) {
    logger.debug("adding source buffer for mimeCodec: " + mimeCodec);
    var sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
    sourceBuffer.addEventListener("error", function (event) {
      logger.error("source buffer error: " + event);
      dispatchVideoErrorEvent(error);
    });
    return sourceBuffer;
  }

  function concatenateBuffers(arrayBuffers) {
    var totalLength = 0;
    for (var arraybuffer of arrayBuffers) {
      totalLength += arraybuffer.byteLength;
    }
    var tmpArray = new Uint8Array(totalLength);
    var position = 0;
    for (var arraybuffer of arrayBuffers) {
      tmpArray.set(new Uint8Array(arraybuffer), position);
      position += arraybuffer.byteLength;
    }
    return tmpArray.buffer;
  }

  function randomSplitBuffer(arrayBuffer, splitNumber) {
    var newArrayBuffers = [];
    var uint8Array = new Uint8Array(arrayBuffer);
    var byteLength = uint8Array.byteLength;
    var variance = parseInt((byteLength / splitNumber) * 0.1);
    var position = 0;
    for (var i = 1; i < splitNumber; i++) {
      var splitPosition =
        (byteLength / splitNumber) * i +
        (Math.random() * variance - variance / 2);
      var splitPosition = parseInt(splitPosition);
      var arrayBuffer = uint8Array.slice(position, splitPosition).buffer;
      position = splitPosition;
      newArrayBuffers.push(arrayBuffer);
    }
    var arrayBuffer = uint8Array.slice(position, byteLength).buffer;
    newArrayBuffers.push(arrayBuffer);
    return newArrayBuffers;
  }

  function setAppendWindow(appendWindow) {
    if (!appendWindow) return;
    var start = appendWindow.start / 1000.0;
    var end = appendWindow.end / 1000.0;

    _sourceBuffer.appendWindowStart = start;
    _sourceBuffer.appendWindowEnd = end;
  }

  function getLogger() {
    if (!options.logger) {
      return console;
    }
    if (!_role) {
      return options.logger;
    }
    return {
      info: function (msg) {
        options.logger.info("[" + _role + "] " + msg);
      },
      debug: function (msg) {
        options.logger.debug("[" + _role + "] " + msg);
      },
      error: function (msg) {
        options.logger.error("[" + _role + "] " + msg);
      },
    };
  }

  function handleTimeUpdate(event) {
    updatePlayingSegment();
    bufferVideo();
  }

  function handleSeeking(event) {
    updatePlayingSegment();
    updateBufferingSegment();
    bufferVideo();
  }

  function dispatchVideoErrorEvent(error) {
    _eventEmitter.dispatchEvent("onVideoError", error);
  }

  function getManifests() {
    return _manifests;
  }

  function setBufferTime(bufferTime) {
    _bufferTime = bufferTime;
  }

  function setBufferingSegment(bufferingSegment) {
    logger.debug("setting buffering segment to " + bufferingSegment);
    _bufferingSegment = bufferingSegment;
  }

  function getCurrentMimeCodec() {
    return _currentMimeCodec;
  }

  function setMediaSource(mediaSource) {
    _mediaSource = mediaSource;
    _sourceBuffer = null;
    _eventEmitter.dispatchEvent(MEDIA_SOURCE_REINITIALIZED);
  }

  function setMaxBackwardBuffer(maxBackwardBuffer) {
    _maxBackwardBuffer = maxBackwardBuffer;
  }

  function setDuration(duration) {
    _duration = duration;
    _mediaSource.duration = duration;
  }

  function hasLoadedAllSegments() {
    return _loadedAllSegments;
  }

  function setRole(role) {
    _role = role;
    logger = getLogger();
  }

  instance = {
    setSegments,
    getSegments,
    getSegmentsCount,
    getPlayingSegment,
    setBufferTime,
    getCurrentMimeCodec,
    setMediaSource,
    clearSegments,
    getPlayingRepresentation,
    getPreBufferedTime,
    getManifests,
    setMaxBackwardBuffer,
    setDuration,
    startBuffering,
    pauseBuffering,
    on: _eventEmitter.on,
    off: _eventEmitter.off,
    setGaps,
    setAppendWindow,
    truncateBuffer,
    handleCurrentTimeChange,
    hasLoadedAllSegments,
    waitForSourceBufferUpdate,
    setRole,
  };

  return instance;
}

function EventEmitter() {
  let instance;

  let _eventListeners = {};

  function dispatchEvent(eventName, payload) {
    if (!(eventName in _eventListeners)) return;
    for (var eventListener of _eventListeners[eventName]) {
      eventListener(payload);
    }
  }

  function on(eventName, callback) {
    if (!(eventName in _eventListeners)) {
      _eventListeners[eventName] = [];
    }
    _eventListeners[eventName].push(callback);
  }

  function off(callback) {
    for (var eventName in _eventListeners) {
      var index = _eventListeners[eventName].indexOf(callback);
      if (index === -1) continue;
      _eventListeners[eventName].splice(index, 1);
      break;
    }
  }

  instance = {
    dispatchEvent,
    on,
    off,
  };

  return instance;
}

function EncryptionController(video, videoMimeCodec, audioMimeCodec, options) {
  var mediaKeysObject;
  var KEYSYSTEM_NAME = "org.w3.clearkey";
  var contentKey;
  var logger = options.logger;

  function handleEncryption(config) {
    var initDataType = config.initDataType;
    var initData = config.initData;
    contentKey = config.contentKey;
    if (!mediaKeysObject) {
      requestMediaKeySystemAccess(initDataType)
        .then(function (keySystemAccess) {
          return keySystemAccess.createMediaKeys();
        })
        .catch(function (error) {
          logger.error(
            "failed to access media key system '" +
              KEYSYSTEM_NAME +
              "': " +
              error.message
          );
        })
        .then(function (createdMediaKeys) {
          mediaKeysObject = createdMediaKeys;
          makeNewRequest(mediaKeysObject, initDataType, initData);
          video.setMediaKeys(mediaKeysObject);
        });
    } else {
      makeNewRequest(mediaKeysObject, initDataType, initData);
    }
  }

  function requestMediaKeySystemAccess(initDataType) {
    var videoCapabilities = [];
    if (videoMimeCodec) {
      videoCapabilities.push({ contentType: videoMimeCodec });
    }
    var audioCapabilities = [];
    if (audioMimeCodec) {
      audioCapabilities.push({ contentType: audioMimeCodec });
    }
    var keySystemConfig = [
      {
        initDataTypes: [initDataType],
        audioCapabilities: audioCapabilities,
        videoCapabilities: videoCapabilities,
      },
    ];
    logger.debug(
      "using key system configuration: " + JSON.stringify(keySystemConfig)
    );
    return navigator.requestMediaKeySystemAccess(
      KEYSYSTEM_NAME,
      keySystemConfig
    );
  }

  function makeNewRequest(mediaKeys, initDataType, initData) {
    var keySession = mediaKeys.createSession();

    keySession.addEventListener("message", licenseRequestReady, false);
    keySession.addEventListener(
      "keystatuseschange",
      handleKeyStatusesChange,
      false
    );
    //keySession.closed.then(console.log.bind(console, "Session closed"));
    keySession.generateRequest(initDataType, initData).catch(function () {
      logger.warn("unable to create or initialize key session");
    });
  }

  function licenseRequestReady(event) {
    var keySession = event.target;
    var message = event.message;

    // ClearKey is the only system that does not require a license server URL, so we
    // handle it here when keys are specified in protection data
    var jsonMsg = JSON.parse(
      String.fromCharCode.apply(null, new Uint8Array(message))
    );
    var clearkeyID = jsonMsg.kids[0];
    var keyPairs = [{ keyID: clearkeyID, key: contentKey }];
    var data = toJWK(keyPairs);
    keySession
      .update(data)
      .catch(console.error.bind(console, "update() failed"));
  }

  function handleKeyStatusesChange(event) {
    event.target.keyStatuses.forEach(function (status, keyId) {
      switch (status) {
        case "usable":
          logger.info("key status change: usable");
          break;
        case "expired":
          logger.warn("key status change: expired");
          break;
        case "status-pending":
          logger.info("key status change: status-pending");
          break;
        default:
        // Do something with |keyId| and |status|.
      }
    });
  }

  function toJWK(keyPairs) {
    let i;
    let numKeys = keyPairs.length;
    let jwk = { keys: [] };

    for (i = 0; i < numKeys; i++) {
      let key = {
        kty: "oct",
        alg: "A128KW",
        kid: keyPairs[i].keyID,
        k: keyPairs[i].key,
      };
      jwk.keys.push(key);
    }

    jwk.type = "temporary";

    let jwkString = JSON.stringify(jwk);
    const len = jwkString.length;

    // Convert JSON string to ArrayBuffer
    let buf = new ArrayBuffer(len);
    let bView = new Uint8Array(buf);
    for (i = 0; i < len; i++) bView[i] = jwkString.charCodeAt(i);
    return buf;
  }

  return {
    handleEncryption,
  };
}
