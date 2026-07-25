import {
  ArrowRight,
  Check,
  ClipboardCheck,
  Code2,
  Github,
  LockKeyhole,
  MessageSquare,
  MousePointer2,
  ShieldCheck,
  Sparkles,
  X,
  createIcons,
} from "lucide";
import "./marketing.css";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="site-header">
    <a class="wordmark" href="#top" aria-label="Annote home"><span class="wordmark-mark"><i data-lucide="message-square"></i></span><span>Annote</span></a>
    <nav class="site-nav" aria-label="Main navigation">
      <a href="#workflow">How it works</a>
      <a href="#install">Install</a>
      <a href="https://github.com/estebancortes/annote" target="_blank" rel="noreferrer">GitHub</a>
    </nav>
    <a class="header-link" href="/demo.html">Try the demo <i data-lucide="arrow-right"></i></a>
  </header>

  <main id="top">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-backdrop" aria-hidden="true"></div>
      <div class="hero-content content-width">
        <p class="eyebrow light">Open-source website review</p>
        <h1 id="hero-title">Feedback belongs on the page, not buried in a thread.</h1>
        <p class="hero-copy">Annote gives clients one small, secure place to point at a live website, leave a note, and get out of your way.</p>
        <div class="hero-actions">
          <a class="button button-coral" href="/demo.html">Try the live demo <i data-lucide="arrow-right"></i></a>
          <a class="button button-ghost" href="https://github.com/estebancortes/annote" target="_blank" rel="noreferrer"><i data-lucide="github"></i>View source</a>
        </div>
        <div class="hero-proof"><span><i data-lucide="shield-check"></i>Self-hosted</span><span><i data-lucide="code-2"></i>Any stack</span><span><i data-lucide="lock-keyhole"></i>Review-code access</span></div>
      </div>
    </section>

    <section class="review-showcase content-width" id="workflow" aria-labelledby="workflow-title">
      <div class="section-intro">
        <p class="eyebrow">The review loop</p>
        <h2 id="workflow-title">One link. One clear conversation.</h2>
        <p>Clients click the part they mean. You see the actual page context, decide what to change, and resolve it without translating screenshots into work.</p>
      </div>
      <div class="review-window" aria-label="Annote client review interface preview">
        <div class="window-bar"><span class="window-dot coral"></span><span class="window-dot yellow"></span><span class="window-dot green"></span><span class="window-url">preview.studio.com</span><span class="window-mode">Review mode</span></div>
        <div class="window-body">
          <div class="preview-page">
            <div class="preview-nav"><strong>northstar</strong><span>Work</span><span>Approach</span><span>Contact</span></div>
            <div class="preview-hero"><div><p class="preview-kicker">Independent design studio</p><h3>Make a useful first impression.</h3><p>Websites and products with a clear point of view.</p><span class="preview-button">Start a project</span></div><div class="preview-art"><div class="preview-art-card"><p>This quarter</p><strong>A calmer way to make progress.</strong><span>New enquiries <b>+42%</b></span></div></div></div>
            <span class="feedback-pin pin-one">1</span><span class="feedback-pin pin-two">2</span>
          </div>
          <aside class="review-popover"><div class="popover-head"><span>New feedback</span><i data-lucide="x"></i></div><p class="target-label">hero-heading</p><p class="target-copy">Make a useful first impression.</p><label>What should change?</label><div class="fake-input">Could we make this specific to the launch?</div><span class="send-row">Send feedback <i data-lucide="arrow-right"></i></span></aside>
        </div>
      </div>
      <div class="workflow-steps">
        <article><span class="step-index">01</span><i data-lucide="lock-keyhole"></i><h3>Share a code</h3><p>Keep your preview link useful for clients, not every visitor who stumbles across it.</p></article>
        <article><span class="step-index">02</span><i data-lucide="mouse-pointer-2"></i><h3>Point to the thing</h3><p>A real element gets a real anchor, along with its page and viewport context.</p></article>
        <article><span class="step-index">03</span><i data-lucide="clipboard-check"></i><h3>Close the loop</h3><p>Open, resolve, or reopen feedback from a small inbox you control.</p></article>
      </div>
    </section>

    <section class="quiet-section">
      <div class="content-width photo-layout">
        <div class="photo-frame"><img src="/images/annote-workbench.png" alt="A web designer reviewing a website with pinned feedback comments on a laptop" /></div>
        <div class="photo-copy"><p class="eyebrow">For the working relationship</p><h2>Make it easy for clients to be precise.</h2><p>There is no new project-management ritual to teach. They open the preview, enter a review code, and write the note while they are looking at the work.</p><p>That tiny difference tends to make feedback calmer, clearer, and much easier to act on.</p></div>
      </div>
    </section>

    <section class="inbox-section content-width" aria-labelledby="inbox-title">
      <div class="section-intro compact"><p class="eyebrow">Your side of it</p><h2 id="inbox-title">A small inbox, not a second job.</h2></div>
      <div class="inbox-preview">
        <div class="inbox-sidebar"><div class="mini-brand"><span><i data-lucide="message-square"></i></span> Annote</div><span class="mini-nav active">Feedback <b>3</b></span><span class="mini-nav">Setup</span><small>Self-hosted</small></div>
        <div class="inbox-main"><div class="inbox-top"><div><p>Client review</p><h3>Northstar client preview</h3></div><span class="mini-button">Copy install</span></div><div class="inbox-filter"><strong>Feedback</strong><span>3 open&nbsp;&nbsp; 8 resolved</span></div><div class="feedback-row"><span class="row-number">1</span><div><span class="element-chip">hero-heading</span><p>Could we make this specific to the launch?</p><small>Make a useful first impression.</small></div><i data-lucide="check"></i></div><div class="feedback-row"><span class="row-number">2</span><div><span class="element-chip">hero-cta</span><p>Can we test a calmer label here?</p><small>Start a project</small></div><i data-lucide="check"></i></div><div class="feedback-row"><span class="row-number">3</span><div><span class="element-chip">client-logos</span><p>We should swap the final partner logo.</p><small>Northstar / Field Notes / Daylight</small></div><i data-lucide="check"></i></div></div>
      </div>
    </section>

    <section class="install-section" id="install">
      <div class="content-width install-layout">
        <div><p class="eyebrow light">No framework required</p><h2>Drop it into the site you already have.</h2><p>Annote is a browser widget. React, Vue, Laravel, WordPress, Webflow, static HTML: if the page can load JavaScript, it can host a review.</p><a class="button button-coral" href="https://github.com/estebancortes/annote#readme" target="_blank" rel="noreferrer">Read the setup <i data-lucide="arrow-right"></i></a></div>
        <pre aria-label="Example Annote installation"><code>&lt;script src="https://feedback.example.com/annote.js"&gt;&lt;/script&gt;
&lt;script&gt;
  Annote.mount({
    reviewId: "northstar-preview",
    apiBase: "https://feedback.example.com"
  });
&lt;/script&gt;</code></pre>
      </div>
    </section>

    <section class="open-source-section content-width">
      <div><p class="eyebrow">Open source, on purpose</p><h2>Own the feedback layer around your work.</h2><p>Run Annote on your own infrastructure, change it to suit your studio, and keep the client-review flow uncomplicated.</p></div>
      <div class="license-note"><i data-lucide="sparkles"></i><span>MIT licensed<br /><small>Free for personal and commercial use</small></span></div>
      <a class="button button-dark" href="https://github.com/estebancortes/annote" target="_blank" rel="noreferrer"><i data-lucide="github"></i>Open the repository</a>
    </section>
  </main>

  <footer class="site-footer content-width"><a class="wordmark" href="#top"><span class="wordmark-mark"><i data-lucide="message-square"></i></span><span>Annote</span></a><p>Made for clearer website reviews.</p><a href="https://github.com/estebancortes/annote" target="_blank" rel="noreferrer">GitHub</a></footer>
`;

createIcons({
  icons: { ArrowRight, Check, ClipboardCheck, Code2, Github, LockKeyhole, MessageSquare, MousePointer2, ShieldCheck, Sparkles, X },
  attrs: { "stroke-width": 2 },
});
