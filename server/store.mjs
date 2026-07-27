import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    reviewCodeHash: row.review_code_hash,
    allowedOrigins: parseJson(row.allowed_origins, []),
    createdAt: row.created_at,
  };
}

function toAnnotation(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    comment: row.comment,
    anchor: parseJson(row.anchor, {}),
    page: parseJson(row.page, {}),
    status: row.status,
    createdAt: row.created_at,
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  };
}

export function createStore({ databasePath, legacyDataPath }) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      review_code_hash TEXT NOT NULL,
      allowed_origins TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      comment TEXT NOT NULL,
      anchor TEXT NOT NULL,
      page TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open', 'resolved')),
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS annotations_project_created ON annotations(project_id, created_at DESC);
  `);

  const projectCount = database.prepare("SELECT COUNT(*) AS count FROM projects").get().count;
  if (projectCount === 0 && fs.existsSync(legacyDataPath)) {
    const legacyData = parseJson(fs.readFileSync(legacyDataPath, "utf8"), { projects: [], annotations: [] });
    const addProject = database.prepare("INSERT OR IGNORE INTO projects (id, name, review_code_hash, allowed_origins, created_at) VALUES (?, ?, ?, ?, ?)");
    const addAnnotation = database.prepare("INSERT OR IGNORE INTO annotations (id, project_id, comment, anchor, page, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const importLegacyData = database.transaction(() => {
      for (const project of legacyData.projects || []) {
        addProject.run(project.id, project.name, project.reviewCodeHash, JSON.stringify(project.allowedOrigins || []), project.createdAt);
      }
      for (const annotation of legacyData.annotations || []) {
        addAnnotation.run(
          annotation.id,
          annotation.projectId,
          annotation.comment,
          JSON.stringify(annotation.anchor || {}),
          JSON.stringify(annotation.page || {}),
          annotation.status || "open",
          annotation.createdAt,
          annotation.updatedAt || null,
        );
      }
    });
    importLegacyData();
  }

  const getProject = database.prepare("SELECT * FROM projects WHERE id = ?");
  const listProjects = database.prepare(`
    SELECT projects.*, SUM(CASE WHEN annotations.status = 'open' THEN 1 ELSE 0 END) AS annotation_count
    FROM projects
    LEFT JOIN annotations ON annotations.project_id = projects.id
    GROUP BY projects.id
    ORDER BY projects.created_at DESC
  `);
  const listAnnotations = database.prepare("SELECT * FROM annotations WHERE project_id = ? ORDER BY created_at DESC");
  const listOpenAnnotations = database.prepare("SELECT * FROM annotations WHERE project_id = ? AND status = 'open' ORDER BY created_at ASC");
  const getAnnotation = database.prepare("SELECT * FROM annotations WHERE id = ?");
  const insertProject = database.prepare("INSERT INTO projects (id, name, review_code_hash, allowed_origins, created_at) VALUES (?, ?, ?, ?, ?)");
  const updateProject = database.prepare("UPDATE projects SET name = ?, review_code_hash = ?, allowed_origins = ? WHERE id = ?");
  const insertAnnotation = database.prepare("INSERT INTO annotations (id, project_id, comment, anchor, page, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)");
  const updateAnnotation = database.prepare("UPDATE annotations SET status = ?, updated_at = ? WHERE id = ?");
  const updateAnnotationComment = database.prepare("UPDATE annotations SET comment = ?, updated_at = ? WHERE id = ?");
  const deleteAnnotation = database.prepare("DELETE FROM annotations WHERE id = ?");
  const sessions = new Map();

  return {
    findProject(id) {
      return toProject(getProject.get(id));
    },
    listProjects() {
      return listProjects.all().map((row) => ({ ...toProject(row), annotationCount: Number(row.annotation_count || 0) }));
    },
    listAnnotations(projectId, openOnly = false) {
      return (openOnly ? listOpenAnnotations.all(projectId) : listAnnotations.all(projectId)).map(toAnnotation);
    },
    createProject(project) {
      insertProject.run(project.id, project.name, project.reviewCodeHash, JSON.stringify(project.allowedOrigins), project.createdAt);
      return this.findProject(project.id);
    },
    updateProject(project) {
      if (updateProject.run(project.name, project.reviewCodeHash, JSON.stringify(project.allowedOrigins), project.id).changes === 0) return null;
      return this.findProject(project.id);
    },
    createAnnotation(annotation) {
      insertAnnotation.run(annotation.id, annotation.projectId, annotation.comment, JSON.stringify(annotation.anchor), JSON.stringify(annotation.page), annotation.createdAt);
      return annotation;
    },
    updateAnnotation(id, status, updatedAt) {
      if (updateAnnotation.run(status, updatedAt, id).changes === 0) return null;
      return toAnnotation(getAnnotation.get(id));
    },
    updateAnnotationComment(id, comment, updatedAt) {
      if (updateAnnotationComment.run(comment, updatedAt, id).changes === 0) return null;
      return toAnnotation(getAnnotation.get(id));
    },
    deleteAnnotation(id) {
      return deleteAnnotation.run(id).changes > 0;
    },
    createSession(token, session) {
      sessions.set(token, session);
    },
    findSession(token) {
      const session = sessions.get(token);
      if (session?.expiresAt < Date.now()) {
        sessions.delete(token);
        return null;
      }
      return session || null;
    },
  };
}
