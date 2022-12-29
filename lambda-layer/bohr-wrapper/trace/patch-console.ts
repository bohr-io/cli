import * as shimmer from "shimmer";
import { inspect } from "util";
import { getLogLevel, LogLevel, setLogLevel } from "../utils/log";
import { WebSocket } from "ws";
import * as parser from 'engine.io-parser'
import { readFile } from "fs/promises";
import { SourceMapConsumer } from 'source-map';


async function readJsonFile(path: any) {
  const file = await readFile(path, "utf8");
  return JSON.parse(file);
}

// const wsUrl = 'ws://localhost:8787/bohr_push_log';
const wsUrl = (process.env.BOHR_REPO_OWNER == 'bohr-io' && process.env.BOHR_REPO_NAME == 'core' && process.env.BOHR_DG_NAME != 'main') ? 'wss://bohr.rocks/bohr_push_log' : 'wss://bohr.io/bohr_push_log';

let ws = new WebSocket(wsUrl);
let logsQueue: string[] = [];

ws.addEventListener("open", event => {
  // console.log('ws open');
  if (logsQueue.length > 0) {
    try {
      parser.encodePacket({
        type: "message",
        data: JSON.stringify(logsQueue),
        options: { compress: true }
      }, true, async (encoded: any) => {
        ws.send(encoded);
        logsQueue = [];
      });
    } catch (error) {
      throw error;
    }
  }
});

ws.addEventListener("message", async msg => {
  //dont use console log here
  //console.log('ws message');
  //console.log(msg.data);
});

ws.addEventListener("close", event => {
  // console.log('ws close');
  ws = new WebSocket(wsUrl);
});

ws.addEventListener("error", event => {
  console.log('ws error');
});

type LogMethod = "log" | "info" | "debug" | "error" | "warn" | "trace";

export function patchConsole(cnsle: Console) {
  patchMethod(cnsle, "log");
  patchMethod(cnsle, "info");
  patchMethod(cnsle, "debug");
  patchMethod(cnsle, "error");
  patchMethod(cnsle, "warn");
  patchMethod(cnsle, "trace");
}

export function unpatchConsole(cnsle: Console) {
  unpatchMethod(cnsle, "log");
  unpatchMethod(cnsle, "info");
  unpatchMethod(cnsle, "debug");
  unpatchMethod(cnsle, "error");
  unpatchMethod(cnsle, "warn");
  unpatchMethod(cnsle, "trace");
}

async function patchMethod(mod: Console, method: LogMethod) {
  if (mod[method].__wrapped !== undefined) return;
  shimmer.wrap(mod, method, (original) => {
    let isLogging = false;
    return async function emitWithContext(this: any, message?: any, ...optionalParams: any[]) {
      if (isLogging) {
        return original.apply(this as any, arguments as any);
      }
      isLogging = true;

      let prefix = "";
      const oldLogLevel = getLogLevel();
      setLogLevel(LogLevel.NONE);
      const LAMBDA_IDENTIFIER = '1';
      try {
        // prefix = `[trace_id=${LAMBDA_IDENTIFIER}]`;
        prefix = ``;
        if (arguments.length === 0) {
          arguments.length = 1;
          arguments[0] = prefix;
        } else {
          let logContent = arguments[0];
          if (typeof logContent !== "string") logContent = inspect(logContent);
          arguments[0] = `${prefix}${logContent}`;
        }
        const mainErrorStack = new Error().stack.split('\n')[2];
        let logArguments: any = await getArguments(arguments);
        let logLineNumber = await getLineNumber(arguments, mainErrorStack);

        logsQueue = [...logsQueue, {
          BOHR_REPO_OWNER: process.env.BOHR_REPO_OWNER,
          BOHR_REPO_NAME: process.env.BOHR_REPO_NAME,
          BOHR_DG_TYPE: process.env.BOHR_DG_TYPE,
          BOHR_DG_NAME: process.env.BOHR_DG_NAME,
          LOG_TYPE: 'wrapper',
          CONSOLE_TYPE: method,
          LINE_NUMBER: logLineNumber,
          TIMESTAMP: Date.now()
        }, logArguments];
        if (ws.readyState === WebSocket.OPEN) {
          try {
            parser.encodePacket({
              type: "message",
              data: JSON.stringify(logsQueue),
              options: { compress: true }
            }, true, async (encoded: any) => {
              ws.send(encoded);
              logsQueue = [];
            });
          } catch (error) {
            ws = new WebSocket(wsUrl);
          }
        }

      } catch (error) {
        // dont use console.log here
      }

      setLogLevel(oldLogLevel);
      isLogging = false;

      return original.apply(this as any, arguments as any);
    };
  });
}

async function getArguments(args: any) {
  let multipleArguments: any;
  if (args.length > 1) {
    multipleArguments = Object.values(args).join(', ');
  } else {
    multipleArguments = args[0];
  }
  return multipleArguments;
}

async function getLineNumber(args: any, mainErrorStack: any) {
  let logLineNumber = null;
  let newLogLineNumber = null;

  try {
    let messageError = await getErrorStack(args);
    if (!messageError) {
      messageError = mainErrorStack;
    }
    if (!messageError) {
      return '0';
    }
    try {
      newLogLineNumber = await getNewLogLine(messageError);
    } catch (error) {
      console.error(error);
    }
    logLineNumber = newLogLineNumber;
    if (!logLineNumber) {
      if (messageError.includes('api\\core\\')) {
        logLineNumber = messageError.split('api\\core\\')[1];
      } else if (messageError.includes('api/core/')) {
        logLineNumber = messageError.split('api/core/')[1];
      } else if (messageError.includes('var/task/')) {
        logLineNumber = messageError.split('var/task/')[1];
      } else if (messageError.includes('var\\task\\')) {
        logLineNumber = messageError.split('var\\task\\')[1];
      } else {
        logLineNumber = messageError;
      }
      if (logLineNumber) {
        logLineNumber = logLineNumber.substring(0, logLineNumber.lastIndexOf(":"));
      }
    } 
    return logLineNumber;
  } catch (error) {
    console.error(error);
    return '0';
  }
}

async function getNewLogLine(messageError: any) {
  try {
    let newLogLineNumber: any = null;
    let fullPath = null;
    let line: any = null;
    let column: any = null;
    if (!messageError) return null;
    fullPath = messageError.replace("at ", '').trim();
    if (fullPath.includes('(') && fullPath.includes(')')) {
      fullPath = fullPath.substring(fullPath.lastIndexOf("(") + 1, fullPath.length);
      fullPath = fullPath.substring(0, fullPath.lastIndexOf(")"));
    }
  
    column = fullPath.substring(fullPath.lastIndexOf(":") + 1, fullPath.length);
    fullPath = fullPath.substring(0, fullPath.lastIndexOf(":"));
    line = fullPath.substring(fullPath.lastIndexOf(":") + 1, fullPath.length);
    fullPath = fullPath.substring(0, fullPath.lastIndexOf(":"));
  
    let mapData = await readJsonFile(`${fullPath}.map`);
    await SourceMapConsumer.with(mapData, null, consumer => {
      let originalPositions = consumer.originalPositionFor({
        line: parseInt(line),
        column: parseInt(column),
      })
      newLogLineNumber = `${originalPositions.source.substring(originalPositions.source.lastIndexOf('..') + 3, originalPositions.source.length)}:${originalPositions.line}`;
    });
    return newLogLineNumber;
  } catch (error) {
    return null;
  }
}

async function getErrorStack(args: any) {
  try {
    let argsErrorStack = args[0].split('\n')
    let errorStack = argsErrorStack.find((errorLine: any) => {
      return errorLine.includes('api\\core\\') || errorLine.includes('api/core/');
    });
    if ((!errorStack || !args[0].includes('Error'))) {
      errorStack = new Error().stack.split('\n').find((errorLine: any) => {
        return errorLine.includes('api\\core\\') || errorLine.includes('api/core/');
      });
    }
    if (!errorStack) {
      errorStack = argsErrorStack.find((errorLine: any) => {
        return errorLine.includes('var\\task\\') || errorLine.includes('var/task/');
      });
    }
    if (!errorStack) {
      errorStack = new Error().stack.split('\n').find((errorLine: any) => {
        return errorLine.includes('var\\task\\') || errorLine.includes('var/task/');
      });
    }
    if (!errorStack) {
      return null;
    }
    return errorStack;
  } catch (error) {
    console.error(error);
  }
}

function unpatchMethod(mod: Console, method: LogMethod) {
  if (mod[method].__wrapped !== undefined) {
    shimmer.unwrap(mod, method);
  }
}