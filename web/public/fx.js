(function () {
  if (window.__cxfx) return; window.__cxfx = true;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      if (el.hasAttribute('data-count') && !el.hasAttribute('data-reveal') && e.intersectionRatio < 0.9 && e.boundingClientRect.bottom > innerHeight - 60) return;
      io.unobserve(el);
      if (el.hasAttribute('data-reveal')) {
        var d = +(el.getAttribute('data-delay') || 0);
        setTimeout(function () { el.style.opacity = '1'; el.style.transform = 'none'; el.style.filter = 'none'; }, d);
      }
      if (el.hasAttribute('data-count') && !el.__counted) { el.__counted = 1; count(el); }
      if (el.hasAttribute('data-bar')) el.style.width = el.getAttribute('data-bar');
    });
  }, { threshold: [0.15, 0.5, 0.9, 1], rootMargin: '0px 0px -40px 0px' }) : null;

  function setTxt(el, v) { var t = el.firstChild; if (t && t.nodeType === 3 && el.childNodes.length === 1) t.nodeValue = v; else if (!el.firstElementChild) setTxt(el, v); }
  function count(el) {
    var sec = el.closest('section');
    if (sec && !el.__grp) { sec.querySelectorAll('[data-count]').forEach(function (o) { o.__grp = 1; if (o !== el && !o.__counted) { o.__counted = 1; if (io) io.unobserve(o); count(o); } }); }
    var to = parseFloat(el.getAttribute('data-count')), suf = el.getAttribute('data-suffix') || '', pre = el.getAttribute('data-prefix') || '';
    var fin = pre + to + suf;
    if (reduce || document.visibilityState === 'hidden') { setTxt(el, fin); return; }
    setTxt(el, pre + '0' + suf); var t0 = performance.now(), dur = 2800;
    function step() { var k = Math.min(1, (performance.now() - t0) / dur); k = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      setTxt(el, k >= 1 ? fin : pre + Math.round(to * k) + suf); if (k < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
    setTimeout(function () { setTxt(el, fin); }, dur + 300);
  }
  function show(el) {
    if (el.hasAttribute('data-reveal')) { el.style.opacity = '1'; el.style.transform = 'none'; el.style.filter = 'none'; }
    if (el.hasAttribute('data-bar')) el.style.width = el.getAttribute('data-bar');
    if (el.hasAttribute('data-count') && !el.__counted) { el.__counted = 1; count(el); }
  }
  // Kinetic type: one-shot word stagger for headlines (h1/h2 only), scroll-scrubbed word fill for ONE statement per page.
  var WS = /([ \t\n\r]+)/;
  function split(el) { return { orig: null, units: [el] }; }
  function restore(el, s) {}
  var kio = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { kio.unobserve(e.target); playK(e.target); } });
  }, { rootMargin: '0px 0px -12% 0px' }) : null;
  function playK(el) {
    var s = el.__ks; if (!s || el.__kp) return; el.__kp = 1;
    var n = s.units.length, step = Math.min(55, 650 / Math.max(1, n)), d0 = +(el.getAttribute('data-delay') || 0);
    s.units.forEach(function (u, i) { setTimeout(function () { u.style.opacity = '1'; u.style.transform = 'none'; }, d0 + i * step); });
    setTimeout(function () { restore(el, s); el.__ks = null; }, d0 + n * step + 1000);
  }
  function kinetic(el) {
    if (reduce || document.visibilityState === 'hidden') return;
    var s = el.__ks = split(el);
    s.units.forEach(function (u) { u.style.opacity = '0'; u.style.transform = 'translateY(.45em) rotate(1.5deg)'; u.style.transformOrigin = '0 100%';
      u.style.transition = 'opacity .7s cubic-bezier(.2,.7,.2,1), transform .9s cubic-bezier(.2,.7,.2,1)'; });
    if (!kio || inView(el)) requestAnimationFrame(function () { playK(el); }); else kio.observe(el);
  }
  var scrubs = [];
  function scrub(el) {
    if (reduce) return;
    var s = split(el); el.__ss = s;
    s.units.forEach(function (u) { u.style.transition = 'opacity .25s linear'; u.style.opacity = '.18'; });
    scrubs.push(el); tick();
  }
  var ticking = 0;
  function tick() { if (ticking) return; ticking = 1; requestAnimationFrame(function () { ticking = 0;
    scrubs.forEach(function (el) { var s = el.__ss; if (!s) return; var r = el.getBoundingClientRect(), vh = innerHeight;
      var p = Math.max(0, Math.min(1, (vh * .85 - r.top) / (vh * .4 + r.height))), n = s.units.length, lit = p * n;
      s.units.forEach(function (u, i) { u.style.opacity = String(.18 + .82 * Math.max(0, Math.min(1, lit - i))); }); }); }); }
  function revealAll() { document.querySelectorAll('[data-kinetic]').forEach(playK); scrubs.forEach(function (el) { if (el.__ss) el.__ss.units.forEach(function (u) { u.style.opacity = '1'; }); });
    document.querySelectorAll('[data-reveal],[data-bar],[data-count]').forEach(function (el) { if (io) io.unobserve(el); show(el);
    if (el.hasAttribute('data-count') && document.visibilityState === 'hidden') setTxt(el, (el.getAttribute('data-prefix') || '') + el.getAttribute('data-count') + (el.getAttribute('data-suffix') || '')); }); }
  function inView(el) { var r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }
  function init(el) {
    if (el.__cx) return; el.__cx = 1;
    if (el.hasAttribute('data-kinetic')) { kinetic(el); return; }
    if (el.hasAttribute('data-scrub')) { scrub(el); return; }
    if (!io || document.visibilityState === 'hidden' || inView(el)) {
      if (el.hasAttribute('data-bar')) { el.style.transition = 'width 1.4s cubic-bezier(.2,.7,.2,1)'; }
      if (el.hasAttribute('data-count')) { el.__counted = 1; count(el); }
      if (el.hasAttribute('data-bar')) el.style.width = el.getAttribute('data-bar');
      if (!el.hasAttribute('data-tilt') && !el.hasAttribute('data-scene') && !el.hasAttribute('data-magnetic')) return;
    } else if (el.hasAttribute('data-reveal') && !reduce) {
      var kind = el.getAttribute('data-reveal');
      el.style.opacity = '0';
      el.style.transform = kind === 'scale' ? 'scale(.94)' : kind === 'left' ? 'translateX(-32px)' : kind === 'right' ? 'translateX(32px)' : 'translateY(28px)';
      el.style.filter = 'blur(6px)';
      el.style.transition = 'opacity .9s cubic-bezier(.2,.7,.2,1), transform .9s cubic-bezier(.2,.7,.2,1), filter .9s';
    }
    if (el.hasAttribute('data-count') && !el.__counted && !reduce) setTxt(el, (el.getAttribute('data-prefix') || '') + '0' + (el.getAttribute('data-suffix') || ''));
    if (el.hasAttribute('data-bar') && !el.style.width) { el.style.transition = 'width 1.4s cubic-bezier(.2,.7,.2,1)'; el.style.width = '0%'; }
    if (io && !el.__counted && (el.hasAttribute('data-reveal') || el.hasAttribute('data-count') || el.hasAttribute('data-bar'))) io.observe(el);
    if (el.hasAttribute('data-tilt') && !reduce) {
      var max = +(el.getAttribute('data-tilt') || 8);
      el.style.transformStyle = 'preserve-3d';
      el.style.transition = (el.style.transition ? el.style.transition + ',' : '') + 'transform .4s cubic-bezier(.2,.7,.2,1)';
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        el.style.transform = 'perspective(900px) rotateY(' + (x * max) + 'deg) rotateX(' + (-y * max) + 'deg) translateZ(6px)';
        el.style.setProperty('--gx', (x + .5) * 100 + '%'); el.style.setProperty('--gy', (y + .5) * 100 + '%');
      });
      el.addEventListener('pointerleave', function () { el.style.transform = 'perspective(900px) rotateY(0) rotateX(0)'; });
    }
    if (el.hasAttribute('data-scene') && !reduce) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        el.querySelectorAll('[data-depth]').forEach(function (c) {
          var d = +c.getAttribute('data-depth');
          c.style.translate = (x * d * 40) + 'px ' + (y * d * 30) + 'px';
        });
      });
      el.addEventListener('pointerleave', function () { el.querySelectorAll('[data-depth]').forEach(function (c) { c.style.translate = '0 0'; }); });
      el.querySelectorAll('[data-depth]').forEach(function (c) { c.style.transition = 'translate .6s cubic-bezier(.2,.7,.2,1)'; });
    }
    if (el.hasAttribute('data-magnetic') && !reduce) {
      el.style.transition = 'translate .3s cubic-bezier(.2,.7,.2,1), background .2s, box-shadow .2s';
      el.addEventListener('pointermove', function (e) { var r = el.getBoundingClientRect();
        el.style.translate = ((e.clientX - r.left - r.width / 2) * .18) + 'px ' + ((e.clientY - r.top - r.height / 2) * .25) + 'px'; });
      el.addEventListener('pointerleave', function () { el.style.translate = '0 0'; });
    }
  }
  var SEL = '[data-kinetic],[data-scrub],[data-reveal],[data-count],[data-tilt],[data-scene],[data-magnetic],[data-bar]';
  function scan(root) { if (root.matches && root.matches(SEL)) init(root); if (root.querySelectorAll) root.querySelectorAll(SEL).forEach(init); }
  function start() {
    scan(document.body);
    new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); }); }); })
      .observe(document.body, { childList: true, subtree: true });
    // Safety net only for elements already scrolled past/at load that failed to fire — never pre-reveals content below the fold.
    setTimeout(function () { document.querySelectorAll('[data-reveal],[data-bar],[data-count],[data-kinetic]').forEach(function (el) {
      if (el.getBoundingClientRect().top < innerHeight) { if (el.hasAttribute('data-kinetic')) playK(el); else { if (io) io.unobserve(el); show(el); } } }); }, 2500);
    window.addEventListener('scroll', tick, { passive: true }); window.addEventListener('resize', tick);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') revealAll(); });
    window.addEventListener('beforeprint', revealAll);
    window.addEventListener('scroll', function () {
      var b = document.getElementById('cx-progress'); if (!b) return;
      var h = document.documentElement.scrollHeight - innerHeight; b.style.transform = 'scaleX(' + (h > 0 ? scrollY / h : 0) + ')';
    }, { passive: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
