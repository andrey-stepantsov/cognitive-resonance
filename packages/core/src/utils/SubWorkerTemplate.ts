export function generateSubWorker(rawFnText: string): string {
    return `// Auto-generated Cloudflare Sub-Worker via Cognitive Resonance
export default {
    async fetch(request: Request, env: any, ctx: any): Promise<Response> {
        try {
            ${rawFnText}
        } catch (err: any) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500 });
        }
    }
};
`;
}
