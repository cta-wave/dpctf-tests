function Logger() {
  var LEVEL_ERROR = 1;
  var LEVEL_WARNING = 2;
  var LEVEL_INFO = 3;
  var LEVEL_DEBUG = 4;

  var LOG_EVENT = "log";

  var logLevel = LEVEL_INFO;
  var logToConsole = false;
  var eventEmitter = new EventEmitter();

  function log(message, level) {
    var prefix = "[" + new Date(Date.now()).toISOString() + "]";

    level = level || LEVEL_INFO;
    switch (level) {
      case LEVEL_DEBUG:
        prefix = prefix + "[DBG]";
        break;
      case LEVEL_INFO:
        prefix = prefix + "[INF]";
        break;
      case LEVEL_WARNING:
        prefix = prefix + "[WRN]";
        break;
      case LEVEL_ERROR:
        prefix = prefix + "[ERR]";
        break;
    }

    var log = prefix + " " + message;
    eventEmitter.dispatchEvent(LOG_EVENT, log);
    if (logToConsole && console && console.log) {
      console.log(log);
    }
  }

  function getMessage(message_parts) {
    var message = "";
    for (var i = 0; i < message_parts.length; i++) {
      message += message_parts[i] + " ";
    }

    return message;
  }

  function logDebug() {
    if (logLevel < LEVEL_DEBUG) return;
    return log(getMessage(arguments), LEVEL_DEBUG);
  }

  function logInfo() {
    if (logLevel < LEVEL_INFO) return;
    return log(getMessage(arguments), LEVEL_INFO);
  }

  function logWarning() {
    if (logLevel < LEVEL_WARNING) return;
    return log(getMessage(arguments), LEVEL_WARNING);
  }

  function logError() {
    if (logLevel < LEVEL_ERROR) return;
    return log(getMessage(arguments), LEVEL_ERROR);
  }

  function setLogLevel(level) {
    logLevel = level;
  }

  function setLogToConsole(enabled) {
    logToConsole = enabled;
  }

  return {
    log: logInfo,
    debug: logDebug,
    info: logInfo,
    warn: logWarning,
    error: logError,
    setLogLevel: setLogLevel,
    setLogToConsole: setLogToConsole,
    on: eventEmitter.on.bind(eventEmitter),
    off: eventEmitter.off.bind(eventEmitter),
    LEVEL_ERROR: LEVEL_ERROR,
    LEVEL_WARNING: LEVEL_WARNING,
    LEVEL_INFO: LEVEL_INFO,
    LEVEL_DEBUG: LEVEL_DEBUG,
    LOG_EVENT: LOG_EVENT,
  };
}
