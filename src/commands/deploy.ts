import { Command, Flags } from '@oclif/core'

export default class Deploy extends Command {
    static description = 'Deploy a site'

    static flags = {}

    static args = []

    async run(): Promise<void> {
        const { args, flags } = await this.parse(Deploy)

        console.log('bohr.io deploy started...');
        /*
        const axios = require('axios');
        const fs = require('graceful-fs');
        const path = require('path');
        const https = require('https');
        const crypto = require('crypto');

        require('dotenv').config({ path: "bohr.env" });

        //Required env
        let DEPLOY_PATH = process.env.DEPLOY_PATH != null ? process.env.DEPLOY_PATH : './';
        let PUBLIC_PATH = process.env.PUBLIC_PATH != null ? process.env.PUBLIC_PATH : DEPLOY_PATH;
        let DEV_MODE = process.env.DEV_MODE == "1";
        let BOHR_SECRET = process.env.BOHR_TOKEN;

        let REPO_OWNER: any = null;
        let REPO_NAME: any = null;
        let REF_TYPE = 1;
        let REF_NAME: any = null;

        //Optional env
        let STACK = process.env.STACK;
        let BASIC_CREDENTIALS = process.env.BASIC_CREDENTIALS;

        //API endpoint
        const CLI_VERSION = process.env.CLI_VERSION;
        let API_ROUTE = DEV_MODE ? "https://localhost/api" : "https://bohr.io/api";
        if (CLI_VERSION != null) {
            if (CLI_VERSION.split('@')[2] == 'dev') {
                API_ROUTE = "https://bohr.rocks/api";
            }
        }

        //Global vars
        const PUBLIC_PATH_FULL = path.resolve(PUBLIC_PATH);
        let allHashs: any = null;
        let allHashsManifest: any = null;
        let lambda_hash = '';
        let missingFiles: any = [];

        //Store hashes via api
        const hashes_on_api = true;

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

        const hashFile = filePath => new Promise(resolve => {
            const hash = crypto.createHash('sha256');
            fs.createReadStream(filePath).on('data', data => hash.update(data)).on('end', () => resolve({ file: filePath.replace(PUBLIC_PATH_FULL, '').replace(/\\/g, '/'), hash: hash.digest('hex') }));
        });

        const walk = function (dir: any, done: any) {
            var results: any[] = [];
            fs.readdir(dir, function (err: any, list: any) {
                if (err) return done(err);
                var pending = list.length;
                if (!pending) return done(null, results);
                list.forEach(function (file: any) {
                    file = path.resolve(dir, file);
                    fs.stat(file, function (err: any, stat: any) {
                        if (stat && stat.isDirectory()) {
                            walk(file, function (err: any, res: any) {
                                results = results.concat(res);
                                if (!--pending) done(null, results);
                            });
                        } else {
                            const file_filter = file.replace(PUBLIC_PATH_FULL, '').toLowerCase().replace(/\\/g, '/');
                            if (
                                (!file_filter.includes('/.git/')) &&
                                (!file_filter.includes('/.github/')) &&
                                (!file_filter.includes('/.worker/')) &&
                                (!file_filter.includes('/node_modules/')) &&
                                (!file_filter.startsWith('/api/')) &&
                                (!file_filter.startsWith('/dist-api/')) &&
                                (!file_filter.endsWith('.env')) &&
                                (!file_filter.endsWith('/package.json')) &&
                                (!file_filter.endsWith('/package-lock.json')) &&
                                (!file_filter.endsWith('/.gitignore'))) {
                                if (stat.size < 24 * 1024 * 1024) {
                                    results.push(file);
                                } else {
                                    console.log('Ignoring file "' + file.replace(PUBLIC_PATH_FULL, '') + '" - too big');
                                }
                            }
                            if (!--pending) done(null, results);
                        }
                    });
                });
            });
        };

        const hashDir = filePath => new Promise(resolve => {
            console.log('Finding files and hash it...');
            let hashs: any[] = [];
            walk(filePath, function (err: any, results: any) {
                if (err) throw err;
                if (results.length == 0) resolve(hashs);
                for (let i = 0; i < results.length; i++) {
                    hashFile(results[i]).then(hash => {
                        hashs.push(hash);
                        if (hashs.length == results.length) resolve(hashs);
                    });
                }
            });
        });

        const kvBulk = function (data: any, data_hash: any, cb: any) {
            bohrApi.put(`/cloudflare/kvBulk`, data, {
            }).then(res => {
                if (res.data.success) {
                    if (hashes_on_api) {
                        bohrApi.post(`/add_objects`, data_hash, {
                        }).then(ret => {
                            if (ret.error) {
                                console.log(ret.error);
                            } else {
                                console.log('Hashes saved with success.');
                            }
                            cb();
                        })
                    } else {
                        cb();
                    }
                } else {
                    console.log('Upload file error.');
                    console.log(res.data);
                    process.exit(1);
                }
            }).catch(error => {
                console.error(error);
                process.exit(1);
            });
        };

        const uploadFiles = function (cb: any) {
            console.log('Uploading files...');
            let data = [];
            let data_hash = [];
            let data_len = 0;
            for (let i = allHashs.length - 1; i >= 0; i--) {
                if (hashes_on_api) {
                    if (!missingFiles.includes(allHashs[i].hash)) continue;
                }
                data.push(fs.readFileSync(PUBLIC_PATH_FULL + allHashs[i].file, { encoding: 'base64' }));
                data_hash.push(allHashs[i].hash);
                data_len += data[data.length - 1].length;
                allHashs.pop();
                if ((data_len >= 50000000) || (data.length >= 500)) {
                    kvBulk(data, data_hash, function () { uploadFiles(cb); });
                    return;
                }
            }
            if (data.length > 0) {
                kvBulk(data, data_hash, function () { cb(); });
            } else {
                cb();
            }
        };

        const saveSiteConfig = function (cb: any) {
            console.log('Saving site config...');
            let assets: any = {};
            for (let i = 0; i < allHashsManifest.length; i++) {
                assets[allHashsManifest[i].file] = allHashsManifest[i].hash;
            }
            let data_value = JSON.stringify({
                lambda_hash: lambda_hash,
                stack: STACK,
                basic_credentials: BASIC_CREDENTIALS,
                assets: assets,
            });
            bohrApi.post(`/site/deploy`, { data_value, REF_TYPE, REF_NAME, REPO_OWNER, REPO_NAME }
            ).then(res => {
                cb(res.data);
            }).catch(error => {
                console.error(error);
                process.exit(1);
            });
        };

        const deployLambda = function (cb_deploy_lambda: any) {
            const API_PATH = DEPLOY_PATH + '/api';
            const DIST_API_PATH = 'dist-api';
            if (!fs.existsSync(API_PATH)) {
                cb_deploy_lambda();
                return;
            }
            console.log('Deploying Lambda function...');
            const { zipFunctions } = require('@netlify/zip-it-and-ship-it');
            async function ZipAndShip() {
                try {
                    const archives = await zipFunctions(API_PATH, './' + DIST_API_PATH);
                    return archives;
                } catch (e) {
                    throw e;
                    process.exit(1);
                }
            };
            ZipAndShip().then(result => {
                if (result.length == 0) {
                    cb_deploy_lambda();
                    return;
                }
                hashFile(result[0].path).then(hash => {
                    console.log('Hash:' + hash.hash);
                    lambda_hash = hash.hash
                    bohrApi.get(`/amazon/getFunctionExists?hash=` + hash.hash).then(response => {
                        if (response.data.success) {
                            if (response.data.exists) {
                                console.log('Function already exists.');
                                cb_deploy_lambda();
                            } else {
                                console.log('New Function detected.');
                                bohrApi.post(`/site/deploy-function`, {
                                    "ZIP": fs.readFileSync(result[0].path, { encoding: 'base64' })
                                }).then(response => {
                                    if (response.status == 200) {
                                        console.log('deployLambda success');
                                        cb_deploy_lambda();
                                    } else {
                                        console.log('deployLambda error');
                                        console.log(response.data);
                                        process.exit(1);
                                    }
                                }).catch(error => {
                                    console.log('deployLambda error');
                                    console.error(error);
                                    process.exit(1);
                                });
                            }
                        } else {
                            console.log('getFunctionExists error');
                            console.log(response.data);
                            process.exit(1);
                        }
                    }).catch(error => {
                        console.log('getFunctionExists error');
                        console.log(error);
                        process.exit(1);
                    });
                });
            }).catch(err => {
                console.log(err);
                process.exit(1);
            });
        };

        const getMissingFiles = function (cb: any) {
            if (hashes_on_api) {
                let onlyHashes = allHashs.map(el => el.hash);
                bohrApi.post(`/get_missing_objects`, onlyHashes, {
                }).then(ret => {
                    if (ret.error) {
                        console.log(ret.error);
                    } else {
                        missingFiles = ret.data;
                        console.log('Missing files loaded with success.');
                        console.log('Total: ', missingFiles.length);
                    }
                    cb();
                }).catch(error => {
                    console.error(error);
                    process.exit(1);
                });
            } else {
                cb();
            }
        }

        const StaticFilesProcess = function () {
            hashDir(PUBLIC_PATH).then(hashs => {
                allHashs = hashs;
                allHashsManifest = hashs.slice();
                getMissingFiles(function () {
                    uploadFiles(function () {
                        saveSiteConfig(function (ret: any) {
                            console.log('finished!');
                            console.log('https://' + ret.url);
                            if (DEV_MODE) process.exit(1);
                        });
                    });
                });
            });
        };

        const getCurrentGit = async function () {
            try {
                //var Git = require("nodegit");
                //let repo = await Git.Repository.open("./");
                //let currentBranch = await repo.getCurrentBranch();
                //let currentBranchName = currentBranch.shorthand();
                //let remotes = await repo.getRemotes();
                //return {
                //    REPOSITORY: remotes[0].url().replace('https://github.com/', '').replace('.git', ''),
                //    REF_NAME: currentBranchName
                //};

                return {
                    REPOSITORY: 'bohr-io/core',
                    REF_NAME: 'dev'
                };
            } catch (e) {
                console.log(e);
                return null;
            }
        };

        const exec = function (cmd: any) {
            try {
                const cp = require('child_process');
                const ret = cp.execSync(cmd, { encoding: 'utf8' });
                return { success: true, result: ret };
            } catch (e) {
                return { success: false, error: e };
            }
        };

        const startDeploy = async function () {
            try {
                let REPOSITORY: any = null;
                if (process.env.GITHUB_ACTIONS) {
                    console.log('GITHUB_ACTIONS detected...');
                    REPOSITORY = process.env.GITHUB_REPOSITORY;
                    REF_NAME = process.env.GITHUB_REF_NAME;
                } else {
                    const git = await getCurrentGit();
                    if (git == null) {
                        console.error('Git repository not found.');
                        process.exit(1);
                    }
                    REPOSITORY = git.REPOSITORY;
                    REF_NAME = git.REF_NAME;
                }
                REPO_OWNER = REPOSITORY.split('/')[0];
                REPO_NAME = REPOSITORY.split('/')[1];

                const res = await bohrApi.post(`/deploy/start`, {
                    ID_TOKEN: process.env.ID_TOKEN,
                    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
                    GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
                    BOHR_TOKEN: process.env.BOHR_TOKEN,
                    REPO_OWNER,
                    REPO_NAME,
                    REF_TYPE,
                    REF_NAME
                });
                process.env = { ...process.env, ...res.data.env };

                let ret = null;
                if (res.data.cmd_install) {
                    console.log('Running cmd_install...');
                    ret = exec(res.data.cmd_install);
                    if (!ret.success) {
                        console.log('cmd_install error');
                        console.error(ret.error);
                        process.exit(1);
                    }
                    console.log(ret.result);
                }

                if (res.data.cmd_build) {
                    console.log('Running cmd_build...');
                    ret = exec(res.data.cmd_build);
                    if (!ret.success) {
                        console.log('cmd_build error');
                        console.error(ret.error);
                        process.exit(1);
                    }
                    console.log(ret.result);
                }

            } catch (error) {
                console.error(error);
                process.exit(1);
            }
        };

        await startDeploy();

        if (!fs.existsSync(PUBLIC_PATH) || fs.readdirSync(PUBLIC_PATH).length == 0) {
            console.error("Invalid or empty public folder.");
            process.exit(1);
        }

        deployLambda(function () {
            StaticFilesProcess();
        });
        */
    }
}