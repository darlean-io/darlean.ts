# Introduction

Suite that bundles a reasonable minimal set of actor suites that should be registered in order to run a Darlean cluster.

# Installation

```
$ npm install @darlean/runtime-suite
```

# Usage

```ts
import { ConfigRunnerBuilder } from '@darlean/core';
import { createRuntimeSuiteFromBuilder } from '@darlean/runtime-suite';

async function main() {
    const builder = new ConfigRunnerBuilder();
    builder.registerSuite(createRuntimeSuiteFromBuilder(builder));
    // Register your own suites here...

    const runner = builder.build();
    await runner.run();
}

if (require.main === module) {
    main()
        .then()
        .catch((e) => console.log(e));
}
```

# Functionality

This suite registers the following suites:
* @darlean/actor-lock-suite
* @darlean/actor-registry-suite
* @darlean/persistence-suite
* @darlean/fs-persistence-suite

The exported `createRuntimeSuiteFromBuilder` function is a convenience wrapper around `createRuntimeSuiteFromConfig` that can be used with a `ConfigRunnerBuilder` (or compatible) instance.

The `createRuntimeSuiteFromConfig` registers the supported suites via their corresponding `*FromConfig` suite creator functions.

# Configuration

See the [API documentation](https://docs.darlean.io/latest/@darlean_runtime-suite.html)

# Documentation
* [API Documentation](https://docs.darlean.io/latest/@darlean_runtime-suite.html)