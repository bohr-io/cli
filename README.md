bohr.io CLI
=================

[![Version](https://img.shields.io/npm/v/bohr.svg)](https://npmjs.org/package/bohr)
[![Downloads/week](https://img.shields.io/npm/dw/bohr.svg)](https://npmjs.org/package/bohr)
[![License](https://img.shields.io/npm/l/bohr.svg)](https://npmjs.org/package/bohr)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
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
bohr/1.0.267 win32-x64 node-v16.15.0
$ bohr --help [COMMAND]
USAGE
  $ bohr COMMAND
...
```
<!-- usagestop -->
```sh-session
$ npm install -g bohr
$ bohr COMMAND
running command...
$ bohr (--version)
bohr/1.0.267 win32-x64 node-v16.15.0
$ bohr --help [COMMAND]
USAGE
  $ bohr COMMAND
...
```
<!-- usagestop -->
```sh-session
$ npm install -g bohr
$ bohr COMMAND
running command...
$ bohr (--version)
bohr/1.0.230 win32-x64 node-v16.14.2
$ bohr --help [COMMAND]
USAGE
  $ bohr COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`bohr deploy`](#bohr-deploy)
* [`bohr dev`](#bohr-dev)
* [`bohr help [COMMAND]`](#bohr-help-command)
* [`bohr login`](#bohr-login)
* [`bohr logout`](#bohr-logout)

## `bohr deploy`

Deploy a site

```
USAGE
  $ bohr deploy [--no-install] [--no-build] [--show-install] [--show-build]

FLAGS
  --no-build      bypass build command
  --no-install    bypass install command
  --show-build    show build command output
  --show-install  show install command output

DESCRIPTION
  Deploy a site
```

_See code: [dist/commands/deploy.ts](https://github.com/bohr-io/cli/blob/v1.0.267/dist/commands/deploy.ts)_

## `bohr dev`

Run localhost environment

```
USAGE
  $ bohr dev [--no-install] [--no-dev] [--show-install] [--show-dev]

FLAGS
  --no-dev        bypass dev command
  --no-install    bypass install command
  --show-dev      show dev command output
  --show-install  show install command output

DESCRIPTION
  Run localhost environment
```

_See code: [dist/commands/dev.ts](https://github.com/bohr-io/cli/blob/v1.0.267/dist/commands/dev.ts)_

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

## `bohr login`

Login in your bohr.io account

```
USAGE
  $ bohr login

DESCRIPTION
  Login in your bohr.io account
```

_See code: [dist/commands/login.ts](https://github.com/bohr-io/cli/blob/v1.0.267/dist/commands/login.ts)_

## `bohr logout`

Logout from your bohr.io account

```
USAGE
  $ bohr logout

DESCRIPTION
  Logout from your bohr.io account
```

_See code: [dist/commands/logout.ts](https://github.com/bohr-io/cli/blob/v1.0.267/dist/commands/logout.ts)_
<!-- commandsstop -->
* [`bohr deploy`](#bohr-deploy)
* [`bohr dev`](#bohr-dev)
* [`bohr help [COMMAND]`](#bohr-help-command)
* [`bohr login`](#bohr-login)
* [`bohr logout`](#bohr-logout)

## `bohr deploy`

Deploy a site

```
USAGE
  $ bohr deploy [--no-install] [--no-build] [--show-install] [--show-build]

FLAGS
  --no-build      bypass build command
  --no-install    bypass install command
  --show-build    show build command output
  --show-install  show install command output

DESCRIPTION
  Deploy a site
```

_See code: [dist/commands/deploy.ts](https://github.com/bohr-io/cli/blob/v1.0.267/dist/commands/deploy.ts)_

## `bohr dev`

Run localhost environment

```
USAGE
  $ bohr dev [--no-install] [--no-dev] [--show-install] [--show-dev]

FLAGS
  --no-dev        bypass dev command
  --no-install    bypass install command
  --show-dev      show dev command output
  --show-install  show install command output

DESCRIPTION
  Run localhost environment
```

_See code: [dist/commands/dev.ts](https://github.com/bohr-io/cli/blob/v1.0.267/dist/commands/dev.ts)_

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

## `bohr login`

Login in your bohr.io account

```
USAGE
  $ bohr login

DESCRIPTION
  Login in your bohr.io account
```

_See code: [dist/commands/login.ts](https://github.com/bohr-io/cli/blob/v1.0.267/dist/commands/login.ts)_

## `bohr logout`

Logout from your bohr.io account

```
USAGE
  $ bohr logout

DESCRIPTION
  Logout from your bohr.io account
```

_See code: [dist/commands/logout.ts](https://github.com/bohr-io/cli/blob/v1.0.267/dist/commands/logout.ts)_
<!-- commandsstop -->
* [`bohr deploy`](#bohr-deploy)
* [`bohr dev`](#bohr-dev)
* [`bohr help [COMMAND]`](#bohr-help-command)
* [`bohr login`](#bohr-login)
* [`bohr logout`](#bohr-logout)

## `bohr deploy`

Deploy a site

```
USAGE
  $ bohr deploy [--no-install] [--no-build] [--show-install] [--show-build]

FLAGS
  --no-build      bypass build command
  --no-install    bypass install command
  --show-build    show build command output
  --show-install  show install command output

DESCRIPTION
  Deploy a site
```

_See code: [dist/commands/deploy.ts](https://github.com/bohr-io/cli/blob/v1.0.230/dist/commands/deploy.ts)_

## `bohr dev`

Run localhost environment

```
USAGE
  $ bohr dev [--no-install] [--no-dev] [--show-install] [--show-dev]

FLAGS
  --no-dev        bypass dev command
  --no-install    bypass install command
  --show-dev      show dev command output
  --show-install  show install command output

DESCRIPTION
  Run localhost environment
```

_See code: [dist/commands/dev.ts](https://github.com/bohr-io/cli/blob/v1.0.230/dist/commands/dev.ts)_

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

## `bohr login`

Login in your bohr.io account

```
USAGE
  $ bohr login

DESCRIPTION
  Login in your bohr.io account
```

_See code: [dist/commands/login.ts](https://github.com/bohr-io/cli/blob/v1.0.230/dist/commands/login.ts)_

## `bohr logout`

Logout from your bohr.io account

```
USAGE
  $ bohr logout

DESCRIPTION
  Logout from your bohr.io account
```

_See code: [dist/commands/logout.ts](https://github.com/bohr-io/cli/blob/v1.0.230/dist/commands/logout.ts)_
<!-- commandsstop -->
