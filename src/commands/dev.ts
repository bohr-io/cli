import { Command, Flags } from '@oclif/core'
import { DevServer } from '../dev/devServer'
import { FunctionServer } from '../dev/functionServer'
import { MainServer } from '../dev/mainServer'
import { Tunnel } from '../dev/tunnel';
import { StartDev } from '../dev/start';
import { info, link, getMainEndpoint, runInstall, getBohrAPI } from '../utils';
const pjson = require('../../package.json');

export default class Dev extends Command {
    static description = 'Run localhost environment';

    static flags = {
        'no-install': Flags.boolean({ default: false, description: 'bypass install command' }),
        'no-dev': Flags.boolean({ default: false, description: 'bypass dev command' }),
        'show-install': Flags.boolean({ default: false, description: 'show install command output' }),
        'show-dev': Flags.boolean({ default: false, description: 'show dev command output' })
    };

    async run(): Promise<void> {

        this.log('');

        var originalConsoleError = console.error;
        const originalExit = process.exit;
        //@ts-ignore
        global.originalProcessExit = process.exit;

        //@ts-ignore
        process.exit = function processEmit(...args) {
            return;
        };
        console.error = function (...args) {
            try {
                if (args[0].indexOf('Error: timed out') != -1) return;
            } catch (error) {
            }
            return originalConsoleError.apply(this, args);
        };

        const { flags } = await this.parse(Dev);
        const DEV_MODE = (!pjson.bohrEnv);
        if (DEV_MODE) {
            flags['show-install'] = true;
            flags['show-dev'] = true;
        }

        let bohrApi = await getBohrAPI(await getMainEndpoint(DEV_MODE) + '/api', new (require('conf'))().get('token'));

        await (new StartDev({
            bohrApi,
            devMode: DEV_MODE
        })).run();

        if (process.env.INSTALL_CMD && !flags['no-install']) {
            await runInstall(process.env.INSTALL_CMD as string, flags['show-install'], true);
        }

        const devServer = new DevServer({
            command: process.env.DEV_CMD as string,
            publicPath: process.env.PUBLIC_PATH as string,
            flags
        });

        const functionServer = new FunctionServer();

        const tunnel = new Tunnel({
            bohrApi,
            devMode: DEV_MODE,
            devServer,
            functionServer
        });

        const mainServer = new MainServer({ tunnel });
        mainServer.on('ready', () => {
            this.log('\n');
            info('READY', 'Server running on ' + link('http://' + mainServer.host as string));
            info('READY', 'Tunnel running on ' + link('https://' + process.env.BOHR_TUNNEL_URL));
            info('READY', 'API running on ' + link('http://' + mainServer.host + '/api'));
            try {
                if(process.env.BOHR_LOCALHOST_ID){
                    bohrApi.put(`/dev/localhost`, {id: process.env.BOHR_LOCALHOST_ID, status: "RUNNING"});
                } else {
                    console.error("Unable to update localhost Status - missing localHostId.");
                }                
            } catch (error) {
                console.error(error);
            }
            if (!DEV_MODE) require('open')('http://' + mainServer.host);
        });

        await devServer.run();
        await functionServer.run();
        await tunnel.init();
        await mainServer.run();

        
        process.on('SIGINT', async function () {
            try {
                if(process.env.BOHR_LOCALHOST_ID){
                    await bohrApi.put(`/dev/localhost`, {id: process.env.BOHR_LOCALHOST_ID, status: "CLOSED"});
                } else {
                    console.error("Unable to update localhost Status - missing localHostId.");
                }
            } catch (error) {
                console.error(error);
            }            
            
            originalExit(0);
        });
    }
}