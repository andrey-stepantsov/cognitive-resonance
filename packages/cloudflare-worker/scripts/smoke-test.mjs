import { parseArgs } from 'util';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    url: { type: 'string', short: 'u' }
  }
});

const prodUrl = values.url;

if (!prodUrl) {
  console.error("❌ Usage: node smoke-test.mjs --url <prod-url>");
  process.exit(1);
}

const healthEndpoint = `${prodUrl.replace(/\/$/, '')}/api/system/health`;

console.log(`\n💨 Starting Smoke Test against ${healthEndpoint}...`);

try {
  const response = await fetch(healthEndpoint);
  
  if (!response.ok) {
    const text = await response.text();
    console.error(`❌ HTTP Error! Status: ${response.status}\nResponse: ${text}`);
    process.exit(1);
  }

  const data = await response.json();
  
  if (data.status === 'ok') {
    console.log("✅ Smoke Test Passed! System is healthy.");
    console.log("Edge Status:", JSON.stringify(data.edge, null, 2));
    process.exit(0);
  } else {
    console.error("❌ Smoke Test Failed! Root status is not 'ok'. JSON:");
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

} catch (error) {
  console.error("❌ Network or Execution Error during Smoke Test:", error);
  process.exit(1);
}
