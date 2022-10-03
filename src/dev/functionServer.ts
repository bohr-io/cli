import * as express from 'express';
import * as fs from 'fs';
import * as chokidar from 'chokidar';
import * as path from 'path';
import * as portfinder from 'portfinder';
import * as utils from '../utils';
import { createFunction } from '@vercel/fun';
import { EventEmitter } from 'events';

export interface FunctionServerOptions {
    port?: number;
}

export class FunctionServer extends EventEmitter {
    public opts: FunctionServerOptions;
    public port?: number;
    public host?: string;

    constructor(opts: FunctionServerOptions = {}) {
        super();
        this.opts = Object.assign(
            {
                port: 8000,
            },
            opts
        );
    }

    public async run() {
        if (!fs.existsSync('./api/core')) return;

        this.port = await portfinder.getPortPromise({ port: this.opts.port });
        this.host = 'localhost' + (this.port != 80 ? ':' + this.port : '');

        let fn: any = null;
        //const globalBohrPath = utils.execNpm('npm list bohr -g --json');
        //const globalBohrPathResolved = globalBohrPath.result.dependencies.bohr.resolved.replace('file:', '').replaceAll('/', '\\').replace('\\cli', '');
        /*
        TO DO: tratar
            success: false,
            error: Error: Command failed: npm list bohr -g --json
        */
        const PROJECT_PATH = `${process.cwd()}\\api\\core\\index.js`;
        const createFunctionHandler = async function () {
            fn = await createFunction({
                Code: {
                    //Directory: globalBohrPathResolved + '/cli/lambda-layer/bohr-wrapper'
                    Directory: './api/core'
                },
                Handler: 'index.handler',
                Runtime: 'nodejs14.x',
                Environment: {
                    Variables: {
                        DEV_MODE: true,
                        PROJECT_PATH: PROJECT_PATH,
                        ...process.env
                    }
                },
                MemorySize: 256
            });
        };
        await createFunctionHandler();

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

        app.get('/favicon.ico', function onRequest(req, res) { res.status(204).end(); });

        app.all('*', async (request, response) => {
            try {
                let requestPath = request.path;

                const queryParams = Object.entries(request.query).reduce(
                    (prev, [key, value]) => ({ ...prev, [key]: Array.isArray(value) ? value : [value] }),
                    {},
                );

                let remoteAddress: any = request.get('x-forwarded-for') || request.socket.remoteAddress || ''
                remoteAddress = remoteAddress.split(remoteAddress.includes('.') ? ':' : ',').pop().trim();

                const headers = Object.entries({ ...request.headers, 'client-ip': [remoteAddress] }).reduce(
                    (prev, [key, value]) => ({ ...prev, [key]: Array.isArray(value) ? value : [value] }),
                    {},
                );

                const isBase64Encoded = !request.headers['content-type'];
                const body = request.get('content-length') ? request.body.toString(isBase64Encoded ? 'base64' : 'utf8') : undefined;

                const rawQuery = new URLSearchParams(request.query as any).toString();
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
                } else {
                    response.statusCode = lambdaResponse.statusCode;
                    addHeaders(lambdaResponse.headers, response);
                    addHeaders(lambdaResponse.multiValueHeaders, response);
                    if (lambdaResponse.body) {
                        response.write(lambdaResponse.isBase64Encoded ? Buffer.from(lambdaResponse.body, 'base64') : lambdaResponse.body);
                    }
                }
                response.end();
            } catch (error) {
                console.log(error);
                response.statusCode = 500;
                response.end();
            }
        });

        app.listen(this.port as number, 'localhost', () => {
            this.emit("ready");
        });

        //API Watch
        const debounce = require('lodash/debounce');
        let chokidar_api = chokidar.watch('./api', { ignoreInitial: true });
        chokidar_api.on('ready', () => {
            const debouncedWatch = debounce(async () => {
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
    }
}