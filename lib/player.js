var sessions = [];
var messageFormat = "utf8";

if (!("MediaSource" in window))
  throw Error("Media Source Extensions API not supported!");

/* ================== Player related stuff ================== */

var Player = function (video) {
  this.currentSegment = 0;
  this.mediaSource = null;
  this.sourceBuffer = null;
  this.video = video;
  this.eventListeners = {};
  this.video.onerror = function (error) {
    console.error("Error " + JSON.stringify(error));
  };
  this.videoSegments = null;
  this.settings = null;
  this.currentSegment = null;
};

Player.prototype.init = function (settings) {
  if (!settings.bufferTime) settings.bufferTime = 30;
  this.settings = settings;
};

Player.prototype.getCurrentManifest = function () {
  return this.manifest;
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

Player.prototype.load = function (testVector) {
  var self = this;
  return ManifestParser.parse(testVector).then(function (manifest) {
    self.manifest = manifest;
    var totalSegmentsCount = manifest
      .getRepresentation(0)
      .getTotalSegmentsCount();
    self.setVideoSegments({
      representationIndex: 1,
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
  var representationIndex = segmentsInfo.representationIndex;
  var startSegment = segmentsInfo.startSegment;
  var endSegment = segmentsInfo.endSegment;
  var representation = this.manifest.getRepresentation(representationIndex);
  if (!this.videoSegments) this.videoSegments = {};
  for (var i = startSegment; i <= endSegment; i++) {
    var segment = representation.getSegment(i);
    this.videoSegments[i] = {
      representationIndex: representationIndex,
      segment: i,
      url: segment.getUrl(),
    };
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
}

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
  if (this.currentSegment + 1 >= this.getVideoSegmentsCount()) {
    this.isBuffering = false;
    return;
  }
  if (!this.isBuffering) return;
  if (this.getPreBufferedTime() >= this.settings.bufferTime) {
    setTimeout(
      this.bufferVideo.bind(this),
      (this.settings.bufferTime * 1000) / 3
    );
    return;
  }
  if (!this.currentSegment && this.currentSegment !== 0) {
    this.currentSegment = 0;
  } else {
    this.currentSegment++;
  }
  var segmentInfo = this.videoSegments[this.currentSegment];
  var isRepresentationChange = true;
  if (this.currentSegment - 1 >= 0) {
    var previousSegmentInfo = this.videoSegments[this.currentSegment - 1];
    isRepresentationChange =
      segmentInfo.representationIndex !==
      previousSegmentInfo.representationIndex;
  }
  var representation = this.manifest.getRepresentation(
    segmentInfo.representationIndex
  );
  var mimeCodec = representation.getMimeCodec();
  var self = this;
  this.bufferSegment({
    representationIndex: segmentInfo.representationIndex,
    segmentIndex: segmentInfo.segment,
    segmentUrl: segmentInfo.url,
    isRepresentationChange: isRepresentationChange,
    mimeCodec: mimeCodec,
  }).then(function () {
    self.bufferVideo();
  });
};

Player.prototype.bufferSegment = function (segmentInfo) {
  var representationIndex = segmentInfo.representationIndex;
  var representation = this.manifest.getRepresentation(representationIndex);
  var segmentIndex = segmentInfo.segmentIndex;
  var segmentUrl = segmentInfo.segmentUrl;
  var isRepresentationChange = segmentInfo.isRepresentationChange;
  var mimeCodec = segmentInfo.mimeCodec;

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
            totalSegmentsLoaded: self.currentSegment + 1,
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
