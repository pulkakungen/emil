/* Sätter hemligheterna för dagsloggen utan att du behöver klistra in dem
   en och en. Kör med:

     npm run sheet -- "https://script.google.com/macros/s/.../exec" "din-token"

   Utan argument frågar den i stället. */

import { spawn } from "node:child_process";
import readline from "node:readline/promises";

function putSecret(name, value) {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["wrangler", "secret", "put", name], {
      shell: true,
      stdio: ["pipe", "inherit", "inherit"]
    });
    proc.stdin.write(value + "\n");
    proc.stdin.end();
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${name} misslyckades (kod ${code})`))));
    proc.on("error", reject);
  });
}

let [url, token] = process.argv.slice(2);
if (!url || !token) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (!url) url = await rl.question("Webbadress till Apps Script (slutar på /exec): ");
  if (!token) token = await rl.question("Token (samma som i skriptet): ");
  rl.close();
}

url = String(url).trim();
token = String(token).trim();

if (!url.startsWith("https://") || !url.endsWith("/exec")) {
  console.error("Adressen ska börja med https:// och sluta med /exec. Kör om kommandot.");
  process.exit(1);
}
if (!token) {
  console.error("Ingen token angiven. Kör om kommandot.");
  process.exit(1);
}

console.log("\nLaddar upp hemligheterna...\n");
await putSecret("SHEET_URL", url);
await putSecret("SHEET_TOKEN", token);
console.log("\nKlart. Kör `npm run deploy` så börjar appen skriva dagens rad 23.58.\n");
