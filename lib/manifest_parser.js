function Segment(attributes) {
  this.url = attributes.url;
  this.duration = attributes.duration;
}

Segment.prototype.getUrl = function () {
  return this.url;
};

Segment.prototype.getDuration = function () {
  return this.duration;
};

function Representation(attributes) {
  this.mimeCodec = attributes.mimeCodec;
  this.initSegmentUrl = attributes.initSegmentUrl;
  this.segments = attributes.segments;
}

Representation.prototype.getMimeCodec = function () {
  return this.mimeCodec;
};

Representation.prototype.getSegment = function (index) {
  return this.segments[index];
};

Representation.prototype.getInitSegmentUrl = function () {
  return this.initSegmentUrl;
};

Representation.prototype.getTotalSegmentsCount = function () {
  return this.segments.length;
};

function Manifest(attributes) {
  this.representations = attributes.representations;
}

Manifest.prototype.getRepresentation = function (index) {
  return this.representations[index];
};

function ManifestParser() {}

ManifestParser.parse = function (manifestUrl) {
  return ManifestParser.fetchInformation(manifestUrl).then(function (
    parsedManifest
  ) {
    var representations = [];
    for (var playlist of parsedManifest.playlists) {
      var mimeCodec = 'video/mp4; codecs="' + playlist.attributes.CODECS + '"';
      if (!MediaSource.isTypeSupported(mimeCodec))
        throw new Error("Unsupported MIME type or codec: " + mimeCodec);
      var initSegmentUrl = playlist.segments[0].map.resolvedUri;
      var segments = [];
      for (var segment of playlist.segments) {
        segments.push(
          new Segment({ url: segment.resolvedUri, duration: segment.duration })
        );
      }
      representations.push(
        new Representation({
          mimeCodec: mimeCodec,
          initSegmentUrl: initSegmentUrl,
          segments: segments,
        })
      );
    }

    return new Manifest({ representations: representations });
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
