"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("@testing-library/jest-dom");
const vitest_1 = require("vitest");
// Mock Mermaid since we don't want to actually render SVGs in JSDOM
vitest_1.vi.mock('mermaid', () => ({
    default: {
        initialize: vitest_1.vi.fn(),
        render: vitest_1.vi.fn().mockResolvedValue({ svg: '<svg data-testid="mock-mermaid"></svg>' }),
    },
}));
// Provide a global mock for vscode before modules are evaluated
window.vscode = {
    postMessage: vitest_1.vi.fn()
};
//# sourceMappingURL=vitest.setup.js.map