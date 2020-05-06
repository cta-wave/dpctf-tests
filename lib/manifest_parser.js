function Segment(attributes) {
  this.url = attributes.url;
  this.duration = attributes.duration;
  this.number = attributes.number;
  this.representationNumber = attributes.representationNumber;
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

function Representation(attributes) {
  this.mimeCodec = attributes.mimeCodec;
  this.initSegmentUrl = attributes.initSegmentUrl;
  this.segments = attributes.segments;
  this.resolution = attributes.resolution;
  this.codecs = attributes.codecs;
  this.bandwidth = attributes.bandwidth;
  this.name = attributes.name;
  this.number = attributes.number;
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

Representation.prototype.getInitSegmentUrl = function () {
  return this.initSegmentUrl;
};

Representation.prototype.getTotalSegmentsCount = function () {
  return this.segments.length;
};

function Manifest(attributes) {
  this.representations = attributes.representations;
  this.duration = attributes.duration;
}

Manifest.prototype.getRepresentation = function (number) {
  return this.representations[number];
};

Manifest.prototype.getRepresentations = function () {
  return this.representations;
};

Manifest.prototype.getDuration = function () {
  return this.duration;
};

function ManifestParser() {}

ManifestParser.parse = function (manifestUrl) {
  return ManifestParser.fetchInformation(manifestUrl).then(function (
    parsedManifest
  ) {
    var representations = [];
    for (var i = 0; i < parsedManifest.playlists.length; i++) {
      var playlist = parsedManifest.playlists[i];
      var mimeCodec = 'video/mp4; codecs="' + playlist.attributes.CODECS + '"';
      if (!MediaSource.isTypeSupported(mimeCodec))
        throw new Error("Unsupported MIME type or codec: " + mimeCodec);
      var initSegmentUrl = playlist.segments[0].map.resolvedUri;
      var segments = [];
      for (var j = 0; j < playlist.segments.length; j++) {
        var segment = playlist.segments[j];
        segments.push(
          new Segment({
            url: segment.resolvedUri,
            duration: segment.duration,
            number: j,
            representationNumber: i,
          })
        );
      }
      var codecs = playlist.attributes.CODECS;
      var resolution = playlist.attributes.RESOLUTION;
      var bandwidth = playlist.attributes.BANDWIDTH;
      var name = playlist.attributes.NAME;
      representations.push(
        new Representation({
          mimeCodec: mimeCodec,
          initSegmentUrl: initSegmentUrl,
          segments: segments,
          codecs: codecs,
          resolution: resolution,
          bandwidth: bandwidth,
          name: name,
          number: i,
        })
      );
    }

    var duration = parsedManifest.duration;

    return new Manifest({
      representations: representations,
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
