import { Command, Flags } from '@oclif/core';
import Login from './login';
import * as chalk from 'chalk';
import { getCurrentGit, spawnAsync, info, warn, logError, link, loading, runInstall, getMainEndpoint, getBohrAPI, b64ToBuf } from '../utils';
import axios from 'axios';

const fs = require('graceful-fs');
const path = require('path');
const crypto = require('crypto');

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
    var originalConsoleError = console.error;

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

    const { flags } = await this.parse(Deploy);


    const Conf = require('conf');
    const config = new Conf();

    let DEV_MODE = (!pjson.bohrEnv) && (!process.env.GITHUB_ACTIONS);

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

    const MAIN_ENDPOINT = await getMainEndpoint(DEV_MODE);
    let API_ROUTE = MAIN_ENDPOINT + '/api';
    let bohrApi = await getBohrAPI(API_ROUTE, config.get('token'));

    warn('WELCOME', 'Let\'s deploy it!...');

    const configFiles = JSON.stringify(await this.getConfigFiles());
    let firstDeployFromTemplate = false;
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
        const coreAction = require('@actions/core');
        const res = await bohrApi.post('/deploy/start' + ((process.env.GITHUB_ACTIONS) ? '?ga=1' : ''), {
          ID_TOKEN: (process.env.GITHUB_ACTIONS) ? await coreAction.getIDToken() : undefined,
          GITHUB_TOKEN: process.env.GITHUB_TOKEN,
          GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
          REPO_OWNER,
          REPO_NAME,
          REF_TYPE,
          REF_NAME,
          CONFIG_FILES: configFiles,
          GITHUB_ACTIONS_RUN_ID: process.env.GITHUB_RUN_ID
        });

        if(res.data.firstDeployFromTemplate){
          firstDeployFromTemplate = res.data.firstDeployFromTemplate;
          return;
        }
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
            if (!tryAutoLogin) {
              tryAutoLogin = true;
              loading('DEV_MODE', 'Calling auto login...');
              await Login.run();
              Object.assign(bohrApi.defaults.headers, { 'Cookie': 'BohrSession=' + config.get('token') });
              return await startDeploy();
            }
            this.error('Please, run "login" command first.');
          }
        }
        this.error(error);
      }
    };
    await startDeploy();
    if(firstDeployFromTemplate){
      info(' DONE ', 'Site deployed successfully: ');
      return;
    }

    let DEPLOY_PATH = process.env.DEPLOY_PATH != null ? process.env.DEPLOY_PATH : './';
    let PUBLIC_PATH = process.env.PUBLIC_PATH != null ? process.env.PUBLIC_PATH : DEPLOY_PATH;
    if (PUBLIC_PATH.substring(0, 1) == '/') PUBLIC_PATH = `.${PUBLIC_PATH}`;
    if (PUBLIC_PATH.substring(0, 2) != './') PUBLIC_PATH = `./${PUBLIC_PATH}`;

    //Install
    if (process.env.INSTALL_CMD && !flags['no-install']) {
      await runInstall(process.env.INSTALL_CMD as string, flags['show-install'], true);
    }

    //Build
    if (process.env.BUILD_CMD && !flags['no-build']) {
      if (process.env.TURBOREPO_TOKEN) process.env.BUILD_CMD = process.env.BUILD_CMD.replace('#TURBOREPO_TOKEN#', process.env.TURBOREPO_TOKEN);
      if (process.env.GITHUB_ACTIONS) {
        // @ts-ignore
        console.log('::group::' + chalk.inverse.bold['yellow'](` RUNNING `) + ' ' + chalk['yellow']('Building your site - ' + chalk.red(process.env.TURBOREPO_TOKEN ? process.env.BUILD_CMD.replace(process.env.TURBOREPO_TOKEN, '***') : process.env.BUILD_CMD)) + '\n');
      } else {
        warn('RUNNING', 'Building your site - ' + chalk.red(process.env.TURBOREPO_TOKEN ? process.env.BUILD_CMD.replace(process.env.TURBOREPO_TOKEN, '***') : process.env.BUILD_CMD));
      }
      try {
        delete process.env.CI;
        await spawnAsync(process.env.BUILD_CMD, flags['show-build'], true);
        if (process.env.GITHUB_ACTIONS) console.log('::endgroup::');
        info('SUCCESS', 'Your site has been successfully built.');
      } catch (error: any) {
        if (deployId) {
          await bohrApi.post('/deploy/setDeployError', {
            deployId,
            REPO_OWNER,
            REPO_NAME,
            errorMessage: error.stderr
          });
        }
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
    const findIndexHTML = async (PUBLIC_PATH_FULL: string) => new Promise(resolve => {
      fs.readdir(PUBLIC_PATH_FULL, async function (err: any, list: any) {
        if (err) return false;
        await list.forEach(function (file: any) {
          if(file.toLowerCase() == "index.html" ) {
            resolve(true);
          }
        });
        resolve(false);
      });
    });

    if(!await findIndexHTML(PUBLIC_PATH_FULL)){
      if (deployId) {
        await bohrApi.post('/deploy/setDeployError', {
          deployId,
          REPO_OWNER,
          REPO_NAME,
          errorMessage: "index.html not found in Public folder."
        });
        if (process.env.GITHUB_ACTIONS) console.log('::endgroup::');
        this.log('\n\n');
        logError('ERROR', 'index.html not found in Public folder.');
        this.exit(1);        
      }
    }

    let allHashs: any = null;
    let allHashsManifest: any = null;
    let lambda_hash = '';
    let missingFiles: any = [];

    //Store hashes via api
    const hashes_on_api = true;

    const hashFile = (filePath: any) => new Promise(resolve => {
      const hash = crypto.createHash('sha256');
      const file = fs.createReadStream(filePath);

      file.on('data', (data: any) => {
        hash.update(data);
      });

      file.on('end', () => {
        resolve({ file: filePath.replace(PUBLIC_PATH_FULL, '').replace(/\\/g, '/'), hash: hash.digest('hex') });
      });
    });

    const createSha256CspHash = (content: any) => {
      return crypto.createHash('sha256').update(content).digest('hex');
    }

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
                (!file_filter.includes('/.turbo/')) &&
                (!file_filter.includes('/node_modules/')) &&
                (!file_filter.includes('/turborepo-cache/')) &&
                (!file_filter.startsWith('/api/')) &&
                (!file_filter.startsWith('/dist-api/')) &&
                (!file_filter.endsWith('.env')) &&
                (!file_filter.endsWith('/package.json')) &&
                (!file_filter.endsWith('/package-lock.json')) &&
                (!file_filter.endsWith('/yarn.lock')) &&
                (!file_filter.endsWith('/.yarnrc')) &&
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

    const kvBulk = async function (data: any, data_hash: any) {
      return new Promise(async (resolve, reject) => {
        bohrApi.put(`/cloudflare/kvBulk`, data).then((res) => {
          if (res.data.success) {
            if (hashes_on_api) {
              let data = {
                hashList: data_hash,
                env: (process.env.BOHR_DG_NAME == 'main' ? 'main' : 'dev')
              };
              bohrApi.post(`/deploy/add_objects`, data).then((ret) => {
                if (ret.data.error) {
                  reject(ret.data.error);
                }
                else {
                  resolve(true);
                }
              })
            } else {
              resolve(true);
            }
          } else {
            reject('Upload file error.\n' + res.data);
          }
        }).catch((error: any) => {
          console.error(error);
          //@ts-ignore
          originalProcessExit(1);
        });
      });
    };

    const uploadFiles = async function () {
      return new Promise(async (resolve, reject) => {
        warn('RUNNING', 'Uploading files...');
        let data = [];
        let data_hash = [];
        let data_len = 0;
        let parallel_bulks = [];
        for (let i = allHashs.length - 1; i >= 0; i--) {
          if (hashes_on_api) {
            if (!missingFiles.includes(allHashs[i].hash)) continue;
          }
          data.push(fs.readFileSync(PUBLIC_PATH_FULL + allHashs[i].file, { encoding: 'base64' }));
          data_hash.push(allHashs[i].hash);
          data_len += data[data.length - 1].length;
          allHashs.pop();
          if ((data_len >= 50000000) || (data.length >= 500)) {
            parallel_bulks.push(kvBulk(data, data_hash));
            data = [];
            data_hash = [];
            data_len = 0;
          }
          if (parallel_bulks.length >= 20) {
            try {
              await Promise.all(parallel_bulks);
            } catch (error) {
              reject(error);
            }
            parallel_bulks = [];
          }
        }
        if (data.length > 0) {
          parallel_bulks.push(kvBulk(data, data_hash));
        }

        Promise.all(parallel_bulks).then(function () {
          resolve(true);
        }).catch(function (error) {
          reject(error);
        });
      });
    };

    const saveSiteConfig = async function (cb: any) {
      warn('RUNNING', 'Deploying your site...');
      let assets: any = {};
      for (let i = 0; i < allHashsManifest.length; i++) {
        assets[allHashsManifest[i].file] = allHashsManifest[i].hash;
      }

      let data: any = {
        lambda_hash: lambda_hash,
        stack: STACK,
        assets: assets,
      };
      let data_value = JSON.stringify(data);

      const contentType = 'application/json';
      const jsonBuf = Buffer.from(data_value, "utf-8");
      let jsonKey = createSha256CspHash(jsonBuf);
      const resGetSignedUrl = await bohrApi.get(`/deploy/getSignedUrl?fileName=${jsonKey}&fileType${contentType}`);
      const retUpload = await uploadToS3(jsonBuf, resGetSignedUrl.data.signedRequest);
      if (retUpload.status != 200) {
        throw ('saveSiteConfig error\n error saving site(1)');
      }
      delete data.assets;
      data.assets_key = jsonKey;
      data_value = JSON.stringify(data);

      bohrApi.post('/deploy/publish', { data_value, deployId, REF_TYPE, REF_NAME, REPO_OWNER, REPO_NAME }
      ).then((res) => {
        cb(res.data);
      }).catch(async (error) => {
        if (deployId) {
          await bohrApi.post('/deploy/setDeployError', {
            deployId,
            REPO_OWNER,
            REPO_NAME,
            errorMessage: error
          });
        }
        console.error(error);
        //@ts-ignore
        originalProcessExit(1);
      });
    };

    const uploadToS3 = async function (zipBuf: ArrayBuffer, signedRequest: string) {
      return await axios.put(signedRequest, zipBuf, {
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
    };

    const deployLambda = async function () {
      return new Promise(async (resolve, reject) => {
        const API_PATH = DEPLOY_PATH + '/api';
        const DIST_API_PATH = 'dist-api';
        if (!fs.existsSync(API_PATH)) {
          info('SUCCESS', 'API function uploaded successfully.');
          return resolve(true);
        }
        warn('RUNNING', 'Uploading API function....');
        const { zipFunctions } = require('@netlify/zip-it-and-ship-it');
        async function ZipAndShip() {
          try {
            if (DEV_MODE && flags['no-install'] && flags['no-build'] && fs.existsSync('dist-api\\core.zip')) {
              loading('DEV_MODE', 'Using old "dist-api\\core.zip"...');
              return [{ path: 'dist-api\\core.zip' }];
            }
            const archives = await zipFunctions(API_PATH, './' + DIST_API_PATH);
            return archives;
          } catch (e) {
            if (deployId) {
              await bohrApi.post('/deploy/setDeployError', {
                deployId,
                REPO_OWNER,
                REPO_NAME,
                errorMessage: e
              });
            }            
            console.error(e);
            //@ts-ignore
            originalProcessExit(1);
          }
        };
        ZipAndShip().then(result => {
          if (result.length == 0) {
            info('SUCCESS', 'API function uploaded successfully.');
            return resolve(true);
          }
          hashFile(result[0].path).then((hash: any) => {
            lambda_hash = hash.hash
            bohrApi.get(`/deploy/getFunctionExists?hash=` + hash.hash).then(async (response) => {
              if (response.data.success) {
                if (response.data.exists) {
                  info('SUCCESS', 'API function uploaded successfully.');
                  return resolve(true);
                } else {
                  try {
                    const zipHash: any = await hashFile(result[0].path);
                    const ZIP: any = fs.readFileSync(result[0].path, { encoding: 'base64' });

                    const contentType = 'application/zip';
                    const zipBuf = b64ToBuf(ZIP);
                    const resGetSignedUrl = await bohrApi.get(`/deploy/getSignedUrl?fileName=${zipHash.hash}&fileType${contentType}`);
                    const retUpload = await uploadToS3(zipBuf, resGetSignedUrl.data.signedRequest);
                    if (retUpload.status != 200) {
                      return reject('deployLambda error\nupload error (1)');
                    }
                    info('SUCCESS', 'API function uploaded successfully.');
                    return resolve(true);
                  } catch (error: any) {
                    return reject('deployLambda error\n' + error);
                  }
                }
              } else {
                return reject('getFunctionExists error\n' + response.data);
              }
            }).catch((error: any) => {
              if (error.response) {
                if (error.response.status == 401) {
                  return reject('Please, run "login" command first.');
                }
              }
              return reject('getFunctionExists error\n' + error);
            });
          });
        }).catch(async (err) => {
          if (deployId) {
            await bohrApi.post('/deploy/setDeployError', {
              deployId,
              REPO_OWNER,
              REPO_NAME,
              errorMessage: err
            });
          }             
          return reject(err);
        });
      });
    };

    const chunkArray = function (myArray: any, chunk_size: number) {
      var index = 0;
      var arrayLength = myArray.length;
      var tempArray = [];

      for (index = 0; index < arrayLength; index += chunk_size) {
        let myChunk = myArray.slice(index, index + chunk_size);
        tempArray.push(myChunk);
      }

      return tempArray;
    }

    const getMissingFiles = async function () {
      return new Promise(async (resolve, reject) => {
        if (hashes_on_api) {
          let onlyHashes = allHashs.map((el: any) => el.hash);

          let parallel_bulks: any[] = [];
          let chunk_size = 5000;
          let chunks = chunkArray(onlyHashes, chunk_size);
          chunks.forEach(el => {
            let data = {
              hashList: el,
              env: (process.env.BOHR_DG_NAME == 'main' ? 'main' : 'dev')
            };
            parallel_bulks.push(bohrApi.post(`/deploy/get_missing_objects`, data, {
            }))
          });

          Promise.all(parallel_bulks).then((ret) => {
            ret.forEach((el: any) => {
              if (el.data.error) {
                reject(el.data.error);
              } else {
                missingFiles = [...missingFiles, ...el.data];
              }
            })
            resolve(true);
          }).catch((error: any) => {
            reject(error);
          });

        } else {
          resolve(true);
        }
      });
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

    const StaticFilesProcess = async function () {
      return new Promise(async (resolve, reject) => {
        hashDir(PUBLIC_PATH).then(async function (hashs: any) {
          allHashs = hashs;
          allHashsManifest = hashs.slice();
          await getMissingFiles();
          await uploadFiles();
          info('SUCCESS', 'Files uploaded successfully.');
          resolve(true);
        });
      });
    };

    if (!fs.existsSync(PUBLIC_PATH) || fs.readdirSync(PUBLIC_PATH).length == 0) {
      console.error("Invalid or empty public folder.");
      //@ts-ignore
      originalProcessExit(1);
    }

    Promise.all([deployLambda(), StaticFilesProcess()]).then(async function () {
      await saveSiteConfig(function (ret: any) {
        info(' DONE ', 'Site deployed successfully: ' + link('https://' + ret.url));
        if (process.env.GITHUB_ACTIONS) {
          execStr('echo "### bohr deploy! :rocket:" >> $GITHUB_STEP_SUMMARY');
          execStr('echo "" >> $GITHUB_STEP_SUMMARY');
          execStr('echo "## https://' + ret.url + '" >> $GITHUB_STEP_SUMMARY');
        }
      });
    }).catch(function (error) {
      console.log(error);
      //@ts-ignore
      originalProcessExit(1);
    });
  }

  async getConfigFiles() {
    const configFiles = ['_config.yml', 'babel.config.js', 'brunch-config.js', 'config.json', 'config.toml', 'config.yaml', 'hydrogen.config.js', 'hydrogen.config.ts', 'jest.config.js', 'package.json', 'package-lock.json', 'yarn.lock', 'remix.config.js', 'sanity.config.js', 'sanity.config.jsx', 'sanity.config.ts', 'sanity.config.tsx', 'sanity.json', 'tsconfig.json', 'tsconfig.root.json', 'turbo.json', 'vue.config.js'];
    let ret = [];
    for (let i = 0; i < configFiles.length; i++) {
      try {
        let data = fs.readFileSync(path.resolve('./' + configFiles[i]), { encoding: 'utf8' });
        if (configFiles[i] == 'package-lock.json' || configFiles[i] == 'yarn.lock') data = '';
        ret.push({
          file: configFiles[i],
          data: data
        });
      } catch (error) {
      }
    }
    return ret;
  }
}
