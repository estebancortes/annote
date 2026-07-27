import crypto from "node:crypto";
import express from "express";

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function originAllowed(project, origin) {
  return !origin || project.allowedOrigins.includes(origin);
}

function projectInput(body) {
  const id = String(body?.id || "").trim().toLowerCase();
  const name = String(body?.name || "").trim();
  const reviewCode = String(body?.reviewCode || "");
  const candidateOrigins = Array.isArray(body?.allowedOrigins) ? body.allowedOrigins : [];
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(id)) return { error: "Project IDs use lowercase letters, numbers, and hyphens." };
  if (name.length < 2 || name.length > 120) return { error: "Project names need between 2 and 120 characters." };
  if (reviewCode.length < 8 || reviewCode.length > 120) return { error: "Review codes need between 8 and 120 characters." };

  const allowedOrigins = [...new Set(candidateOrigins.map((origin) => String(origin).trim()).filter(Boolean))];
  if (!allowedOrigins.length) return { error: "Add at least one client site origin." };
  for (const origin of allowedOrigins) {
    try {
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) throw new Error();
    } catch {
      return { error: `Use a full origin such as https://preview.example.com. Invalid origin: ${origin}` };
    }
  }
  return { project: { id, name, reviewCodeHash: hash(reviewCode), allowedOrigins, createdAt: new Date().toISOString() } };
}

function projectUpdateInput(body, project) {
  const name = String(body?.name || "").trim();
  const reviewCode = String(body?.reviewCode || "");
  const candidateOrigins = Array.isArray(body?.allowedOrigins) ? body.allowedOrigins : [];
  if (name.length < 2 || name.length > 120) return { error: "Project names need between 2 and 120 characters." };
  if (reviewCode && (reviewCode.length < 8 || reviewCode.length > 120)) return { error: "New review codes need between 8 and 120 characters." };

  const allowedOrigins = [...new Set(candidateOrigins.map((origin) => String(origin).trim()).filter(Boolean))];
  if (!allowedOrigins.length) return { error: "Add at least one client site origin." };
  for (const origin of allowedOrigins) {
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) throw new Error();
    } catch {
      return { error: `Use a full origin such as https://preview.example.com. Invalid origin: ${origin}` };
    }
  }
  return { project: { ...project, name, allowedOrigins, ...(reviewCode ? { reviewCodeHash: hash(reviewCode) } : {}) } };
}

export function createApiApp({ store, adminKey }) {
  const app = express();
  app.use(express.json({ limit: "100kb" }));

  app.use("/api", async (request, response, next) => {
    try {
      const origin = request.get("origin");
      const reviewId = request.params.reviewId || request.path.split("/")[2];
      const project = reviewId ? await store.findProject(reviewId) : undefined;
      const knownLocalOrigin = origin && ["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:8787", "http://localhost:8787"].includes(origin);
      if (origin && ((project && originAllowed(project, origin)) || (!project && knownLocalOrigin))) {
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Vary", "Origin");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Annote-Admin-Key");
        response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
      }
      if (request.method === "OPTIONS") return response.status(204).end();
      next();
    } catch (error) {
      next(error);
    }
  });

  function requireAdmin(request, response, next) {
    if (request.get("x-annote-admin-key") !== adminKey) {
      response.status(401).json({ error: "Dashboard key required." });
      return;
    }
    next();
  }

  app.get("/api/projects", requireAdmin, async (_request, response) => {
    const projects = await store.listProjects();
    response.json(projects.map(({ reviewCodeHash, ...project }) => project));
  });

  app.post("/api/projects", requireAdmin, async (request, response) => {
    const result = projectInput(request.body);
    if (result.error) return response.status(400).json({ error: result.error });
    if (await store.findProject(result.project.id)) return response.status(409).json({ error: "That project ID already exists." });
    const project = await store.createProject(result.project);
    const { reviewCodeHash, ...safeProject } = project;
    response.status(201).json(safeProject);
  });

  app.patch("/api/projects/:projectId", requireAdmin, async (request, response) => {
    const currentProject = await store.findProject(request.params.projectId);
    if (!currentProject) return response.status(404).json({ error: "Project not found." });
    const result = projectUpdateInput(request.body, currentProject);
    if (result.error) return response.status(400).json({ error: result.error });
    const project = await store.updateProject(result.project);
    const { reviewCodeHash, ...safeProject } = project;
    response.json(safeProject);
  });

  app.post("/api/reviews/:reviewId/unlock", async (request, response) => {
    const project = await store.findProject(request.params.reviewId);
    const origin = request.get("origin");
    if (!project || !originAllowed(project, origin)) return response.status(404).json({ error: "Review not found." });
    const codeHash = hash(String(request.body?.code || ""));
    if (!crypto.timingSafeEqual(Buffer.from(codeHash), Buffer.from(project.reviewCodeHash))) {
      return response.status(401).json({ error: "That review code is not right." });
    }
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + 1000 * 60 * 60 * 12;
    await store.createSession(token, { projectId: project.id, expiresAt }, 60 * 60 * 12);
    response.json({ token, expiresAt: new Date(expiresAt).toISOString() });
  });

  async function sessionFor(request, projectId) {
    const token = request.get("authorization")?.replace("Bearer ", "");
    const session = token ? await store.findSession(token) : undefined;
    if (!session || session.projectId !== projectId || session.expiresAt < Date.now()) return null;
    return session;
  }

  app.get("/api/reviews/:reviewId/annotations", async (request, response) => {
    const project = await store.findProject(request.params.reviewId);
    if (!project || !(await sessionFor(request, project.id))) return response.status(401).json({ error: "Review session required." });
    response.json(await store.listAnnotations(project.id, true));
  });

  app.post("/api/reviews/:reviewId/annotations", async (request, response) => {
    const project = await store.findProject(request.params.reviewId);
    if (!project || !(await sessionFor(request, request.params.reviewId))) return response.status(401).json({ error: "Review session required." });
    const body = request.body || {};
    if (typeof body.comment !== "string" || body.comment.trim().length < 2 || body.comment.length > 1200) {
      return response.status(400).json({ error: "Comments need between 2 and 1200 characters." });
    }
    if (!body.anchor?.selector || !body.page?.url) return response.status(400).json({ error: "An annotation target is required." });
    const annotation = {
      id: crypto.randomUUID(),
      projectId: project.id,
      comment: body.comment.trim(),
      anchor: body.anchor,
      page: body.page,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    await store.createAnnotation(annotation);
    response.status(201).json(annotation);
  });

  app.get("/api/projects/:projectId/annotations", requireAdmin, async (request, response) => {
    response.json(await store.listAnnotations(request.params.projectId));
  });

  app.patch("/api/annotations/:annotationId", requireAdmin, async (request, response) => {
    if (!["open", "resolved"].includes(request.body?.status)) return response.status(400).json({ error: "Unknown status." });
    const annotation = await store.updateAnnotation(request.params.annotationId, request.body.status, new Date().toISOString());
    if (!annotation) return response.status(404).json({ error: "Annotation not found." });
    response.json(annotation);
  });

  app.use((error, request, response, _next) => {
    console.error(error);
    const isDashboardRequest = request.get("x-annote-admin-key") === adminKey;
    response.status(500).json({
      error: isDashboardRequest && error instanceof Error ? error.message : "Annote could not process that request.",
    });
  });

  return app;
}
