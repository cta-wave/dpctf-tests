var content = [];
var video = null;
var manifestParser = null;
var sessions = [];
var messageFormat = 'utf8';
var playerSettings = null;
/* ================== Player related stuff ================== */

var Player = function(video) {
  this.currentSegment = 0;
  this.mediaSource = null;
  this.sourceBuffer = null;
  this.manifestParser = null
  this.video = video;
  this.callbackList = [];
  this.video.onerror = function(err) {
    console.log("Error " + JSON.stringify(video.error));
  }
};

Player.prototype.init = function(settings) {
  playerSettings = settings;
};

Player.prototype.load = async function(testVector) {
  console.log("Test-Vector: ", testVector)
  this.manifestParser = new manifestParser(testVector);
  await this.manifestParser.parse();
  this.fireCallback("onManifestParsed", null)
  this.setContentArrays();
  this.createMediaSource();
};

Player.prototype.getCurrentManifest = function() {
  return this.manifestParser.manifestContent;
};

Player.prototype.registerCallbacks = function(callbacks) {
  this.callbackList = this.callbackList.concat(callbacks);
};

Player.prototype.fireCallback = function(callbackName, payload) {
  if(!this.callbackList){
    return;
  }
  for (var i = 0; i < this.callbackList.length; i++) {
    if (this.callbackList[i].name == callbackName) {
      var callbackFunction = this.callbackList[i];
      console.log(callbackFunction)
      callbackFunction(payload);
    }
  }
};

Player.prototype.setContentArrays = function() {
  var segmentsNumber = this.manifestParser.manifestContent.playlists[0].segments.length;
  var initSegment = this.manifestParser.manifestContent.playlists[0].segments[0].map.resolvedUri
  content.push(initSegment);
  for (var i = 0; i < segmentsNumber; i++) {
    var segmentInfo = this.manifestParser.manifestContent.playlists[0].segments[i];
    var segmentUri = segmentInfo.resolvedUri
    content.push(segmentUri);
  }
};

Player.prototype.debug = function(msg) {
  var self = this;
  console.log(msg);
};

/* ================== MSE related stuff ================== */

Player.prototype.createMediaSource = function() {
  var self = this;
  self.debug('Starting to create media source with codec avc1.4D401E');
  if ('MediaSource' in window && MediaSource.isTypeSupported('video/mp4; codecs="avc1.4D401E"')) {
    self.mediaSource = new MediaSource();
    this.video.src = URL.createObjectURL(self.mediaSource);
    self.mediaSource.addEventListener('sourceopen', self.onMediaSourceOpen.bind(self));
  } else {
    self.debug('Browser has no media source or codec is not supported');
    console.error('Unsupported MIME type or codec: ');
  }
};


Player.prototype.onMediaSourceOpen = function() {
  var self = this;
  //self.mediaSource.duration = self.manifestParser.manifestContent.duration;
  self.debug('Media Source created and in open state');
  self.sourceBuffer = self.mediaSource.addSourceBuffer('video/mp4;codecs="avc1.4D401E"');
  self.fireCallback("onSourceBufferAdded", self.sourceBuffer)
  self.sourceBuffer.addEventListener('updateend', function() {

    if(playerSettings.numberOfSegmentBeforePlay && playerSettings.numberOfSegmentBeforePlay == self.currentSegment){
      video.play();
    }
    self.debug('Buffer operation completed at ' + self.video.currentTime);
    self.Playerend();
  });

  self.mediaSource.addEventListener('error', function() {
    console.log("ERRORRR")
  });
  self.Playerend();

};

Player.prototype.Playerend = function() {
  var self = this;

  if (self.currentSegment >= content.length) {
    self.finished = true;
    self.mediaSource.endOfStream();
  } else {
    self.fetchSegment(content[self.currentSegment], function(arrayBuffer) {
      try {
        console.log(arrayBuffer)
        self.debug('Trying to Playerend segment ' + self.currentSegment + ' to the buffer...');
        self.sourceBuffer.appendBuffer(arrayBuffer);
        self.currentSegment += 1;
      } catch (e) {
        console.log(e);
      }
    });
  }
};

Player.prototype.fetchSegment = function(url, callback) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.responseType = 'arraybuffer';
  xhr.send();

  xhr.onload = function(e) {
    if (xhr.status != 200) {
      return false;
    }
    callback(xhr.response, url);
  };
};
