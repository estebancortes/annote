const prefix = "annote:v1:";

function projectKey(id) {
  return `${prefix}project:${id}`;
}

function annotationKey(id) {
  return `${prefix}annotation:${id}`;
}

function annotationIndexKey(projectId) {
  return `${prefix}project:${projectId}:annotations`;
}

function parse(value) {
  if (!value) return null;
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

export function createUpstashStore() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("Upstash Redis is not configured. Connect the Upstash integration and ensure its Redis variables are available in the Production environment.");
  }

  async function command(...args) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.error) {
      const detail = body?.error || body?.message || `HTTP ${response.status}`;
      throw new Error(`Upstash Redis request failed: ${detail}`);
    }
    return body?.result;
  }

  async function annotationIds(projectId, newestFirst) {
    const ids = await command("ZRANGE", annotationIndexKey(projectId), 0, -1, ...(newestFirst ? ["REV"] : []));
    return Array.isArray(ids) ? ids : [];
  }

  async function annotationsFor(projectId, newestFirst) {
    const ids = await annotationIds(projectId, newestFirst);
    const entries = await Promise.all(ids.map((id) => command("GET", annotationKey(id))));
    return entries.map(parse).filter(Boolean);
  }

  return {
    async findProject(id) {
      return parse(await command("GET", projectKey(id)));
    },
    async listProjects() {
      const ids = await command("ZRANGE", `${prefix}projects`, 0, -1, "REV");
      const entries = await Promise.all((Array.isArray(ids) ? ids : []).map((id) => command("GET", projectKey(id))));
      return Promise.all(entries.map(async (entry) => {
        const project = parse(entry);
        if (!project) return null;
        const annotations = await annotationsFor(project.id, false);
        return { ...project, annotationCount: annotations.filter((annotation) => annotation.status === "open").length };
      })).then((projects) => projects.filter(Boolean));
    },
    async createProject(project) {
      await Promise.all([
        command("SET", projectKey(project.id), JSON.stringify(project)),
        command("ZADD", `${prefix}projects`, new Date(project.createdAt).getTime(), project.id),
      ]);
      return project;
    },
    async updateProject(project) {
      await command("SET", projectKey(project.id), JSON.stringify(project));
      return project;
    },
    async listAnnotations(projectId, openOnly = false) {
      const annotations = await annotationsFor(projectId, !openOnly);
      return openOnly ? annotations.filter((annotation) => annotation.status === "open") : annotations;
    },
    async createAnnotation(annotation) {
      await Promise.all([
        command("SET", annotationKey(annotation.id), JSON.stringify(annotation)),
        command("ZADD", annotationIndexKey(annotation.projectId), new Date(annotation.createdAt).getTime(), annotation.id),
      ]);
      return annotation;
    },
    async updateAnnotation(id, status, updatedAt) {
      const annotation = parse(await command("GET", annotationKey(id)));
      if (!annotation) return null;
      const updated = { ...annotation, status, updatedAt };
      await command("SET", annotationKey(id), JSON.stringify(updated));
      return updated;
    },
    async updateAnnotationComment(id, comment, updatedAt) {
      const annotation = parse(await command("GET", annotationKey(id)));
      if (!annotation) return null;
      const updated = { ...annotation, comment, updatedAt };
      await command("SET", annotationKey(id), JSON.stringify(updated));
      return updated;
    },
    async deleteAnnotation(id) {
      const annotation = parse(await command("GET", annotationKey(id)));
      if (!annotation) return false;
      await Promise.all([
        command("DEL", annotationKey(id)),
        command("ZREM", annotationIndexKey(annotation.projectId), id),
      ]);
      return true;
    },
    async createSession(token, session, ttlSeconds) {
      await command("SET", `${prefix}session:${token}`, JSON.stringify(session), "EX", ttlSeconds);
    },
    async findSession(token) {
      return parse(await command("GET", `${prefix}session:${token}`));
    },
  };
}
