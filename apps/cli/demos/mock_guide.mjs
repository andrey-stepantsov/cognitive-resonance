import { setTimeout } from 'timers/promises';

async function type(text) {
    for (const char of text) {
        process.stdout.write(char);
        await setTimeout(40);
    }
    process.stdout.write('\n');
}

export async function runGuide() {
    process.stdout.write('\x1b[35mcr@user> \x1b[0m');
    await setTimeout(1000);
    await type('@Guide How does the Dynamic Memory Escalation architecture work in this project?');
    
    process.stdout.write('Thinking (@guide)...\n');
    await setTimeout(1000);
    process.stdout.write('\x1b[36m[Vectorize] Searching semantic embeddings for "Dynamic Memory Escalation"...\x1b[0m\n');
    await setTimeout(2000);
    
    console.log(`\n🤖 [@Guide]`);
    console.log(`**Dynamic Memory Escalation** is a core architectural pattern used to manage token limits during long interactions.`);
    console.log(`\nHere is how it works:`);
    console.log(`1. **Sliding Window:** Initially, the system maintains a sliding window of the most recent \`events\`.`);
    console.log(`2. **Semantic Compilation:** Once the \`estimated_tokens\` threshold (e.g., 6,000 tokens) is reached, the system pauses standard processing.`);
    console.log(`3. **Knowledge Graph:** The entire conversation history is fed into an LLM with instructions to extract a semantic knowledge graph.`);
    console.log(`4. **Deep Mode:** The session is flagged with \`has_graph = 1\`, and subsequent prompts inject this compressed State of the World instead of the raw history.`);
    console.log(`\nThis allows Cognitive Resonance to maintain infinite context bounds without accumulating enormous API costs!`);
    console.log(`\n\x1b[90m[Dissonance: 0/100]\x1b[0m`);
    
    process.stdout.write('\n\x1b[35mcr@user> \x1b[0m');
    await setTimeout(2000);
}

runGuide();
