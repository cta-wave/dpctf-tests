function Segment(attributes) {
  this.url = attributes.url;
  this.duration = attributes.duration;
  this.number = attributes.number;
  this.representationNumber = attributes.representationNumber;
  this.chunks = attributes.chunks || [];
  this.initSegmentUrl = attributes.initSegmentUrl;
  this.periodNumber = attributes.periodNumber;
}

Segment.prototype.sameRepresentationAs = function (segment) {
  return this.representationNumber === segment.representationNumber;
};

Segment.prototype.getUrl = function () {
  return this.url;
};

Segment.prototype.getDuration = function () {
  return this.duration;
};

Segment.prototype.getNumber = function () {
  return this.number;
};

Segment.prototype.getRepresentationNumber = function () {
  return this.representationNumber;
};

Segment.prototype.getChunks = function () {
  return this.chunks;
};

Segment.prototype.getInitSegmentUrl = function () {
  return this.initSegmentUrl;
};

Segment.prototype.getPeriodNumber = function () {
  return this.periodNumber;
};

function Representation(attributes) {
  this.mimeCodec = attributes.mimeCodec;
  this.segments = attributes.segments;
  this.resolution = attributes.resolution;
  this.codecs = attributes.codecs;
  this.bandwidth = attributes.bandwidth;
  this.name = attributes.name;
  this.number = attributes.number;
  this.periodNumber = attributes.periodNumber;
}

Representation.prototype.getMimeCodec = function () {
  return this.mimeCodec;
};

Representation.prototype.getResolution = function () {
  return this.resolution;
};

Representation.prototype.getCodecs = function () {
  return this.codecs;
};

Representation.prototype.getBandwidth = function () {
  return this.bandwidth;
};

Representation.prototype.getName = function () {
  return this.name;
};

Representation.prototype.getNumber = function () {
  return this.number;
};

Representation.prototype.getSegment = function (number) {
  return this.segments[number];
};

Representation.prototype.getSegments = function () {
  return this.segments;
};

Representation.prototype.getTotalSegmentsCount = function () {
  return this.segments.length;
};

Representation.prototype.getPeriodNumber = function () {
  return this.periodNumber;
};

function Manifest(attributes) {
  this.periods = attributes.periods;
  this.duration = attributes.duration;
}

Manifest.prototype.getRepresentation = function (number, periodNumber) {
  periodNumber = periodNumber || 0;
  return this.periods[periodNumber][number];
};

Manifest.prototype.getRepresentations = function () {
  var representations = [];
  for (var i; i < this.periods.length; i++) {
    representations = representations.concat(this.periods[i]);
  }
  return representations;
};

Manifest.prototype.getDuration = function () {
  return this.duration;
};

Manifest.prototype.getPeriods = function () {
  return this.periods;
};

function ManifestParser() {}

ManifestParser.parse = function (manifestUrl) {
  return ManifestParser.fetchInformation(manifestUrl).then(function (
    parsedManifest
  ) {
    var periods = [];
    var currentPeriod = null;
    var periodNumber = -1;
    var representationNumber = 0;
    for (var i = 0; i < parsedManifest.playlists.length; i++) {
      var playlist = parsedManifest.playlists[i];
      var periodId = playlist.timeline;
      var mimeCodec = 'video/mp4; codecs="' + playlist.attributes.CODECS + '"';
      if (!MediaSource.isTypeSupported(mimeCodec))
        throw new Error("Unsupported MIME type or codec: " + mimeCodec);
      var segments = [];

      if (currentPeriod !== periodId) {
        currentPeriod = periodId;
        periodNumber++;
        representationNumber = 0;
        periods.push([]);
      }

      for (var j = 0; j < playlist.segments.length; j++) {
        var segment = playlist.segments[j];
        var initSegmentUrl = segment.map.resolvedUri;
        segments.push(
          new Segment({
            url: segment.resolvedUri,
            duration: segment.duration,
            number: j,
            representationNumber: representationNumber,
            chunks: segment.chunks,
            initSegmentUrl: initSegmentUrl,
            periodNumber: periodNumber,
          })
        );
      }
      var codecs = playlist.attributes.CODECS;
      var resolution = playlist.attributes.RESOLUTION;
      var bandwidth = playlist.attributes.BANDWIDTH;
      var name = playlist.attributes.NAME;
      periods[periods.length - 1].push(
        new Representation({
          mimeCodec: mimeCodec,
          segments: segments,
          codecs: codecs,
          resolution: resolution,
          bandwidth: bandwidth,
          name: name,
          number: representationNumber,
          periodNumber: periodNumber,
        })
      );
      representationNumber ++;
    }

    var duration = parsedManifest.duration;

    return new Manifest({
      periods: periods,
      duration: duration,
    });
  });
};

ManifestParser.fetchInformation = function (manifestUrl) {
  return new Promise(function (resolve) {
    var mpdParser = window["mpdParser"];
    var xhr = new XMLHttpRequest();
    xhr.open("GET", manifestUrl);
    xhr.responseType = "text";
    xhr.overrideMimeType("text/xml");
    xhr.onload = function () {
      if (xhr.readyState === xhr.DONE && xhr.status === 200) {
        var parsedManifest = mpdParser.parse(xhr.responseText, {
          manifestUri: manifestUrl,
        });
        console.log("MPD: ", parsedManifest);
        resolve(parsedManifest);
      }
    };
    xhr.send();
  });
};
