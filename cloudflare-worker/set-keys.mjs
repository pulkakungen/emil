/* Skapar nya VAPID-nycklar och laddar upp dem till Cloudflare direkt,
   utan att du behöver kopiera något. Kör med: npm run keys */

import { webcrypto } from "node:crypto";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// wrangler läser hemligheten från stdin när den inte körs i ett tangentbord,
// så vi matar in värdet själva i stället för att du ska klistra in det.
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

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const svar = await rl.question("Vilken e-postadress ska stå som avsändare? (t.ex. du@exempel.se) ");
rl.close();
const epost = svar.trim().replace(/^mailto:/, "");
if (!epost.includes("@")) {
  console.error("Det där såg inte ut som en e-postadress. Kör om kommandot.");
  process.exit(1);
}

const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicKey = b64url(await webcrypto.subtle.exportKey("raw", pair.publicKey));
const jwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);

console.log("\nLaddar upp nycklarna till Cloudflare...\n");
await putSecret("VAPID_PUBLIC_KEY", publicKey);
await putSecret("VAPID_PRIVATE_KEY", jwk.d);
await putSecret("VAPID_SUBJECT", "mailto:" + epost);

console.log("\nKlart! Alla tre hemligheter är satta.");
console.log("Publik nyckel (ofarlig att visa):", publicKey);
console.log("\nKör `npm run deploy` om du inte redan gjort det, och slå sedan");
console.log("av och på klockan i appen så att telefonen prenumererar med de nya nycklarna.\n");
