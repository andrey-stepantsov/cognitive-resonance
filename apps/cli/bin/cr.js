#!/usr/bin/env node

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: "CommonJS",
    esModuleInterop: true
  }
});
require('../src/index.ts');
