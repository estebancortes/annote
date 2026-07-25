import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApiApp } from "./server/app.mjs";
import { createStore } from "./server/store.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8787);
const adminKey = process.env.ANNOTE_ADMIN_KEY || "annote-local";
const databasePath = process.env.ANNOTE_DATABASE_PATH || path.join(root, "data", "annote.db");
const store = createStore({ databasePath, legacyDataPath: path.join(root, "data", "annote.json") });
const app = express();

app.use(createApiApp({ store, adminKey }));
app.use(express.static(path.join(root, "dist")));
app.get("*splat", (_request, response) => response.sendFile(path.join(root, "dist", "index.html")));

app.listen(port, () => {
  console.log(`Annote is listening on http://127.0.0.1:${port}`);
  console.log(`Database: ${databasePath}`);
  console.log(`Dashboard key: ${process.env.ANNOTE_ADMIN_KEY ? "from ANNOTE_ADMIN_KEY" : "annote-local (change before deploying)"}`);
});
