"use strict";
exports.__esModule = true;
exports.getLogLevel = exports.setLogLevel = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["ERROR"] = 1] = "ERROR";
    LogLevel[LogLevel["NONE"] = 2] = "NONE";
})(LogLevel = exports.LogLevel || (exports.LogLevel = {}));
var logLevel = LogLevel.ERROR;
function setLogLevel(level) {
    logLevel = level;
}
exports.setLogLevel = setLogLevel;
function getLogLevel() {
    return logLevel;
}
exports.getLogLevel = getLogLevel;
