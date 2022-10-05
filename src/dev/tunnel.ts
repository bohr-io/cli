// @ts-ignore
import * as esloader from '../../utils/esloader.js';
import * as WebSocket from 'ws';
import * as parser from 'engine.io-parser'
import * as portfinder from 'portfinder';
import * as chalk from 'chalk';
import * as https from 'https';
import { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import { getFileExtension, base64ArrayBuffer, b64ToBuf, ab2str, spawnAsync, warn, logError, isBohrPath, getGlobalBohrPath } from '../utils'
import { IncomingMessage } from 'http';
import { DevServer } from './devServer.js';
import { FunctionServer } from './functionServer.js';
const { v4: uuidv4 } = require('uuid');

export interface TunnelOptions {
    bohrApi: AxiosInstance,
    devMode: boolean,
    devServer: DevServer,
    functionServer: FunctionServer
}

const DEBUG = false;
let LOCALHOST = false;

export class Tunnel extends EventEmitter {
    opts: TunnelOptions;
    port?: number;
    currentWebSocket: any = null;
    requests: any[];
    textExtensions = ['HTML', 'CSS', 'JS', 'JSON', 'SHTM', 'XML'];
    key: any;
    address: any;
    ws: WebSocket;
    isRejoing = false;
    startTime = Date.now();
    rejoinInterval = 1000;
    pingTimeoutId: any;
    pingTimeout = 0;
    fetch: any;
    httpsAgent: any;

    constructor(opts: TunnelOptions) {
        super();
        this.opts = opts;
        //@ts-ignore
        this.ws = null;
        this.requests = [];
    }

    async init() {
        LOCALHOST = this.opts.bohrApi.defaults.baseURL == 'http://localhost/api';
        if (this.opts.devMode && LOCALHOST) await this.start();
        await this.join();
    }

    async start() {
        this.port = await portfinder.getPortPromise({ port: 8787 });
        let command = `cd ${getGlobalBohrPath()} ` + (isBohrPath() ? `&& node saveEnv.js ` : '') + `&& cd tunnel && npx --yes miniflare --watch --env ../.env --kv-persist ../.bohr/kv --port ${this.port}`;
        warn('RUNNING', 'Starting edge server - ' + chalk.red(command));
        spawnAsync(command, true, true).catch((error) => {
            console.log('\n\n');
            logError('ERROR', 'An error occurred while starting the edge server.');
            console.log(error.stdout);
            console.log('\n\n');
            console.log(error.stderr);
            //@ts-ignore
            originalProcessExit(1);
        });
        const waitPort = require('wait-port');
        await waitPort({ host: 'localhost', port: this.port, output: 'silent' });
    }

    async join() {

        if (this.opts.devMode && LOCALHOST) {
            this.address = "ws://localhost:" + this.port;
        } else {
            this.address = "wss://" + process.env.BOHR_TUNNEL_URL;
        }

        this.ws = new WebSocket(this.address);
        this.currentWebSocket = this.ws;
        this.startTime = Date.now();

        if (this.fetch == null) this.fetch = await esloader('node-fetch');
        if (this.httpsAgent == null) this.httpsAgent = new https.Agent({ rejectUnauthorized: false });

        this.bindEventListeners(this.ws);
    }

    async sendRequest(request: IncomingMessage, bodyBuf: ArrayBufferLike): Promise<any> {
        const ws = this.currentWebSocket;
        const url = new URL(request.url as string, 'https://' + process.env.BOHR_TUNNEL_URL);
        if (DEBUG) console.log('CLI - tunnel - sendRequest - ' + url.toString());
        const body = base64ArrayBuffer(bodyBuf);
        const requestId = uuidv4();
        const maxBodyLen = 990000;
        let result: any = null;
        if (body.length > maxBodyLen) {
            let chunksTotal = Math.ceil(body.length / maxBodyLen);
            for (let i = 0; i < body.length; i += maxBodyLen) {
                let req: any = {
                    type: "REQUEST",
                    requestId,
                    request: {
                        method: request.method,
                        url: url.toString(),
                        headers: JSON.stringify({ ...request.headers }),
                        body: body.slice(i, i + maxBodyLen),
                        chunksTotal: chunksTotal,
                        chunkIndex: i,
                        chunks: []
                    }
                }
                if (i == 0) {
                    result = new Promise((resolve, reject) => {
                        req.resolve = resolve;
                        req.reject = reject;
                    });
                }
                this.requests.push(req);
                this.sendMessage(ws, req);
            }
        } else {
            let req: any = {
                type: "REQUEST",
                requestId,
                request: {
                    method: request.method,
                    url: url.toString(),
                    headers: JSON.stringify({ ...request.headers }),
                    body: body,
                    chunksTotal: 1
                }
            }
            result = new Promise((resolve, reject) => {
                req.resolve = resolve;
                req.reject = reject;
            });
            this.requests.push(req);
            this.sendMessage(ws, req);
        }
        const response = await result as any;
        if (response.headers['bohr_tunnel_direct'] == '1') {
            if (response.isBase64) response.body = ab2str(b64ToBuf(response.body));
            const responseData = JSON.parse(response.body);
            for (let i = 0; i < responseData.length; i++) {
                const respInt: any = await this.processRequest(null as any, responseData[i]);
                if (respInt.status != 404) return respInt;
            }
            return { status: 404, headers: {}, body: null };
        } else {
            if (response.status == 500) {
                const body = (response.isBase64) ? ab2str(b64ToBuf(response.body)) : response.body as string;
                if ((body.includes('503 Service Temporarily Unavailable') || body.includes('Subrequest depth limit exceeded'))) {
                    await this.rejoin(ws);
                    return await this.sendRequest(request, bodyBuf);
                }
            }
            return response;
        }
    };

    async quit(ws: WebSocket) {
        await this.rejoin(ws);
    }

    async sendRaw(ws: WebSocket, message: any) {
        if (DEBUG) console.log('snd: ' + message);
        try {
            ws.send(message);
        } catch (err) {
            await this.quit(ws);
        }
    }

    sendMessage(ws: WebSocket, message: any) {
        if (DEBUG) {
            console.log('sendMessage');
            console.log(message);
        }
        parser.encodePacket({
            type: "message",
            data: JSON.stringify(message),
            options: { compress: true }
        }, true, async encoded => {
            await this.sendRaw(ws, encoded);
        });
    }

    async rejoin(ws: WebSocket) {
        if (ws != this.currentWebSocket) return;
        if (this.isRejoing) return;
        this.isRejoing = true;
        this.pingTimeout = 0;
        let timeSinceLastJoin = Date.now() - this.startTime;
        if (timeSinceLastJoin < this.rejoinInterval) {
            await new Promise(resolve => setTimeout(resolve, this.rejoinInterval - timeSinceLastJoin));
        }
        this.isRejoing = false;
        await this.join();
    }

    bindEventListeners(ws: WebSocket) {
        ws.addEventListener("open", event => {
        });

        ws.addEventListener("message", async msg => {
            try {
                await this.processRawMessage(ws, msg.data);
            } catch (err: any) {
                console.log(err);
                await this.quit(ws);
            }
        });

        ws.addEventListener("close", async event => {
            await this.quit(ws);
        });

        ws.addEventListener("error", async event => {
            await this.quit(ws);
        });
    }

    async processRawMessage(ws: WebSocket, data: WebSocket.Data) {
        const dataPacket = parser.decodePacket(data, "arraybuffer");

        if (dataPacket.type == 'open') {
            if (DEBUG) console.log('rcv: open');
            parser.encodePacket({ type: "open" }, true, async encoded => {
                await this.sendRaw(ws, encoded);
            });
            const tunnelData = {
                type: 'subscribe',
                message: {
                    localhostId: process.env.BOHR_LOCALHOST_ID,
                    secret: new (require('conf'))().get('token')
                }
            };

            await this.sendMessage(ws, tunnelData)

            for (let i = 0; i < this.requests.length; i++) {
                this.sendMessage(ws, this.requests[i]);
            }
            return;
        }

        if (dataPacket.type == 'ping') {
            if (DEBUG) console.log('rcv: ping');
            parser.encodePacket({ type: "pong" }, true, async encoded => {
                await this.sendRaw(ws, encoded);
            });
            clearTimeout(this.pingTimeoutId);
            if (this.pingTimeout != 0) {
                this.pingTimeoutId = setTimeout(async () => {
                    await this.quit(ws);
                }, this.pingTimeout);
            }
            return;
        }

        if (dataPacket.type == 'message') {
            this.processMessage(ws, dataPacket.data);
            return;
        }

        if (dataPacket.type == 'close') {
            if (DEBUG) console.log('rcv: close');
            await this.quit(ws);
            return;
        }

        if (DEBUG) console.log('Error, unknow ws packet type.');
    }

    async processMessage(ws: WebSocket, data: any) {
        data = JSON.parse(data);
        if (DEBUG) {
            console.log('processMessage');
            console.log(data);
        }
        if (data.type == "ERROR") {
            if ((data.evt) && (data.evt.code == 1002)) {
                console.log('ERROR: WebSocket message is too large');
            } else {
                console.log("ERROR:");
                console.log(data);
            }
            await this.quit(ws);
            return;
        }

        if (data.type == "SET_PING") {
            this.pingTimeout = data.timeout;
            return;
        }

        if (data.type == "REQUEST") {
            this.processRequest(ws, data);
            return;
        }

        if (data.type == "RESPONSE") {
            this.processResponse(data);
            return;
        }

        if (DEBUG) console.log('Error, unknow ws message type.');
    }

    async processRequest(ws: WebSocket, data: any) {
        if (DEBUG) console.log('CLI - tunnel - processRequest - ' + data.request.url);
        const url = new URL(data.request.url);
        url.protocol = (data.requestType == 'STATIC') ? this.opts.devServer.protocol || 'http' : 'http';
        url.host = ((data.requestType == 'STATIC') ? this.opts.devServer.host : this.opts.functionServer.host) as string;

        let fetchOptions: any = {
            method: data.request.method,
            headers: JSON.parse(data.request.headers),
            body: ['GET', 'HEAD'].indexOf(data.request.method) == -1 ? b64ToBuf(data.request.body) : null,
        };
        if (url.protocol == 'https:') fetchOptions.agent = this.httpsAgent;
        const response = await this.fetch(url.toString(), fetchOptions);

        let isBase64 = false;
        let body = null;
        const ext = getFileExtension(url.pathname);
        if (this.textExtensions[ext] == null) {
            body = await response.arrayBuffer();
            body = base64ArrayBuffer(body);
            isBase64 = true;
        } else {
            body = await response.text();
        }

        if (ws != null) {
            const maxBodyLen = 990000;
            if (body.length > maxBodyLen) {
                let chunksTotal = Math.ceil(body.length / maxBodyLen);
                for (let i = 0; i < body.length; i += maxBodyLen) {
                    this.sendMessage(ws, {
                        type: 'RESPONSE',
                        requestId: data.requestId,
                        status: response.status,
                        chunksTotal: chunksTotal,
                        chunkIndex: i,
                        body: body.slice(i, i + maxBodyLen),
                        headers: Object.fromEntries(response.headers),
                        isBase64
                    });
                }
            } else {
                this.sendMessage(ws, {
                    type: 'RESPONSE',
                    requestId: data.requestId,
                    status: response.status,
                    chunksTotal: 1,
                    body: body,
                    headers: Object.fromEntries(response.headers),
                    isBase64
                });
            }
        } else {
            return {
                status: response.status,
                body: body,
                headers: Object.fromEntries(response.headers),
                isBase64
            };
        }
    }

    processResponse(data: any) {
        const req = this.requests.find(member => member.requestId == data.requestId);
        if (req) {
            req.resolve(data);
            this.requests = this.requests.filter(member => member.requestId !== data.requestId);
        }
    }
}