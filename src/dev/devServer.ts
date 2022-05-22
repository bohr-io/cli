import { EventEmitter } from 'events';
import * as portfinder from 'portfinder';
import * as http from 'http';
import * as fs from 'fs';
import * as chalk from 'chalk';
import { spawnAsync, warn, logError } from '../utils';

export interface DevServerOptions {
    command: string;
    publicPath: string;
    flags: any;
    port?: number;
}

export class DevServer extends EventEmitter {
    public opts: DevServerOptions;
    public port?: number;
    public host?: string;

    constructor(opts: DevServerOptions) {
        super();
        this.opts = Object.assign(
            {
                port: 8152,
            },
            opts
        );
    }

    private serveStaticFiles (port: number, host: string, path: string) {
        http.createServer(function (req, res) {
            fs.readFile(path as string + req.url as string, function (error, content) {
                if (error) {
                    if (error.code == 'ENOENT') {
                        res.writeHead(404);
                        res.end();
                    } else {
                        res.writeHead(500);
                        res.end(error.code);
                        res.end();
                    }
                } else {
                    res.writeHead(200);
                    res.end(content, 'utf-8');
                }
            });
        }).listen(port, host);
    };

    public async run() {
        this.port = await portfinder.getPortPromise({ port: this.opts.port });
        this.host = 'localhost' + (this.port != 80 ? ':' + this.port : '');

        if (this.opts.command == null || this.opts.flags['no-dev']) {
            this.serveStaticFiles(this.port, 'localhost', this.opts.publicPath);
        } else {
            this.opts.command = this.opts.command.replace('$PORT', this.port.toString());
            warn('RUNNING', 'Starting development server - ' + chalk.red(this.opts.command));
            spawnAsync(this.opts.command, this.opts.flags['show-dev'], true).catch((error) => {
                console.log('\n\n');
                logError('ERROR', 'An error occurred while starting the development server.');
                console.log(error.stdout);
                console.log('\n\n');
                console.log(error.stderr);
                process.exit(1);
            });
            const waitPort = require('wait-port');
            await waitPort({ host: 'localhost', port: this.port, output: 'silent' });
        }
    }
}