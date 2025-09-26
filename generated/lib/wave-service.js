function WaveService() {
  var urlParams;
  (window.onpopstate = function () {
    var match,
      pl = /\+/g, // Regex for replacing addition symbol with a space
      search = /([^&=]+)=?([^&]*)/g,
      decode = function (s) {
        return decodeURIComponent(s.replace(pl, " "));
      },
      query = window.location.search.substring(1);

    urlParams = {};
    while ((match = search.exec(query)))
      urlParams[decode(match[1])] = decode(match[2]);
  })();

  var webRoot = urlParams["web_root"];
  var sessionEventListeners = {};
  var sessionEventNumbers = {};

  function initialize(waveConfigUrl) {
    return new Promise(function (resolve) {
      sendRequest(
        "GET",
        waveConfigUrl,
        null,
        null,
        function (response) {
          var config = JSON.parse(response);
          var webRoot = config.web_root;
          if (webRoot.indexOf("/") !== 0) webRoot = "/" + webRoot;
          if (webRoot.split("").pop() !== "/") webRoot += "/";
          webRoot = webRoot;
          resolve();
        },
        function (error) {
          resolve(error);
        }
      );
    });
  }

  function sendRequest(method, uri, headers, data, onSuccess, onError) {
    var xhr = new XMLHttpRequest();
    xhr.onload = function () {
      if (xhr.status === 200) {
        onSuccess(xhr.response);
      } else {
        if (onError) onError(xhr.status, xhr.response);
      }
    };
    xhr.onerror = function () {
      if (onError) onError();
    };
    xhr.open(method, webRoot + uri, true);
    for (var header in headers) {
      xhr.setRequestHeader(header, headers[header]);
    }
    xhr.send(data);
    return xhr;
  }

  function sendSessionEvent(token, type, data) {
    if (!type) type = null;
    if (!data) data = null;
    var event = { type: type, data: data };
    var data = JSON.stringify(event);
    return new Promise(function (resolve) {
      sendRequest(
        "POST",
        "api/sessions/" + token + "/events",
        null,
        data,
        function () {
          resolve();
        },
        function (error) {
          resolve(error);
        }
      );
    });
  }

  function listenHttpPolling(url, onSuccess, onError) {
    var uniqueId = new Date().getTime();
    if (url.indexOf("?") === -1) {
      url = url + "?id=" + uniqueId;
    } else {
      url = url + "&id=" + uniqueId;
    }
    sendRequest(
      "GET",
      url,
      null,
      null,
      function (response) {
        if (!response) {
          onSuccess(null);
          return;
        }
        onSuccess(JSON.parse(response));
      },
      onError
    );
  }

  function addSessionEventListener(token, callback) {
    var listeners = sessionEventListeners;
    if (!listeners[token]) listeners[token] = [];
    if (listeners[token].indexOf(callback) >= 0) return;
    listeners[token].push(callback);
    sessionEventListeners = listeners;
    listenSessionEvents(token);
  }

  function removeSessionEventListener(callback) {
    var listeners = sessionEventListeners;
    for (var token of Object.keys(listeners)) {
      var index = listeners[token].indexOf(callback);
      if (index === -1) continue;
      listeners[token].splice(index, 1);
      break;
    }
    sessionEventListeners = listeners;
  }

  function listenSessionEvents(token) {
    var listeners = sessionEventListeners;
    if (!listeners[token] || listeners.length === 0) return;
    var url = "api/sessions/" + token + "/events";
    var lastEventNumber = sessionEventNumbers[token];
    if (lastEventNumber) {
      url += "?last_event=" + lastEventNumber;
    }
    listenHttpPolling(
      url,
      function (response) {
        if (!response) {
          listenSessionEvents(token);
          return;
        }
        var lastEventNumber = 0;
        for (var event of response) {
          for (var listener of listeners[token]) {
            if (event.number > lastEventNumber) {
              lastEventNumber = event.number;
            }
            listener(event);
          }
        }
        sessionEventNumbers[token] = lastEventNumber;
        listenSessionEvents(token);
      },
      function () {
        setTimeout(function () {
          listenSessionEvents();
        }, 1000);
      }
    );
  }

  function sendLogs(token, test, logs) {
    if (!logs) logs = [];
    var data = JSON.stringify({ test: test, logs: logs });
    return new Promise(function (resolve) {
      sendRequest(
        "POST",
        "api/tests/" + token + "/logs",
        null,
        data,
        function () {
          resolve();
        },
        function (error) {
          resolve(error);
        }
      );
    });
  }

  return { sendLogs, sendSessionEvent, addSessionEventListener, removeSessionEventListener, initialize };
}

var WaveService = new WaveService();