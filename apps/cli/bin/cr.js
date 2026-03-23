#!/usr/bin/env node

const path = require('path');
require('ts-node').register({
  project: path.join(__dirname, '../tsconfig.json'),
  transpileOnly: true,
  experimentalResolver: true,
  compilerOptions: {
    module: "CommonJS",
    esModuleInterop: true
  }
});
require('../src/index.ts');
