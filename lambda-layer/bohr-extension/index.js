#!/usr/bin/env node
const { register, next } = require('./extensions-api');
const { subscribe } = require('./logs-api');
const http = require('http');
const https = require('https');
const request = require('sync-request');
const agent = new https.Agent({
    keepAlive: true,
    maxSockets: Infinity
});
const WebSocket = require('ws');
let ws = new WebSocket('wss://bohr.io/bohr_push_log');
let logsQueue = [];

ws.addEventListener("open", event => {
    console.log('ws open');
    if (logsQueue.length > 0) {
        try {
            ws.send(JSON.stringify(logsQueue));
            logsQueue = [];
        } catch (error) {
            throw error;
        }
    }
});

ws.addEventListener("message", async msg => {
    console.log('ws message');
    console.log(msg.data);
});

ws.addEventListener("close", event => {
    console.log('ws close');
    ws = new WebSocket('wss://bohr.io/bohr_push_log');
});

ws.addEventListener("error", event => {
    console.log('ws error');
});

const EventType = {
    INVOKE: 'INVOKE',
    SHUTDOWN: 'SHUTDOWN',
};

function handleShutdown(event) {
    console.log('shutdown', { event });
    process.exit(0);
}

function handleInvoke(event) {
    console.log('invoke');
}

const LOCAL_DEBUGGING_IP = "0.0.0.0";
const RECEIVER_NAME = "sandbox";

async function receiverAddress() {
    return (process.env.AWS_SAM_LOCAL === 'true')
        ? LOCAL_DEBUGGING_IP
        : RECEIVER_NAME;
}

const FUNCTION_NAME = process.env.AWS_LAMBDA_FUNCTION_NAME;

// Subscribe to platform logs and receive them on ${local_ip}:4243 via HTTP protocol.
const RECEIVER_PORT = 4243;
const TIMEOUT_MS = 25 // Maximum time (in milliseconds) that a batch is buffered.
const MAX_BYTES = 262144 // Maximum size in bytes that the logs are buffered in memory.
const MAX_ITEMS = 10000 // Maximum number of events that are buffered in memory.

const SUBSCRIPTION_BODY = {
    "destination": {
        "protocol": "HTTP",
        "URI": `http://${RECEIVER_NAME}:${RECEIVER_PORT}`,
    },
    "types": ["platform"],
    "buffering": {
        "timeoutMs": TIMEOUT_MS,
        "maxBytes": MAX_BYTES,
        "maxItems": MAX_ITEMS
    },
    "schemaVersion": "2021-03-18"
};

function uploadLogs(batch) {
    return new Promise((resolve, reject) => {
        //if (fetch == null) fetch = (await import('node-fetch')).default;
        try {

            /*
            const res = await fetch(`https://bohr.io/bohr_push_log`, {
                method: 'post',
                body: JSON.stringify(batch),
                headers: {
                    'Content-Type': 'application/json',
                    'Lambda-Function-Name': FUNCTION_NAME
                }
            });
            if (!res.ok) {
                console.error('push log failed', await res.text());
            }
            */

            /*
            const data = JSON.stringify(batch);
            const req = http.request({
                hostname: 'bohr.io',
                path: '/bohr_push_log',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length,
                },
            }, res => {
                console.log(`statusCode: ${res.statusCode}`);
                res.on('data', d => {
                    console.log('data');
                    console.log(d);
                    process.stdout.write(d);
                });
                res.on('end', () => {
                    console.log('end');
                });
            });
            req.on('error', error => {
                console.error(error);
            });
            req.write(data);
            req.end();
            */

            const data = JSON.stringify(batch);
            const req = https.request({
                hostname: 'bohr.io',
                port: 443,
                path: '/bohr_push_log',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length,
                },
                agent: agent
            }, res => {
                console.log(`statusCode: ${res.statusCode}`);
                var body = '';
                res.on('data', function (data) { body += data; });
                res.on('end', () => {
                    if (res.statusCode == 200) {
                        resolve(body);
                    } else {
                        reject(res);
                    }
                });
            });
            req.on('error', error => {
                reject(error);
            });
            req.write(data);
            req.end();
        } catch (error) {
            reject(error);
        }
    });
}

function uploadLogsSync(batch) {
    logsQueue = [...logsQueue, {lambda: FUNCTION_NAME }, ...batch];
    if (ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(logsQueue));
            logsQueue = [];
        } catch (error) {
            ws = new WebSocket('wss://bohr.io/bohr_push_log');
            throw error;
        }
    } else {
        console.log('ws not connected');
    }
    //var res = request('POST', 'http://bohr.io/bohr_push_log', { json: batch });
    //if (res.statusCode != 200) throw '500';
}

(async function main() {
    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    console.log('register');
    const extensionId = await register();
    console.log('extensionId', extensionId);

    console.log('starting listener');
    const server = http.createServer(function (request, response) {
        if (request.method == 'POST') {
            var body = '';
            request.on('data', function (data) { body += data; });
            request.on('end', async function () {
                console.log('Logs listener received: ' + body);

                let batch = null;
                try {
                    batch = JSON.parse(body);
                } catch (error) {
                    console.log("failed to parse logs");
                    console.error(error);
                    response.writeHead(500, {});
                    response.end("ERROR");
                    return;
                }

                if (batch != null && batch.length > 0) {
                    var time = new Date();
                    try {
                        //await uploadLogs(batch);
                        uploadLogsSync(batch);
                        console.log('success: ' + (new Date() - time));
                    } catch (error) {
                        console.log('error: ' + (new Date() - time));
                        console.error(error);
                        response.writeHead(500, {});
                        response.end("ERROR");
                        return;
                    }
                }

                response.writeHead(200, {});
                response.end("OK");
            });
        } else {
            response.writeHead(200, {});
            response.end("OK");
        }
    });
    server.listen(RECEIVER_PORT, await receiverAddress(), async () => {
        console.log('subscribing listener');
        await subscribe(extensionId, SUBSCRIPTION_BODY, server);
        while (true) {
            console.log('next');
            const event = await next(extensionId);
            switch (event.eventType) {
                case EventType.SHUTDOWN:
                    handleShutdown(event);
                    break;
                case EventType.INVOKE:
                    handleInvoke(event);
                    break;
                default:
                    throw new Error('unknown event: ' + event.eventType);
            }
        }
    });
})();