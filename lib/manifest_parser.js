function ManifestParser() {}

ManifestParser.parse = function (manifestUrl) {
  return ManifestParser.fetchInformation(manifestUrl).then(function (
    parsedManifest
  ) {
    var periods = [];
    var currentPeriod = null;
    var periodNumber = -1;
    var representationNumber = 0;
    var playlists = [];
    playlists = playlists.concat(parsedManifest.playlists);
    if (parsedManifest.mediaGroups.AUDIO.audio) {
      for (let lang in parsedManifest.mediaGroups.AUDIO.audio) {
        playlists = playlists.concat(
          parsedManifest.mediaGroups.AUDIO.audio[lang].playlists
        );
      }
    }
    for (var i = 0; i < playlists.length; i++) {
      var playlist = playlists[i];
      var periodId = playlist.timeline;
      var codecs = playlist.attributes.CODECS;
      var mimeCodec = "";
      if (codecs.indexOf("avc1") !== -1) {
        mimeCodec = 'video/mp4; codecs="' + codecs + '"';
      } else if (codecs.indexOf("mp4a") !== -1) {
        mimeCodec = 'audio/mp4; codecs="' + codecs + '"';
      }
      if (!MediaSource.isTypeSupported(mimeCodec))
        throw new Error("Unsupported MIME type or codec: '" + mimeCodec + "'");
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
      representationNumber++;
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
        resolve(parsedManifest);
      }
    };
    xhr.send();
  });
};

function Segment(attributes) {
  let instance;
  let _url = attributes.url;
  let _duration = attributes.duration;
  let _number = attributes.number;
  let _representationNumber = attributes.representationNumber;
  let _chunks = attributes.chunks || [];
  let _initSegmentUrl = attributes.initSegmentUrl;
  let _periodNumber = attributes.periodNumber;

  function sameRepresentationAs(segment) {
    return _representationNumber === segment.representationNumber;
  }

  function getUrl() {
    return _url;
  }

  function getDuration() {
    return _duration;
  }

  function getNumber() {
    return _number;
  }

  function getRepresentationNumber() {
    return _representationNumber;
  }

  function getChunks() {
    return _chunks;
  }

  function getInitSegmentUrl() {
    return _initSegmentUrl;
  }

  function getPeriodNumber() {
    return _periodNumber;
  }

  instance = {
    sameRepresentationAs,
    getUrl,
    getDuration,
    getNumber,
    getRepresentationNumber,
    getChunks,
    getInitSegmentUrl,
    getPeriodNumber,
  };

  return instance;
}

function Representation(attributes) {
  let instance;
  let _mimeCodec = attributes.mimeCodec;
  let _segments = attributes.segments;
  let _resolution = attributes.resolution;
  let _codecs = attributes.codecs;
  let _bandwidth = attributes.bandwidth;
  let _name = attributes.name;
  let _number = attributes.number;
  let _periodNumber = attributes.periodNumber;

  function getMimeCodec() {
    return _mimeCodec;
  }

  function getResolution() {
    return _resolution;
  }

  function getCodecs() {
    return _codecs;
  }

  function getBandwidth() {
    return _bandwidth;
  }

  function getName() {
    return _name;
  }

  function getNumber() {
    return _number;
  }

  function getSegment(number) {
    return _segments[number];
  }

  function getSegments() {
    return _segments;
  }

  function getTotalSegmentsCount() {
    return _segments.length;
  }

  function getPeriodNumber() {
    return _periodNumber;
  }

  instance = {
    getMimeCodec,
    getResolution,
    getCodecs,
    getBandwidth,
    getName,
    getNumber,
    getSegment,
    getSegments,
    getTotalSegmentsCount,
    getPeriodNumber,
  };

  return instance;
}

function Manifest(attributes) {
  let instance;
  let _periods = attributes.periods;
  let _duration = attributes.duration;

  function getRepresentation(number, periodNumber) {
    periodNumber = periodNumber || 0;
    return _periods[periodNumber][number];
  }

  function getRepresentations() {
    var representations = [];
    for (var i = 0; i < _periods.length; i++) {
      representations = representations.concat(_periods[i]);
    }
    return representations;
  }

  function getDuration() {
    return _duration;
  }

  function getPeriods() {
    return _periods;
  }

  instance = {
    getRepresentation,
    getRepresentations,
    getDuration,
    getPeriods,
  };

  return instance;
}
