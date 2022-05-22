import { Command } from '@oclif/core'
import { info } from '../utils';

export default class Logout extends Command {
    static description = 'Logout from your bohr.io account'
    async run(): Promise<void> {
        this.log('');
        const Conf = require('conf');
        const config = new Conf();
        config.delete('token');
        info('DONE', 'Logout successful!');
    }
}