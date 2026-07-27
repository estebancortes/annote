import { createApiApp } from "../server/app.mjs";
import { createUpstashStore } from "../server/upstash-store.mjs";

let app;

function apiApp() {
  if (app) return app;
  const adminKey = process.env.ANNOTE_ADMIN_KEY;
  if (!adminKey) throw new Error("ANNOTE_ADMIN_KEY is not configured for the Production environment.");
  app = createApiApp({ store: createUpstashStore(), adminKey });
  return app;
}

export default function handler(request, response) {
  try {
    return apiApp()(request, response);
  } catch (error) {
    console.error(error);
    response.statusCode = 500;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Annote API configuration failed." }));
  }
}
