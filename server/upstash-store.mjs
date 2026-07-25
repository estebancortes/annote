import { Redis } from "@upstash/redis";

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
  const redis = Redis.fromEnv();

  async function annotationIds(projectId, newestFirst) {
    return redis.zrange(annotationIndexKey(projectId), 0, -1, newestFirst ? { rev: true } : undefined);
  }

  async function annotationsFor(projectId, newestFirst) {
    const ids = await annotationIds(projectId, newestFirst);
    const entries = await Promise.all(ids.map((id) => redis.get(annotationKey(id))));
    return entries.map(parse).filter(Boolean);
  }

  return {
    async findProject(id) {
      return parse(await redis.get(projectKey(id)));
    },
    async listProjects() {
      const ids = await redis.zrange(`${prefix}projects`, 0, -1, { rev: true });
      const entries = await Promise.all(ids.map((id) => redis.get(projectKey(id))));
      return Promise.all(entries.map(async (entry) => {
        const project = parse(entry);
        if (!project) return null;
        const annotations = await annotationsFor(project.id, false);
        return { ...project, annotationCount: annotations.filter((annotation) => annotation.status === "open").length };
      })).then((projects) => projects.filter(Boolean));
    },
    async createProject(project) {
      await Promise.all([
        redis.set(projectKey(project.id), JSON.stringify(project)),
        redis.zadd(`${prefix}projects`, { score: new Date(project.createdAt).getTime(), member: project.id }),
      ]);
      return project;
    },
    async listAnnotations(projectId, openOnly = false) {
      const annotations = await annotationsFor(projectId, !openOnly);
      return openOnly ? annotations.filter((annotation) => annotation.status === "open") : annotations;
    },
    async createAnnotation(annotation) {
      await Promise.all([
        redis.set(annotationKey(annotation.id), JSON.stringify(annotation)),
        redis.zadd(annotationIndexKey(annotation.projectId), { score: new Date(annotation.createdAt).getTime(), member: annotation.id }),
      ]);
      return annotation;
    },
    async updateAnnotation(id, status, updatedAt) {
      const annotation = parse(await redis.get(annotationKey(id)));
      if (!annotation) return null;
      const updated = { ...annotation, status, updatedAt };
      await redis.set(annotationKey(id), JSON.stringify(updated));
      return updated;
    },
    async createSession(token, session, ttlSeconds) {
      await redis.set(`${prefix}session:${token}`, JSON.stringify(session), { ex: ttlSeconds });
    },
    async findSession(token) {
      return parse(await redis.get(`${prefix}session:${token}`));
    },
  };
}
