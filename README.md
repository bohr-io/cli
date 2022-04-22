bohr.io CLI
=================

[![Version](https://img.shields.io/npm/v/bohr.svg)](https://npmjs.org/package/bohr)
[![Downloads/week](https://img.shields.io/npm/dw/bohr.svg)](https://npmjs.org/package/bohr)
[![License](https://img.shields.io/npm/l/bohr.svg)](https://npmjs.org/package/bohr)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Usage
<!-- usage -->
```sh-session
$ npm install -g bohr
$ bohr COMMAND
running command...
$ bohr (--version)
bohr/0.0.0 win32-x64 node-v16.13.1
$ bohr --help [COMMAND]
USAGE
  $ bohr COMMAND
...
```
<!-- usagestop -->

# Commands
<!-- commands -->
* [`bohr hello PERSON`](#bohr-hello-person)
* [`bohr help [COMMAND]`](#bohr-help-command)
* [`bohr world`](#bohr-world)

## `bohr hello PERSON`

Say hello

```
USAGE
  $ bohr hello [PERSON] -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Whom is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ oex hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [dist/commands/hello.ts](https://github.com/bohr-io/cli/blob/v0.0.0/dist/commands/hello.ts)_

## `bohr help [COMMAND]`

Display help for bohr.

```
USAGE
  $ bohr help [COMMAND] [-n]

ARGUMENTS
  COMMAND  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for bohr.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v5.1.12/src/commands/help.ts)_

## `bohr world`

Say hello world

```
USAGE
  $ bohr world

DESCRIPTION
  Say hello world

EXAMPLES
  $ oex hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [dist/commands/world.ts](https://github.com/bohr-io/cli/blob/v0.0.0/dist/commands/world.ts)_
<!-- commandsstop -->
