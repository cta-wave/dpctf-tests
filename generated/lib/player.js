var sessions = [];
var messageFormat = "utf8";

function Player(video) {
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

  var PLAYER_EVENT_START_BUFFERING = Player.PLAYER_EVENT_START_BUFFERING;
  var PLAYER_EVENT_TRIGGER_PLAY = Player.PLAYER_EVENT_TRIGGER_PLAY;

  function init(settings) {
    if (_mediaSource) throw new Error("Player already initialized");
    if (!settings.bufferTime) settings.bufferTime = 30;
    if (!settings.parallelLoading) settings.parallelLoading = false;
    if (!settings.concatAndSplit) settings.concatAndSplit = false;
    if (!settings.outOfOrderLoading) settings.outOfOrderLoading = false;
    if (!settings.loading) settings.loading = null;
    _settings = settings;
    console.log(settings);

    video.addEventListener("encrypted", function (event) {
      if (event.type !== "encrypted") return;
      var config = {
        initData: event.initData,
        initDataType: event.initDataType,
      };
      _protectionController.handleEncryption(config);
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
  }

  function getDuration() {
    return _duration;
  }

  function setDuration(duration) {
    _duration = duration;
    if (_mediaSource) {
      _mediaSource.duration = duration;
    }
  }

  function getVideo() {
    return _video;
  }

  function setBufferTime(bufferTime) {
    _settings.bufferTime = bufferTime;
  }

  function getBufferTime() {
    return _settings.bufferTime;
  }

  function play() {
    _eventEmitter.dispatchEvent(PLAYER_EVENT_TRIGGER_PLAY);
    return _video.play();
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
    _eventEmitter.on(eventName, callback);
  }

  function off(callback) {
    _eventEmitter.off(callback);
    _videoBufferManager.off(callback);
  }

  function loadVideo(vectorUrls) {
    if (!vectorUrls || vectorUrls.length === 0) {
      console.log("Warning: No video mpd provided!");
      return;
    }
    if (!_mediaSource) throw new Error("Player not initialized");
    return Promise.all(
      vectorUrls.map((vectorUrl) => ManifestParser.parse(vectorUrl))
    ).then(function (manifests) {
      _videoBufferManager = new BufferManager(
        manifests,
        _mediaSource,
        _video,
        _settings
      );
      for (let manifest of manifests) {
        var bufferOffset = 0;
        var totalDuration = 0;
        var representationNumber;
        for (var periodId in manifest.getPeriods()) {
          var period = manifest.getPeriods()[periodId];
          var videoRepresentation;
          for (var representation of period) {
            if (
              representationNumber &&
              representationNumber === representation.getNumber()
            ) {
              videoRepresentation = representation;
              break;
            } else {
              if (representation.getMimeCodec().indexOf("video") === -1)
                continue;
              videoRepresentation = representation;
              representationNumber = videoRepresentation.getNumber();
              break;
            }
          }
          var periodNumber = videoRepresentation.getPeriodNumber();

          var totalSegmentsCount = manifest
            .getRepresentation(representationNumber, periodNumber)
            .getTotalSegmentsCount();
          var duration = _videoBufferManager.setSegments({
            representationNumber: representationNumber,
            startSegment: 0,
            endSegment: totalSegmentsCount - 1,
            bufferOffset: bufferOffset,
            periodNumber: periodNumber,
          });
          bufferOffset += totalSegmentsCount;
          totalDuration = duration;
        }
        setDuration(totalDuration);
      }
      _eventEmitter.dispatchEvent("onVideoManifestParsed", manifests);
    });
  }

  function loadAudio(vectorUrls) {
    if (!vectorUrls || vectorUrls.length === 0) {
      console.log("Warning: No audio mpd provided!");
      return;
    }
    if (!_mediaSource) throw new Error("Player not initialized");
    return Promise.all(
      vectorUrls.map((vectorUrl) => ManifestParser.parse(vectorUrl))
    ).then(function (manifests) {
      _videoBufferManager = new BufferManager(
        manifests,
        _mediaSource,
        _video,
        _settings
      );
      for (let manifest of manifests) {
        var bufferOffset = 0;
        var totalDuration = 0;
        var representationNumber;
        for (var periodId in manifest.getPeriods()) {
          var period = manifest.getPeriods()[periodId];
          var audioRepresentation;
          for (var representation of period) {
            if (
              representationNumber &&
              representationNumber === representation.getNumber()
            ) {
              audioRepresentation = representation;
              break;
            } else {
              if (representation.getMimeCodec().indexOf("audio") === -1)
                continue;
              audioRepresentation = representation;
              representationNumber = audioRepresentation.getNumber();
              break;
            }
          }
          var periodNumber = audioRepresentation.getPeriodNumber();

          var totalSegmentsCount = manifest
            .getRepresentation(representationNumber, periodNumber)
            .getTotalSegmentsCount();
          var duration = _audioBufferManager.setSegments({
            representationNumber: representationNumber,
            startSegment: 0,
            endSegment: totalSegmentsCount - 1,
            bufferOffset: bufferOffset,
            periodNumber: periodNumber,
          });
          bufferOffset += totalSegmentsCount;
          totalDuration = duration;
        }
        setDuration(totalDuration);
      }
      _eventEmitter.dispatchEvent("onAudioManifestParsed", manifest);
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
      audioMimeCodec
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
    _videoBufferManager.setSegments(segmentsInfo);
  }

  function getVideoSegments() {
    if (!_videoBufferManager) return;
    return _videoBufferManager.getSegments();
  }

  function getVideoSegmentsCount() {
    if (!_videoBufferManager) return;
    return _videoBufferManager.getSegmentsCount();
  }

  function clearVideoSegments() {
    if (!_videoBufferManager) return;
    return _videoBufferManager.clearSegments();
  }

  function clearAudioSegments() {
    if (!_audioBufferManager) return;
    return _audioBufferManager.clearSegments();
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
    getVideoSegmentsCount,
    clearAudioSegments,
    clearVideoSegments,
    setBufferTime,
    getBufferTime,
    on,
    off,
    startBuffering,
    play,
    loadVideo,
    loadAudio,
    getPreBufferedTime,
    setProtectionData,
  };

  return instance;
}

Player.PLAYER_EVENT_START_BUFFERING = "onPlayerStartBuffering";
Player.PLAYER_EVENT_TRIGGER_PLAY = "onPlayerTriggerPlay";

function BufferManager(manifests, mediaSource, video, options) {
  let instance;

  let _manifests = manifests || [];
  let _mediaSource = mediaSource;
  let _video = video;
  _video.addEventListener("timeupdate", handleTimeUpdate);
  _video.addEventListener("seeking", handleSeeking);
  let _segments = {};
  let _playingSegment;
  let _playingRepresentation;
  let _bufferingSegment;
  let _isBuffering;
  let _isBufferingSegment;
  let _isAppendingBuffer;
  let _bufferTime = options.bufferTime || 30;
  let _concatAndSplit = options.concatAndSplit || false;
  let _parallelLoading = options.parallelLoading || false;
  let _outOfOrderLoading = options.outOfOrderLoading || false;
  let _loading = options.loading || null;
  let _sourceBuffer;
  let _bufferQueue;
  let _bufferingRepresentationNumber;
  let _bufferingPeriodNumber;
  let _lastInitSegmentUrl;

  let _eventEmitter = new EventEmitter();

  function getSegments() {
    return _segments;
  }

  function setSegments(segmentsInfo) {
    console.log(segmentsInfo);
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
    console.log(representation);
    var timestampOffset = 0;
    if (offset !== 0) {
      var regularTimestamp = 0;
      for (var i = 0; i < startSegment; i ++) {
        var segment = representation.getSegment(i);
        regularTimestamp += segment.getDuration();
      }
      var actualTimestamp = 0;
      for (var i = 0; i < startSegment + offset; i ++) {
        var segment = representation.getSegment(i);
        actualTimestamp += segment.getDuration();
      }
      timestampOffset = regularTimestamp - actualTimestamp;
    }
    console.log(timestampOffset);

    for (var i = startSegment; i <= endSegment; i++) {
      var segment = representation.getSegment(i + offset);
      segment.setTimestampOffset(timestampOffset);
      segment.setManifestIndex(manifestIndex);
      _segments[i + bufferOffset] = segment;
    }
    updatePlayingSegment();

    var playingSegment = _playingSegment.getNumber();
    var bufferingSegment = _bufferingSegment;
    if (playingSegment < endSegment && bufferingSegment > startSegment) {
      if (playingSegment < startSegment) {
        _bufferingSegment = startSegment;
      } else {
        _bufferingSegment = playingSegment;
      }
    }

    var totalDuration = 0;
    for (var segment of Object.values(_segments)) {
      if (!segment) continue;
      totalDuration += segment.getDuration();
    }
    return totalDuration;
  }

  function clearSegments() {
    _segments = [];
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
      _playingRepresentation.getNumber() === representation.getNumber()
    )
      return;
    _playingRepresentation = representation;
    _eventEmitter.dispatchEvent(
      "onPlayingRepresentationChange",
      _playingRepresentation
    );
  }

  function startBuffering() {
    if (_isBuffering) return;
    if (!_segments) return;
    _isBuffering = true;
    bufferVideo();
  }

  function bufferVideo() {
    if (!_isBuffering) return;
    var preBufferedTime = getPreBufferedTime();
    if (preBufferedTime >= _bufferTime) return;
    if (_isBufferingSegment) return;
    _isBufferingSegment = true;

    var segment = getNextBufferSegment();
    if (!segment) {
      _isBuffering = false;
      _isBufferingSegment = false;
      _mediaSource.endOfStream();
      return;
    }
    bufferSegment(segment).then(function () {
      _isBufferingSegment = false;
      bufferVideo();
    });
  }

  function getPreBufferedTime() {
    var bufferedTime = 0;
    for (var i = 0; i < _bufferingSegment; i++) {
      var segment = _segments[i];
      bufferedTime += segment.getDuration();
    }

    return bufferedTime - _video.currentTime;
  }

  function getNextBufferSegment() {
    if (!_bufferingSegment && _bufferingSegment !== 0) {
      _bufferingSegment = 0;
    }
    var segment = _segments[_bufferingSegment];
    if (_outOfOrderLoading && _loading) {
      var nextSegmentIndex = _loading[_bufferingSegment] - 1;
      segment = _segments[nextSegmentIndex];
    }
    return segment;
  }

  function bufferSegment(segment) {
    var representationNumber = segment.getRepresentationNumber();
    var manifestIndex = segment.getManifestIndex();
    var representation = _manifests[manifestIndex].getRepresentation(
      representationNumber,
      segment.getPeriodNumber()
    );
    var mimeCodec = representation.getMimeCodec();

    if (!_sourceBuffer) {
      _sourceBuffer = _mediaSource.addSourceBuffer(mimeCodec);
    }

    return new Promise(function (resolve) {
      var fetchJobs = [];

      if (segment.getChunks().length === 0) {
        fetchJobs.push({
          url: segment.getUrl(),
        });
      } else {
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
      _bufferQueue.push(bufferInfo);
      appendQueuedBuffers();
    });
  }

  function appendQueuedBuffers() {
    if (_isAppendingBuffer) return;
    var bufferInfo = _bufferQueue.shift();
    if (!bufferInfo) return;

    _isAppendingBuffer = true;

    var arrayBuffer = bufferInfo.arrayBuffer;
    var representationNumber = bufferInfo.segment.getRepresentationNumber();
    var periodNumber = bufferInfo.segment.getPeriodNumber();
    var manifestIndex = bufferInfo.segment.getManifestIndex();

    var isRepresentationChange =
      representationNumber !== _bufferingRepresentationNumber;

    var isPeriodChange = periodNumber !== _bufferingPeriodNumber;

    var initSegmentUrl = bufferInfo.segment.getInitSegmentUrl();
    var isInitSegmentChange = initSegmentUrl !== _lastInitSegmentUrl;
    _lastInitSegmentUrl = initSegmentUrl;

    var timestampOffset = bufferInfo.segment.getTimestampOffset();

    if (_sourceBuffer.timestampOffset !== timestampOffset) {
      _sourceBuffer.timestampOffset = timestampOffset;
    }

    new Promise(function (resolve) {
      if (!isRepresentationChange && !isInitSegmentChange && !isPeriodChange) {
        resolve();
        return;
      }
      _bufferingRepresentationNumber = representationNumber;
      _bufferingPeriodNumber = periodNumber;

      if (isRepresentationChange) {
        var representation = _manifests[manifestIndex].getRepresentation(
          representationNumber,
          periodNumber
        );
        var mimeCodec = representation.getMimeCodec();

        _sourceBuffer.changeType(mimeCodec);
      }

      return fetchSegment(initSegmentUrl)
        .then(function (arrayBuffer) {
          return appendVideoBuffer(arrayBuffer);
        })
        .then(resolve);
    })
      .then(function () {
        return appendVideoBuffer(arrayBuffer);
      })
      .then(function () {
        _isAppendingBuffer = false;
        bufferInfo.resolve();
        appendQueuedBuffers();
        _bufferingSegment++;
        _eventEmitter.dispatchEvent("onSegmentLoaded", {
          totalSegmentsLoaded: _bufferingSegment,
        });
      });
  }

  function appendVideoBuffer(arrayBuffer) {
    return appendBuffer(arrayBuffer, _sourceBuffer);
  }

  function appendBuffer(arrayBuffer, sourceBuffer) {
    if (_video.error) {
      dispatchVideoErrorEvent(
        new Error("Video Error: " + _video.error.message)
      );
      return;
    }
    return new Promise(function (resolve) {
      sourceBuffer.appendBuffer(arrayBuffer);
      var handleBufferAppended = function () {
        sourceBuffer.removeEventListener("updateend", handleBufferAppended);
        resolve();
      };
      sourceBuffer.addEventListener("updateend", handleBufferAppended);
    });
  }

  function fetchSegment(url) {
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.responseType = "arraybuffer";
      xhr.send();

      xhr.onload = function () {
        if (xhr.status !== 200) {
          return false;
        }
        resolve(xhr.response);
      };
    });
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

  function handleTimeUpdate(event) {
    updatePlayingSegment();
    bufferVideo();
  }

  function handleSeeking(event) {
    updatePlayingSegment();
    _bufferingSegment = getPlayingSegment().getNumber() - 1;
    bufferVideo();
  }

  function dispatchVideoErrorEvent(error) {
    _eventEmitter.dispatchEvent("onVideoError", error);
  }

  function getManifests() {
    return _manifests;
  }

  instance = {
    setSegments,
    getSegments,
    getSegmentsCount,
    getPlayingSegment,
    clearSegments,
    getPlayingRepresentation,
    getPreBufferedTime,
    getManifests,
    startBuffering,
    on: _eventEmitter.on,
    off: _eventEmitter.off,
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

function EncryptionController(video, videoMimeCodec, audioMimeCodec) {
  var mediaKeysObject;
  var KEYSYSTEM_NAME = "org.w3.clearkey";
  var contentKey;

  function handleEncryption(config) {
    var initDataType = config.initDataType;
    var initData = config.initData;
    contentKey = config.contentKey;
    if (!mediaKeysObject) {
      requestMediaKeySystemAccess(initDataType)
        .then(function (keySystemAccess) {
          return keySystemAccess.createMediaKeys();
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
    keySession
      .generateRequest(initDataType, initData)
      .catch(
        console.error.bind(
          console,
          "Unable to create or initialize key session"
        )
      );
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
          console.log("Key Status Change: Usable");
          break;
        case "expired":
          console.log("Key Status Change: Expired");
          break;
        case "status-pending":
          console.log("Key Status Change: Status-Pending");
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
