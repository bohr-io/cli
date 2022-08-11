import * as http from 'http';
import * as portfinder from 'portfinder';
import { EventEmitter } from 'events';
import { Tunnel } from './tunnel';
import { b64ToBuf } from '../utils'

export interface MainServerOptions {
    tunnel: Tunnel,
    port?: number;
}

export class MainServer extends EventEmitter {
    public opts: MainServerOptions;
    public port?: number;
    public host?: string;

    constructor(opts: MainServerOptions) {
        super();
        this.opts = Object.assign(
            {
                port: 80,
            },
            opts
        );
    }

    public async run() {
        this.port = await portfinder.getPortPromise({ port: this.opts.port });
        this.host = 'localhost' + (this.port != 80 ? ':' + this.port : '');
        http.createServer(async (req, res) => {
            let a: any = new Date();
            const buffers = [];
            for await (const chunk of req) buffers.push(chunk);
            const ret = await this.opts.tunnel.sendRequest(req, Buffer.concat(buffers));
            delete ret.headers['connection'];
            delete ret.headers['content-encoding'];
            delete ret.headers['x-powered-by'];
            delete ret.headers['accept-ranges'];
            delete ret.headers['vary'];
            delete ret.headers['etag'];
            delete ret.headers['transfer-encoding'];
            res.writeHead(ret.status, ret.headers);
            res.end(new Uint8Array((ret.isBase64) ? b64ToBuf(ret.body) : ret.body));
        }).listen(this.port, 'localhost');
        this.emit("ready");
    }
}