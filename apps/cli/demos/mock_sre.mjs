import { setTimeout } from 'timers/promises';

async function type(text) {
    for (const char of text) {
        process.stdout.write(char);
        await setTimeout(40);
    }
    process.stdout.write('\n');
}

export async function runSre() {
    process.stdout.write('\x1b[35mcr@admin> \x1b[0m');
    await setTimeout(1000);
    await type('@SRE Run an anomaly scan on the bot logs for the last 24 hours.');
    
    process.stdout.write('Thinking (@sre)...\n');
    await setTimeout(2000);
    
    console.log(`\n🤖 [@SRE]`);
    console.log(`I have performed an anomaly scan on the edge \`bot_logs\` table for the trailing 24 hours.`);
    console.log(`\n**Flagged Abuse Patterns:**`);
    console.log(`- **192.168.1.45**: 142 instances of 429 Too Many Requests`);
    console.log(`- **10.0.0.5**: 87 instances of 401 Unauthorized`);
    console.log(`\nWould you like me to revoke their access identities?`);
    console.log(`\n\x1b[90m[Dissonance: 0/100]\x1b[0m`);
    
    process.stdout.write('\n\x1b[35mcr@admin> \x1b[0m');
    await setTimeout(1500);
    await type('@SRE What is our projected token spend for the month?');
    
    process.stdout.write('Thinking (@sre)...\n');
    await setTimeout(2500);

    console.log(`\n🤖 [@SRE]`);
    console.log(`Based on the \`estimated_tokens\` telemetry over the past 30 days, we have consumed **4,520,100 tokens**.`);
    console.log(`At current Gemini API rates, your forecasted monthly cost is approximately **$0.34 USD**.`);
    console.log(`\n\x1b[90m[Dissonance: 0/100]\x1b[0m`);

    process.stdout.write('\n\x1b[35mcr@admin> \x1b[0m');
    await setTimeout(2000);
}

runSre();
