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
    public protocol?: string;

    constructor(opts: DevServerOptions) {
        super();
        this.opts = Object.assign(
            {
                port: 8152,
            },
            opts
        );
    }

    private getMimeType(ext: string) {
        const mime: any = { "HTML": 'text/html, charset=utf-8', "SHTM": 'text/html, charset=utf-8', "CSS": 'text/css', "XML": 'text/xml', "GIF": 'image/gif', "JPG": 'image/jpeg', "JPEG": 'image/jpeg', "JS": 'application/x-javascript', "PNG": 'image/png', "TIF": 'image/tiff', "TIFF": 'image/tiff', "ICO": 'image/x-icon', "SVG": 'image/svg+xml', "JSON": 'application/json', "MP4": 'video/mp4', "MOV": 'video/quicktime', "M4V": 'video/x-m4v', "3GP": 'video/3gpp', "WOFF2": 'font/woff2', "WOFF": 'font/woff', "TTF": 'font/ttf' };
        return mime[ext] != null ? mime[ext] : "text/html, charset=utf-8";
    }

    private getFileExtension(path: string) {
        const last_path: any = (path.indexOf('/') != -1) ? path.split('/').pop() : path;
        return (last_path.indexOf('.') != -1) ? last_path.split('.').pop().toUpperCase() : null;
    }

    private serveStaticFiles(port: number, host: string, path: string) {
        http.createServer((req, res) => {
            let filePath = req.url?.endsWith('/') ? req.url + 'index.html' : req.url;
            fs.readFile(path as string + filePath as string, (error, content) => {
                if (error) {
                    if (error.code == 'ENOENT') {
                        res.writeHead(404);
                        res.end();
                    } else {
                        res.writeHead(500);
                        res.end(error.code);
                    }
                } else {
                    res.writeHead(200, { "Content-Type": this.getMimeType(this.getFileExtension(filePath as string)) });
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
            this.protocol = 'http';
        } else {
            this.opts.command = this.opts.command.replace('$PORT', this.port.toString());
            warn('RUNNING', 'Starting development server - ' + chalk.red(this.opts.command));
            spawnAsync(this.opts.command, this.opts.flags['show-dev'], true).catch((error) => {
                console.log('\n\n');
                logError('ERROR', 'An error occurred while starting the development server.');
                console.log(error.stdout);
                console.log('\n\n');
                console.log(error.stderr);
                //@ts-ignore
                originalProcessExit(1);
            });
            const waitPort = require('wait-port');
            await waitPort({ host: 'localhost', port: this.port, output: 'silent' });
            this.protocol = 'http'; //TO DO: get from dev server opened
        }
    }
}