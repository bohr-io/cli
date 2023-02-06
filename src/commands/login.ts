import { Command } from '@oclif/core'
import stream = require('stream');
import * as http from 'http';
import * as portfinder from 'portfinder';
import { info, getMainEndpoint, getBohrAPI, logError, checkBohrAPIStatus, PROD_URL } from '../utils';
const pjson = require('../../package.json');

export default class Login extends Command {
    static description = 'Login in your bohr.io account'
    async run(): Promise<void> {
        this.log('');

        let DEV_MODE = (!pjson.bohrEnv);

        let MAIN_ENDPOINT = await getMainEndpoint(DEV_MODE);

        if (!await checkBohrAPIStatus(MAIN_ENDPOINT + '/api')) {
            logError('ERROR', 'API error, trying use production API...');
            MAIN_ENDPOINT = PROD_URL;
        }

        const TEMP_PORT = await portfinder.getPortPromise({ port: 8796 });
        const login_url = MAIN_ENDPOINT + '/login-cli?port=' + TEMP_PORT;

        const ora = require('ora');
        const spinner = ora('Please, access the URL: ' + login_url);

        await new Promise<void>((resolve, reject) => {
            const sockets = new Set<stream.Duplex>();
            const server = http.createServer((request, response) => {
                const url = require('url');
                const query = url.parse(request.url, true).query;
                const Conf = require('conf');
                const config = new Conf();
                config.set('token', query.token);
                response.writeHead(302, { 'Location': MAIN_ENDPOINT + '/home' });
                response.end();
                for (const socket of sockets) {
                    socket.destroy();
                    sockets.delete(socket);
                }
                server.close(() => {
                    spinner.succeed();
                    this.log('');
                    info('DONE', 'Login successful!');
                    resolve();
                });
            });
            server.on('connection', (socket: stream.Duplex) => {
                sockets.add(socket);
                server.once('close', () => {
                    sockets.delete(socket);
                });
            });
            server.listen(TEMP_PORT);
            spinner.start();
            require('open')(login_url);
        });

    }
}
