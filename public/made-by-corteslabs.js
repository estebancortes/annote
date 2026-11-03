/*
 * "Made by CORTÉSLabs" credit.
 * Any link with the data-corteslabs-credit attribute deciphers its text
 * (the same scramble effect as corteslabs.xyz) when it first scrolls into
 * view and again on hover. No dependencies; does nothing if the link is
 * missing or the visitor prefers reduced motion.
 */
(function () {
  var CHARS = '!<>-_\\/[]{}=+*^?#@$%&';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function scramble(el, text, duration) {
    if (el._ccBusy) return;
    el._ccBusy = true;
    var start = performance.now();
    var queue = [], last = 0, out = text;
    for (var i = 0; i < text.length; i++) {
      var t0 = Math.random() * 0.4;
      queue.push({ to: text[i], t0: t0, t1: t0 + 0.3 + Math.random() * 0.3 });
    }
    function frame(now) {
      var p = Math.min((now - start) / duration, 1);
      // new random characters about every 55 ms, not every frame, so it
      // reads as a calm decode rather than a flicker
      if (now - last < 55 && p < 1) { requestAnimationFrame(frame); return; }
      last = now;
      out = '';
      var done = 0;
      for (var k = 0; k < queue.length; k++) {
        var q = queue[k];
        if (q.to === ' ') { out += ' '; done++; }
        else if (p >= q.t1) { out += q.to; done++; }
        else if (p >= q.t0) out += CHARS[(Math.random() * CHARS.length) | 0];
        else out += q.to;
      }
      el.textContent = out;
      if (done < queue.length && p < 1) requestAnimationFrame(frame);
      else { el.textContent = text; el._ccBusy = false; }
    }
    requestAnimationFrame(frame);
  }

  function setup(el) {
    if (el._ccReady) return;
    el._ccReady = true;
    var text = el.textContent.trim();
    if (reduced) return;
    // keep the width steady while the characters change
    el.style.display = 'inline-block';
    el.style.whiteSpace = 'nowrap';
    var lock = function () { el.style.width = ''; el.style.width = Math.ceil(el.getBoundingClientRect().width) + 'px'; };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(lock); else lock();
    el.addEventListener('mouseenter', function () { scramble(el, text, 800); });
    el.addEventListener('focus', function () { scramble(el, text, 800); });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { scramble(el, text, 800); io.disconnect(); }
        });
      }, { threshold: 0.6 });
      io.observe(el);
    }
  }

  function init() {
    var els = document.querySelectorAll('[data-corteslabs-credit]');
    for (var i = 0; i < els.length; i++) setup(els[i]);
  }
  window.corteslabsCredit = init;   // single-page apps can call this after rendering
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // pick up a footer rendered later, or again after a page change,
  // by a framework (React, Next.js). Checks at most once per frame.
  if ('MutationObserver' in window) {
    var queued = false;
    var mo = new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; init(); });
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
