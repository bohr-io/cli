import { Command, Flags } from '@oclif/core';
import Login from './login';
import * as chalk from 'chalk';
import { getCurrentGit, spawnAsync, info, warn, logError, link, loading, runInstall, getMainEndpoint, getBohrAPI, b64ToBuf } from '../utils';
import axios from 'axios';

const pjson = require('../../package.json');

export default class Deploy extends Command {
    static description = 'Deploy a site';

    static flags = {
        'no-install': Flags.boolean({ default: false, description: 'bypass install command' }),
        'no-build': Flags.boolean({ default: false, description: 'bypass build command' }),
        'show-install': Flags.boolean({ default: false, description: 'show install command output' }),
        'show-build': Flags.boolean({ default: false, description: 'show build command output' })
    };

    async run(): Promise<void> {
        this.log('');
        const { flags } = await this.parse(Deploy);

        const fs = require('graceful-fs');
        const path = require('path');
        const crypto = require('crypto');

        const Conf = require('conf');
        const config = new Conf();

        let DEV_MODE = (!pjson.bohrEnv);

        if (DEV_MODE || process.env.GITHUB_ACTIONS) {
            flags['show-install'] = true;
            flags['show-build'] = true;
        }

        let REPO_OWNER: any = null;
        let REPO_NAME: any = null;
        let REF_TYPE = "BRANCH";
        let REF_NAME: any = null;
        let deployId: any = null;

        //Optional env
        let STACK = process.env.STACK;
        let BASIC_CREDENTIALS = process.env.BASIC_CREDENTIALS;

        const MAIN_ENDPOINT = await getMainEndpoint(DEV_MODE);
        let API_ROUTE = MAIN_ENDPOINT + '/api';
        let bohrApi = await getBohrAPI(API_ROUTE, config.get('token'));

        let tryAutoLogin = false;
        const startDeploy = async (): Promise<any> => {
            let REPOSITORY: any = null;
            if (process.env.GITHUB_ACTIONS) {
                REPOSITORY = process.env.GITHUB_REPOSITORY;
                REF_NAME = process.env.GITHUB_REF_NAME;
            } else {
                const git = await getCurrentGit();
                if (git == null) {
                    this.error('Git repository not found.');
                }
                REPOSITORY = git.REPOSITORY;
                REF_NAME = git.REF_NAME;
            }
            REPO_OWNER = REPOSITORY.split('/')[0];
            REPO_NAME = REPOSITORY.split('/')[1];

            try {
                const res = await bohrApi.post('/deploy/start' + ((process.env.GITHUB_ACTIONS) ? '?ga=1' : ''), {
                    ID_TOKEN: process.env.ID_TOKEN,
                    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
                    GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
                    REPO_OWNER,
                    REPO_NAME,
                    REF_TYPE,
                    REF_NAME
                });

                deployId = res.data.deployId;

                Object.keys(res.data.env).forEach(function (key) { process.env[key] = res.data.env[key]; });

                if (process.env.GITHUB_ACTIONS) {
                    Object.assign(bohrApi.defaults.headers, {
                        'Cookie': null,
                        'Bohr-Auth-Bypass': res.data.token
                    });
                }
            } catch (error: any) {
                if (error.response) {
                    if (error.response.status == 401) {
                        if (DEV_MODE) {
                            if (!tryAutoLogin) {
                                tryAutoLogin = true;
                                loading('DEV_MODE', 'Calling auto login...');
                                await Login.run();
                                Object.assign(bohrApi.defaults.headers, { 'Cookie': 'BohrSession=' + config.get('token') });
                                return await startDeploy();
                            }
                        }
                        this.error('Please, run "login" command first.');
                    }
                }
                this.error(error);
            }
        };
        await startDeploy();

        let DEPLOY_PATH = process.env.DEPLOY_PATH != null ? process.env.DEPLOY_PATH : './';
        let PUBLIC_PATH = process.env.PUBLIC_PATH != null ? process.env.PUBLIC_PATH : DEPLOY_PATH;

        //Install
        if (process.env.INSTALL_CMD && !flags['no-install']) {
            await runInstall(process.env.INSTALL_CMD as string, flags['show-install'], true);
        }

        //Build
        if (process.env.BUILD_CMD && !flags['no-build']) {
            if (process.env.GITHUB_ACTIONS) {
                // @ts-ignore
                console.log('::group::' + chalk.inverse.bold['yellow'](` RUNNING `) + ' ' + chalk['yellow']('Building your site - ' + chalk.red(process.env.BUILD_CMD)) + '\n');
            } else {
                warn('RUNNING', 'Building your site - ' + chalk.red(process.env.BUILD_CMD));
            }
            try {
                await spawnAsync(process.env.BUILD_CMD, flags['show-build'], true);
                if (process.env.GITHUB_ACTIONS) console.log('::endgroup::');
                info('SUCCESS', 'Your site has been successfully built.');
            } catch (error: any) {
                if (process.env.GITHUB_ACTIONS) console.log('::endgroup::');
                this.log('\n\n');
                logError('ERROR', 'An error occurred while building the site.');
                this.log(error.stdout);
                this.log('\n\n');
                this.log(error.stderr);
                this.exit(1);
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

        const hashFile = (filePath: any) => new Promise(resolve => {
            const hash = crypto.createHash('sha256');
            fs.createReadStream(filePath).on('data', (data: any) => hash.update(data)).on('end', () => resolve({ file: filePath.replace(PUBLIC_PATH_FULL, '').replace(/\\/g, '/'), hash: hash.digest('hex') }));
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

        const hashDir = (filePath: any) => new Promise(resolve => {
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
            bohrApi.put(`/cloudflare/kvBulk`, data).then((res) => {
                if (res.data.success) {
                    if (hashes_on_api) {
                        bohrApi.post(`/add_objects`, data_hash).then((ret) => {
                            if (ret.data.error) {
                                console.log(ret.data.error);
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
            }).catch((error: any) => {
                console.error(error);
                process.exit(1);
            });
        };

        const uploadFiles = function (cb: any) {
            warn('RUNNING', 'Uploading files...');
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
            warn('RUNNING', 'Deploying your site...');
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
            bohrApi.post(`/site/deploy`, { data_value, deployId, REF_TYPE, REF_NAME, REPO_OWNER, REPO_NAME }
            ).then((res) => {
                cb(res.data);
            }).catch((error) => {
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
            warn('RUNNING', 'Uploading API function...');
            const { zipFunctions } = require('@netlify/zip-it-and-ship-it');
            async function ZipAndShip() {
                try {
                    //return [{ path: 'dist-api\\core.zip' }];
                    const archives = await zipFunctions(API_PATH, './' + DIST_API_PATH);
                    return archives;
                } catch (e) {
                    console.error(e);
                    process.exit(1);
                }
            };
            ZipAndShip().then(result => {
                if (result.length == 0) {
                    cb_deploy_lambda();
                    return;
                }
                hashFile(result[0].path).then((hash: any) => {
                    lambda_hash = hash.hash
                    bohrApi.get(`/amazon/getFunctionExists?hash=` + hash.hash).then(async (response) => {
                        if (response.data.success) {
                            if (response.data.exists) {
                                cb_deploy_lambda();
                            } else {
                                const uploadToS3 = async function (zipBuf: ArrayBuffer, signedRequest: string) {
                                    return await axios.put(signedRequest, zipBuf, {
                                        maxContentLength: Infinity,
                                        maxBodyLength: Infinity
                                    });
                                };

                                try {
                                    const zipHash: any = await hashFile(result[0].path);
                                    const ZIP: any = fs.readFileSync(result[0].path, { encoding: 'base64' });

                                    const contentType = 'application/zip';
                                    const zipBuf = b64ToBuf(ZIP);
                                    const resGetSignedUrl = await bohrApi.get(`/amazon/getSignedUrl?fileName=${zipHash.hash}&fileType${contentType}`);
                                    const retUpload = await uploadToS3(zipBuf, resGetSignedUrl.data.signedRequest);
                                    if (retUpload.status != 200) {
                                        console.log('deployLambda error');
                                        console.log('upload error (1)');
                                        process.exit(1);
                                    }
                                    cb_deploy_lambda();
                                } catch (error: any) {
                                    console.log('deployLambda error');
                                    console.error(error);
                                    process.exit(1);
                                }
                            }
                        } else {
                            console.log('getFunctionExists error');
                            console.log(response.data);
                            process.exit(1);
                        }
                    }).catch((error: any) => {
                        if (error.response) {
                            if (error.response.status == 401) {
                                console.log('Please, run "login" command first.');
                                process.exit(1);
                            }
                        }
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
                let onlyHashes = allHashs.map((el: any) => el.hash);
                bohrApi.post(`/get_missing_objects`, onlyHashes, {
                }).then((ret) => {
                    if (ret.data.error) {
                        console.log(ret.data.error);
                    } else {
                        missingFiles = ret.data;
                    }
                    cb();
                }).catch((error: any) => {
                    console.error(error);
                    process.exit(1);
                });
            } else {
                cb();
            }
        }

        const execStr = function (cmd: string) {
            try {
                const cp = require('child_process');
                const ret = cp.execSync(cmd, { shell: true, encoding: 'utf8' });
                return { success: true, result: ret };
            } catch (e) {
                return { success: false, error: e };
            }
        };

        const StaticFilesProcess = function () {
            hashDir(PUBLIC_PATH).then((hashs: any) => {
                allHashs = hashs;
                allHashsManifest = hashs.slice();
                getMissingFiles(function () {
                    uploadFiles(function () {
                        info('SUCCESS', 'Files uploaded successfully.');
                        saveSiteConfig(function (ret: any) {
                            info(' DONE ', 'Site deployed successfully: ' + link('https://' + ret.url));
                            if (process.env.GITHUB_ACTIONS) {
                                execStr('echo "### bohr deploy! :rocket:" >> $GITHUB_STEP_SUMMARY');
                                execStr('echo "" >> $GITHUB_STEP_SUMMARY');
                                execStr('echo "## https://' + ret.url + '" >> $GITHUB_STEP_SUMMARY');
                            }
                            process.exit(0);
                        });
                    });
                });
            });
        };

        if (!fs.existsSync(PUBLIC_PATH) || fs.readdirSync(PUBLIC_PATH).length == 0) {
            console.error("Invalid or empty public folder.");
            process.exit(1);
        }

        deployLambda(function () {
            info('SUCCESS', 'API function uploaded successfully.');
            StaticFilesProcess();
        });
    }
}