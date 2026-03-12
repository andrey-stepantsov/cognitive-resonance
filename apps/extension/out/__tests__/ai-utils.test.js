"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const ai_utils_1 = require("../ai-utils");
// ─── parseModelResponse ──────────────────────────────────────────────
(0, vitest_1.describe)("parseModelResponse", () => {
    (0, vitest_1.it)("parses valid JSON and returns the object as-is", () => {
        const input = JSON.stringify({
            reply: "Hello!",
            dissonanceScore: 42,
            dissonanceReason: "Moderate uncertainty",
            semanticNodes: [{ id: "a" }],
            semanticEdges: [],
        });
        const result = (0, ai_utils_1.parseModelResponse)(input);
        (0, vitest_1.expect)(result.reply).toBe("Hello!");
        (0, vitest_1.expect)(result.dissonanceScore).toBe(42);
        (0, vitest_1.expect)(result.semanticNodes).toHaveLength(1);
    });
    (0, vitest_1.it)("returns synthesized fallback for malformed JSON (raw text)", () => {
        const rawText = "I cannot produce JSON output at this time.";
        const result = (0, ai_utils_1.parseModelResponse)(rawText);
        (0, vitest_1.expect)(result.dissonanceScore).toBe(100);
        (0, vitest_1.expect)(result.dissonanceReason).toContain("Schema mismatch");
        (0, vitest_1.expect)(result.reply).toContain("Raw Output:");
        (0, vitest_1.expect)(result.reply).toContain(rawText);
        (0, vitest_1.expect)(result.semanticNodes).toEqual([]);
        (0, vitest_1.expect)(result.semanticEdges).toEqual([]);
    });
    (0, vitest_1.it)("handles valid JSON with extra whitespace/newlines", () => {
        const input = `
      {
        "reply": "Spaced out",
        "dissonanceScore": 10,
        "dissonanceReason": "Low",
        "semanticNodes": [],
        "semanticEdges": []
      }
    `;
        const result = (0, ai_utils_1.parseModelResponse)(input);
        (0, vitest_1.expect)(result.reply).toBe("Spaced out");
        (0, vitest_1.expect)(result.dissonanceScore).toBe(10);
    });
    (0, vitest_1.it)("returns synthesized fallback for an empty string", () => {
        const result = (0, ai_utils_1.parseModelResponse)("");
        (0, vitest_1.expect)(result.dissonanceScore).toBe(100);
        (0, vitest_1.expect)(result.reply).toContain("Raw Output:");
    });
});
// ─── filterModelList ─────────────────────────────────────────────────
(0, vitest_1.describe)("filterModelList", () => {
    const mockModels = [
        // Should be INCLUDED
        { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", description: "The best." },
        { name: "models/gemini-2.0-flash", displayName: "Gemini 2.0 Flash", description: "Fast." },
        { name: "models/gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro Preview", description: "Preview." },
        // Should be INCLUDED — nano
        { name: "models/gemini-2.0-flash-nano", displayName: "Nano", description: "Tiny." },
        // Should be EXCLUDED — vision
        { name: "models/gemini-pro-vision", displayName: "Vision", description: "Sees things." },
        // Should be EXCLUDED — embedding
        { name: "models/embedding-001", displayName: "Embedding", description: "Embeds." },
        // Should be EXCLUDED — aqa
        { name: "models/aqa", displayName: "AQA", description: "Answers." },
        // Should be EXCLUDED — audio
        { name: "models/gemini-audio-preview", displayName: "Audio", description: "Hears." },
        // Should be EXCLUDED — learn
        { name: "models/gemini-learnlm-1.5-pro-experimental", displayName: "LearnLM", description: "Learns." },
        // Should be EXCLUDED — bison legacy
        { name: "models/text-bison-001", displayName: "Bison", description: "Legacy." },
        // Should be EXCLUDED — gecko legacy
        { name: "models/text-gecko-001", displayName: "Gecko", description: "Legacy." },
        // Should be EXCLUDED — no 'gemini-' in name
        { name: "models/chat-model-001", displayName: "Chat", description: "Generic." },
        // Should be EXCLUDED — missing name entirely
        { displayName: "Phantom", description: "No name." },
    ];
    (0, vitest_1.it)("returns only valid Gemini chat models", () => {
        const result = (0, ai_utils_1.filterModelList)(mockModels);
        const names = result.map((m) => m.name);
        (0, vitest_1.expect)(names).toEqual([
            "models/gemini-2.5-pro",
            "models/gemini-2.0-flash",
            "models/gemini-3.1-pro-preview",
            "models/gemini-2.0-flash-nano",
        ]);
    });
    (0, vitest_1.it)("excludes vision, embedding, aqa, audio, learn, bison, and gecko models", () => {
        const result = (0, ai_utils_1.filterModelList)(mockModels);
        const names = result.map((m) => m.name);
        (0, vitest_1.expect)(names).toContain("models/gemini-2.0-flash-nano");
        (0, vitest_1.expect)(names).not.toContain("models/gemini-pro-vision");
        (0, vitest_1.expect)(names).not.toContain("models/embedding-001");
        (0, vitest_1.expect)(names).not.toContain("models/aqa");
        (0, vitest_1.expect)(names).not.toContain("models/gemini-audio-preview");
        (0, vitest_1.expect)(names).not.toContain("models/gemini-learnlm-1.5-pro-experimental");
        (0, vitest_1.expect)(names).not.toContain("models/text-bison-001");
        (0, vitest_1.expect)(names).not.toContain("models/text-gecko-001");
    });
    (0, vitest_1.it)("falls back to name without 'models/' prefix when displayName is missing", () => {
        const result = (0, ai_utils_1.filterModelList)([
            { name: "models/gemini-2.0-flash" },
        ]);
        (0, vitest_1.expect)(result[0].displayName).toBe("gemini-2.0-flash");
    });
    (0, vitest_1.it)("uses default description when description is missing", () => {
        const result = (0, ai_utils_1.filterModelList)([
            { name: "models/gemini-2.0-flash" },
        ]);
        (0, vitest_1.expect)(result[0].description).toBe("A Google Gemini generative model.");
    });
});
// ─── formatApiError ──────────────────────────────────────────────────
(0, vitest_1.describe)("formatApiError", () => {
    (0, vitest_1.it)("extracts .message from Error objects", () => {
        const err = new Error("API key is invalid");
        (0, vitest_1.expect)((0, ai_utils_1.formatApiError)(err)).toBe("API key is invalid");
    });
    (0, vitest_1.it)("returns string errors as-is", () => {
        (0, vitest_1.expect)((0, ai_utils_1.formatApiError)("Network timeout")).toBe("Network timeout");
    });
    (0, vitest_1.it)("JSON-stringifies plain objects without .message", () => {
        const err = { code: 403, status: "FORBIDDEN" };
        (0, vitest_1.expect)((0, ai_utils_1.formatApiError)(err)).toBe(JSON.stringify(err));
    });
    (0, vitest_1.it)("extracts .message from plain objects that have one", () => {
        const err = { message: "Region blocked", code: 451 };
        (0, vitest_1.expect)((0, ai_utils_1.formatApiError)(err)).toBe("Region blocked");
    });
    (0, vitest_1.it)("returns a meaningful fallback for null", () => {
        (0, vitest_1.expect)((0, ai_utils_1.formatApiError)(null)).toBe("An unknown error occurred.");
    });
    (0, vitest_1.it)("returns a meaningful fallback for undefined", () => {
        (0, vitest_1.expect)((0, ai_utils_1.formatApiError)(undefined)).toBe("An unknown error occurred.");
    });
});
// ─── getMimeType ─────────────────────────────────────────────────────
(0, vitest_1.describe)("getMimeType", () => {
    (0, vitest_1.it)("maps known image extensions", () => {
        (0, vitest_1.expect)((0, ai_utils_1.getMimeType)("photo.png")).toBe("image/png");
        (0, vitest_1.expect)((0, ai_utils_1.getMimeType)("photo.jpg")).toBe("image/jpeg");
        (0, vitest_1.expect)((0, ai_utils_1.getMimeType)("photo.jpeg")).toBe("image/jpeg");
        (0, vitest_1.expect)((0, ai_utils_1.getMimeType)("image.webp")).toBe("image/webp");
        (0, vitest_1.expect)((0, ai_utils_1.getMimeType)("graphic.gif")).toBe("image/gif");
    });
    (0, vitest_1.it)("maps known document extensions", () => {
        (0, vitest_1.expect)((0, ai_utils_1.getMimeType)("file.pdf")).toBe("application/pdf");
        (0, vitest_1.expect)((0, ai_utils_1.getMimeType)("notes.txt")).toBe("text/plain");
        (0, vitest_1.expect)((0, ai_utils_1.getMimeType)("readme.md")).toBe("text/markdown");
        (0, vitest_1.expect)((0, ai_utils_1.getMimeType)("data.csv")).toBe("text/csv");
        (0, vitest_1.expect)((0, ai_utils_1.getMimeType)("config.json")).toBe("application/json");
    });
    (0, vitest_1.it)("is case-insensitive", () => {
        (0, vitest_1.expect)((0, ai_utils_1.getMimeType)("PHOTO.PNG")).toBe("image/png");
        (0, vitest_1.expect)((0, ai_utils_1.getMimeType)("Report.PDF")).toBe("application/pdf");
    });
    (0, vitest_1.it)("handles full paths", () => {
        (0, vitest_1.expect)((0, ai_utils_1.getMimeType)("/Users/someone/images/cat.jpg")).toBe("image/jpeg");
    });
    (0, vitest_1.it)("returns octet-stream for unknown extensions", () => {
        (0, vitest_1.expect)((0, ai_utils_1.getMimeType)("archive.zip")).toBe("application/octet-stream");
        (0, vitest_1.expect)((0, ai_utils_1.getMimeType)("data.parquet")).toBe("application/octet-stream");
    });
    (0, vitest_1.it)("returns octet-stream for files without an extension", () => {
        (0, vitest_1.expect)((0, ai_utils_1.getMimeType)("Makefile")).toBe("application/octet-stream");
    });
});
//# sourceMappingURL=ai-utils.test.js.map