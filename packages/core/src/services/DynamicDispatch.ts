import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export class DynamicDispatch {
    private accountId: string;
    private apiToken: string;

    constructor() {
        this.accountId = process.env.CF_ACCOUNT_ID || '';
        this.apiToken = process.env.CF_API_TOKEN || '';
        
        if (!this.accountId || !this.apiToken) {
            throw new Error('CF_ACCOUNT_ID and CF_API_TOKEN must be set in the environment for Dynamic Dispatch.');
        }
    }

    public async deploy(workerName: string, sourceCode: string, workspaceDir: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const dispatchDir = path.join(workspaceDir, '.cr', 'dispatch', workerName);
            fs.mkdirSync(dispatchDir, { recursive: true });

            const indexPath = path.join(dispatchDir, 'index.ts');
            fs.writeFileSync(indexPath, sourceCode, 'utf8');

            const tomlPath = path.join(dispatchDir, 'wrangler.toml');
            const tomlContent = `name = "${workerName}"\nmain = "./index.ts"\ncompatibility_date = "2024-03-20"\n`;
            fs.writeFileSync(tomlPath, tomlContent, 'utf8');
            
            const env = { 
                ...process.env, 
                CLOUDFLARE_ACCOUNT_ID: this.accountId, 
                CLOUDFLARE_API_TOKEN: this.apiToken 
            };

            const proc = exec('npx wrangler deploy', { cwd: dispatchDir, env }, (err, stdout, stderr) => {
                if (err) {
                    console.error(`[Dynamic Dispatch] Deployment failed:`, stderr || stdout);
                    return reject(new Error(stderr || err.message));
                }
                
                // Extract deployed URL
                const urlMatch = stdout.match(/https:\/\/[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+\.workers\.dev/);
                const url = urlMatch ? urlMatch[0] : `https://${workerName}.subdomain.workers.dev`;
                
                resolve(url);
            });
        });
    }

    public async teardown(workerName: string): Promise<void> {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/workers/scripts/${workerName}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${this.apiToken}`
            }
        });
        
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Cloudflare deletion failed: ${body}`);
        }
    }
}
