/* Skapar ett nytt VAPID-nyckelpar. Kör med: node generate-vapid.mjs
   Publik nyckel klistras in i app.js, privat nyckel läggs som hemlighet
   i Cloudflare och ska aldrig checkas in i git. */

import { webcrypto } from "node:crypto";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicKey = b64url(await webcrypto.subtle.exportKey("raw", pair.publicKey));
const jwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);

console.log("\nVAPID_PUBLIC_KEY  (klistra in i app.js och som hemlighet i Cloudflare):");
console.log(publicKey);
console.log("\nVAPID_PRIVATE_KEY (bara som hemlighet i Cloudflare, dela aldrig):");
console.log(jwk.d);
console.log("\nSätt dem med:");
console.log("  npx wrangler secret put VAPID_PUBLIC_KEY");
console.log("  npx wrangler secret put VAPID_PRIVATE_KEY");
console.log('  npx wrangler secret put VAPID_SUBJECT      (t.ex. "mailto:din@epost.se")\n');
