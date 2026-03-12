"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs = require("fs");
const path = require("path");
const os = require("os");
const diagnostics_1 = require("../diagnostics");
// Use a temp directory for each test run
let tmpDir;
(0, vitest_1.beforeEach)(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-diag-test-"));
});
(0, vitest_1.afterEach)(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});
// ─── appendDiagnostic ────────────────────────────────────────────────
(0, vitest_1.describe)("appendDiagnostic", () => {
    (0, vitest_1.it)("creates the log file and writes an NDJSON entry", () => {
        (0, diagnostics_1.appendDiagnostic)(tmpDir, {
            level: "error",
            context: "test",
            message: "something broke",
        });
        const content = fs.readFileSync((0, diagnostics_1.getLogPath)(tmpDir), "utf8");
        const entry = JSON.parse(content.trim());
        (0, vitest_1.expect)(entry.level).toBe("error");
        (0, vitest_1.expect)(entry.context).toBe("test");
        (0, vitest_1.expect)(entry.message).toBe("something broke");
        (0, vitest_1.expect)(entry.ts).toBeDefined();
    });
    (0, vitest_1.it)("appends multiple entries on separate lines", () => {
        (0, diagnostics_1.appendDiagnostic)(tmpDir, { level: "error", context: "a", message: "first" });
        (0, diagnostics_1.appendDiagnostic)(tmpDir, { level: "warn", context: "b", message: "second" });
        const lines = fs.readFileSync((0, diagnostics_1.getLogPath)(tmpDir), "utf8").trim().split("\n");
        (0, vitest_1.expect)(lines).toHaveLength(2);
        (0, vitest_1.expect)(JSON.parse(lines[0]).message).toBe("first");
        (0, vitest_1.expect)(JSON.parse(lines[1]).message).toBe("second");
    });
    (0, vitest_1.it)("never throws even if the path is invalid", () => {
        // /dev/null/impossible is not a valid directory on any OS
        (0, vitest_1.expect)(() => {
            (0, diagnostics_1.appendDiagnostic)("/dev/null/impossible/path", {
                level: "error",
                context: "test",
                message: "should not throw",
            });
        }).not.toThrow();
    });
});
// ─── readDiagnosticLog ───────────────────────────────────────────────
(0, vitest_1.describe)("readDiagnosticLog", () => {
    (0, vitest_1.it)("returns empty string when no log exists", () => {
        (0, vitest_1.expect)((0, diagnostics_1.readDiagnosticLog)(tmpDir)).toBe("");
    });
    (0, vitest_1.it)("returns the raw log content", () => {
        (0, diagnostics_1.appendDiagnostic)(tmpDir, { level: "info", context: "test", message: "hi" });
        const log = (0, diagnostics_1.readDiagnosticLog)(tmpDir);
        (0, vitest_1.expect)(log).toContain('"message":"hi"');
    });
});
// ─── formatDiagnosticReport ──────────────────────────────────────────
(0, vitest_1.describe)("formatDiagnosticReport", () => {
    (0, vitest_1.it)("returns a 'no entries' message for empty input", () => {
        (0, vitest_1.expect)((0, diagnostics_1.formatDiagnosticReport)("")).toBe("No diagnostic entries recorded.");
        (0, vitest_1.expect)((0, diagnostics_1.formatDiagnosticReport)("  \n  ")).toBe("No diagnostic entries recorded.");
    });
    (0, vitest_1.it)("formats NDJSON into a readable markdown report", () => {
        const ndjson = [
            JSON.stringify({ ts: "2026-01-01T00:00:00Z", level: "error", context: "api", message: "bad key" }),
            JSON.stringify({ ts: "2026-01-01T00:01:00Z", level: "warn", context: "io", message: "disk full", detail: "ENOSPC" }),
        ].join("\n");
        const report = (0, diagnostics_1.formatDiagnosticReport)(ndjson);
        (0, vitest_1.expect)(report).toContain("# Cognitive Resonance Diagnostics Report");
        (0, vitest_1.expect)(report).toContain("Entries: 2");
        (0, vitest_1.expect)(report).toContain("[ERROR]");
        (0, vitest_1.expect)(report).toContain("bad key");
        (0, vitest_1.expect)(report).toContain("[WARN]");
        (0, vitest_1.expect)(report).toContain("ENOSPC");
    });
    (0, vitest_1.it)("handles malformed JSON lines gracefully", () => {
        const ndjson = "not valid json\n" + JSON.stringify({ ts: "t", level: "info", context: "x", message: "ok" });
        const report = (0, diagnostics_1.formatDiagnosticReport)(ndjson);
        (0, vitest_1.expect)(report).toContain("[RAW]");
        (0, vitest_1.expect)(report).toContain("not valid json");
        (0, vitest_1.expect)(report).toContain("[INFO]");
    });
});
//# sourceMappingURL=diagnostics.test.js.map