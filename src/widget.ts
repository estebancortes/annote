import { Check, Circle, Crosshair, Highlighter, LockKeyhole, MessageSquare, MousePointer2, Pencil, PenTool, Send, Square, Trash2, X, createElement } from "lucide";
import type { Annotation, AnnotationGeometry, AnnotationKind } from "./types";

export interface AnnoteOptions {
  reviewId: string;
  apiBase: string;
  buttonLabel?: string;
}

interface SelectedTarget {
  element: Element;
  selector: string;
  label: string;
  text: string;
  position: { x: number; y: number };
  kind: AnnotationKind;
  quote?: string;
  geometry?: AnnotationGeometry;
}

function escapeSelector(value: string) {
  return value.replace(/(["\\])/g, "\\$1");
}

function selectorFor(element: Element) {
  const identified = element.closest("[data-annote-id]") as HTMLElement | null;
  if (identified?.dataset.annoteId) return `[data-annote-id="${escapeSelector(identified.dataset.annoteId)}"]`;
  if ((element as HTMLElement).id) return `#${CSS.escape((element as HTMLElement).id)}`;

  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node !== document.body && parts.length < 5) {
    const container: Element | null = node.parentElement;
    if (!container) break;
    const siblings = Array.from(container.children).filter((child: Element) => child.tagName === node!.tagName);
    const index = siblings.indexOf(node) + 1;
    parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${index})`);
    node = container;
  }
  return `body > ${parts.join(" > ")}`;
}

function targetFor(element: Element): SelectedTarget {
  const rect = element.getBoundingClientRect();
  const label = element.getAttribute("aria-label") || element.getAttribute("data-annote-id") || element.getAttribute("alt") || element.tagName.toLowerCase();
  return {
    element,
    selector: selectorFor(element),
    label,
    text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 180),
    position: { x: Math.round(rect.left + window.scrollX), y: Math.round(rect.top + window.scrollY) },
    kind: "element",
  };
}

function textRangeFor(root: Element, quote: string) {
  const content = root.textContent || "";
  const start = content.indexOf(quote);
  if (start < 0) return null;
  const end = start + quote.length;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let cursor = 0;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const next = cursor + node.data.length;
    if (!startNode && start >= cursor && start <= next) {
      startNode = node;
      startOffset = start - cursor;
    }
    if (end >= cursor && end <= next) {
      endNode = node;
      endOffset = end - cursor;
      break;
    }
    cursor = next;
    node = walker.nextNode() as Text | null;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function apiUrl(base: string, pathname: string) {
  return `${base.replace(/\/$/, "")}${pathname}`;
}

class AnnoteWidget {
  private readonly host = document.createElement("div");
  private readonly root: ShadowRoot;
  private token = "";
  private picking = false;
  private selectingText = false;
  private drawingTool: AnnotationGeometry["type"] | null = null;
  private drawingStart: { x: number; y: number } | null = null;
  private draftGeometry: AnnotationGeometry | null = null;
  private panelDrag: { startX: number; startY: number; offsetX: number; offsetY: number } | null = null;
  private panelOffset = { x: 0, y: 0 };
  private selected: SelectedTarget | null = null;
  private editingAnnotation: Annotation | null = null;
  private annotations: Annotation[] = [];
  private reviewQuery = "";
  private readonly highlightName: string;

  constructor(private readonly options: AnnoteOptions) {
    this.host.dataset.annoteWidget = "true";
    this.root = this.host.attachShadow({ mode: "open" });
    this.token = sessionStorage.getItem(this.sessionKey()) || "";
    this.highlightName = `annote-feedback-${this.options.reviewId}`;
  }

  mount() {
    document.body.append(this.host);
    this.root.innerHTML = `
      <style>
        :host { all: initial; }
        *, *::before, *::after { box-sizing: border-box; }
        .layer { position: fixed; z-index: 2147483647; inset: 0; pointer-events: none; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17211f; }
        button, input, textarea { font: inherit; }
        button { border: 0; cursor: pointer; }
        .launcher { position: fixed; right: 22px; bottom: 22px; width: 48px; height: 48px; display: grid; place-items: center; border-radius: 50%; background: #17211f; color: #fff; box-shadow: 0 12px 28px rgba(23,33,31,.25); pointer-events: auto; transition: transform .16s ease, background .16s ease; }
        .launcher[hidden] { display: none; }
        .launcher:hover { transform: translateY(-2px); background: #008f7a; }
        .launcher svg { width: 20px; height: 20px; }
        .count { position: absolute; right: -4px; top: -4px; min-width: 19px; height: 19px; display: grid; place-items: center; padding: 0 4px; border: 2px solid #fff; border-radius: 50%; background: #ef6b50; color: #fff; font-size: 10px; font-weight: 800; }
        .count[hidden] { display: none; }
        [data-tooltip]::after { content: attr(data-tooltip); position: absolute; right: 58px; top: 50%; transform: translateY(-50%); width: max-content; max-width: 220px; padding: 7px 9px; border-radius: 4px; background: #17211f; color: #fff; font-size: 12px; line-height: 1.2; opacity: 0; pointer-events: none; transition: opacity .14s ease; }
        [data-tooltip]:hover::after { opacity: 1; }
        .outline { position: fixed; display: none; border: 2px solid #008f7a; background: rgba(0,143,122,.08); border-radius: 3px; pointer-events: none; }
        .composer, .unlock, .notice { position: fixed; right: 22px; bottom: 82px; width: min(360px, calc(100vw - 32px)); padding: 18px; border: 1px solid #c7d1ca; border-radius: 7px; background: #fff; box-shadow: 0 18px 46px rgba(23,33,31,.18); pointer-events: auto; }
        .composer[hidden], .unlock[hidden], .notice[hidden], .review-panel[hidden], .tool-dock[hidden] { display: none; }
        .panel-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        h2 { margin: 0; font-size: 15px; letter-spacing: 0; }
        .icon-button { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 4px; background: transparent; color: #53645f; }
        .icon-button:hover { background: #eaf1ed; color: #17211f; }
        .icon-button svg { width: 17px; height: 17px; }
        .target { margin: 13px 0 12px; padding: 9px 10px; border-left: 3px solid #008f7a; background: #f3f7f4; color: #53645f; font-size: 12px; line-height: 1.35; }
        label { display: block; margin-bottom: 7px; color: #53645f; font-size: 12px; font-weight: 700; }
        input, textarea { width: 100%; border: 1px solid #b6c3bb; border-radius: 4px; background: #fff; color: #17211f; outline: none; }
        input { height: 42px; padding: 0 11px; }
        textarea { min-height: 98px; padding: 10px 11px; resize: vertical; line-height: 1.42; }
        input:focus, textarea:focus { border-color: #008f7a; box-shadow: 0 0 0 3px rgba(0,143,122,.12); }
        .actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 12px; }
        .text-button { min-height: 36px; padding: 0 11px; border-radius: 4px; background: transparent; color: #53645f; font-size: 13px; font-weight: 700; }
        .text-button:hover { background: #edf2ef; color: #17211f; }
        .primary { min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 12px; border-radius: 4px; background: #008f7a; color: #fff; font-size: 13px; font-weight: 750; }
        .primary:hover { background: #007764; }
        .primary svg { width: 15px; height: 15px; }
        .hint, .error { margin: 10px 0 0; color: #65756e; font-size: 12px; line-height: 1.4; }
        .error { color: #b42318; }
        .notice { display: flex; align-items: center; gap: 10px; color: #245c4f; font-size: 13px; font-weight: 700; }
        .notice svg { width: 18px; height: 18px; color: #008f7a; flex: 0 0 auto; }
        .review-panel { position: fixed; right: 84px; bottom: 22px; width: min(396px, calc(100vw - 96px)); height: min(620px, calc(100vh - 44px)); display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; border: 1px solid #d8e0db; border-radius: 8px; background: #fff; box-shadow: 0 18px 46px rgba(23,33,31,.18); pointer-events: auto; overflow: hidden; animation: annote-panel-in .2s ease-out; }
        @keyframes annote-panel-in { from { opacity: 0; transform: translateX(26px); } to { opacity: 1; transform: translateX(0); } }
        .review-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 17px 16px 13px; border-bottom: 1px solid #e2e8e4; cursor: grab; user-select: none; }
        .review-header:active { cursor: grabbing; }
        .eyebrow { margin: 0 0 5px; color: #008f7a; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
        .review-title { display: flex; align-items: center; gap: 8px; }
        .review-title h2 { font-size: 16px; }
        .panel-count { display: grid; min-width: 22px; height: 22px; place-items: center; padding: 0 5px; border-radius: 12px; background: #edf3ef; color: #52625c; font-size: 11px; font-weight: 800; }
        .tool-dock { position: fixed; right: 22px; bottom: 22px; display: grid; gap: 4px; width: 50px; padding: 6px; border: 1px solid #d8e0db; border-radius: 8px; background: #fff; box-shadow: 0 12px 30px rgba(23,33,31,.14); pointer-events: auto; }
        .tool-divider { height: 1px; margin: 3px 4px; background: #e2e8e4; }
        .tool-button { position: relative; width: 36px; height: 36px; display: grid; place-items: center; border-radius: 5px; background: transparent; color: #53645f; }
        .tool-button:hover { background: #eaf5f0; color: #008f7a; }
        .tool-button.primary { background: #008f7a; color: #fff; box-shadow: 0 4px 10px rgba(0,143,122,.22); }
        .tool-button.primary:hover { background: #007764; color: #fff; }
        .tool-button svg { width: 18px; height: 18px; }
        .tool-dock [data-tooltip]::after { right: 44px; }
        .review-actions { display: none; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #dce4df; }
        .review-action { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid #b7c7be; border-radius: 4px; background: #fff; color: #33433e; font-size: 12px; font-weight: 760; }
        .review-action:hover { border-color: #008f7a; color: #006e5e; background: #f4faf7; }
        .review-action.primary { border-color: #008f7a; background: #008f7a; color: #fff; }
        .review-action.primary:hover { background: #007764; color: #fff; }
        .review-action.ink { grid-column: span 2; }
        .review-action svg { width: 15px; height: 15px; }
        .review-search { padding: 10px 16px; border-bottom: 1px solid #e2e8e4; background: #fff; }
        .review-search input { height: 36px; padding: 0 10px; font-size: 12px; }
        .feedback-list { display: grid; align-content: start; gap: 9px; min-height: 0; padding: 11px; overflow: auto; background: #f5f8f6; }
        .feedback-entry { padding: 11px; border: 1px solid #dce5df; border-radius: 7px; background: #fff; box-shadow: 0 1px 2px rgba(23,33,31,.03); }
        .feedback-entry:hover { border-color: #b7cfc4; }
        .feedback-head { display: flex; align-items: center; gap: 7px; min-width: 0; }
        .feedback-number { display: grid; width: 22px; height: 22px; place-items: center; border-radius: 50%; background: #ef6b50; color: #fff; font-size: 11px; font-weight: 800; }
        .feedback-type { overflow: hidden; color: #52625c; font-size: 11px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
        .feedback-time { margin-left: auto; color: #8a9891; font-size: 10px; white-space: nowrap; }
        .feedback-jump { width: 100%; min-width: 0; padding: 9px 0 7px; border: 0; background: transparent; color: #263531; text-align: left; font-size: 13px; line-height: 1.4; }
        .feedback-jump:hover { color: #008f7a; }
        .feedback-context { display: block; overflow: hidden; color: #718078; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
        .feedback-controls { display: flex; align-items: center; gap: 4px; padding-top: 7px; border-top: 1px solid #edf1ee; }
        .feedback-edit, .feedback-delete { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 4px; background: transparent; color: #63736c; }
        .feedback-edit:hover { background: #eaf1ed; color: #008f7a; }
        .feedback-delete:hover { background: #fceae7; color: #c33d2c; }
        .feedback-edit svg, .feedback-delete svg { width: 15px; height: 15px; }
        .feedback-empty { margin: 0; padding: 24px 12px; color: #718078; font-size: 12px; line-height: 1.45; }
        .review-footer { display: flex; align-items: center; gap: 7px; padding: 11px 16px; border-top: 1px solid #dce4df; color: #718078; font-size: 11px; line-height: 1.35; }
        .review-footer svg { width: 14px; height: 14px; color: #008f7a; flex: 0 0 auto; }
        .composer { right: 84px; bottom: 22px; width: min(396px, calc(100vw - 96px)); padding: 18px; }
        .visual-layer { position: fixed; inset: 0; width: 100vw; height: 100vh; overflow: visible; pointer-events: none; }
        .visual-shape { fill: rgba(0, 143, 122, .08); stroke: #008f7a; stroke-width: 3; vector-effect: non-scaling-stroke; }
        .visual-ink { fill: none; stroke: #008f7a; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
        .marker { position: fixed; width: 25px; height: 25px; display: grid; place-items: center; border-radius: 50%; background: #ef6b50; color: #fff; box-shadow: 0 5px 12px rgba(104,36,21,.28); font-size: 12px; font-weight: 800; pointer-events: auto; }
        .marker:hover { transform: scale(1.08); }
        .marker-card { position: fixed; width: min(300px, calc(100vw - 32px)); padding: 14px; border: 1px solid #c7d1ca; border-radius: 7px; background: #fff; box-shadow: 0 18px 46px rgba(23,33,31,.18); pointer-events: auto; }
        .marker-card[hidden] { display: none; }
        .marker-card p { margin: 7px 0 0; color: #33433e; font-size: 13px; line-height: 1.45; }
        .pick-banner { position: fixed; left: 50%; top: 20px; transform: translateX(-50%); display: flex; align-items: center; gap: 9px; padding: 10px 13px; border-radius: 5px; background: #17211f; color: #fff; box-shadow: 0 10px 24px rgba(23,33,31,.2); font-size: 13px; font-weight: 700; pointer-events: none; }
        .pick-banner[hidden] { display: none; }
        .pick-banner svg { width: 16px; height: 16px; color: #73d7ba; }
        @media (max-width: 560px) {
          .launcher { right: 16px; bottom: 16px; }
          .unlock, .notice { right: 16px; bottom: 74px; }
          .review-panel, .composer { top: 0; right: 0; bottom: auto; width: 100vw; height: 100vh; max-height: 100vh; border-radius: 0; }
          .tool-dock { display: none; }
          .review-actions { display: grid; }
          .review-header { padding-top: max(20px, env(safe-area-inset-top)); }
        }
      </style>
      <div class="layer">
        <div class="outline"></div>
        <div class="pick-banner" hidden><i data-lucide="crosshair"></i><span>Select the part you want to discuss</span></div>
        <button class="launcher" data-action="launcher" data-tooltip="Open feedback" aria-label="Open feedback"><i data-lucide="message-square"></i><span class="count" hidden></span></button>
        <section class="unlock" hidden aria-label="Unlock feedback">
          <div class="panel-top"><h2>Leave feedback</h2><button class="icon-button" data-action="close-unlock" aria-label="Close" title="Close"><i data-lucide="x"></i></button></div>
          <p class="hint">Enter the review code your team shared with you.</p>
          <form data-form="unlock"><label for="annote-code">Review code</label><input id="annote-code" name="code" autocomplete="one-time-code" required /><p class="error" hidden></p><div class="actions"><button class="primary" type="submit"><i data-lucide="lock-keyhole"></i>Continue</button></div></form>
        </section>
        <section class="composer" hidden aria-label="New feedback">
          <div class="panel-top"><h2>New feedback</h2><button class="icon-button" data-action="cancel-comment" aria-label="Cancel comment" title="Cancel"><i data-lucide="x"></i></button></div>
          <div class="target"></div>
          <form data-form="comment"><label for="annote-comment">What should change?</label><textarea id="annote-comment" name="comment" maxlength="1200" required placeholder="Describe the feedback clearly..."></textarea><p class="error" hidden></p><div class="actions"><button class="text-button" type="button" data-action="cancel-comment">Cancel</button><button class="primary" type="submit"><i data-lucide="send"></i>Send</button></div></form>
        </section>
        <aside class="tool-dock" hidden aria-label="Annotation tools">
          <button class="tool-button primary" data-action="add-point" data-tooltip="Pin note" aria-label="Pin note"><i data-lucide="mouse-pointer-2"></i></button>
          <button class="tool-button" data-action="highlight" data-tooltip="Highlight text" aria-label="Highlight text"><i data-lucide="highlighter"></i></button>
          <button class="tool-button" data-action="rectangle" data-tooltip="Rectangle" aria-label="Rectangle"><i data-lucide="square"></i></button>
          <button class="tool-button" data-action="circle" data-tooltip="Circle" aria-label="Circle"><i data-lucide="circle"></i></button>
          <button class="tool-button" data-action="freehand" data-tooltip="Freehand" aria-label="Freehand"><i data-lucide="pen-tool"></i></button>
          <span class="tool-divider"></span>
          <button class="tool-button" data-action="open-review" data-tooltip="Show feedback" aria-label="Show feedback"><i data-lucide="message-square"></i></button>
        </aside>
        <section class="review-panel" hidden aria-label="Your feedback">
          <header class="review-header"><div><p class="eyebrow">Client review</p><div class="review-title"><h2>Feedback</h2><span class="panel-count">0</span></div></div><button class="icon-button" data-action="close-review" aria-label="Close feedback panel" title="Close"><i data-lucide="x"></i></button></header>
          <div class="review-actions"><button class="review-action primary" data-action="add-point"><i data-lucide="mouse-pointer-2"></i>Pin note</button><button class="review-action" data-action="highlight"><i data-lucide="highlighter"></i>Highlight</button><button class="review-action" data-action="rectangle"><i data-lucide="square"></i>Rectangle</button><button class="review-action" data-action="circle"><i data-lucide="circle"></i>Circle</button><button class="review-action ink" data-action="freehand"><i data-lucide="pen-tool"></i>Freehand</button></div>
          <div class="review-search"><input type="search" data-review-search placeholder="Search feedback" aria-label="Search feedback" /></div>
          <div class="feedback-list"></div>
          <footer class="review-footer"><i data-lucide="check"></i><span>Your notes are shared with the project team.</span></footer>
        </section>
        <aside class="notice" hidden><i data-lucide="check"></i><span>Feedback sent</span></aside>
        <aside class="marker-card" hidden></aside>
        <svg class="visual-layer" aria-hidden="true"></svg>
        <div class="markers"></div>
      </div>
    `;
    this.renderIcons();
    this.bind();
    if (this.token) {
      void this.loadAnnotations().then(() => this.showReviewPanel());
    }
    return this;
  }

  private sessionKey() {
    return `annote:${this.options.apiBase}:${this.options.reviewId}`;
  }

  private renderIcons() {
    const icons = { check: Check, circle: Circle, crosshair: Crosshair, highlighter: Highlighter, "lock-keyhole": LockKeyhole, "message-square": MessageSquare, "mouse-pointer-2": MousePointer2, pencil: Pencil, "pen-tool": PenTool, send: Send, square: Square, "trash-2": Trash2, x: X };
    this.root.querySelectorAll<HTMLElement>("i[data-lucide]").forEach((placeholder) => {
      const icon = icons[placeholder.dataset.lucide as keyof typeof icons];
      if (!icon) return;
      const svg = createElement(icon);
      svg.setAttribute("stroke-width", "2");
      placeholder.replaceWith(svg);
    });
  }

  private element<T extends Element>(selector: string) {
    return this.root.querySelector<T>(selector)!;
  }

  private bind() {
    this.element<HTMLButtonElement>("[data-action='launcher']").addEventListener("click", () => {
      if (this.token) this.toggleReviewPanel();
      else this.showUnlock();
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='add-point']").forEach((button) => button.addEventListener("click", () => this.startPicking()));
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='highlight']").forEach((button) => button.addEventListener("click", () => this.startTextSelecting()));
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='rectangle']").forEach((button) => button.addEventListener("click", () => this.startDrawing("rectangle")));
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='circle']").forEach((button) => button.addEventListener("click", () => this.startDrawing("circle")));
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='freehand']").forEach((button) => button.addEventListener("click", () => this.startDrawing("freehand")));
    this.element<HTMLButtonElement>("[data-action='open-review']").addEventListener("click", () => this.showReviewPanel());
    this.element<HTMLButtonElement>("[data-action='close-review']").addEventListener("click", () => this.hideReviewPanel());
    this.element<HTMLElement>(".review-header").addEventListener("pointerdown", (event) => this.startPanelDrag(event));
    this.element<HTMLInputElement>("[data-review-search]").addEventListener("input", (event) => {
      this.reviewQuery = (event.currentTarget as HTMLInputElement).value.trim().toLowerCase();
      this.renderReviewPanel();
    });
    this.root.querySelectorAll("[data-action='close-unlock']").forEach((button) => button.addEventListener("click", () => this.hideUnlock()));
    this.root.querySelectorAll("[data-action='cancel-comment']").forEach((button) => button.addEventListener("click", () => this.cancelComment()));
    this.element<HTMLFormElement>("[data-form='unlock']").addEventListener("submit", (event) => this.unlock(event));
    this.element<HTMLFormElement>("[data-form='comment']").addEventListener("submit", (event) => this.sendComment(event));
    window.addEventListener("scroll", () => this.renderMarkers(), { passive: true });
    window.addEventListener("resize", () => this.renderMarkers());
    document.addEventListener("keydown", (event) => {
      const path = event.composedPath();
      const editable = path.some((node) => node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || (node instanceof HTMLElement && node.isContentEditable));
      if (editable || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") {
        if (this.picking) this.stopPicking();
        else if (this.selectingText) this.stopTextSelecting();
        else if (this.drawingTool) this.stopDrawing();
        else this.cancelComment();
        return;
      }
      if (!this.token) return;
      const key = event.key.toLowerCase();
      if (key === "a") this.toggleReviewPanel();
      if (key === "p") this.startPicking();
      if (key === "h") this.startTextSelecting();
      if (key === "r") this.startDrawing("rectangle");
      if (key === "c") this.startDrawing("circle");
      if (key === "d") this.startDrawing("freehand");
    });
  }

  private showUnlock() {
    this.element<HTMLElement>(".unlock").hidden = false;
    window.setTimeout(() => this.element<HTMLInputElement>("#annote-code").focus(), 0);
  }

  private hideUnlock() {
    this.element<HTMLElement>(".unlock").hidden = true;
  }

  private async unlock(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const code = new FormData(form).get("code");
    const error = form.querySelector<HTMLElement>(".error")!;
    error.hidden = true;
    try {
      const response = await fetch(apiUrl(this.options.apiBase, `/api/reviews/${this.options.reviewId}/unlock`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not unlock feedback.");
      this.token = payload.token;
      sessionStorage.setItem(this.sessionKey(), this.token);
      this.hideUnlock();
      await this.loadAnnotations();
      this.showReviewPanel();
    } catch (caught) {
      error.textContent = caught instanceof Error ? caught.message : "Could not unlock feedback.";
      error.hidden = false;
    }
  }

  private startPicking() {
    this.cancelComment(false);
    this.hideReviewPanel();
    this.stopTextSelecting();
    this.picking = true;
    document.body.style.cursor = "crosshair";
    this.element<HTMLElement>(".pick-banner").querySelector("span")!.textContent = "Select the part you want to discuss";
    this.element<HTMLElement>(".pick-banner").hidden = false;
    document.addEventListener("pointermove", this.highlightTarget, true);
    document.addEventListener("click", this.pickTarget, true);
  }

  private stopPicking() {
    this.picking = false;
    document.body.style.cursor = "";
    this.element<HTMLElement>(".pick-banner").hidden = true;
    this.element<HTMLElement>(".outline").style.display = "none";
    document.removeEventListener("pointermove", this.highlightTarget, true);
    document.removeEventListener("click", this.pickTarget, true);
  }

  private startTextSelecting() {
    this.cancelComment(false);
    this.hideReviewPanel();
    this.stopPicking();
    this.selectingText = true;
    this.element<HTMLElement>(".pick-banner").querySelector("span")!.textContent = "Select the text you want to discuss";
    this.element<HTMLElement>(".pick-banner").hidden = false;
    document.addEventListener("pointerup", this.pickText, true);
  }

  private stopTextSelecting() {
    this.selectingText = false;
    this.element<HTMLElement>(".pick-banner").hidden = true;
    document.removeEventListener("pointerup", this.pickText, true);
  }

  private startDrawing(type: AnnotationGeometry["type"]) {
    this.cancelComment(false);
    this.hideReviewPanel();
    this.stopPicking();
    this.stopTextSelecting();
    this.drawingTool = type;
    const banner = this.element<HTMLElement>(".pick-banner");
    banner.querySelector("span")!.textContent = type === "freehand" ? "Draw directly on the page, then release" : "Drag over the area you want to discuss";
    banner.hidden = false;
    document.addEventListener("pointerdown", this.beginDrawing, true);
  }

  private stopDrawing() {
    this.drawingTool = null;
    this.drawingStart = null;
    this.draftGeometry = null;
    this.element<HTMLElement>(".pick-banner").hidden = true;
    document.removeEventListener("pointerdown", this.beginDrawing, true);
    document.removeEventListener("pointermove", this.updateDrawing, true);
    document.removeEventListener("pointerup", this.finishDrawing, true);
    this.renderVisuals();
  }

  private drawingPoint(event: PointerEvent) {
    return { x: Math.round(event.clientX + window.scrollX), y: Math.round(event.clientY + window.scrollY) };
  }

  private beginDrawing = (event: PointerEvent) => {
    if (!this.drawingTool || this.host.contains(event.target as Node)) return;
    event.preventDefault();
    event.stopPropagation();
    const point = this.drawingPoint(event);
    this.drawingStart = point;
    this.draftGeometry = this.drawingTool === "freehand"
      ? { type: "freehand", x: point.x, y: point.y, points: [point] }
      : { type: this.drawingTool, x: point.x, y: point.y, width: 0, height: 0 };
    document.removeEventListener("pointerdown", this.beginDrawing, true);
    document.addEventListener("pointermove", this.updateDrawing, true);
    document.addEventListener("pointerup", this.finishDrawing, true);
    this.renderVisuals();
  };

  private updateDrawing = (event: PointerEvent) => {
    if (!this.drawingTool || !this.drawingStart || !this.draftGeometry) return;
    event.preventDefault();
    const point = this.drawingPoint(event);
    if (this.draftGeometry.type === "freehand") {
      const points = this.draftGeometry.points || [];
      const previous = points.at(-1);
      if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 2) points.push(point);
    } else {
      this.draftGeometry.width = point.x - this.drawingStart.x;
      this.draftGeometry.height = point.y - this.drawingStart.y;
    }
    this.renderVisuals();
  };

  private finishDrawing = (event: PointerEvent) => {
    if (!this.drawingTool || !this.draftGeometry) return;
    this.updateDrawing(event);
    const geometry = this.draftGeometry;
    const kind = geometry.type === "freehand" ? "freehand" : geometry.type;
    const meaningful = geometry.type === "freehand"
      ? (geometry.points?.length || 0) > 2
      : Math.abs(geometry.width || 0) > 8 && Math.abs(geometry.height || 0) > 8;
    if (meaningful) {
      this.selected = {
        element: document.body,
        selector: "body",
        label: geometry.type === "freehand" ? "Freehand mark" : geometry.type === "circle" ? "Circle" : "Rectangle",
        text: "Visual annotation",
        position: { x: geometry.x, y: geometry.y },
        kind,
        geometry,
      };
    }
    this.stopDrawing();
    if (meaningful) this.openComposer();
    else this.showReviewPanel();
  };

  private startPanelDrag(event: PointerEvent) {
    if (window.innerWidth <= 560 || (event.target as Element).closest("button")) return;
    const panel = this.element<HTMLElement>(".review-panel");
    this.panelDrag = { startX: event.clientX, startY: event.clientY, offsetX: this.panelOffset.x, offsetY: this.panelOffset.y };
    panel.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", this.movePanel, true);
    document.addEventListener("pointerup", this.stopPanelDrag, true);
  }

  private movePanel = (event: PointerEvent) => {
    if (!this.panelDrag) return;
    const panel = this.element<HTMLElement>(".review-panel");
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const baseLeft = window.innerWidth - width - 84;
    const baseTop = window.innerHeight - height - 22;
    const nextLeft = Math.min(window.innerWidth - width - 8, Math.max(8, baseLeft + this.panelDrag.offsetX + event.clientX - this.panelDrag.startX));
    const nextTop = Math.min(window.innerHeight - height - 8, Math.max(8, baseTop + this.panelDrag.offsetY + event.clientY - this.panelDrag.startY));
    this.panelOffset = { x: nextLeft - baseLeft, y: nextTop - baseTop };
    panel.style.transform = `translate(${this.panelOffset.x}px, ${this.panelOffset.y}px)`;
  };

  private stopPanelDrag = () => {
    this.panelDrag = null;
    document.removeEventListener("pointermove", this.movePanel, true);
    document.removeEventListener("pointerup", this.stopPanelDrag, true);
  };

  private highlightTarget = (event: PointerEvent) => {
    const target = event.target as Element | null;
    if (!target || this.host.contains(target)) return;
    const rect = target.getBoundingClientRect();
    const outline = this.element<HTMLElement>(".outline");
    Object.assign(outline.style, { display: "block", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  };

  private pickTarget = (event: MouseEvent) => {
    const target = event.target as Element | null;
    if (!target || this.host.contains(target)) return;
    event.preventDefault();
    event.stopPropagation();
    this.selected = targetFor(target);
    this.stopPicking();
    this.openComposer();
  };

  private pickText = (event: PointerEvent) => {
    if (this.host.contains(event.target as Node)) return;
    window.setTimeout(() => {
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      const quote = selection.toString().trim();
      const root = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer as Element
        : range.commonAncestorContainer.parentElement;
      if (!root || !quote || this.host.contains(root)) return;
      const rect = range.getBoundingClientRect();
      this.selected = {
        element: root,
        selector: selectorFor(root),
        label: "Selected text",
        text: quote.slice(0, 180),
        quote,
        kind: "text",
        position: { x: Math.round(rect.left + window.scrollX), y: Math.round(rect.top + window.scrollY) },
      };
      selection.removeAllRanges();
      this.stopTextSelecting();
      this.openComposer();
    }, 0);
  };

  private openComposer(editing?: Annotation) {
    if (!this.selected && !editing) return;
    this.editingAnnotation = editing || null;
    const composer = this.element<HTMLElement>(".composer");
    const target = this.element<HTMLElement>(".target");
    const heading = composer.querySelector("h2")!;
    const textarea = this.element<HTMLTextAreaElement>("#annote-comment");
    const anchor = editing?.anchor || this.selected!;
    heading.textContent = editing ? "Edit feedback" : "New feedback";
    target.textContent = anchor.text ? `${anchor.label}: ${anchor.text}` : `Selected ${anchor.label}`;
    textarea.value = editing?.comment || "";
    this.hideReviewPanel();
    this.element<HTMLElement>(".tool-dock").hidden = true;
    this.element<HTMLButtonElement>("[data-action='launcher']").hidden = true;
    composer.hidden = false;
    window.setTimeout(() => textarea.focus(), 0);
  }

  private cancelComment(showPanel = true) {
    this.selected = null;
    this.editingAnnotation = null;
    const composer = this.element<HTMLElement>(".composer");
    composer.hidden = true;
    const form = this.element<HTMLFormElement>("[data-form='comment']");
    form.reset();
    const error = form.querySelector<HTMLElement>(".error")!;
    error.hidden = true;
    if (showPanel && this.token && !this.picking && !this.selectingText) this.showReviewPanel();
  }

  private showNotice(message = "Feedback sent") {
    const notice = this.element<HTMLElement>(".notice");
    notice.querySelector("span")!.textContent = message;
    notice.hidden = false;
    window.setTimeout(() => { notice.hidden = true; }, 2200);
  }

  private showReviewPanel() {
    if (!this.token) return;
    this.renderReviewPanel();
    this.element<HTMLElement>(".review-panel").hidden = false;
    const dock = this.element<HTMLElement>(".tool-dock");
    dock.hidden = false;
    this.element<HTMLButtonElement>("[data-action='launcher']").hidden = true;
  }

  private hideReviewPanel() {
    this.element<HTMLElement>(".review-panel").hidden = true;
    if (this.token) {
      const dock = this.element<HTMLElement>(".tool-dock");
      dock.hidden = false;
    }
    this.element<HTMLButtonElement>("[data-action='launcher']").hidden = Boolean(this.token);
  }

  private toggleReviewPanel() {
    if (this.element<HTMLElement>(".review-panel").hidden) this.showReviewPanel();
    else this.hideReviewPanel();
  }

  private renderReviewPanel() {
    const list = this.element<HTMLElement>(".feedback-list");
    this.element<HTMLElement>(".panel-count").textContent = String(this.annotations.length);
    const search = this.element<HTMLInputElement>("[data-review-search]");
    search.value = this.reviewQuery;
    const visible = this.annotations.filter((annotation) => `${annotation.comment} ${annotation.anchor.label} ${annotation.anchor.text} ${annotation.anchor.quote || ""}`.toLowerCase().includes(this.reviewQuery));
    list.innerHTML = visible.length
      ? visible.map((annotation) => {
        const index = this.annotations.indexOf(annotation) + 1;
        const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(annotation.createdAt));
        const context = annotation.anchor.kind === "text" ? annotation.anchor.quote || annotation.anchor.text : annotation.anchor.label;
        return `<article class="feedback-entry"><div class="feedback-head"><span class="feedback-number">${index}</span><span class="feedback-type">${this.escapeHtml(annotation.anchor.label)}</span><span class="feedback-time">${time}</span></div><button class="feedback-jump" data-action="jump-feedback" data-id="${annotation.id}"><span>${this.escapeHtml(annotation.comment)}</span><span class="feedback-context">${this.escapeHtml(context)}</span></button><div class="feedback-controls"><button class="feedback-edit" data-action="edit-feedback" data-id="${annotation.id}" aria-label="Edit feedback ${index}" title="Edit feedback"><i data-lucide="pencil"></i></button><button class="feedback-delete" data-action="delete-feedback" data-id="${annotation.id}" aria-label="Delete feedback ${index}" title="Delete feedback"><i data-lucide="trash-2"></i></button></div></article>`;
      }).join("")
      : `<p class="feedback-empty">${this.reviewQuery ? "No feedback matches that search." : "Add a point, a visual mark, or a text highlight to begin your review."}</p>`;
    this.renderIcons();
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='jump-feedback']").forEach((button) => button.addEventListener("click", () => {
      const annotation = this.annotations.find((entry) => entry.id === button.dataset.id);
      if (annotation) this.focusFeedback(annotation);
    }));
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='edit-feedback']").forEach((button) => button.addEventListener("click", () => {
      const annotation = this.annotations.find((entry) => entry.id === button.dataset.id);
      if (annotation) this.openComposer(annotation);
    }));
    this.root.querySelectorAll<HTMLButtonElement>("[data-action='delete-feedback']").forEach((button) => button.addEventListener("click", () => {
      const annotation = this.annotations.find((entry) => entry.id === button.dataset.id);
      if (annotation) this.deleteFeedback(annotation);
    }));
  }

  private focusFeedback(annotation: Annotation) {
    history.replaceState(null, "", `#annote=${annotation.id}`);
    const anchored = document.querySelector(annotation.anchor.selector);
    anchored?.scrollIntoView({ behavior: "smooth", block: "center" });
    const marker = this.element<HTMLElement>(`[data-marker-id="${annotation.id}"]`);
    if (marker) this.showMarker(annotation, marker);
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  }

  private async deleteFeedback(annotation: Annotation) {
    try {
      const response = await fetch(apiUrl(this.options.apiBase, `/api/reviews/${this.options.reviewId}/annotations/${annotation.id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!response.ok) throw new Error("Could not delete feedback.");
      this.annotations = this.annotations.filter((entry) => entry.id !== annotation.id);
      this.renderMarkers();
      this.showReviewPanel();
      this.showNotice("Feedback deleted");
    } catch {
      this.showNotice("Could not delete feedback");
    }
  }

  private async sendComment(event: SubmitEvent) {
    event.preventDefault();
    const selected = this.selected;
    const editing = this.editingAnnotation;
    if (!selected && !editing) return;
    const form = event.currentTarget as HTMLFormElement;
    const error = form.querySelector<HTMLElement>(".error")!;
    error.hidden = true;
    const comment = String(new FormData(form).get("comment") || "").trim();
    try {
      const response = await fetch(apiUrl(this.options.apiBase, editing
        ? `/api/reviews/${this.options.reviewId}/annotations/${editing.id}`
        : `/api/reviews/${this.options.reviewId}/annotations`), {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
        body: JSON.stringify(editing ? { comment } : {
          comment,
          anchor: {
            selector: selected!.selector,
            label: selected!.label,
            text: selected!.text,
            position: selected!.position,
            kind: selected!.kind,
            ...(selected!.quote ? { quote: selected!.quote } : {}),
            ...(selected!.geometry ? { geometry: selected!.geometry } : {}),
          },
          page: {
            url: window.location.href,
            path: window.location.pathname,
            viewport: { width: window.innerWidth, height: window.innerHeight },
          },
        }),
      });
      const annotation = await response.json();
      if (!response.ok) throw new Error(annotation.error || "Could not send feedback.");
      if (editing) this.annotations = this.annotations.map((entry) => entry.id === annotation.id ? annotation : entry);
      else this.annotations.push(annotation);
      this.renderMarkers();
      this.cancelComment(false);
      this.showReviewPanel();
      this.showNotice(editing ? "Feedback updated" : `Feedback ${this.annotations.length} saved`);
    } catch (caught) {
      error.textContent = caught instanceof Error ? caught.message : "Could not send feedback.";
      error.hidden = false;
    }
  }

  private async loadAnnotations() {
    try {
      const response = await fetch(apiUrl(this.options.apiBase, `/api/reviews/${this.options.reviewId}/annotations`), { headers: { Authorization: `Bearer ${this.token}` } });
      if (!response.ok) return;
      this.annotations = await response.json();
      this.renderMarkers();
      const focusId = window.location.hash.startsWith("#annote=") ? window.location.hash.slice("#annote=".length) : "";
      const focused = this.annotations.find((annotation) => annotation.id === focusId);
      if (focused) window.setTimeout(() => this.focusFeedback(focused), 0);
    } catch {
      // A feedback tool should never interfere with the website it is reviewing.
    }
  }

  private renderMarkers() {
    const markers = this.element<HTMLElement>(".markers");
    markers.replaceChildren();
    const count = this.element<HTMLElement>(".count");
    count.textContent = String(this.annotations.length);
    count.hidden = this.annotations.length === 0;
    this.renderHighlights();
    this.renderVisuals();
    this.renderReviewPanel();
    this.annotations.forEach((annotation, index) => {
      const geometry = annotation.anchor.geometry;
      const anchored = annotation.anchor.kind === "text" || geometry ? null : document.querySelector(annotation.anchor.selector);
      const rect = anchored?.getBoundingClientRect();
      const point = rect
        ? { x: rect.right - 8, y: rect.top - 8 }
        : { x: (geometry?.x ?? annotation.anchor.position.x) - window.scrollX, y: (geometry?.y ?? annotation.anchor.position.y) - window.scrollY };
      const marker = document.createElement("button");
      marker.className = "marker";
      marker.dataset.markerId = annotation.id;
      marker.textContent = String(index + 1);
      marker.style.left = `${Math.max(8, point.x)}px`;
      marker.style.top = `${Math.max(8, point.y)}px`;
      marker.title = "View feedback";
      marker.addEventListener("click", () => this.showMarker(annotation, marker));
      markers.append(marker);
    });
  }

  private showMarker(annotation: Annotation, marker: HTMLElement) {
    const card = this.element<HTMLElement>(".marker-card");
    const rect = marker.getBoundingClientRect();
    card.innerHTML = `<strong>Feedback</strong><p></p>`;
    card.querySelector("p")!.textContent = annotation.anchor.kind === "text" ? `“${annotation.anchor.quote || annotation.anchor.text}” — ${annotation.comment}` : annotation.comment;
    const railWidth = this.element<HTMLElement>(".review-panel").hidden ? 0 : 394;
    card.style.left = `${Math.max(16, Math.min(window.innerWidth - railWidth - 316, Math.max(16, rect.left - 258)))}px`;
    card.style.top = `${Math.max(16, rect.top + 32)}px`;
    card.hidden = !card.hidden;
  }

  private renderVisuals() {
    const layer = this.element<SVGSVGElement>(".visual-layer");
    layer.replaceChildren();
    const geometries = this.annotations.map((annotation) => annotation.anchor.geometry).filter((geometry): geometry is AnnotationGeometry => Boolean(geometry));
    if (this.draftGeometry) geometries.push(this.draftGeometry);
    geometries.forEach((geometry) => {
      const node = this.visualNode(geometry);
      if (node) layer.append(node);
    });
  }

  private visualNode(geometry: AnnotationGeometry) {
    const create = (name: string) => document.createElementNS("http://www.w3.org/2000/svg", name);
    if (geometry.type === "freehand") {
      const points = geometry.points || [];
      if (points.length < 2) return null;
      const path = create("polyline");
      path.setAttribute("class", "visual-ink");
      path.setAttribute("points", points.map((point) => `${point.x - window.scrollX},${point.y - window.scrollY}`).join(" "));
      return path;
    }
    const width = geometry.width || 0;
    const height = geometry.height || 0;
    const x = Math.min(geometry.x, geometry.x + width) - window.scrollX;
    const y = Math.min(geometry.y, geometry.y + height) - window.scrollY;
    const absoluteWidth = Math.abs(width);
    const absoluteHeight = Math.abs(height);
    if (geometry.type === "circle") {
      const ellipse = create("ellipse");
      ellipse.setAttribute("class", "visual-shape");
      ellipse.setAttribute("cx", String(x + absoluteWidth / 2));
      ellipse.setAttribute("cy", String(y + absoluteHeight / 2));
      ellipse.setAttribute("rx", String(absoluteWidth / 2));
      ellipse.setAttribute("ry", String(absoluteHeight / 2));
      return ellipse;
    }
    const rectangle = create("rect");
    rectangle.setAttribute("class", "visual-shape");
    rectangle.setAttribute("x", String(x));
    rectangle.setAttribute("y", String(y));
    rectangle.setAttribute("width", String(absoluteWidth));
    rectangle.setAttribute("height", String(absoluteHeight));
    return rectangle;
  }

  private renderHighlights() {
    const highlightConstructor = (globalThis as typeof globalThis & { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    const registry = (CSS as typeof CSS & { highlights?: { set(name: string, highlight: unknown): void; delete(name: string): void } }).highlights;
    if (!highlightConstructor || !registry) return;
    const ranges = this.annotations.flatMap((annotation) => {
      if (annotation.anchor.kind !== "text" || !annotation.anchor.quote) return [];
      const root = document.querySelector(annotation.anchor.selector);
      const range = root ? textRangeFor(root, annotation.anchor.quote) : null;
      return range ? [range] : [];
    });
    registry.delete(this.highlightName);
    if (ranges.length) registry.set(this.highlightName, new highlightConstructor(...ranges));
    let style = document.head.querySelector<HTMLStyleElement>("style[data-annote-highlight-style]");
    if (!style) {
      style = document.createElement("style");
      style.dataset.annoteHighlightStyle = "true";
      document.head.append(style);
    }
    style.textContent = `::highlight(${this.highlightName}) { background: rgba(255, 214, 94, .72); color: inherit; }`;
  }
}

export const Annote = {
  mount(options: AnnoteOptions) {
    return new AnnoteWidget(options).mount();
  },
};

if (typeof window !== "undefined") {
  Object.assign(window, { Annote });
}
