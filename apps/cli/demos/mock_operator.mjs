import { setTimeout } from 'timers/promises';

async function type(text) {
    for (const char of text) {
        process.stdout.write(char);
        await setTimeout(40);
    }
    process.stdout.write('\n');
}

export async function runOperator() {
    process.stdout.write('\x1b[35mcr@admin> \x1b[0m');
    await setTimeout(1000);
    await type('@Operator We are deploying a new frontend update. Please flush the edge cache.');
    
    process.stdout.write('Thinking (@operator)...\n');
    await setTimeout(2000);
    
    console.log(`\n🤖 [@Operator]`);
    console.log(`Understood. Deploying Master Admin privileges...`);
    console.log(`\x1b[36m[System: Executed flushEdgeCache successfully.]\x1b[0m`);
    console.log(`\nThe edge KV and memory caches have been flushed globally. The new frontend assets should propagate within 60 seconds.`);
    console.log(`\n\x1b[90m[Dissonance: 0/100]\x1b[0m`);
    
    process.stdout.write('\n\x1b[35mcr@admin> \x1b[0m');
    await setTimeout(2000);
}

runOperator();
