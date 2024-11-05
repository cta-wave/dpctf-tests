function HbbTV() {
  var INIT_APP_DELAY_MS = 1000;
  var STOP_BROADCAST_TIMEOUT_MS = 10000;
  var STATE_UNREALIZED = 0;
  var STATE_CONNECTING = 1;
  var STATE_PRESENTING = 2;
  var STATE_STOPPED = 3;

  var log = console.log;

  function setKeyset(mask) {
    try {
      var app = document.getElementById("appmgr").getOwnerApplication(document);
      app.privateData.keyset.setValue(mask);
    } catch (e) {}
  }

  function initApp() {
    try {
      var app = document.getElementById("appmgr").getOwnerApplication(document);
      app.show();
    } catch (e) {}
    setKeyset(0x1 + 0x2 + 0x4 + 0x8 + 0x10);
  }

  function activate() {
    // active only on hbbtv terminals
    if (navigator.userAgent.toLowerCase().indexOf("hbbtv") === -1) {
      return;
    }
    log("activating hbbtv");

    // create hbbtv objects and add to body
    var appmgroipfcfg =
      '<object id="appmgr" type="application/oipfApplicationManager" style="position: absolute; left: 0px; top: 0px; width: 0px; height: 0px;">';

    var elem = document.createElement("div");
    elem.innerHTML = appmgroipfcfg;
    document.body.appendChild(elem);

    setTimeout(initApp, INIT_APP_DELAY_MS);
  }

  function isHbbTvContext() {
    return navigator.userAgent.toLowerCase().indexOf("hbbtv") !== -1;
  }

  function stopBroadcast() {
    return new Promise(function (resolve) {
      if (!isHbbTvContext()) return resolve();
      log("stopping broadcast");

      var wrapperElement = document.createElement("div");
      wrapperElement.innerHTML =
        '<object id="broadcast-object" type="video/broadcast" style="position: absolute; left: 0px; top: 0px; width: 1280px; height: 720px;">';
      wrapperElement.style = "visibility:hidden;width:0px;height:0px;";
      document.body.appendChild(wrapperElement);
      var broadcastObject = document.getElementById("broadcast-object");

      if (broadcastObject.playState === STATE_STOPPED) {
        return resolve();
      }

      if (broadcastObject.playState === STATE_UNREALIZED) {
        return resolve();
      }

      broadcastObject.setChannel(null);
      broadcastObject.onPlayStateChange = function (state, error) {
        if (error !== undefined) {
          return resolve(error);
        }
        switch (state) {
          case STATE_STOPPED:
          case STATE_UNREALIZED:
            broadcastObject.onPlayStateChange = function () {};
            clearTimeout(stopBroadcastTimeout);
            resolve();
            break;
          case STATE_CONNECTING:
          case STATE_PRESENTING:
            broadcastObject.setChannel(null);
            break;
          default:
            break;
        }
      };

      try {
        broadcastObject.bindToCurrentChannel();
      } catch (error) {
        if (error.name === "SecurityError") {
          log("warning: " + error);
        } else {
          return resolve(error);
        }
      }
      log("broadcast stopped successfully");
      resolve();
    });
  }

  function setLogger(logger) {
    log = logger.log;
  }

  return {
    activate: activate,
    stopBroadcast: stopBroadcast,
    setLogger: setLogger,
    isHbbTvContext: isHbbTvContext,
  };
}

HbbTV = new HbbTV();

(function () {
  var HBBTV_ACTIVATION_DELAY_MS = 1000;
  setTimeout(HbbTV.activate, HBBTV_ACTIVATION_DELAY_MS);
})();
