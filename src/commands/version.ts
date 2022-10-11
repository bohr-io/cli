import { Command } from '@oclif/core'

export default class Login extends Command {
    static description = 'Version'
    async run(): Promise<void> {
        this.log('BOHR CLI 0.1.102');
    }
}