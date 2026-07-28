import { Check, Clipboard, ExternalLink, KeyRound, LockKeyhole, MessageSquare, Pencil, Plus, RotateCcw, Settings2, Trash2, X, createIcons } from "lucide";
import type { Annotation, Project } from "./types";
import "./style.css";

const apiBase = window.location.port === "5173" ? "http://127.0.0.1:8787" : window.location.origin;
const app = document.querySelector<HTMLDivElement>("#app")!;
let dashboardKey = sessionStorage.getItem("annote-dashboard-key") || "";
let activeProject: Project | null = null;
let activeProjectId = sessionStorage.getItem("annote-active-project") || "";
type DashboardView = "feedback" | "setup";

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function iconify() {
  createIcons({ icons: { Check, Clipboard, ExternalLink, KeyRound, LockKeyhole, MessageSquare, Pencil, Plus, RotateCcw, Settings2, Trash2, X }, attrs: { "stroke-width": 2 } });
}

async function request<T>(pathname: string, init: RequestInit = {}) {
  const requestUrl = `${apiBase}${pathname}`;
  const response = await fetch(requestUrl, {
    ...init,
    cache: "no-store",
    headers: { "X-Annote-Admin-Key": dashboardKey, ...(init.headers || {}) },
  });
  const responseText = await response.text();
  const data = (() => {
    try {
      return responseText ? JSON.parse(responseText) : {};
    } catch {
      return {};
    }
  })();
  if (!response.ok) {
    throw new ApiError(data.error || `${requestUrl} returned ${response.status}${responseText ? `: ${responseText.slice(0, 160)}` : "."}`, response.status);
  }
  return data as T;
}

function showUnlock(error = "") {
  app.innerHTML = `
    <main class="unlock-page">
      <section class="unlock-panel" aria-labelledby="unlock-title">
        <div class="mark"><i data-lucide="message-square"></i></div>
        <p class="eyebrow">Annote</p>
        <h1 id="unlock-title">Open your feedback inbox</h1>
        <p class="subtle">Enter the dashboard key configured on your self-hosted server.</p>
        <form id="unlock-dashboard">
          <label for="dashboard-key">Dashboard key</label>
          <input id="dashboard-key" name="key" type="password" required autofocus />
          <p class="form-error" ${error ? "" : "hidden"}>${error}</p>
          <button class="button primary full" type="submit"><i data-lucide="lock-keyhole"></i>Open inbox</button>
        </form>
        <p class="footnote">${window.location.port === "5173" ? "Local starter key: <code>annote-local</code>" : "Your dashboard key is stored only for this browser session."}</p>
      </section>
    </main>`;
  iconify();
  app.querySelector<HTMLFormElement>("#unlock-dashboard")!.addEventListener("submit", async (event) => {
    event.preventDefault();
    dashboardKey = String(new FormData(event.currentTarget as HTMLFormElement).get("key") || "");
    sessionStorage.setItem("annote-dashboard-key", dashboardKey);
    await loadDashboard();
  });
}

function embedSnippet(project: Project) {
  if (window.location.port === "5173") {
    return `<script type="module">\n  import { Annote } from "${window.location.origin}/src/widget.ts";\n  Annote.mount({ reviewId: "${project.id}", apiBase: "${apiBase}" });\n</script>`;
  }
  return `<script src="${window.location.origin}/annote.js"></script>\n<script>window.Annote.mount({ reviewId: "${project.id}", apiBase: "${apiBase}" });</script>`;
}

function activeView(): DashboardView {
  return window.location.hash === "#setup" ? "setup" : "feedback";
}

function renderDashboard(project: Project, projects: Project[], annotations: Annotation[]) {
  const open = annotations.filter((annotation) => annotation.status === "open");
  const resolved = annotations.filter((annotation) => annotation.status === "resolved");
  const view = activeView();
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="/dashboard.html"><span class="brand-mark"><i data-lucide="message-square"></i></span><span>Annote</span></a>
        <nav aria-label="Primary navigation"><a class="nav-item ${view === "feedback" ? "active" : ""}" href="#feedback"><i data-lucide="message-square"></i>Feedback <span>${open.length}</span></a><a class="nav-item ${view === "setup" ? "active" : ""}" href="#setup"><i data-lucide="settings-2"></i>Setup</a></nav>
        <div class="sidebar-foot"><span class="status-dot"></span>Self-hosted</div>
      </aside>
      <main class="workspace">
        <header class="topbar">
          <div class="project-heading"><p class="eyebrow">Client review</p><label class="project-select" for="project-selector"><span>Project</span><select id="project-selector">${projects.map((entry) => `<option value="${escapeHtml(entry.id)}" ${entry.id === project.id ? "selected" : ""}>${escapeHtml(entry.name)}</option>`).join("")}</select></label></div>
          <div class="top-actions"><button class="icon-action" id="edit-project" title="Project settings" aria-label="Project settings"><i data-lucide="pencil"></i></button><button class="button secondary icon-text" id="new-project"><i data-lucide="plus"></i>New project</button>${view === "feedback" ? '<a class="button secondary icon-text" href="/demo.html" target="_blank"><i data-lucide="external-link"></i>Open preview</a>' : '<button class="button primary icon-text" id="copy-snippet"><i data-lucide="clipboard"></i>Copy install</button>'}</div>
        </header>
        <section class="review-strip" aria-label="Review access">
          <div><span class="strip-label">Review ID</span><code>${project.id}</code></div>
          <div><span class="strip-label">Client access</span><strong>Code required</strong></div>
          <div><span class="strip-label">Allowed sites</span><strong>${project.allowedOrigins.length} configured</strong></div>
        </section>
        ${view === "feedback" ? renderFeedbackView(annotations, open, resolved) : renderSetupView(project)}
      </main>
      ${renderCreateProjectDialog()}
      ${renderProjectSettingsDialog(project)}
    </div>`;
  iconify();
  app.querySelector<HTMLButtonElement>("#copy-snippet")?.addEventListener("click", () => copySnippet(project));
  app.querySelector<HTMLSelectElement>("#project-selector")!.addEventListener("change", (event) => {
    activeProjectId = (event.currentTarget as HTMLSelectElement).value;
    sessionStorage.setItem("annote-active-project", activeProjectId);
    loadDashboard();
  });
  app.querySelector<HTMLButtonElement>("#new-project")!.addEventListener("click", openCreateProjectDialog);
  app.querySelector<HTMLButtonElement>("#edit-project")!.addEventListener("click", openProjectSettingsDialog);
  bindCreateProjectDialog();
  bindProjectSettingsDialog(project);
  app.querySelectorAll<HTMLButtonElement>("[data-status]").forEach((button) => button.addEventListener("click", () => updateStatus(button.dataset.id!, button.dataset.status as Annotation["status"])));
  app.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteAnnotation(button.dataset.delete!)));
}

function renderEmptyDashboard() {
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="/dashboard.html"><span class="brand-mark"><i data-lucide="message-square"></i></span><span>Annote</span></a>
        <div class="sidebar-foot"><span class="status-dot"></span>Self-hosted</div>
      </aside>
      <main class="workspace">
        <header class="topbar">
          <div><p class="eyebrow">Client reviews</p><h1>Start your first review</h1></div>
          <div class="top-actions"><button class="button primary icon-text" id="new-project"><i data-lucide="plus"></i>New project</button></div>
        </header>
        <section class="first-project" aria-labelledby="first-project-title"><span class="empty-icon"><i data-lucide="message-square"></i></span><div><h2 id="first-project-title">Give feedback a home.</h2><p>Create a client review, add the exact preview URL, then paste Annote's small script into their website.</p><button class="button secondary icon-text" id="first-project-action"><i data-lucide="plus"></i>Create first project</button></div></section>
      </main>
      ${renderCreateProjectDialog()}
    </div>`;
  iconify();
  app.querySelector<HTMLButtonElement>("#new-project")!.addEventListener("click", openCreateProjectDialog);
  app.querySelector<HTMLButtonElement>("#first-project-action")!.addEventListener("click", openCreateProjectDialog);
  bindCreateProjectDialog();
}

function renderCreateProjectDialog() {
  return `<dialog class="project-dialog" id="project-dialog" aria-labelledby="project-dialog-title">
    <form id="create-project-form">
      <div class="dialog-head"><div><p class="eyebrow">New client review</p><h2 id="project-dialog-title">Create a project</h2></div><button class="icon-action" type="button" id="close-project-dialog" aria-label="Close" title="Close"><i data-lucide="x"></i></button></div>
      <div class="form-grid"><label for="project-name">Project name<input id="project-name" name="name" maxlength="120" required placeholder="Acme website refresh" /></label><label for="project-id">Review ID<input id="project-id" name="id" pattern="[a-z0-9][a-z0-9-]{2,62}" maxlength="63" required placeholder="acme-website-refresh" /></label></div>
      <label for="project-code">Review code<input id="project-code" name="reviewCode" type="password" minlength="8" maxlength="120" required autocomplete="new-password" placeholder="Share this privately with the client" /></label>
      <label for="project-origins">Allowed website origins<textarea id="project-origins" name="origins" rows="3" required placeholder="https://preview.acme.com&#10;https://staging.acme.com"></textarea><span class="field-hint">One exact origin per line. Include the protocol, without a path.</span></label>
      <p class="form-error" id="project-form-error" hidden></p>
      <div class="dialog-actions"><button class="button secondary" type="button" id="cancel-project-dialog">Cancel</button><button class="button primary icon-text" type="submit"><i data-lucide="plus"></i>Create project</button></div>
    </form>
  </dialog>`;
}

function renderProjectSettingsDialog(project: Project) {
  return `<dialog class="project-dialog" id="project-settings-dialog" aria-labelledby="project-settings-title">
    <form id="project-settings-form">
      <div class="dialog-head"><div><p class="eyebrow">Project settings</p><h2 id="project-settings-title">Edit ${escapeHtml(project.name)}</h2></div><button class="icon-action" type="button" id="close-project-settings" aria-label="Close" title="Close"><i data-lucide="x"></i></button></div>
      <label for="settings-project-id">Review ID<input id="settings-project-id" value="${escapeHtml(project.id)}" readonly /></label>
      <div class="form-grid"><label for="settings-project-name">Project name<input id="settings-project-name" name="name" maxlength="120" required value="${escapeHtml(project.name)}" /></label><label for="settings-project-code">New review code<input id="settings-project-code" name="reviewCode" type="password" minlength="8" maxlength="120" autocomplete="new-password" placeholder="Leave blank to keep current" /></label></div>
      <label for="settings-project-origins">Allowed website origins<textarea id="settings-project-origins" name="origins" rows="3" required>${escapeHtml(project.allowedOrigins.join("\n"))}</textarea><span class="field-hint">One exact origin per line. Include the protocol, without a path.</span></label>
      <p class="form-error" id="project-settings-error" hidden></p>
      <div class="dialog-actions"><button class="button secondary" type="button" id="cancel-project-settings">Cancel</button><button class="button primary icon-text" type="submit"><i data-lucide="check"></i>Save changes</button></div>
    </form>
  </dialog>`;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
}

function openCreateProjectDialog() {
  const dialog = app.querySelector<HTMLDialogElement>("#project-dialog")!;
  dialog.showModal();
  window.setTimeout(() => app.querySelector<HTMLInputElement>("#project-name")!.focus(), 0);
}

function bindCreateProjectDialog() {
  const dialog = app.querySelector<HTMLDialogElement>("#project-dialog")!;
  const form = app.querySelector<HTMLFormElement>("#create-project-form")!;
  const name = app.querySelector<HTMLInputElement>("#project-name")!;
  const id = app.querySelector<HTMLInputElement>("#project-id")!;
  const close = () => dialog.close();
  app.querySelector<HTMLButtonElement>("#close-project-dialog")!.addEventListener("click", close);
  app.querySelector<HTMLButtonElement>("#cancel-project-dialog")!.addEventListener("click", close);
  name.addEventListener("input", () => {
    if (!id.dataset.edited) id.value = slugify(name.value);
  });
  id.addEventListener("input", () => {
    id.dataset.edited = "true";
    id.value = slugify(id.value);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = app.querySelector<HTMLElement>("#project-form-error")!;
    const submit = form.querySelector<HTMLButtonElement>("button[type='submit']")!;
    const values = new FormData(form);
    const allowedOrigins = String(values.get("origins") || "").split(/\n|,/).map((origin) => origin.trim()).filter(Boolean);
    error.hidden = true;
    submit.disabled = true;
    try {
      const created = await request<Project>("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: values.get("name"), id: values.get("id"), reviewCode: values.get("reviewCode"), allowedOrigins }) });
      activeProjectId = created.id;
      sessionStorage.setItem("annote-active-project", activeProjectId);
      dialog.close();
      if (window.location.hash === "#setup") await loadDashboard();
      else window.location.hash = "#setup";
    } catch (caught) {
      error.textContent = caught instanceof Error ? caught.message : "Could not create this project.";
      error.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
}

function openProjectSettingsDialog() {
  app.querySelector<HTMLDialogElement>("#project-settings-dialog")!.showModal();
}

function bindProjectSettingsDialog(project: Project) {
  const dialog = app.querySelector<HTMLDialogElement>("#project-settings-dialog")!;
  const form = app.querySelector<HTMLFormElement>("#project-settings-form")!;
  const close = () => dialog.close();
  app.querySelector<HTMLButtonElement>("#close-project-settings")!.addEventListener("click", close);
  app.querySelector<HTMLButtonElement>("#cancel-project-settings")!.addEventListener("click", close);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = app.querySelector<HTMLElement>("#project-settings-error")!;
    const submit = form.querySelector<HTMLButtonElement>("button[type='submit']")!;
    const values = new FormData(form);
    const allowedOrigins = String(values.get("origins") || "").split(/\n|,/).map((origin) => origin.trim()).filter(Boolean);
    error.hidden = true;
    submit.disabled = true;
    try {
      await request<Project>(`/api/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: values.get("name"), reviewCode: values.get("reviewCode"), allowedOrigins }) });
      dialog.close();
      await loadDashboard();
    } catch (caught) {
      error.textContent = caught instanceof Error ? caught.message : "Could not update this project.";
      error.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
}

function renderFeedbackView(annotations: Annotation[], open: Annotation[], resolved: Annotation[]) {
  return `<section class="inbox-head"><div><h2>Feedback</h2><p>${open.length ? `${open.length} item${open.length === 1 ? "" : "s"} waiting for you` : "Nothing is waiting for you"}</p></div><div class="counts"><span>${open.length} open</span><span>${resolved.length} resolved</span></div></section>
    <section class="feedback-list" aria-label="Feedback items">
      ${annotations.length ? annotations.map((annotation, index) => annotationRow(annotation, index + 1)).join("") : emptyState()}
    </section>`;
}

function renderSetupView(project: Project) {
  return `<section class="setup-section"><div><p class="eyebrow">Install anywhere</p><h2>One script, any website.</h2><p>Load the widget from your Annote server, then mount it with this review ID. It works on a static site, CMS theme, React app, Laravel project, or any page that can load JavaScript.</p><a class="button secondary icon-text" href="/demo.html" target="_blank"><i data-lucide="external-link"></i>Open example</a></div><pre><code>${escapeHtml(embedSnippet(project))}</code></pre></section>`;
}

function annotationRow(annotation: Annotation, number: number) {
  const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(annotation.createdAt));
  const resolved = annotation.status === "resolved";
  const pageUrl = externalUrl(annotation.page.url);
  return `<article class="feedback-row ${resolved ? "is-resolved" : ""}">
    <div class="feedback-index">${number}</div>
    <div class="feedback-body"><div class="feedback-meta"><span class="element-tag">${escapeHtml(annotation.anchor.label)}</span><span>${date}</span>${resolved ? "<span class=\"resolved-label\">Resolved</span>" : ""}</div><p>${escapeHtml(annotation.comment)}</p><span class="feedback-context"><span>${escapeHtml(annotation.anchor.quote || annotation.anchor.text || "Selected element")}</span><span>Page ${escapeHtml(annotation.page.path || "/")}</span></span></div>
    <div class="feedback-actions">${pageUrl ? `<a class="icon-action" href="${escapeHtml(pageUrl)}" target="_blank" rel="noreferrer" title="Open annotated page" aria-label="Open annotated page"><i data-lucide="external-link"></i></a>` : ""}${resolved ? `<button class="icon-action" data-id="${annotation.id}" data-status="open" title="Reopen feedback" aria-label="Reopen feedback"><i data-lucide="rotate-ccw"></i></button>` : `<button class="icon-action success" data-id="${annotation.id}" data-status="resolved" title="Resolve feedback" aria-label="Resolve feedback"><i data-lucide="check"></i></button>`}<button class="icon-action danger" data-delete="${annotation.id}" title="Delete feedback" aria-label="Delete feedback"><i data-lucide="trash-2"></i></button></div>
  </article>`;
}

function emptyState() {
  return `<div class="empty-state"><span class="empty-icon"><i data-lucide="message-square"></i></span><h3>Ready for feedback</h3><p>Send the preview link and review code to your client. Their notes will show up here.</p><a class="button secondary icon-text" href="/demo.html" target="_blank"><i data-lucide="external-link"></i>Open preview</a></div>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

function externalUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

async function copySnippet(project: Project) {
  const button = app.querySelector<HTMLButtonElement>("#copy-snippet");
  if (!button) return;
  await navigator.clipboard.writeText(embedSnippet(project));
  button.innerHTML = '<i data-lucide="check"></i>Copied';
  iconify();
  window.setTimeout(() => { button.innerHTML = '<i data-lucide="clipboard"></i>Copy install'; iconify(); }, 1500);
}

async function updateStatus(id: string, status: Annotation["status"]) {
  await request<Annotation>(`/api/annotations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  await loadDashboard();
}

async function deleteAnnotation(id: string) {
  await request<void>(`/api/annotations/${id}`, { method: "DELETE" });
  await loadDashboard();
}

async function loadDashboard() {
  try {
    const projects = await request<Project[]>("/api/projects");
    activeProject = projects.find((project) => project.id === activeProjectId) || projects[0] || null;
    if (!activeProject) {
      activeProjectId = "";
      sessionStorage.removeItem("annote-active-project");
      renderEmptyDashboard();
      return;
    }
    activeProjectId = activeProject.id;
    sessionStorage.setItem("annote-active-project", activeProjectId);
    const annotations = await request<Annotation[]>(`/api/projects/${activeProject.id}/annotations`);
    renderDashboard(activeProject, projects, annotations);
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 401) {
      sessionStorage.removeItem("annote-dashboard-key");
      dashboardKey = "";
    }
    showUnlock(caught instanceof Error ? caught.message : "Could not open the feedback inbox.");
  }
}

showUnlock();
if (dashboardKey) loadDashboard();
window.addEventListener("hashchange", () => {
  if (dashboardKey) loadDashboard();
});
