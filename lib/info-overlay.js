var INFO_OVERLAY_DEFAULT_TEST_INFO = {
  test: {
    title: "unknown",
    description: "unknown",
  },
  video: {
    representations: [],
    playingRepresentation: "unknown",
    currentTime: "unknown",
    playingSegment: "unknown"
  },
};

function InfoOverlay(element) {
  this.visible = false;
  this.rootElement = element;
  this.info = INFO_OVERLAY_DEFAULT_TEST_INFO;
}

InfoOverlay.prototype.init = function () {
  var rootElement = this.rootElement;
  rootElement.innerHtml = "";
  rootElement.style.position = "fixed";
  rootElement.style.width = "100vw";
  rootElement.style.height = "100vh";
  rootElement.style.left = "0";
  rootElement.style.top = "0";
  rootElement.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
  rootElement.style.fontFamily = "Sans";
  rootElement.style.display = "none";
  this.visible = false;

  var contentElement = document.createElement("div");
  contentElement.style.color = "white";
  contentElement.style.padding = "1em";
  rootElement.appendChild(contentElement);
  this.contentElement = contentElement;

  this.renderInfo();
};

InfoOverlay.prototype.updateOverlayInfo = function(player, testInfo) {
  var manifest = player.getManifest();
  var playingRepresentation = player.getPlayingRepresentation();
  var number = "none";
  if (playingRepresentation) number = playingRepresentation.getNumber();
  this.setInfo({
    test: testInfo,
    video: {
      representations: manifest.getRepresentations(),
      playingRepresentation: number,
      currentTime: player.getCurrentTime(),
      playingSegment: player.getPlayingSegment().getNumber(),
      duration: manifest.getDuration(),
    },
  });
  this.renderInfo();
}

InfoOverlay.prototype.setInfo = function (info) {
  this.info = info;
};

InfoOverlay.prototype.show = function () {
  if (this.visible) return;
  this.visible = true;
  this.rootElement.style.display = "block";
};

InfoOverlay.prototype.hide = function () {
  if (!this.visible) return;
  this.visible = false;
  this.rootElement.style.display = "none";
};

InfoOverlay.prototype.toggle = function () {
  if (this.visible) {
    this.hide();
  } else {
    this.show();
  }
};

InfoOverlay.prototype.renderInfo = function () {
  var rootElement = this.contentElement;
  rootElement.innerHTML = "";

  this.renderTestInfo(rootElement);
  this.renderVideoInfo(rootElement);
};

InfoOverlay.prototype.renderTestInfo = function (rootElement) {
  var testInfo = this.info.test;

  var testInfoHeading = document.createElement("h3");
  testInfoHeading.innerText = "Test Information";
  rootElement.appendChild(testInfoHeading);

  var testInfoTable = document.createElement("table");
  testInfoTable.className = "test-info-table";
  rootElement.appendChild(testInfoTable);

  var testTitleRow = document.createElement("tr");
  testInfoTable.appendChild(testTitleRow);

  var testTitleName = document.createElement("td");
  testTitleName.innerText = "Title: ";
  testTitleName.style.fontWeight = "bold";
  testTitleRow.appendChild(testTitleName);

  var testTitle = document.createElement("td");
  testTitle.innerText = testInfo.title;
  testTitleRow.appendChild(testTitle);

  var testDescriptionRow = document.createElement("tr");
  testInfoTable.appendChild(testDescriptionRow);

  var testDescriptionName = document.createElement("td");
  testDescriptionName.innerText = "Description: ";
  testDescriptionName.style.fontWeight = "bold";
  testDescriptionRow.appendChild(testDescriptionName);

  var testDescription = document.createElement("td");
  testDescription.innerText = testInfo.description;
  testDescriptionRow.appendChild(testDescription);

  var testInfoTableRows = document.querySelectorAll(".test-info-table tr");
  for (var testInfoTableRow of testInfoTableRows) {
    testInfoTableRow.style.verticalAlign = "top";
  }
};

InfoOverlay.prototype.renderVideoInfo = function (rootElement) {
  var videoInfo = this.info.video;

  var videoInfoHeading = document.createElement("h3");
  videoInfoHeading.innerText = "Video Information";
  rootElement.appendChild(videoInfoHeading);

  var videoInfoTable = document.createElement("table");
  rootElement.appendChild(videoInfoTable);

  var playingRepresentationRow = document.createElement("tr");
  videoInfoTable.appendChild(playingRepresentationRow);

  var playingRepresentationName = document.createElement("td");
  playingRepresentationName.innerText = "Current Representation:";
  playingRepresentationRow.appendChild(playingRepresentationName);

  var playingRepresentationValue = document.createElement("td");
  playingRepresentationValue.innerText = videoInfo.playingRepresentation;
  playingRepresentationRow.appendChild(playingRepresentationValue);

  var playingSegmentRow = document.createElement("tr");
  videoInfoTable.appendChild(playingSegmentRow);

  var playingSegmentName = document.createElement("td");
  playingSegmentName.innerText = "Current Segment:";
  playingSegmentRow.appendChild(playingSegmentName);

  var playingSegmentValue = document.createElement("td");
  playingSegmentValue.innerText = videoInfo.playingSegment;
  playingSegmentRow.appendChild(playingSegmentValue);

  var currentTimeRow = document.createElement("tr");
  videoInfoTable.appendChild(currentTimeRow);

  var currentTimeName = document.createElement("td");
  currentTimeName.innerText = "Current Time:";
  videoInfoTable.appendChild(currentTimeName);

  var currentTimeValue = document.createElement("td");
  currentTimeValue.innerText = InfoOverlay.parseTimeStampFromSeconds(videoInfo.currentTime);
  videoInfoTable.appendChild(currentTimeValue);

  var durationRow = document.createElement("tr");
  videoInfoTable.appendChild(durationRow);

  var durationName = document.createElement("td");
  durationName.innerText = "Duration:";
  durationRow.appendChild(durationName);

  var durationValue = document.createElement("td");
  durationValue.innerText = InfoOverlay.parseTimeStampFromSeconds(videoInfo.duration);
  durationRow.appendChild(durationValue);

  var representationsWrapper = document.createElement("div");
  for (var i = 0; i < videoInfo.representations.length; i++) {
    var representation = videoInfo.representations[i];
    this.renderRepresentation(representationsWrapper, representation);
  }
  rootElement.appendChild(representationsWrapper);
};

InfoOverlay.prototype.renderRepresentation = function (
  rootElement,
  representation
) {
  var representationTitle = document.createElement("h4");
  representationTitle.innerText =
    "Representation " + representation.getNumber();
  rootElement.appendChild(representationTitle);

  var representationTable = document.createElement("table");
  representationTable.className = "represent-table";
  rootElement.appendChild(representationTable);

  var nameRow = document.createElement("tr");
  representationTable.appendChild(nameRow);

  var nameName = document.createElement("td");
  nameName.innerText = "Name:";
  nameRow.appendChild(nameName);

  var nameValue = document.createElement("td");
  nameValue.innerText = representation.getName();
  nameRow.appendChild(nameValue);

  var codecRow = document.createElement("tr");
  representationTable.appendChild(codecRow);

  var codecName = document.createElement("td");
  codecName.innerText = "Codecs:";
  codecRow.appendChild(codecName);

  var codecValue = document.createElement("td");
  codecValue.innerText = representation.getCodecs();
  codecRow.appendChild(codecValue);

  var resolutionRow = document.createElement("tr");
  representationTable.appendChild(resolutionRow);

  var resolutionName = document.createElement("td");
  resolutionName.innerText = "Resolution:";
  resolutionRow.appendChild(resolutionName);

  var resolution = representation.getResolution();
  var resolutionValue = document.createElement("td");
  resolutionValue.innerText = resolution.width + "x" + resolution.height;
  resolutionRow.appendChild(resolutionValue);

  var bandwidthRow = document.createElement("tr");
  representationTable.appendChild(bandwidthRow);

  var bandwidthName = document.createElement("td");
  bandwidthName.innerText = "Bandwidth:";
  bandwidthRow.appendChild(bandwidthName);

  var bandwidthValue = document.createElement("td");
  bandwidthValue.innerText = representation.getBandwidth();
  bandwidthRow.appendChild(bandwidthValue);

  var segmentsRow = document.createElement("tr");
  representationTable.appendChild(segmentsRow);

  var segmentsName = document.createElement("td");
  segmentsName.innerText = "Segments:";
  segmentsRow.appendChild(segmentsName);

  var segmentsValue = document.createElement("td");
  segmentsValue.innerText = representation.getTotalSegmentsCount();
  segmentsRow.appendChild(segmentsValue);
};

InfoOverlay.parseTimeStampFromSeconds = function (seconds) {
  function pad(number, length) {
    var string = "0000000000" + number;
    return string.substr(string.length - length);
  }

  var parsedSeconds = Math.floor(seconds) % 60;
  var parsedMinutes = Math.floor(seconds / 60) % 60;
  var parsedHours = Math.floor(seconds / 60 / 60);

  return (
    pad(parsedHours, 2) +
    ":" +
    pad(parsedMinutes, 2) +
    ":" +
    pad(parsedSeconds, 2)
  );
};
