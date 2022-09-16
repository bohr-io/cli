export enum LogLevel {
  DEBUG = 0,
  ERROR,
  NONE,
}

export interface Logger {
  debug(message: string): void;
  error(message: string): void;
}

let logLevel = LogLevel.ERROR;

export function setLogLevel(level: LogLevel) {
  logLevel = level;
}

export function getLogLevel(): LogLevel {
  return logLevel;
}