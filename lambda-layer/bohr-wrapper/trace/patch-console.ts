import * as shimmer from "shimmer";
import { inspect } from "util";
import { getLogLevel, LogLevel, setLogLevel } from "../utils/log";
import { WebSocket } from "ws";
import * as parser from 'engine.io-parser'

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

function patchMethod(mod: Console, method: LogMethod) {
  if (mod[method].__wrapped !== undefined) return;
  shimmer.wrap(mod, method, (original) => {
    let isLogging = false;
    return function emitWithContext(this: any, message?: any, ...optionalParams: any[]) {
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

        let logArguments: any = getArguments(arguments);
        let logLineNumber = getLineNumber(arguments);

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

function getArguments(args: any) {
  let multipleArguments: any;
  if (args.length > 1) {
    multipleArguments = Object.values(args).join(', ');
  } else {
    multipleArguments = args[0];
  }
  return multipleArguments;
}

function getLineNumber(args: any) {
  let logLineNumber = null;

  try {
    let messageError = getErrorStack(args);
    if (messageError.includes('api\\core\\')) {
      logLineNumber = messageError.split('api\\core\\')[1];
    } else {
      logLineNumber = messageError.split('api/core/')[1];
    }
    if(logLineNumber){
      logLineNumber = logLineNumber.substring(0, logLineNumber.lastIndexOf(":"));
    }
    return logLineNumber;
  } catch (error) {
    console.log(error);
    return;
  }
}

function getErrorStack(args: any) {
  let argsErrorStack = args[0].split('\n')
  let errorStack = argsErrorStack.find((errorLine: any) => {
    return errorLine.includes('api\\core\\') || errorLine.includes('api/core/');
  });
  if ((!errorStack || !args[0].includes('Error'))) {
    errorStack = new Error().stack.split('\n').find((errorLine: any) => {
      return errorLine.includes('api\\core\\') || errorLine.includes('api/core/');
    });
  } 
  return errorStack;
}

function unpatchMethod(mod: Console, method: LogMethod) {
  if (mod[method].__wrapped !== undefined) {
    shimmer.unwrap(mod, method);
  }
}