var WaveService = function () {
  this.sessionEventListeners = {};
  this.webRoot = "/";
};

WaveService.TEST_READY_EVENT = "test_ready";
WaveService.OBSERVATION_READY_EVENT = "observation_ready";

WaveService.prototype.initialize = function (waveConfigUrl) {
  var self = this;
  return new Promise(function (resolve) {
    self.sendRequest(
      "GET",
      waveConfigUrl,
      null,
      null,
      function (response) {
        var config = JSON.parse(response);
        var webRoot = config.web_root;
        if (webRoot.indexOf("/") !== 0) webRoot = "/" + webRoot;
        if (webRoot.split("").pop() !== "/") webRoot += "/";
        self.webRoot = webRoot;
        resolve();
      },
      function (error) {
        resolve(error);
      }
    );
  });
};

WaveService.prototype.sendRequest = function (
  method,
  uri,
  headers,
  data,
  onSuccess,
  onError
) {
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
  xhr.open(method, this.webRoot + uri, true);
  for (var header in headers) {
    xhr.setRequestHeader(header, headers[header]);
  }
  xhr.send(data);
  return xhr;
};

WaveService.prototype.sendSessionEvent = function (token, type, data) {
  var event = { type: type, data: data };
  var data = JSON.stringify(event);
  var self = this;
  return new Promise(function (resolve) {
    self.sendRequest(
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
};

WaveService.prototype.listenHttpPolling = function (url, onSuccess, onError) {
  var uniqueId = new Date().getTime();
  if (url.indexOf("?") === -1) {
    url = url + "?id=" + uniqueId;
  } else {
    url = url + "&id=" + uniqueId;
  }
  this.sendRequest(
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
};

WaveService.prototype.addSessionEventListener = function (token, callback) {
  var listeners = this.sessionEventListeners;
  if (!listeners[token]) listeners[token] = [];
  if (listeners[token].indexOf(callback) >= 0) return;
  listeners[token].push(callback);
  this.sessionEventListeners = listeners;
  this.listenSessionEvents(token);
};

WaveService.prototype.removeSessionEventListener = function (callback) {
  var listeners = this.sessionEventListeners;
  for (var token of Object.keys(listeners)) {
    var index = listeners[token].indexOf(callback);
    if (index === -1) continue;
    listeners[token].splice(index, 1);
    break;
  }
  this.sessionEventListeners = listeners;
};

WaveService.prototype.listenSessionEvents = function (token) {
  var listeners = this.sessionEventListeners;
  if (!listeners[token] || listeners.length === 0) return;
  var self = this;
  this.listenHttpPolling(
    "api/sessions/" + token + "/events",
    function (response) {
      if (!response) {
        self.listenSessionEvents(token);
        return;
      }
      for (var listener of listeners[token]) {
        listener(response);
      }
      self.listenSessionEvents(token);
    },
    function () {
      setTimeout(function () {
        self.listenSessionEvents();
      }, 1000);
    }
  );
};
