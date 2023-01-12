# MonoRepo for Darlean

This is the monorepo for Darlean that contains basic npm packages, suite packages and example code.

## Contents

### Basic Packages
The following basic packages are part of this monorepo:
* [@darlean/base](base) with declarations and basic types needed to write (implement) actors
* [@darlean/core](core) with the core framework needed for hosting (running) actors
* [@darlean/utils](utils) with all kind of utilities that do not directly relate to virtual actors
* [@darlean/docgen](docgen) with a preprocessor for [typedoc](https://www.npmjs.com/package/typedoc) to generate the [documentation](https://docs.darlean.io/latest) the way we like it

### Suite packages
The following actor suite packages are part of this monorepo:
* [@darlean/actor-lock-suite](suites/actor-lock-suite) which contains the implementation of the distributed actor lock

### Examples
We have also included some working examples:
* [Tutorial of creating an distributed Oracle using Darlean](examples/src)

## Building

Because we use a monorepo (with multiple packages in one git repo), there apply some special rules:
* All npm commands must be executed from the *root* of the monorepo using the `-w name` or `--workspaces` flags to instruct npm to operate on one specific workspace (`-w name`) or on all workspaces together (`--workspaces`).
* The `-w` and `--workspaces` flags can be combined with `--if-present` to ignore warnings when certain commands are not present for all workspaces
* The following workspace names are supported:
  * base
  * core
  * utils
  * docgen
  * examples
  * suites/actor-lock-suite
* Every workspace has its own `package.json`, but there is only one `node_modules` and one `package-lock.json` at the root of the repo
* The `npm install --workspaces` command automatically creates symlinks that allow all packages to see the most recent versions of all
  other packages, without the need for first committing the changes.

### Installing

To install everything after a fresh pull:
```
$ npm install --workspaces
```

To install only one specific workspace:
```
$ npm install -w base
```

### Building

```
$ npm run build --workspaces
$ npm run build -w base
```

### Formatting, linting and building

Do this before every commit!

```
$ npm run precommit --workspaces
$ npm run precommit -w base
```

### Formatting, linting, installing and testing

Recommended before every commit!

```
$ npm run preversion --workspaces
$ npm run preversion -w base
```

### Unit testing and running the examples

```
$ npm run test --workspaces --if-present
$ npm run test -w base
```
