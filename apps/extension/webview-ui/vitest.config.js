"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
const plugin_react_1 = require("@vitejs/plugin-react");
const path_1 = require("path");
exports.default = (0, config_1.defineConfig)({
    plugins: [(0, plugin_react_1.default)()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./vitest.setup.ts'],
    },
    resolve: {
        alias: {
            '@': path_1.default.resolve(__dirname, './src'),
        },
    },
});
//# sourceMappingURL=vitest.config.js.map