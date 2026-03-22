import fs from 'fs';
import path from 'path';

const DOCS_DIR = path.resolve(__dirname, '../../../../docs');
const ENV_FILE = path.resolve(__dirname, '../../../../packages/cloudflare-worker/.dev.vars');

function getApiKey() {
  const envContent = fs.readFileSync(ENV_FILE, 'utf-8');
  for (const line of envContent.split('\n')) {
    if (line.startsWith('GEMINI_API_KEY=')) {
      return line.split('=')[1].replace(/"/g, '').trim();
    }
  }
  throw new Error('GEMINI_API_KEY not found in .dev.vars');
}

async function getEmbedding(text: string, apiKey: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text }] }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini Embedding Error: ${await response.text()}`);
  }

  const data = await response.json() as any;
  return data.embedding.values;
}

function chunkText(text: string, maxLen = 1500) {
  const chunks: string[] = [];
  let currentChunk = '';
  const blocks = text.split(/(?=\n## |\n### )/); // Split on AT LEAST H2 boundaries

  for (const block of blocks) {
    if ((currentChunk.length + block.length) > maxLen && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = block;
    } else {
      currentChunk += '\n' + block;
    }
  }
  if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
  return chunks;
}

async function main() {
  const apiKey = getApiKey();
  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md'));
  
  const ndjsonLines: string[] = [];

  for (const file of files) {
    console.log(`Processing ${file}...`);
    const content = fs.readFileSync(path.join(DOCS_DIR, file), 'utf-8');
    const chunks = chunkText(content);

    for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        if (!chunkText.trim()) continue;

        const vector = await getEmbedding(chunkText, apiKey);
        
        const id = `${file.replace('.md', '')}-${i}`;
        ndjsonLines.push(JSON.stringify({
            id,
            values: vector.slice(0, 1536),
            metadata: {
                file,
                content: chunkText
            }
        }));
    }
  }

  const outFile = path.resolve(__dirname, 'vectorize-docs.ndjson');
  fs.writeFileSync(outFile, ndjsonLines.join('\n'));
  console.log(`\nSuccessfully wrote ${ndjsonLines.length} vectors to ${outFile}`);
  console.log(`Run: npx wrangler vectorize insert cr-docs-index --file=../../../core/src/scripts/vectorize-docs.ndjson`);
}

main().catch(console.error);
