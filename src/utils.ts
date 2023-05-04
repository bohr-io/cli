// @ts-ignore
import * as esloader from "../utils/esloader.js";
// @ts-ignore
import * as remote from "../utils/git-remote-origin-url.js";
import * as CurrentGitBranch from "current-git-branch";
import * as cp from "child_process";
import * as chalk from "chalk";
import * as https from "https";
import axios from "axios";
const pjson = require("../package.json");
const fs = require('graceful-fs');

export const PROD_URL = "https://bohr.io";

export const cliFetch = async function (url: string, options: any = {}) {
  let response = null;
  if (typeof fetch === 'undefined') {
    const fetch = require("node-fetch");
    response = await fetch(url, options);
  }
  else {
    const dns = require('node:dns');
    dns.setDefaultResultOrder('ipv4first');

    response = await fetch(url, options);
  }
  return response;
}

const getApiByEnv = async function (env: string) {
  try {
    const response = await cliFetch(PROD_URL + "/api/api?env=" + env);

    const body = await response.json();
    if (body.found) {
      return "https://" + body.url;
    } else {
      return PROD_URL;
    }
  } catch (error) {
    return PROD_URL;
  }
};

export async function getMainEndpoint(DEV_MODE: boolean) {
  let ret = PROD_URL;
  if (DEV_MODE) {
    const waitPort = require("wait-port");
    let port_open = await waitPort({
      host: "localhost",
      port: 80,
      timeout: 100,
      output: "silent",
    });
    if (port_open.open == true) {
      ret = "http://localhost";
    } else {
      ret = await getApiByEnv(
        CurrentGitBranch({ altPath: require.main?.path }) as string
      );
    }
    loading("DEV_MODE", "Using API at: " + chalk.red(ret));
  } else {
    if (process.env.GITHUB_ACTIONS && process.env.GITHUB_REPOSITORY == "bohr-io/core") {
      ret = await getApiByEnv(process.env.GITHUB_REF_NAME as string);
      loading("CHANGE", "Using API at: " + chalk.red(ret));
    } else {
      if (pjson.bohrEnv != "main") {
        ret = await getApiByEnv(pjson.bohrEnv);
        loading("CHANGE", "Using API at: " + chalk.red(ret));
      }
    }
  }
  return ret;
}

export async function checkBohrAPIStatus(baseUrl: string) {
  try {
    const body: any = await axios.get(baseUrl + "/api/status", {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });
    return body.data.bohr_api;
  } catch (error) {
    return false;
  }
}

export async function getBohrAPI(baseUrl: string, secret: string) {
  if (!(await checkBohrAPIStatus(baseUrl))) {
    logError("ERROR", "API error, trying use production API...");
    baseUrl = PROD_URL + "/api";
  }
  return axios.create({
    baseURL: baseUrl,
    headers: {
      "Content-Type": "application/json",
      Cookie: "BohrSession=" + secret,
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
    }),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
}

export async function runInstall(
  command: string,
  showOutput: boolean,
  showError: boolean
) {
  if (process.env.GITHUB_ACTIONS) {
    // @ts-ignore
    console.log(
      "::group::" +
      chalk.inverse.bold["yellow"](` RUNNING `) +
      " " +
      chalk["yellow"](
        "Installing dependencies - " + chalk.red(process.env.INSTALL_CMD)
      ) +
      "\n"
    );
  } else {
    warn(
      "RUNNING",
      "Installing dependencies - " + chalk.red(process.env.INSTALL_CMD)
    );
  }
  try {
    await spawnAsync(command, showOutput, showError);
    if (process.env.GITHUB_ACTIONS) console.log("::endgroup::");
    info("SUCCESS", "Dependencies were successfully installed.");
  } catch (error: any) {
    if (process.env.GITHUB_ACTIONS) console.log("::endgroup::");
    console.log("\n\n");
    logError("ERROR", "An error occurred while installing dependencies.");
    console.log(error.stdout);
    console.log("\n\n");
    console.log(error.stderr);

    //@ts-ignore
    originalProcessExit(1);
  }
}

export function hideExperimentalWarning() {
  const originalEmit = process.emit;
  // @ts-expect-error
  process.emit = function (name, data: any, ...args) {
    if (
      name === `warning` &&
      typeof data === `object` &&
      data.name === `ExperimentalWarning` &&
      (data.message.includes(`stream/web is an experimental feature`) ||
        data.message.includes(`buffer.Blob is an experimental feature`))
    )
      return false;
    return originalEmit.apply(
      process,
      arguments as unknown as Parameters<typeof process.emit>
    );
  };
}

export async function getCurrentGit() {
  try {
    let origin = await remote.default();
    if (origin.startsWith("https://github.com/")) {
      origin = origin.replace("https://github.com/", "").replace(".git", "");
    } else if (origin.startsWith("git@github.com:")) {
      origin = origin.replace("git@github.com:", "").replace(".git", "");
    } else {
      return null;
    }
    const branchName = CurrentGitBranch();
    return {
      REPOSITORY: origin,
      REF_NAME: branchName,
    };
  } catch (e) {
    return null;
  }
}

export function isBohrPath() {
  try {
    const pjson = require(process.cwd() + "/package.json");
    return pjson.name == "bohr-core";
  } catch (error) {
    return false;
  }
}

export function getGlobalBohrPath() {
  const npmRootPath = execNpm("npm root -g", true);
  const globalBohrPath = execNpm("npm list bohr -g --json");
  //return npmRootPath.result.replace(/(\r\n|\n|\r)/gm, "") + '\\' + globalBohrPath.result.dependencies.bohr.resolved.replace('file:', '').replaceAll('/', '\\') + '\\..';
  return (
    globalBohrPath.result.dependencies.bohr.resolved
      .replace("file:", "")
      .replaceAll("/", "\\") + "\\.."
  );
}

export function execNpm(cmd: string, noParseJson: boolean = false) {
  let ret = null;
  try {
    const cp = require("child_process");
    ret = cp.execSync(cmd, { encoding: "utf8" });
    return {
      success: true,
      result: ret != "" && !noParseJson ? JSON.parse(ret) : ret,
    };
  } catch (e) {
    return { success: false, error: e, ret };
  }
}

type spawnAsyncResult = {
  stdout: string;
  stderr: string;
  code: number;
};

export function spawnAsync(
  command: string,
  showOutput: boolean,
  showError: boolean
) {
  return new Promise<spawnAsyncResult>(async (resolve, reject) => {
    const supportsColor = await esloader("supports-color");

    const child = cp.spawn(command, {
      shell: true,
      stdio: [
        "inherit",
        showOutput ? "inherit" : "pipe",
        showError ? "inherit" : "pipe",
      ],
      env: {
        ...process.env,
        FORCE_COLOR: supportsColor.stdout.level,
      },
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    if (child.stdout)
      child.stdout.on("data", (data: Buffer) => {
        stdout.push(data);
      });
    if (child.stderr)
      child.stderr.on("data", (data: Buffer) => {
        stderr.push(data);
      });

    child.on("error", function (error: Error) {
      reject({
        code: 1,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString() + "\n" + error,
      });
    });

    child.on("close", function (code: number, signal: string) {
      const result = {
        code,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
      };
      if (code == 0) {
        resolve(result);
      } else {
        reject(result);
      }
    });
  });
}

const print = (color: string, label: string, message: string) => {
  console.log(
    // @ts-ignore
    chalk.inverse.bold[color](` ${label} `),
    " ",
    // @ts-ignore
    chalk[color](message),
    "\n"
  );
};

export function info(label: string, message: string) {
  print("green", label, message);
}
export function warn(label: string, message: string) {
  print("yellow", label, message);
}
export function loading(label: string, message: string) {
  print("blue", label, message);
}
export function logError(label: string, message: string) {
  if (process.env.GITHUB_ACTIONS) {
    console.log("::error::" + message);
  } else {
    print("red", label, message);
  }
}
export function link(url: string) {
  return chalk.blue(url);
}

export function getFileExtension(path: string) {
  const last_path: any = path.indexOf("/") != -1 ? path.split("/").pop() : path;
  return last_path.indexOf(".") != -1
    ? last_path.split(".").pop().toUpperCase()
    : null;
}

export function base64ArrayBuffer(arrayBuffer: any) {
  var base64 = "";
  var encodings =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  var bytes = new Uint8Array(arrayBuffer);
  var byteLength = bytes.byteLength;
  var byteRemainder = byteLength % 3;
  var mainLength = byteLength - byteRemainder;

  var a, b, c, d;
  var chunk;

  // Main loop deals with bytes in chunks of 3
  for (var i = 0; i < mainLength; i = i + 3) {
    // Combine the three bytes into a single integer
    chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

    // Use bitmasks to extract 6-bit segments from the triplet
    a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
    b = (chunk & 258048) >> 12; // 258048   = (2^6 - 1) << 12
    c = (chunk & 4032) >> 6; // 4032     = (2^6 - 1) << 6
    d = chunk & 63; // 63       = 2^6 - 1

    // Convert the raw binary segments to the appropriate ASCII encoding
    base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
  }

  // Deal with the remaining bytes and padding
  if (byteRemainder == 1) {
    chunk = bytes[mainLength];

    a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2

    // Set the 4 least significant bits to zero
    b = (chunk & 3) << 4; // 3   = 2^2 - 1

    base64 += encodings[a] + encodings[b] + "==";
  } else if (byteRemainder == 2) {
    chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];

    a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
    b = (chunk & 1008) >> 4; // 1008  = (2^6 - 1) << 4

    // Set the 2 least significant bits to zero
    c = (chunk & 15) << 2; // 15    = 2^4 - 1

    base64 += encodings[a] + encodings[b] + encodings[c] + "=";
  }

  return base64;
}

export function b64ToBuf(base64: string) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = typeof Uint8Array === "undefined" ? [] : new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  var decode = function (base64: string) {
    let bufferLength = base64.length * 0.75,
      len = base64.length,
      i,
      p = 0,
      encoded1,
      encoded2,
      encoded3,
      encoded4;
    if (base64[base64.length - 1] === "=") {
      bufferLength--;
      if (base64[base64.length - 2] === "=") {
        bufferLength--;
      }
    }
    const arraybuffer = new ArrayBuffer(bufferLength),
      bytes = new Uint8Array(arraybuffer);
    for (i = 0; i < len; i += 4) {
      encoded1 = lookup[base64.charCodeAt(i)];
      encoded2 = lookup[base64.charCodeAt(i + 1)];
      encoded3 = lookup[base64.charCodeAt(i + 2)];
      encoded4 = lookup[base64.charCodeAt(i + 3)];
      bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
      bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
    return arraybuffer;
  };
  return decode(base64);
}

export function ab2str(buf: any) {
  return String.fromCharCode.apply(null, new Uint8Array(buf) as any);
}

export async function copyFolderRecursive(source: string, destination: string) {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    await fs.mkdir(destination, { recursive: true });
    const files = await fs.readdir(source);
    for (const file of files) {
      try {
        const currentPath = path.join(source, file);
        const destinationPath = path.join(destination, file);
        const fileStat = await fs.stat(currentPath);
        if (fileStat.isDirectory()) {
          await fs.mkdir(destinationPath, { recursive: true });
          await copyFolderRecursive(currentPath, destinationPath);
        } else {
          await fs.copyFile(currentPath, destinationPath);
        }
      } catch (error) {
        console.warn(error);
      }
    }
  } catch (error) {
    console.warn(error);
  }
}

export function createRunScript(destination: string) {
  const fs = require('fs');
  const content = "#!/bin/bash\n\n[ ! -d '/tmp/cache' ] && mkdir -p /tmp/cache\n\nexec node server.js\n";
  fs.writeFileSync(destination + '/run.sh', content);
}

export async function createZip(directoryPath: string, zipFilePath: string) {
  const fs = require('fs');
  const archiver = require('archiver');
  const output = fs.createWriteStream(zipFilePath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  const promise = new Promise(async (resolve, reject) => {
    output.on('close', function () {
      resolve(true);
    });
    archive.on('error', function (error: any) {
      reject(error);
    });
  });
  archive.pipe(output);
  archive.directory(directoryPath, false);
  archive.finalize();
  return Promise.resolve(promise);
}

export async function checkAndCreateNextConfigFile(path: string) {
  if (fs.existsSync('next.config.js')) {
    const contents = await fs.readFileSync(path + '/next.config.js', 'utf-8');

    if (!contents.includes('unoptimized')) {
      await fs.appendFileSync('next.config.js', "\nmodule.exports?.images?.unoptimized = true;");
    }
    else if (contents.includes('unoptimized: false') || contents.includes('unoptimized = false')) {
      await fs.appendFileSync('next.config.js', "\nmodule.exports?.images?.unoptimized = true;");
    }
  } else {
    if (fs.existsSync(path + '/package.json')) {
      const contents = await fs.readFileSync(path + '/package.json', 'utf-8');
      if (contents.includes('\"next\"')) {
        await fs.writeFileSync('next.config.js', 'module.exports = {\n\timages: {\n\t\tunoptimized: true\n\t}\n}');
      }
    }
  }
}
