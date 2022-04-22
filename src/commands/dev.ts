import { Command, Flags } from '@oclif/core'

export default class Dev extends Command {
    static description = 'Run localhost environment'

    static flags = {}

    static args = []

    async run(): Promise<void> {
        const { args, flags } = await this.parse(Dev)

        console.log('bohr.io dev starting...');

        const { Miniflare } = require("miniflare");
        const open = require('open');
        const http = require('http');
        const https = require('https');
        const chokidar = require('chokidar');
        const axios = require('axios');
        const { createFunction } = require('@vercel/fun');
        const path = require("path");
        const fs = require('fs');
        const spawn = require('cross-spawn');
        const waitPort = require('wait-port');
        const getPort = await import('get-port');

        require('dotenv').config({ path: "bohr.env" });

        let DEV_MODE = process.env.DEV_MODE == "1";
        DEV_MODE = false;
        let BOHR_SECRET = process.env.BOHR_TOKEN;

        let REPO_OWNER = null;
        let REPO_NAME = null;
        let REF_TYPE = 1;
        let REF_NAME = null;

        //API endpoint
        const CLI_VERSION = process.env.CLI_VERSION;
        let API_ROUTE = DEV_MODE ? "https://localhost/api" : "https://bohr.io/api";
        if (CLI_VERSION != null) {
            if (CLI_VERSION.split('@')[2] == 'dev') {
                API_ROUTE = "https://bohr.rocks/api";
            }
        }

        const bohrApi = axios.create({
            baseURL: `${API_ROUTE}`,
            headers: {
                'Content-Type': 'application/json',
                'Cookie': 'BohrSession=' + BOHR_SECRET
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            }),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        const getCurrentGit = async function () {
            try {
                /*
                var Git = require("nodegit");
                let repo = await Git.Repository.open("./");
                let currentBranch = await repo.getCurrentBranch();
                let currentBranchName = currentBranch.shorthand();
                let remotes = await repo.getRemotes();
                return {
                    REPOSITORY: remotes[0].url().replace('https://github.com/', '').replace('.git', ''),
                    REF_NAME: currentBranchName
                };
                */
                return {
                    REPOSITORY: 'bohr-io/core',
                    REF_NAME: 'dev'
                };
            } catch (e) {
                console.log(e);
                return null;
            }
        };

        const startDev = async function () {
            try {
                const git = await getCurrentGit();
                if (git == null) {
                    console.error('Git repository not found.');
                    process.exit(1);
                }
                let REPOSITORY = git.REPOSITORY;
                REF_NAME = git.REF_NAME;
                REPO_OWNER = REPOSITORY.split('/')[0];
                REPO_NAME = REPOSITORY.split('/')[1];

                const res = await bohrApi.post(`/dev/start`, {
                    BOHR_TOKEN: process.env.BOHR_TOKEN,
                    REPO_OWNER,
                    REPO_NAME,
                    REF_TYPE,
                    REF_NAME
                });
                process.env = { ...process.env, ...res.data.env };
            } catch (error) {
                console.error(error);
                process.exit(1);
            }
        };
        await startDev();

        const PORT_STATIC = await getPort.default({ host: '127.0.0.1', port: 8152 });
        const PORT_API = await getPort.default({ host: '127.0.0.1', port: 8000 });
        const PORT_MAIN = await getPort.default({ host: '127.0.0.1', port: 443 });

        let PUBLIC_PATH = process.env.PUBLIC_PATH;
        let DEV_CMD = process.env.DEV_CMD;

        function spawnCommand(command: any, options: any) {
            const opts = { ...options, prettyCommand: command };
            if (process.platform === 'win32') {
                return spawn('cmd.exe', ['/C', command], opts);
            }
            return spawn('sh', ['-c', command], opts);
        }

        //Static Files
        if (DEV_CMD == null) {
            http.createServer(function (request: any, response: any) {
                fs.readFile(PUBLIC_PATH + request.url, function (error: any, content: any) {
                    if (error) {
                        if (error.code == 'ENOENT') {
                            response.writeHead(404);
                            response.end();
                        } else {
                            response.writeHead(500);
                            response.end(error.code);
                            response.end();
                        }
                    } else {
                        response.writeHead(200);
                        response.end(content, 'utf-8');
                    }
                });
            }).listen(PORT_STATIC);
        } else {
            spawnCommand(DEV_CMD.replace('$PORT', PORT_STATIC.toString()), { stdio: 'inherit' });
        }

        waitPort({
            host: 'localhost',
            port: PORT_STATIC,
        }).then((port_open: any) => {
            if (port_open) {
                //Miniflare
                (async () => {
                    const mf = new Miniflare({
                        scriptPath: "worker/index.js",
                        watch: true,
                        kvPersist: "./.bohr/kv",
                        kvNamespaces: ["___BOHR_SITES", "___BOHR_ASSETS", "___BOHR_SESSION"],
                        https: "./.bohr/cert",
                        globals: {
                            LOCAL_DEV: true,
                            PORT_STATIC: PORT_STATIC,
                            PORT_API: PORT_API
                        }
                    });
                    (await mf.createServer(true)).listen(PORT_MAIN, '127.0.0.1', () => {
                        console.log("Worker server started!");
                        console.log('https://localhost' + (PORT_MAIN.toString() != '443' ? ':' + PORT_MAIN : ''));
                        //open('https://localhost' + (PORT_MAIN != '443' ? ':' + PORT_MAIN : ''));
                    });
                })();
            } else {
                console.log('The port did not open before the timeout...');
            }
        }).catch((err: any) => {
            console.error(`An unknown error occured while waiting for the port: ${err}`);
        });

        //API
        const RunFunctionServer = async function () {
            let fn: any = null;
            const createFunctionHandler = async function () {
                fn = await createFunction({
                    Code: {
                        Directory: './api/core'
                    },
                    Handler: 'index.handler',
                    Runtime: 'nodejs14.x',
                    Environment: {
                        Variables: {
                            LOCAL_DEV: true,
                            ...process.env
                        }
                    },
                    MemorySize: 256
                });
            };
            await createFunctionHandler();

            const express = require('express');
            const expressLogging = require('express-logging');
            const app = express();

            app.set('query parser', 'simple');

            const sizeLimit = '6mb';
            app.use(
                express.text({
                    limit: sizeLimit,
                    type: ['text/*', 'application/json']
                })
            );
            app.use(express.raw({ limit: sizeLimit, type: '*/*' }));
            app.use(expressLogging(console, { blacklist: ['/favicon.ico'] }));

            app.get('/favicon.ico', function onRequest(req: any, res: any) { res.status(204).end(); });

            app.all('*', async function (request: any, response: any) {
                let requestPath = request.path;

                const queryParams = Object.entries(request.query).reduce(
                    (prev, [key, value]) => ({ ...prev, [key]: Array.isArray(value) ? value : [value] }),
                    {},
                );

                let remoteAddress = request.get('x-forwarded-for') || request.socket.remoteAddress || ''
                remoteAddress = remoteAddress.split(remoteAddress.includes('.') ? ':' : ',').pop().trim();

                const headers = Object.entries({ ...request.headers, 'client-ip': [remoteAddress] }).reduce(
                    (prev, [key, value]) => ({ ...prev, [key]: Array.isArray(value) ? value : [value] }),
                    {},
                );

                const isBase64Encoded = !request.headers['content-type'];
                const body = request.get('content-length') ? request.body.toString(isBase64Encoded ? 'base64' : 'utf8') : undefined;

                const rawQuery = new URLSearchParams(request.query).toString();
                const url = new URL(requestPath, `${request.protocol}://${request.get('host') || 'localhost'}`);
                url.search = rawQuery;
                const rawUrl = url.toString();

                const event = {
                    path: requestPath,
                    httpMethod: request.method,
                    queryStringParameters: Object.entries(queryParams).reduce(
                        (prev, [key, value]) => ({ ...prev, [key]: Array(value).join(', ') }),
                        {},
                    ),
                    multiValueQueryStringParameters: queryParams,
                    headers: Object.entries(headers).reduce((prev, [key, value]) => ({ ...prev, [key]: Array(value).join(', ') }), {}),
                    multiValueHeaders: headers,
                    body,
                    isBase64Encoded,
                    rawUrl,
                    rawQuery
                };

                const lambdaResponse = await fn(event);

                const { error } = validateLambdaResponse(lambdaResponse);
                if (error) {
                    console.log(error);
                    response.statusCode = 500;
                    response.text(error);
                } else {
                    response.statusCode = lambdaResponse.statusCode;
                    addHeaders(lambdaResponse.headers, response);
                    addHeaders(lambdaResponse.multiValueHeaders, response);
                    if (lambdaResponse.body) {
                        response.write(lambdaResponse.isBase64Encoded ? Buffer.from(lambdaResponse.body, 'base64') : lambdaResponse.body);
                    }
                    response.end();
                }

            });

            app.listen(PORT_API, (err: any) => {
                if (err) {
                    console.log('Error');
                    console.log(err);
                } else {
                    console.log('Function server Started.');
                }
            });

            //API Watch
            const debounce = require('lodash/debounce');
            let chokidar_api = chokidar.watch('./api', { ignoreInitial: true });
            chokidar_api.on('ready', function () {
                const debouncedWatch = debounce(async function () {
                    console.log('Reloading function...');
                    if (fn != null) {
                        await fn.destroy();
                        await createFunctionHandler();
                    }
                }, 100);
                chokidar_api.on('all', (_event: any, path_watch: any) => {
                    delete require.cache[path.resolve(path_watch)];
                    debouncedWatch();
                });
            });

            const addHeaders = (headers: any, response: any) => {
                if (!headers) return;
                Object.entries(headers).forEach(([key, value]) => {
                    response.setHeader(key, value);
                });
            };
            const validateLambdaResponse = (lambdaResponse: any) => {
                if (lambdaResponse === undefined) return { error: 'lambda response was undefined. check your function code again' };
                if (!Number(lambdaResponse.statusCode)) return { error: `Your function response must have a numerical statusCode. You gave: $ ${lambdaResponse.statusCode}` };
                if (lambdaResponse.body && typeof lambdaResponse.body !== 'string') return { error: `Your function response must have a string body. You gave: ${lambdaResponse.body}` };
                return {};
            };
        };
        await RunFunctionServer();
    }
}