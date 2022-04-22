import {expect, test} from '@oclif/test'

describe('world', () => {
  test
  .stdout()
  .command(['world'])
  .it('runs world cmd', ctx => {
    expect(ctx.stdout).to.contain('hello world!')
  })
})
