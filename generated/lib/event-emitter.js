function EventEmitter() {
  var listeners = {};

  function on(event, listener) {
    if (!listeners[event]) {
      listeners[event] = [];
    }
    listeners[event].push(listener);
  }

  function off(event, listener) {
    if (!listeners[event]) return;
    var index = listeners[event].indexOf(listener);
    if (index === -1) return;
    listeners[event].splice(index, 1);
  }

  function emit(event, data) {
    if (!listeners[event]) return;
    listeners[event].forEach(function (listener) {
      listener(data);
    });
  }

  return {
    on: on,
    off: off,
    emit: emit,
  };
}

