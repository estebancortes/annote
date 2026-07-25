import { createApiApp } from "../server/app.mjs";
import { createUpstashStore } from "../server/upstash-store.mjs";

const adminKey = process.env.ANNOTE_ADMIN_KEY;

if (!adminKey) {
  throw new Error("ANNOTE_ADMIN_KEY must be configured for the Annote API.");
}

export default createApiApp({ store: createUpstashStore(), adminKey });
