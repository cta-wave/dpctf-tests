var sessions = [];
var messageFormat = "utf8";

/* ================== Player related stuff ================== */

var Player = function (video) {
  this.mediaSource = null;
  this.sourceBuffer = null;
  video.addEventListener("timeupdate", this.handleTimeUpdate.bind(this));
  video.addEventListener("seeking", this.handleSeeking.bind(this));
  this.video = video;
  this.eventListeners = {};
  this.video.onerror = function (error) {
    console.error("Error " + JSON.stringify(error));
  };
  this.videoSegments = null;
  this.settings = null;
  this.bufferingSegment = null;
  this.bufferingRepresentationNumber = null;
  this.playingSegment = null;
  this.playingRepresentation = null;
};

Player.prototype.init = function (settings) {
  if (!settings.bufferTime) settings.bufferTime = 30;
  if (!settings.parallelLoading) settings.parallelLoading = false;
  this.settings = settings;
};

Player.prototype.getManifest = function () {
  return this.manifest;
};

Player.prototype.getPlayingSegment = function () {
  return this.playingSegment;
};

Player.prototype.setPlayingSegment = function (segment) {
  var segmentNumber = segment.getNumber();
  var representationNumber = segment.getRepresentationNumber();
  if (
    this.playingSegment &&
    this.playingRepresentation.getNumber() === representationNumber &&
    this.playingSegment.getNumber() === segmentNumber
  )
    return;
  this.playingSegment = segment;
  this.dispatchEvent("onPlayingSegmentChange", segment);
};

Player.prototype.setPlayingRepresentation = function (representation) {
  if (
    this.playingRepresentation &&
    this.playingRepresentation.getNumber() === representation.getNumber()
  )
    return;
  this.playingRepresentation = representation;
  this.dispatchEvent(
    "onPlayingRepresentationChange",
    this.playingRepresentation
  );
};

Player.prototype.getPlayingRepresentation = function () {
  return this.playingRepresentation;
};

Player.prototype.getCurrentTime = function () {
  return this.video.currentTime;
};

Player.prototype.setCurrentTime = function (currentTime) {
  this.video.currentTime = currentTime;
};

Player.prototype.addEventListener = function (eventName, callback) {
  if (!(eventName in this.eventListeners)) {
    this.eventListeners[eventName] = [];
  }
  this.eventListeners[eventName].push(callback);
};

Player.prototype.play = function () {
  this.video.play();
};

Player.prototype.dispatchEvent = function (eventName, payload) {
  if (!(eventName in this.eventListeners)) return;
  for (var eventListener of this.eventListeners[eventName]) {
    eventListener(payload);
  }
};

Player.prototype.handleTimeUpdate = function (event) {
  this.updatePlayingSegment();
  this.bufferVideo();
  this.dispatchEvent("onTimeUpdate", this.video.currentTime);
};

Player.prototype.handleSeeking = function (event) {
  this.updatePlayingSegment();
  this.bufferingSegment = this.getPlayingSegment().getNumber() - 1;
  this.bufferVideo();
};

Player.prototype.updatePlayingSegment = function () {
  var segmentTime = 0;
  for (var i = 0; i < Object.keys(this.videoSegments).length; i++) {
    var segment = this.videoSegments[i];
    segmentTime += segment.getDuration();
    if (segmentTime <= this.video.currentTime) continue;
    var representation = this.manifest.getRepresentation(
      segment.getRepresentationNumber()
    );
    this.setPlayingRepresentation(representation);
    this.setPlayingSegment(segment);
    break;
  }
};

Player.prototype.load = function (testVector) {
  var self = this;
  return ManifestParser.parse(testVector).then(function (manifest) {
    self.manifest = manifest;
    var totalSegmentsCount = manifest
      .getRepresentation(0)
      .getTotalSegmentsCount();
    self.setVideoSegments({
      representationNumber: 0,
      startSegment: 0,
      endSegment: totalSegmentsCount - 1,
    });
    self.dispatchEvent("onManifestParsed", manifest);
  });
};

Player.prototype.debug = function (msg) {
  var self = this;
  console.log(msg);
};

Player.prototype.getVideoSegmentsCount = function () {
  return Object.keys(this.videoSegments).length;
};

/* ================== MSE related stuff ================== */

Player.prototype.setVideoSegments = function (segmentsInfo) {
  var representationNumber = segmentsInfo.representationNumber;
  var startSegment = segmentsInfo.startSegment;
  var endSegment = segmentsInfo.endSegment;
  var representation = this.manifest.getRepresentation(representationNumber);
  if (!this.videoSegments) this.videoSegments = {};
  for (var i = startSegment; i <= endSegment; i++) {
    this.videoSegments[i] = representation.getSegment(i);
  }
  this.updatePlayingSegment();

  var playingSegment = this.playingSegment.getNumber();
  var bufferingSegment = this.bufferingSegment;
  if (playingSegment < endSegment && bufferingSegment > startSegment) {
    if (playingSegment < startSegment) {
      this.bufferingSegment = startSegment;
    } else {
      this.bufferingSegment = playingSegment;
    }
  }
};

Player.prototype.createMediaSource = function () {
  var self = this;
  return new Promise(function (resolve) {
    var mediaSource = new MediaSource();
    self.video.src = URL.createObjectURL(mediaSource);
    var handleMediaSourceOpened = function () {
      mediaSource.removeEventListener("sourceopen", handleMediaSourceOpened);
      resolve(mediaSource);
    };
    mediaSource.addEventListener("sourceopen", handleMediaSourceOpened);
    self.mediaSource = mediaSource;
  });
};

Player.prototype.getPreBufferedTime = function () {
  var bufferedTime = 0;
  var playingSegment = this.getPlayingSegment();
  for (var i = playingSegment.getNumber(); i < this.bufferingSegment; i++) {
    var segment = this.videoSegments[i];
    bufferedTime += segment.getDuration();
  }

  return bufferedTime;
};

Player.prototype.startBuffering = function () {
  var self = this;
  return new Promise(function (resolve) {
    if (this.mediaSource) {
      resolve();
      return;
    }
    self.createMediaSource().then(function (mediaSource) {
      self.mediaSource = mediaSource;
      resolve();
    });
  }).then(function () {
    if (!self.videoSegments) return;
    self.isBuffering = true;
    self.bufferVideo();
  });
};

Player.prototype.bufferVideo = function () {
  if (!this.isBuffering) return;
  var preBufferedTime = this.getPreBufferedTime();
  if (preBufferedTime >= this.settings.bufferTime) return;
  if (this.isBufferingSegment) return;
  this.isBufferingSegment = true;

  var segment = this.getNextBufferSegment();
  if (!segment) {
    this.isBuffering = false;
    this.isBufferingSegment = false;
    this.mediaSource.endOfStream();
    return;
  }
  var self = this;
  this.bufferSegment(segment).then(function () {
    self.isBufferingSegment = false;
    self.bufferVideo();
  });
};

Player.prototype.getNextBufferSegment = function () {
  if (!this.bufferingSegment && this.bufferingSegment !== 0) {
    this.bufferingSegment = 0;
  } else {
    this.bufferingSegment++;
  }
  var segment = this.videoSegments[this.bufferingSegment];
  return segment;
};

Player.prototype.bufferSegment = function (segment) {
  var representationNumber = segment.getRepresentationNumber();
  var representation = this.manifest.getRepresentation(representationNumber);
  var mimeCodec = representation.getMimeCodec();

  if (!this.videoSourceBuffer) {
    this.videoSourceBuffer = this.mediaSource.addSourceBuffer(mimeCodec);
  }

  var self = this;
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

    var currentJob = 0;
    function bufferSegment() {
      return new Promise(function (resolveJob) {
        var fetchJob = fetchJobs[currentJob];
        var promise = self
          .fetchSegment(fetchJob.url)
          .then(function (arrayBuffer) {
            return self.queueVideoBuffer({
              arrayBuffer: arrayBuffer,
              representationNumber: segment.getRepresentationNumber(),
              segmentNumber: segment.getNumber(),
              chunkNumber: fetchJob.chunkNumber,
            });
          });
        if (self.settings.parallelLoading) {
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
};

Player.prototype.queueVideoBuffer = function (bufferInfo) {
  if (!this._videoBufferQueue) {
    this._videoBufferQueue = [];
  }
  var self = this;
  return new Promise(function (resolve) {
    bufferInfo.resolve = resolve;
    self._videoBufferQueue.push(bufferInfo);
    self.appendQueuedVideoBuffers();
  });
};

Player.prototype.appendQueuedVideoBuffers = function () {
  if (this.isAppendingVideoBuffer) return;
  var bufferInfo = this._videoBufferQueue.shift();
  if (!bufferInfo) return;

  this.isAppendingVideoBuffer = true;

  var arrayBuffer = bufferInfo.arrayBuffer;
  var representationNumber = bufferInfo.representationNumber;

  var isRepresentationChange =
    representationNumber !== this.bufferingRepresentationNumber;

  var self = this;
  new Promise(function (resolve) {
    if (!isRepresentationChange) {
      resolve();
      return;
    }
    self.bufferingRepresentationNumber = representationNumber;

    return self
      .loadInitSegment(representationNumber)
      .then(function (arrayBuffer) {
        return self.appendVideoBuffer(arrayBuffer);
      })
      .then(resolve);
  })
    .then(function () {
      return self.appendVideoBuffer(arrayBuffer);
    })
    .then(function () {
      self.isAppendingVideoBuffer = false;
      bufferInfo.resolve();
      self.appendQueuedVideoBuffers();
      self.dispatchEvent("onSegmentLoaded", {
        totalSegmentsLoaded: self.bufferingSegment + 1,
      });
    });
};

Player.prototype.loadInitSegment = function (representationNumber) {
  var representation = this.manifest.getRepresentation(representationNumber);
  var mimeCodec = representation.getMimeCodec();

  this.videoSourceBuffer.changeType(mimeCodec);
  var initSegmentUrl = representation.getInitSegmentUrl();
  return this.fetchSegment(initSegmentUrl);
};

Player.prototype.appendVideoBuffer = function (arrayBuffer) {
  return this.appendBuffer(arrayBuffer, this.videoSourceBuffer);
};

Player.prototype.appendBuffer = function (arrayBuffer, sourceBuffer) {
  var self = this;
  return new Promise(function (resolve) {
    sourceBuffer.appendBuffer(arrayBuffer);
    var handleBufferAppended = function () {
      sourceBuffer.removeEventListener("updateend", handleBufferAppended);
      resolve();
    };
    sourceBuffer.addEventListener("updateend", handleBufferAppended);
  });
};

Player.prototype.fetchSegment = function (url) {
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
};

Player.prototype.concatenateBuffers = function (arrayBuffers) {
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
};
