import crypto from "node:crypto";

const code = process.argv[2];

if (!code) {
  console.error("Usage: npm run hash-code -- \"your-review-code\"");
  process.exit(1);
}

console.log(crypto.createHash("sha256").update(code).digest("hex"));
