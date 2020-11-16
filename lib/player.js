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
  let _manifest;
  let _mediaSource;
  let _eventEmitter = new EventEmitter();

  let _videoBufferManager;
  let _audioBufferManager;

  function init(settings) {
    if (_mediaSource) throw new Error("Player already initialized");
    if (!settings.bufferTime) settings.bufferTime = 30;
    if (!settings.parallelLoading) settings.parallelLoading = false;
    if (!settings.concatAndSplit) settings.concatAndSplit = false;
    _settings = settings;
    return new Promise((resolve) => {
      createMediaSource().then(function (mediaSource) {
        _mediaSource = mediaSource;
        resolve();
      });
    });
  }

  function getManifest() {
    return _manifest;
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
    _video.play();
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

  function load(testVector) {
    return ManifestParser.parse(testVector).then(function (manifest) {
      _manifest = manifest;
      var totalSegmentsCount = manifest
        .getRepresentation(0)
        .getTotalSegmentsCount();
      setVideoSegments({
        representationNumber: 0,
        startSegment: 0,
        endSegment: totalSegmentsCount - 1,
      });
      dispatchEvent("onManifestParsed", manifest);
    });
  }

  function loadVideo(vectorUrl) {
    if (!vectorUrl) {
      console.log("Warning: No video mpd provided!");
      return;
    }
    if (!_mediaSource) throw new Error("Player not initialized");
    return ManifestParser.parse(vectorUrl).then(function (manifest) {
      _videoBufferManager = new BufferManager(
        manifest,
        _mediaSource,
        _video,
        _settings
      );
      var totalSegmentsCount = manifest
        .getRepresentation(0)
        .getTotalSegmentsCount();
      var duration = _videoBufferManager.setSegments({
        representationNumber: 0,
        startSegment: 0,
        endSegment: totalSegmentsCount - 1,
      });
      setDuration(duration);
      _eventEmitter.dispatchEvent("onVideoManifestParsed", manifest);
    });
  }

  function loadAudio(vectorUrl) {
    if (!vectorUrl) {
      console.log("Warning: No audio mpd provided!");
      return;
    }
    if (!_mediaSource) throw new Error("Player not initialized");
    return ManifestParser.parse(vectorUrl).then(function (manifest) {
      _audioBufferManager = new BufferManager(
        manifest,
        _mediaSource,
        _video,
        _settings
      );
      var totalSegmentsCount = manifest
        .getRepresentation(0)
        .getTotalSegmentsCount();
      var duration = _audioBufferManager.setSegments({
        representationNumber: 0,
        startSegment: 0,
        endSegment: totalSegmentsCount - 1,
      });
      setDuration(duration);
      _eventEmitter.dispatchEvent("onAudioManifestParsed", manifest);
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
    if (_videoBufferManager) _videoBufferManager.startBuffering();
    if (_audioBufferManager) _audioBufferManager.startBuffering();
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

  function getVideoManifest() {
    if (_videoBufferManager) return _videoBufferManager.getManifest();
    return null;
  }

  function getAudioManifest() {
    if (_audioBufferManager) return _audioBufferManager.getManifest();
    return null;
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

  instance = {
    init,
    getVideoManifest,
    getAudioManifest,
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
    setBufferTime,
    getBufferTime,
    on,
    off,
    startBuffering,
    play,
    loadVideo,
    loadAudio,
    getPreBufferedTime,
  };

  return instance;
}

function BufferManager(manifest, mediaSource, video, options) {
  let instance;

  let _manifest = manifest;
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
  let _sourceBuffer;
  let _bufferQueue;
  let _bufferingRepresentationNumber;
  let _lastInitSegmentUrl;

  let _eventEmitter = new EventEmitter();

  function getSegments() {
    return _segments;
  }

  function setSegments(segmentsInfo) {
    var representationNumber = segmentsInfo.representationNumber;
    var startSegment = segmentsInfo.startSegment;
    var endSegment = segmentsInfo.endSegment;
    var periodNumber = segmentsInfo.periodNumber;
    var offset = segmentsInfo.representationOffset || 0;
    var representation = _manifest.getRepresentation(
      representationNumber,
      periodNumber
    );
    for (var i = startSegment; i <= endSegment; i++) {
      _segments[i] = representation.getSegment(i + offset);
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

  function getSegmentsCount() {
    return Object.keys(_segments).length;
  }

  function updatePlayingSegment() {
    var segmentTime = 0;
    for (var i = 0; i < Object.keys(_segments).length; i++) {
      var segment = _segments[i];
      segmentTime += segment.getDuration();
      if (segmentTime <= _video.currentTime) continue;
      var representation = _manifest.getRepresentation(
        segment.getRepresentationNumber()
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
    var playingSegment = getPlayingSegment();
    for (var i = playingSegment.getNumber(); i < _bufferingSegment; i++) {
      var segment = _segments[i];
      bufferedTime += segment.getDuration();
    }

    return bufferedTime;
  }

  function getNextBufferSegment() {
    if (!_bufferingSegment && _bufferingSegment !== 0) {
      _bufferingSegment = 0;
    } else {
      _bufferingSegment++;
    }
    var segment = _segments[_bufferingSegment];
    return segment;
  }

  function bufferSegment(segment) {
    var representationNumber = segment.getRepresentationNumber();
    var representation = _manifest.getRepresentation(
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

    var isRepresentationChange =
      representationNumber !== _bufferingRepresentationNumber;

    var initSegmentUrl = bufferInfo.segment.getInitSegmentUrl();
    var isInitSegmentChange = initSegmentUrl !== _lastInitSegmentUrl;
    _lastInitSegmentUrl = initSegmentUrl;

    new Promise(function (resolve) {
      if (!isRepresentationChange && !isInitSegmentChange) {
        resolve();
        return;
      }
      _bufferingRepresentationNumber = representationNumber;

      if (isRepresentationChange) {
        var representation = _manifest.getRepresentation(representationNumber);
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
        _eventEmitter.dispatchEvent("onSegmentLoaded", {
          totalSegmentsLoaded: _bufferingSegment + 1,
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

  function getManifest() {
    return _manifest;
  }

  instance = {
    setSegments,
    getSegments,
    getSegmentsCount,
    getPlayingSegment,
    getPlayingRepresentation,
    getPreBufferedTime,
    getManifest,
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
