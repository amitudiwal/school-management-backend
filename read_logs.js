const fs = require('fs');
const readline = require('readline');

async function run() {
  const fileStream = fs.createReadStream('C:/Users/amitu/.gemini/antigravity-ide/brain/bda357ca-b60d-44b6-84db-26b35f9d1681/.system_generated/logs/transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('Reading logs...');
  for await (const line of rl) {
    if (line.includes('console') || line.includes('error') || line.includes('Exception') || line.includes('TypeError')) {
      // Print first 200 chars of matching line to avoid overflow
      console.log(line.substring(0, 300));
    }
  }
}

run().catch(console.error);
