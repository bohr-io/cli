import { EventEmitter } from 'events';
import { getCurrentGit, loading } from '../utils';
import Login from '../commands/login';
import { AxiosInstance } from 'axios';
const path = require('path');

export interface StartDevOptions {
    bohrApi: AxiosInstance,
    devMode: boolean
}

export class StartDev extends EventEmitter {
    public opts: StartDevOptions;
    private tryAutoLogin = false;

    constructor(opts: StartDevOptions) {
        super();
        this.opts = opts;
    }

    public async run(): Promise<any> {

        try {
            const git = await getCurrentGit();
            const defaultName = '/' + path.basename(process.cwd()).replace(/\s/g, '-');
            let REPOSITORY = process.env.BOHR_REPOSITORY || (git as any)?.REPOSITORY || defaultName;
            console.log('REPOSITORY=' + REPOSITORY);

            let REPO_OWNER = REPOSITORY.split('/')[0];
            let REPO_NAME = REPOSITORY.split('/')[1];
            let REF_TYPE = process.env.BOHR_REF_TYPE || "BRANCH";
            let REF_NAME = process.env.BOHR_REF_NAME || (git as any)?.REF_NAME || 'main';

            const res = await this.opts.bohrApi.post(`/dev/start`, {
                REPO_OWNER,
                REPO_NAME,
                REF_TYPE,
                REF_NAME
            });

            Object.keys(res.data.env).forEach(function (key) { process.env[key] = res.data.env[key]; });
        } catch (error: any) {
            if (error.message.indexOf('Request failed with status code 401') != -1) {
                if (!this.tryAutoLogin) {
                    this.tryAutoLogin = true;
                    loading('DEV_MODE', 'Calling auto login...');
                    await Login.run();
                    const config = new (require('conf'))();
                    Object.assign(this.opts.bohrApi.defaults.headers, { 'Cookie': 'BohrSession=' + config.get('token') });
                    return await this.run();
                } else {
                    console.error('Please, run "login" command first.');
                    //@ts-ignore
                    originalProcessExit(1);
                }
            }
            console.error(error);
            if (this.opts.devMode) {
                loading('DEV_MODE', 'Trying load bohr.env...');
                require('dotenv').config({ path: ".env" });
            } else {
                //@ts-ignore
                originalProcessExit(1);
            }
        }
    };
}
