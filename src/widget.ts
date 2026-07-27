import { Check, Crosshair, Highlighter, LockKeyhole, MessageSquare, Send, X, createElement } from "lucide";
import type { Annotation } from "./types";

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
  kind: "element" | "text";
  quote?: string;
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
  const label = element.getAttribute("aria-label") || element.getAttribute("data-annote-id") || element.tagName.toLowerCase();
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
  private selected: SelectedTarget | null = null;
  private annotations: Annotation[] = [];
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
        .launcher:hover { transform: translateY(-2px); background: #008f7a; }
        .launcher svg { width: 20px; height: 20px; }
        .text-launcher { position: fixed; right: 80px; bottom: 28px; width: 36px; height: 36px; display: grid; place-items: center; border: 1px solid #c7d1ca; border-radius: 50%; background: #fff; color: #43524c; box-shadow: 0 8px 20px rgba(23,33,31,.16); pointer-events: auto; }
        .text-launcher:hover { border-color: #008f7a; color: #008f7a; }
        .text-launcher svg { width: 17px; height: 17px; }
        .count { position: absolute; right: -4px; top: -4px; min-width: 19px; height: 19px; display: grid; place-items: center; padding: 0 4px; border: 2px solid #fff; border-radius: 50%; background: #ef6b50; color: #fff; font-size: 10px; font-weight: 800; }
        .count[hidden] { display: none; }
        [data-tooltip]::after { content: attr(data-tooltip); position: absolute; right: 58px; top: 50%; transform: translateY(-50%); width: max-content; max-width: 220px; padding: 7px 9px; border-radius: 4px; background: #17211f; color: #fff; font-size: 12px; line-height: 1.2; opacity: 0; pointer-events: none; transition: opacity .14s ease; }
        [data-tooltip]:hover::after { opacity: 1; }
        .outline { position: fixed; display: none; border: 2px solid #008f7a; background: rgba(0,143,122,.08); border-radius: 3px; pointer-events: none; }
        .composer, .unlock, .notice { position: fixed; right: 22px; bottom: 82px; width: min(360px, calc(100vw - 32px)); padding: 18px; border: 1px solid #c7d1ca; border-radius: 7px; background: #fff; box-shadow: 0 18px 46px rgba(23,33,31,.18); pointer-events: auto; }
        .composer[hidden], .unlock[hidden], .notice[hidden] { display: none; }
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
        .marker { position: fixed; width: 25px; height: 25px; display: grid; place-items: center; border-radius: 50%; background: #ef6b50; color: #fff; box-shadow: 0 5px 12px rgba(104,36,21,.28); font-size: 12px; font-weight: 800; pointer-events: auto; }
        .marker:hover { transform: scale(1.08); }
        .marker-card { position: fixed; width: min(300px, calc(100vw - 32px)); padding: 14px; border: 1px solid #c7d1ca; border-radius: 7px; background: #fff; box-shadow: 0 18px 46px rgba(23,33,31,.18); pointer-events: auto; }
        .marker-card[hidden] { display: none; }
        .marker-card p { margin: 7px 0 0; color: #33433e; font-size: 13px; line-height: 1.45; }
        .pick-banner { position: fixed; left: 50%; top: 20px; transform: translateX(-50%); display: flex; align-items: center; gap: 9px; padding: 10px 13px; border-radius: 5px; background: #17211f; color: #fff; box-shadow: 0 10px 24px rgba(23,33,31,.2); font-size: 13px; font-weight: 700; pointer-events: none; }
        .pick-banner[hidden] { display: none; }
        .pick-banner svg { width: 16px; height: 16px; color: #73d7ba; }
        @media (max-width: 560px) { .launcher { right: 16px; bottom: 16px; } .composer, .unlock, .notice { right: 16px; bottom: 74px; } }
      </style>
      <div class="layer">
        <div class="outline"></div>
        <div class="pick-banner" hidden><i data-lucide="crosshair"></i><span>Select the part you want to discuss</span></div>
        <button class="text-launcher" data-action="highlight" data-tooltip="Highlight text" aria-label="Highlight text"><i data-lucide="highlighter"></i></button>
        <button class="launcher" data-action="launcher" data-tooltip="Add feedback point" aria-label="Add feedback point"><i data-lucide="message-square"></i><span class="count" hidden></span></button>
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
        <aside class="notice" hidden><i data-lucide="check"></i><span>Feedback sent</span></aside>
        <aside class="marker-card" hidden></aside>
        <div class="markers"></div>
      </div>
    `;
    this.renderIcons();
    this.bind();
    if (this.token) this.loadAnnotations();
    return this;
  }

  private sessionKey() {
    return `annote:${this.options.apiBase}:${this.options.reviewId}`;
  }

  private renderIcons() {
    const icons = { check: Check, crosshair: Crosshair, highlighter: Highlighter, "lock-keyhole": LockKeyhole, "message-square": MessageSquare, send: Send, x: X };
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
      if (this.token) this.startPicking();
      else this.showUnlock();
    });
    this.element<HTMLButtonElement>("[data-action='highlight']").addEventListener("click", () => {
      if (this.token) this.startTextSelecting();
      else this.showUnlock();
    });
    this.root.querySelectorAll("[data-action='close-unlock']").forEach((button) => button.addEventListener("click", () => this.hideUnlock()));
    this.root.querySelectorAll("[data-action='cancel-comment']").forEach((button) => button.addEventListener("click", () => this.cancelComment()));
    this.element<HTMLFormElement>("[data-form='unlock']").addEventListener("submit", (event) => this.unlock(event));
    this.element<HTMLFormElement>("[data-form='comment']").addEventListener("submit", (event) => this.sendComment(event));
    window.addEventListener("scroll", () => this.renderMarkers(), { passive: true });
    window.addEventListener("resize", () => this.renderMarkers());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (this.picking) this.stopPicking();
        else if (this.selectingText) this.stopTextSelecting();
        else this.cancelComment();
      }
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
      this.startPicking();
    } catch (caught) {
      error.textContent = caught instanceof Error ? caught.message : "Could not unlock feedback.";
      error.hidden = false;
    }
  }

  private startPicking() {
    this.cancelComment();
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
    this.cancelComment();
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

  private openComposer() {
    if (!this.selected) return;
    const composer = this.element<HTMLElement>(".composer");
    const target = this.element<HTMLElement>(".target");
    target.textContent = this.selected.text ? `${this.selected.label}: ${this.selected.text}` : `Selected ${this.selected.label}`;
    composer.hidden = false;
    window.setTimeout(() => this.element<HTMLTextAreaElement>("#annote-comment").focus(), 0);
  }

  private cancelComment() {
    this.selected = null;
    const composer = this.element<HTMLElement>(".composer");
    composer.hidden = true;
    const form = this.element<HTMLFormElement>("[data-form='comment']");
    form.reset();
    const error = form.querySelector<HTMLElement>(".error")!;
    error.hidden = true;
  }

  private showNotice(message = "Feedback sent") {
    const notice = this.element<HTMLElement>(".notice");
    notice.querySelector("span")!.textContent = message;
    notice.hidden = false;
    window.setTimeout(() => { notice.hidden = true; }, 2200);
  }

  private async sendComment(event: SubmitEvent) {
    event.preventDefault();
    const selected = this.selected;
    if (!selected) return;
    const form = event.currentTarget as HTMLFormElement;
    const error = form.querySelector<HTMLElement>(".error")!;
    error.hidden = true;
    const comment = String(new FormData(form).get("comment") || "").trim();
    try {
      const response = await fetch(apiUrl(this.options.apiBase, `/api/reviews/${this.options.reviewId}/annotations`), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({
          comment,
          anchor: {
            selector: selected.selector,
            label: selected.label,
            text: selected.text,
            position: selected.position,
            kind: selected.kind,
            ...(selected.quote ? { quote: selected.quote } : {}),
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
      this.annotations.push(annotation);
      this.renderMarkers();
      const nextMode = selected.kind;
      this.cancelComment();
      this.showNotice(`Feedback ${this.annotations.length} saved. Add another point or press Escape.`);
      if (nextMode === "text") this.startTextSelecting();
      else this.startPicking();
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
    this.annotations.forEach((annotation, index) => {
      const anchored = annotation.anchor.kind === "text" ? null : document.querySelector(annotation.anchor.selector);
      const rect = anchored?.getBoundingClientRect();
      const point = rect
        ? { x: rect.right - 8, y: rect.top - 8 }
        : { x: annotation.anchor.position.x - window.scrollX, y: annotation.anchor.position.y - window.scrollY };
      const marker = document.createElement("button");
      marker.className = "marker";
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
    card.style.left = `${Math.min(window.innerWidth - 316, Math.max(16, rect.left - 258))}px`;
    card.style.top = `${Math.max(16, rect.top + 32)}px`;
    card.hidden = !card.hidden;
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
