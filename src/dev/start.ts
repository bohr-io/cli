import { EventEmitter } from 'events';
import { getCurrentGit, loading } from '../utils';
import Login from '../commands/login';
import { AxiosInstance } from 'axios';

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
            if (git == null) {
                console.error('Git repository not found.');
            }
            let REPOSITORY = (git as any).REPOSITORY;

            let REPO_OWNER = REPOSITORY.split('/')[0];
            let REPO_NAME = REPOSITORY.split('/')[1];
            let REF_TYPE = "BRANCH";
            let REF_NAME = (git as any).REF_NAME;

            const res = await this.opts.bohrApi.post(`/dev/start`, {
                REPO_OWNER,
                REPO_NAME,
                REF_TYPE,
                REF_NAME
            });

            Object.keys(res.data.env).forEach(function (key) { process.env[key] = res.data.env[key]; });
        } catch (error: any) {
            if (error.response) {
                if (error.response.status == 401) {
                    if (this.opts.devMode) {
                        if (!this.tryAutoLogin) {
                            this.tryAutoLogin = true;
                            loading('DEV_MODE', 'Calling auto login...');
                            await Login.run();
                            const config = new (require('conf'))();
                            Object.assign(this.opts.bohrApi.defaults.headers, { 'Cookie': 'BohrSession=' + config.get('token') });
                            return await this.run();
                        }
                    }
                    console.error('Please, run "login" command first.');
                }
            }
            console.error(error);
            process.exit(1);
        }
    };
}