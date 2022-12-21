#!/usr/bin/env node

import { generate } from './index';

if (require.main === module) {
    const args = process.argv.slice(2);
    generate(args[0], args[1]);
}
