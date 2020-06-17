var sessions = [];
var messageFormat = "utf8";

if (!("MediaSource" in window))
  throw Error("Media Source Extensions API not supported!");

/* ================== Player related stuff ================== */

var Player = function (video) {
  this.mediaSource = null;
  this.sourceBuffer = null;
  video.addEventListener("timeupdate", this.handleTimeUpdate.bind(this));
  this.video = video;
  this.eventListeners = {};
  this.video.onerror = function (error) {
    console.error("Error " + JSON.stringify(error));
  };
  this.videoSegments = null;
  this.settings = null;
  this.bufferingSegment = null;
  this.playingSegment = null;
  this.playingRepresentation = null;
};

Player.prototype.init = function (settings) {
  if (!settings.bufferTime) settings.bufferTime = 30;
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
  var segmentTime = 0;
  for (var i = 0; i < Object.keys(this.videoSegments).length; i++) {
    var segment = this.videoSegments[i];
    segmentTime += segment.getDuration();
    if (segmentTime < this.video.currentTime) continue;
    var representation = this.manifest.getRepresentation(
      segment.getRepresentationNumber()
    );
    this.setPlayingRepresentation(representation);
    this.setPlayingSegment(segment);
    break;
  }
  this.dispatchEvent("onTimeUpdate", this.video.currentTime);
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
  if (!this.playingRepresentation && startSegment === 0)
    this.playingRepresentation = representation;
  if (!this.playingSegment && startSegment === 0)
    this.playingSegment = representation.getSegment(0);
  for (var i = startSegment; i <= endSegment; i++) {
    this.videoSegments[i] = representation.getSegment(i);
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
  var timeRanges = this.video.buffered;
  if (timeRanges.length === 0) return 0;
  var currentTime = this.video.currentTime;
  for (var i = 0; i < timeRanges.length; i++) {
    var start = timeRanges.start(i);
    var end = timeRanges.end(i);
    if (start <= currentTime && end > currentTime) {
      return end - currentTime;
    }
  }
  return 0;
};

Player.prototype.startBuffering = function () {
  var self = this;
  return new Promise(function (resolve) {
    if (this.mediaSource) resolve();
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
  if (this.getPreBufferedTime() >= this.settings.bufferTime) {
    setTimeout(
      this.bufferVideo.bind(this),
      (this.settings.bufferTime * 1000) / 3
    );
    return;
  }
  var segment = this.getNextBufferSegment();
  if (!segment) {
    this.isBuffering = false;
    this.mediaSource.endOfStream();
    return;
  }
  var self = this;
  this.bufferSegment(segment).then(function () {
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
}

Player.prototype.bufferSegment = function (segment) {
  var representationNumber = segment.getRepresentationNumber();
  var representation = this.manifest.getRepresentation(representationNumber);
  var segmentUrl = segment.getUrl();
  var mimeCodec = representation.getMimeCodec();
  var isRepresentationChange = true;
  if (this.bufferingSegment - 1 >= 0) {
    var previousSegment = this.videoSegments[this.bufferingSegment - 1];
    isRepresentationChange =
      segment.getRepresentationNumber() !==
      previousSegment.getRepresentationNumber();
  }

  if (!this.videoSourceBuffer) {
    this.videoSourceBuffer = this.mediaSource.addSourceBuffer(mimeCodec);
  }

  var self = this;
  return new Promise(function (resolve, reject) {
    if (!isRepresentationChange) {
      resolve();
      return;
    }
    if (!MediaSource.isTypeSupported(mimeCodec)) {
      throw Error("Unsupported codec: " + mimeCodec);
    }
    self.videoSourceBuffer.changeType(mimeCodec);
    var initSegmentUrl = representation.getInitSegmentUrl();
    self.fetchSegment(initSegmentUrl).then(function (arrayBuffer) {
      try {
        self.appendVideoBuffer(arrayBuffer).then(resolve);
      } catch (error) {
        reject(error);
      }
    });
  }).then(function () {
    return new Promise(function (resolve) {
      self.fetchSegment(segmentUrl).then(function (arrayBuffer) {
        self.appendVideoBuffer(arrayBuffer).then(function () {
          self.dispatchEvent("onSegmentLoaded", {
            totalSegmentsLoaded: self.bufferingSegment + 1,
          });
          resolve();
        });
      });
    });
  });
};

Player.prototype.appendVideoBuffer = function (arrayBuffer) {
  var self = this;
  return new Promise(function (resolve) {
    self.videoSourceBuffer.appendBuffer(arrayBuffer);
    var handleBufferAppended = function () {
      self.videoSourceBuffer.removeEventListener(
        "updateend",
        handleBufferAppended
      );
      resolve();
    };
    self.videoSourceBuffer.addEventListener("updateend", handleBufferAppended);
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
