function ManifestParser() {}

ManifestParser.parse = function (manifestUrl, manifestIndex) {
  return ManifestParser.fetchInformation(manifestUrl).then(function (
    parsedManifest
  ) {
    var periods = {};
    var currentPeriod = null;
    var representationNumber = 0;
    parsedManifest.playlists.forEach(function (playlist) {
      playlist.type = "video";
    });
    parsedManifest.audioPlaylists.forEach(function (playlist) {
      playlist.type = "audio";
    });
    var playlists = [];
    playlists = playlists.concat(parsedManifest.playlists);
    playlists = playlists.concat(parsedManifest.audioPlaylists);
    //if (parsedManifest.mediaGroups.AUDIO.audio) {
    //for (let lang in parsedManifest.mediaGroups.AUDIO.audio) {
    //playlists = playlists.concat(
    //parsedManifest.mediaGroups.AUDIO.audio[lang].playlists
    //);
    //}
    //}
    for (var i = 0; i < playlists.length; i++) {
      var playlist = playlists[i];
      var periodId = playlist.timeline;
      var codecs = playlist.attributes.CODECS;
      var mimeCodec = "";
      if (playlist.type === "video") {
        mimeCodec = 'video/mp4; codecs="' + codecs + '"';
      } else if (playlist.type === "audio") {
        mimeCodec = 'audio/mp4; codecs="' + codecs + '"';
      }
      if (!MediaSource.isTypeSupported(mimeCodec)) {
        // For now we don't throw an error. This will change in the future
        //throw new Error("Unsupported MIME type or codec: '" + mimeCodec + "'");
        console.warn("Unsupported MIME type or codec: '" + mimeCodec + "'");
      }
      var segments = [];

      if (currentPeriod !== periodId) {
        if (!periods[periodId]) {
          periods[periodId] = [];
        }
        currentPeriod = periodId;
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
            periodNumber: periodId,
            timestampOffset: segment.timestampOffset,
            manifestIndex: manifestIndex,
          })
        );
      }
      var codecs = playlist.attributes.CODECS;
      var resolution = playlist.attributes.RESOLUTION;
      var bandwidth = playlist.attributes.BANDWIDTH;
      var name = playlist.attributes.NAME;
      periods[periodId].push(
        new Representation({
          mimeCodec: mimeCodec,
          segments: segments,
          codecs: codecs,
          resolution: resolution,
          bandwidth: bandwidth,
          name: name,
          number: representationNumber,
          periodNumber: periodId,
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
  return new Promise(function (resolve, reject) {
    var mpdParser = window["mpdParser"];
    var xhr = new XMLHttpRequest();
    xhr.open("GET", manifestUrl);
    xhr.responseType = "text";
    xhr.overrideMimeType("text/xml");
    xhr.onload = function () {
      if (xhr.status === 404) {
        reject(new Error("Could not find manifest: " + manifestUrl));
      }
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
  let _timestampOffset = attributes.timestampOffset;
  let _manifestIndex = attributes.manifestIndex;

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

  function getTimestampOffset() {
    return _timestampOffset;
  }

  function setTimestampOffset(timestampOffset) {
    _timestampOffset = timestampOffset;
  }

  function getManifestIndex() {
    return _manifestIndex;
  }

  function setManifestIndex(manifestIndex) {
    _manifestIndex = manifestIndex;
  }

  function copy() {
    return new Segment({
      url: _url,
      duration: _duration,
      number: _number,
      representationNumber: _representationNumber,
      chunks: _chunks,
      initSegmentUrl: _initSegmentUrl,
      periodNumber: _periodNumber,
      timestampOffset: _timestampOffset,
      manifestIndex: _manifestIndex,
    });
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
    getTimestampOffset,
    setTimestampOffset,
    getManifestIndex,
    setManifestIndex,
    copy,
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

  function getManifestIndex() {
    return _segments[0].getManifestIndex();
  }

  function toString() {
    var string = "";
    string += "MimeCodec: " + _mimeCodec + ";";
    string += "Resolution: " + _resolution + ";";
    string += "Codecs: " + _codecs + ";";
    string += "Bandwidth: " + _bandwidth + ";";
    string += "Name: " + _name + ";";
    string += "Number: " + _number + ";";
    string += "TotalSegments: " + _segments.length + ";";
    string += "Period: " + _periodNumber + ";";
    return string;
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
    getManifestIndex,
    toString,
  };

  return instance;
}

function Manifest(attributes) {
  let instance;
  let _periods = attributes.periods;
  let _duration = attributes.duration;

  function getRepresentation(number, periodNumber) {
    periodNumber = periodNumber || 0;
    for (var representation of _periods[periodNumber]) {
      if (representation.getNumber() !== number) continue;
      return representation;
    }
    return null;
  }

  function getRepresentations() {
    var representations = [];
    for (var periodId in _periods) {
      representations = representations.concat(_periods[periodId]);
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
