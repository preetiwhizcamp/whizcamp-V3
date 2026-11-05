/**
 * Whizcamp Main Application Script  (performance build)
 * - Single init path: no duplicate listeners / GSAP contexts
 * - Smooth scroll: Lenis driven by the GSAP ticker, synced with ScrollTrigger
 * - Scroll work is rAF-throttled; layout reads are batched
 * - Heavy images are prefetched in idle time so nothing pops in while scrolling
 */
(function () {
  'use strict';
  if (window.__wcApp) return;
  window.__wcApp = true;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var resizeFns = [];
  var lenis = null;
  var refreshQueued = false;

  /* ------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------ */
  function onResize(fn) { resizeFns.push(fn); }

  function debounce(fn, ms) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function rafThrottle(fn) {
    var queued = false, lastArgs;
    return function () {
      lastArgs = arguments;
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        fn.apply(null, lastArgs);
      });
    };
  }

  var idle = window.requestIdleCallback
    ? function (fn) { window.requestIdleCallback(fn, { timeout: 2500 }); }
    : function (fn) { setTimeout(fn, 250); };

  function setupGsap() {
    if (!window.gsap) return false;
    if (!window.__wcGsap) {
      gsap.config({ autoSleep: 60, nullTargetWarn: false });
      gsap.ticker.lagSmoothing(0);
      if (window.ScrollTrigger) {
        gsap.registerPlugin(ScrollTrigger);
        ScrollTrigger.config({
          ignoreMobileResize: true,
          limitCallbacks: true,
          autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load'
        });
      }
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) gsap.ticker.sleep();
        else gsap.ticker.wake();
      });
      window.__wcGsap = true;
    }
    return true;
  }

  function hydrateImgs(root) {
    if (!root) return;
    var imgs = root.querySelectorAll('img[data-src]');
    for (var i = 0; i < imgs.length; i++) {
      if (!imgs[i].getAttribute('src')) imgs[i].src = imgs[i].getAttribute('data-src');
    }
  }

  /* one coalesced ScrollTrigger refresh, no matter how many callers */
  function refreshST() {
    if (!window.ScrollTrigger || refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(function () {
      refreshQueued = false;
      ScrollTrigger.refresh();
    });
  }

  function scrollToY(y) {
    if (lenis) lenis.scrollTo(y, { duration: 1.1 });
    else window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  /* ------------------------------------------------------------------
     Smooth scroll (Lenis on the GSAP ticker) — keeps native scrolling,
     so position:sticky and the fixed case-study pin keep working.
     ------------------------------------------------------------------ */
  function initSmoothScroll() {
    if (lenis || reduceMotion || !window.Lenis || !setupGsap()) return;

    lenis = new Lenis({
      duration: 1.15,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
      syncTouch: false
    });
    window.__wcLenis = lenis;

    if (window.ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);

    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href');
      if (!id || id.length < 2) return;
      var el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset: -80, duration: 1.2 });
    });
  }

  /* ------------------------------------------------------------------
     Images: async decode + lazy-load everything that is well below the fold
     ------------------------------------------------------------------ */
  function initImages() {
    var vh = window.innerHeight || 800;
    var imgs = document.querySelectorAll('img[src]');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (!img.hasAttribute('decoding')) img.decoding = 'async';
      if (!img.hasAttribute('loading')) {
        if (img.getBoundingClientRect().top > vh * 1.5) img.loading = 'lazy';
      }
    }
  }

  function initBrandMedia() {
    var slides = document.querySelectorAll('.brands-slider .brand-slide img');
    for (var i = 0; i < slides.length; i++) {
      slides[i].decoding = 'async';
      if (i > 3) slides[i].loading = 'lazy';
    }
  }

  /* ------------------------------------------------------------------
     Services Accordion
     ------------------------------------------------------------------ */
  function initAccordion() {
    var root = document.querySelector('.services-accordion');
    if (!root || root.dataset.wcReady) return;
    root.dataset.wcReady = '1';

    var items = Array.prototype.slice.call(root.querySelectorAll('[data-service-item]'));
    if (!items.length) return;

    var AUTOPLAY_MS = 6000;
    root.style.setProperty('--svc-duration', AUTOPLAY_MS + 'ms');

    var current = -1;
    var started = false;
    var inView = false;
    var hydratedAll = false;

    function syncPlayState() {
      root.classList.toggle('is-paused', !inView || document.hidden);
    }

    function setExpanded(item, expanded) {
      var row = item.querySelector('.services-accordion__row');
      var panel = item.querySelector('.services-accordion__panel');
      item.classList.toggle('is-expanded', expanded);
      row.setAttribute('aria-expanded', String(expanded));
      panel.setAttribute('aria-hidden', String(!expanded));
    }

    function restartProgress() {
      items.forEach(function (it) { it.classList.remove('is-playing'); });
      if (current < 0) return;
      void items[current].offsetWidth;
      items[current].classList.add('is-playing');
    }

    function openItem(index) {
      current = index;
      items.forEach(function (it, i) { setExpanded(it, i === index); });
      hydrateImgs(items[index]);
      restartProgress();
    }

    function next() {
      openItem((current + 1) % items.length);
    }

    function hydrateRest() {
      if (hydratedAll) return;
      hydratedAll = true;
      var i = 0;
      (function step() {
        if (i >= items.length) return;
        hydrateImgs(items[i++]);
        idle(step);
      })();
    }

    items.forEach(function (item, index) {
      var row = item.querySelector('.services-accordion__row');
      var toggle = item.querySelector('.services-accordion__toggle');
      var panel = item.querySelector('.services-accordion__panel');
      var title = item.querySelector('.services-accordion__title');

      panel.hidden = false;
      panel.removeAttribute('hidden');
      panel.style.maxHeight = '';
      panel.style.opacity = '';

      var bar = document.createElement('span');
      bar.className = 'services-accordion__progress';
      bar.setAttribute('aria-hidden', 'true');
      item.appendChild(bar);
      bar.addEventListener('animationend', function () {
        if (current === index) next();
      });

      title.id = title.id || 'service-title-' + (index + 1);
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-labelledby', title.id);
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      if (panel.id) row.setAttribute('aria-controls', panel.id);
      toggle.setAttribute('tabindex', '-1');
      toggle.setAttribute('aria-hidden', 'true');
      toggle.removeAttribute('aria-controls');
      toggle.removeAttribute('aria-expanded');

      function activate() {
        started = true;
        openItem(index);
      }
      row.addEventListener('click', activate);
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });

      setExpanded(item, false);
    });

    document.addEventListener('visibilitychange', syncPlayState);

    function onEnter() {
      if (!started) {
        started = true;
        openItem(0);
      }
      hydrateRest();
    }

    if ('IntersectionObserver' in window) {
      /* wake the autoplay only when the section is really on screen */
      new IntersectionObserver(function (entries) {
        var was = inView;
        inView = entries[0].isIntersecting;
        syncPlayState();
        if (inView && !was) onEnter();
      }, { threshold: 0.15 }).observe(root);

      /* start fetching the hidden panel images before the user arrives */
      new IntersectionObserver(function (entries, io) {
        if (entries[0].isIntersecting) { hydrateRest(); io.disconnect(); }
      }, { rootMargin: '1200px 0px' }).observe(root);
    } else {
      inView = true;
      syncPlayState();
      onEnter();
    }
  }

  /* ------------------------------------------------------------------
     Marquees (ticker + brand logos)
     ------------------------------------------------------------------ */
  function initMarquees() {
    if (!setupGsap()) return;
    if (document.documentElement.dataset.wcMarquee) return;
    document.documentElement.dataset.wcMarquee = '1';

    function setupMarquee(cfg) {
      var track = document.querySelector(cfg.track);
      var view = document.querySelector(cfg.view);
      if (!track || !view) return;

      var state = { tween: null, visible: true, lastWidth: 0 };

      function clear() {
        if (state.tween) { state.tween.kill(); state.tween = null; }
        track.querySelectorAll('[data-marquee-clone]').forEach(function (n) { n.remove(); });
        gsap.set(track, { x: 0 });
      }

      function init() {
        clear();
        state.lastWidth = view.offsetWidth;
        if (reduceMotion) { view.style.overflowX = 'auto'; return; }

        var items = Array.prototype.slice.call(track.children);
        if (!items.length) return;

        function addSet() {
          items.forEach(function (n) {
            var c = n.cloneNode(true);
            c.setAttribute('data-marquee-clone', '');
            c.setAttribute('aria-hidden', 'true');
            var imgs = c.querySelectorAll('img');
            for (var i = 0; i < imgs.length; i++) { imgs[i].loading = 'lazy'; imgs[i].decoding = 'async'; }
            track.appendChild(c);
          });
        }

        addSet();
        var firstClone = track.querySelector('[data-marquee-clone]');
        var W = firstClone.offsetLeft - items[0].offsetLeft;
        if (W <= 0) return;

        var need = Math.ceil(view.offsetWidth / W);
        for (var k = 1; k < need; k++) addSet();

        state.tween = gsap.to(track, {
          x: -W,
          duration: W / cfg.speed,
          ease: 'none',
          repeat: -1,
          force3D: true
        });
        state.tween.paused(!state.visible);
      }

      if (canHover) {
        view.addEventListener('mouseenter', function () {
          if (state.tween) gsap.to(state.tween, { timeScale: 0, duration: 0.6, ease: 'power2.out', overwrite: true });
        });
        view.addEventListener('mouseleave', function () {
          if (state.tween) gsap.to(state.tween, { timeScale: 1, duration: 0.8, ease: 'power2.inOut', overwrite: true });
        });
      }

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          state.visible = entries[0].isIntersecting;
          if (state.tween) state.tween.paused(!state.visible);
        }, { threshold: 0 }).observe(view);
      }

      onResize(function () {
        if (Math.abs(view.offsetWidth - state.lastWidth) > 1) init();
      });

      init();
    }

    setupMarquee({ view: '.frame-wrapper .frame', track: '.frame-wrapper .frame .div', speed: 55 });
    setupMarquee({ view: '.brands-slider-wrap', track: '.brands-slider', speed: 70 });
  }

  /* ------------------------------------------------------------------
     Case study cursor follower (one layout read per frame, not per event)
     ------------------------------------------------------------------ */
  function initCaseStudyCursor() {
    if (!setupGsap() || !canHover) return;
    if (document.documentElement.dataset.wcCursor) return;
    document.documentElement.dataset.wcCursor = '1';

    var HALF = 134 / 2;

    document.querySelectorAll('.cs-card__media').forEach(function (media) {
      var circle = media.querySelector('.group-42');
      if (!circle) return;

      gsap.set(circle, { x: 0, y: 0, scale: 0, autoAlpha: 0, transformOrigin: '50% 50%' });

      var moveX = gsap.quickTo(circle, 'x', { duration: 0.45, ease: 'power3.out' });
      var moveY = gsap.quickTo(circle, 'y', { duration: 0.45, ease: 'power3.out' });
      var inside = false, cx = 0, cy = 0;

      var follow = rafThrottle(function () {
        if (!inside) return;
        var r = media.getBoundingClientRect();
        var s = r.width / media.offsetWidth || 1;
        moveX((cx - r.left) / s - HALF);
        moveY((cy - r.top) / s - HALF);
      });

      function enter(e) {
        cx = e.clientX; cy = e.clientY;
        var r = media.getBoundingClientRect();
        var s = r.width / media.offsetWidth || 1;
        inside = true;
        gsap.killTweensOf(circle, 'scale,opacity,visibility');
        gsap.set(circle, { x: (cx - r.left) / s - HALF, y: (cy - r.top) / s - HALF });
        gsap.to(circle, { scale: 1, autoAlpha: 1, duration: 0.5, ease: 'back.out(1.6)' });
      }

      function leave() {
        inside = false;
        gsap.to(circle, { scale: 0, autoAlpha: 0, duration: 0.3, ease: 'power2.in' });
      }

      media.addEventListener('pointermove', function (e) {
        if (!inside) { enter(e); return; }
        cx = e.clientX; cy = e.clientY;
        follow();
      }, { passive: true });
      media.addEventListener('pointerenter', enter);
      media.addEventListener('pointerleave', leave);
    });
  }

  /* ------------------------------------------------------------------
     Featured projects pin / stack  (scrubbed timeline = works both ways)
     ------------------------------------------------------------------ */
  function initCaseStudiesPin() {
    if (!setupGsap() || !window.ScrollTrigger) return;
    var home = document.querySelector('.homepage');
    var stack = document.querySelector('[data-cs-stack]');
    var pin = document.querySelector('[data-cs-pin]');
    var scaleEl = document.querySelector('[data-cs-scale]');
    var inner = document.querySelector('.cs-inner');
    var row = document.querySelector('.cs-more');
    var more = document.querySelector('[data-cs-more]');
    if (!home || !stack || !pin || !scaleEl || !inner || !row) return;
    if (stack.dataset.wcReady) return;
    stack.dataset.wcReady = '1';

    var cards = gsap.utils.toArray('[data-cs-card]');
    var heads = gsap.utils.toArray('.cs-card__head');
    var N = cards.length;
    var STEP = 560;
    var DIST = STEP * (N - 1);
    var PIN_H = 1050;

    document.querySelectorAll('.cs-card__media, [data-cs-more]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (a.getAttribute('href') === '#') e.preventDefault();
      });
    });

    /* these images are scrubbed in from the side: load them early, not on demand */
    idle(function () {
      cards.forEach(function (c) {
        var im = c.querySelector('img');
        if (im) im.loading = 'eager';
      });
    });

    var qt = [];
    for (var q = 1; q < N; q++) {
      var parts = heads[q].querySelector('.PROJECT').textContent.split(' - ');
      var el = document.createElement('p');
      el.className = 'cs-qtitle';
      el.appendChild(document.createTextNode(parts[0] + ' -'));
      el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(parts.slice(1).join(' - ')));
      inner.appendChild(el);
      qt[q] = el;
    }

    function pageScale() {
      return home.offsetWidth ? home.getBoundingClientRect().width / home.offsetWidth : 1;
    }
    function fit() {
      return Math.max(0.6, Math.min(1, (window.innerHeight / pageScale() - 32) / PIN_H));
    }
    function topOffset() {
      return Math.max(16, (window.innerHeight - PIN_H * fit() * pageScale()) / 2);
    }

    var ctx, state = '', native = true, dash = 80, lastW = 0;

    function fitStack() {
      var sc = pageScale();
      stack.style.marginLeft = '0px';
      row.style.marginLeft = '0px';
      stack.style.width = '991px';
      var rowLeft = row.getBoundingClientRect().left;
      var left = stack.getBoundingClientRect().left;
      var w = document.documentElement.clientWidth / sc;
      stack.style.marginLeft = (-left / sc) + 'px';
      stack.style.width = w + 'px';
      row.style.marginLeft = (-rowLeft / sc) + 'px';
      row.style.width = w + 'px';
      row.style.paddingLeft = '0px';
      dash = rowLeft / sc;
      row.style.setProperty('--cs-dash-left', dash + 'px');
      stack.style.setProperty('--cs-dash-left', dash + 'px');
      var f = fit();
      pin.style.height = (PIN_H * f) + 'px';
      row.style.marginTop = (-10 - 230 * f) + 'px';
      gsap.set(scaleEl, { scale: f, transformOrigin: '50% 0' });
    }

    function setPin(mode) {
      if (state === mode) return;
      state = mode;
      var st = pin.style;
      st.position = mode === 'fixed' ? 'fixed' : 'absolute';
      st.top = mode === 'before' ? '0px' : mode === 'fixed' ? topOffset() + 'px' : 'auto';
      st.bottom = mode === 'after' ? '0px' : 'auto';
    }

    function build() {
      fitStack();
      native = getComputedStyle(home).transform === 'none';
      var sc = pageScale();
      var vw = document.documentElement.clientWidth / sc;
      var innerLeft = (vw - 991) / 2;
      var f = fit();
      var cx = vw / 2;
      var rightX = cx + (cx - dash) / f - innerLeft;

      var MAIN = { x: 0, y: 98, w: 991, h: 530, r: 12 };
      var T3 = { w: 200, h: 124, r: 6 };
      T3.x = rightX - T3.w; T3.y = 858 - T3.h;
      var T2 = { w: 280, h: 173, r: 8 };
      T2.x = T3.x - 48 - T2.w; T2.y = 858 - T2.h;
      var OFF = { x: rightX + vw, y: T3.y, w: T3.w, h: T3.h, r: 6 };
      function P(o) {
        return { x: o.x, y: o.y, width: o.w, height: o.h, borderRadius: o.r, force3D: true };
      }

      ctx = gsap.context(function () {
        gsap.set(cards, { left: 0, top: 0, marginLeft: 0, force3D: true });
        gsap.set(cards[0], P(MAIN));
        if (cards[1]) gsap.set(cards[1], P(T2));
        if (cards[2]) gsap.set(cards[2], P(T3));
        if (cards[3]) gsap.set(cards[3], P(OFF));
        gsap.set(heads.slice(1), { autoAlpha: 0, y: 14 });
        qt.forEach(function (el, i) {
          if (!el) return;
          gsap.set(el, { left: T2.x - 305, top: T2.y + 24, autoAlpha: i === 1 ? 1 : 0 });
        });

        var tl = gsap.timeline({ defaults: { ease: 'none' } });
        function mv(card, from, to, t) {
          var toVars = P(to);
          toVars.duration = 0.6;
          toVars.ease = 'none';
          toVars.immediateRender = false;
          tl.fromTo(card, P(from), toVars, t);
        }
        for (var s = 0; s < N - 1; s++) {
          var t0 = s + 0.05;
          tl.to(heads[s], { autoAlpha: 0, y: -14, duration: 0.2 }, s + 0.02);
          tl.to(cards[s], { scale: 0.95, duration: 0.6 }, t0);
          mv(cards[s + 1], T2, MAIN, t0);
          if (cards[s + 2]) mv(cards[s + 2], T3, T2, t0);
          if (cards[s + 3]) mv(cards[s + 3], OFF, T3, t0);
          tl.to(heads[s + 1], { autoAlpha: 1, y: 0, duration: 0.3 }, s + 0.35);
          tl.to(qt[s + 1], { autoAlpha: 0, duration: 0.2 }, s + 0.02);
          if (qt[s + 2]) tl.to(qt[s + 2], { autoAlpha: 1, duration: 0.3 }, s + 0.65);
        }
        tl.to({}, { duration: 0.05 }, N - 1 - 0.05);

        var btnTween = null;
        if (more) {
          gsap.set(more, { autoAlpha: 0, y: 40 });
          btnTween = gsap.to(more, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power3.out', paused: true });
        }

        var lastIdx = -1;
        var btnOn = false;
        var lastPin = '';
        function sync(self) {
          var p = self.progress;
          var mode = native ? (p <= 0 ? 'before' : p >= 1 ? 'after' : 'fixed') : 'before';
          if (mode !== lastPin) { lastPin = mode; setPin(mode); }
          if (!native) gsap.set(pin, { y: p * DIST });
          var idx = Math.min(N - 1, Math.floor(tl.time() + 0.35));
          if (idx !== lastIdx) {
            lastIdx = idx;
            for (var i = 0; i < N; i++) cards[i].classList.toggle('is-active', i === idx);
          }
          if (btnTween) {
            var show = p > 0.9;
            if (show !== btnOn) { btnOn = show; if (show) btnTween.play(); else btnTween.reverse(); }
          }
        }

        ScrollTrigger.create({
          trigger: stack,
          start: function () { return 'top ' + topOffset(); },
          end: function () { return '+=' + DIST * pageScale(); },
          animation: tl,
          /* Lenis already smooths the scroll, so scrub 1:1; fall back to a light lag without it */
          scrub: lenis ? true : 0.4,
          anticipatePin: 0,
          fastScrollEnd: true,
          invalidateOnRefresh: true,
          onRefresh: function (self) { state = ''; lastIdx = -1; lastPin = ''; sync(self); },
          onUpdate: sync
        });
      });
    }

    function rebuild() {
      var w = window.innerWidth;
      if (Math.abs(w - lastW) < 2 && ctx) return;
      lastW = w;
      if (ctx) ctx.revert();
      state = '';
      pin.removeAttribute('style');
      build();
    }

    lastW = window.innerWidth;
    build();
    onResize(rebuild);
  }

  /* ------------------------------------------------------------------
     Industries: sticky image + list (scroll-position driven, both directions)
     ------------------------------------------------------------------ */
  function initIndustries() {
    if (!setupGsap()) return;
    var list = document.querySelector('.after-case-studies .frame-42');
    var hero = document.querySelector('.after-case-studies .rectangle-20');
    if (!list || !hero || list.closest('.ind-layout') || list.dataset.wcReady) return;
    list.dataset.wcReady = '1';

    var IMAGES = [
      null,
      'assets/images/rectangle-25050.webp',
      'assets/images/rectangle-25040.webp',
      'assets/images/rectangle-25028-2.webp',
      'assets/images/rectangle-25028.webp',
      'assets/images/rectangle-25017.webp',
      'assets/images/rectangle-25028-2.webp',
      'assets/images/rectangle-25050.webp',
      'assets/images/rectangle-25054.png',
      'assets/images/rectangle-25028.webp',
      'assets/images/rectangle-25028-1.webp',
      'assets/images/rectangle-25017.webp'
    ];

    var DESKTOP = '(min-width: 901px)';
    var DUR = 0.55;

    var rows = Array.prototype.slice.call(list.querySelectorAll('.group-119'));
    if (!rows.length) return;

    var heroSrc = hero.getAttribute('src');

    function rowTitle(row) {
      var t = '';
      row.querySelectorAll('div').forEach(function (d) {
        if (d.children.length) return;
        var s = d.textContent.trim();
        if (!t && s && !/^\d+$/.test(s)) t = s;
      });
      return t;
    }

    var layout = document.createElement('div');
    layout.className = 'ind-layout';
    var media = document.createElement('div');
    media.className = 'ind-media';
    list.parentNode.insertBefore(layout, list);
    layout.appendChild(list);
    layout.appendChild(media);

    function fallback(img) {
      img.addEventListener('error', function () {
        var png = (img.getAttribute('src') || '').replace(/\.webp$/i, '.png');
        if (png && img.getAttribute('src') !== png) img.src = png;
        else if (img.getAttribute('src') !== heroSrc) img.src = heroSrc;
      });
    }

    var layers = rows.map(function (row, i) {
      var img;
      if (i === 0) {
        img = hero;
      } else {
        img = hero.cloneNode(false);
        img.removeAttribute('src');
        img.setAttribute('data-src', IMAGES[i] || heroSrc);
        img.loading = 'lazy';
        img.decoding = 'async';
      }
      img.alt = rowTitle(row);
      fallback(img);
      media.appendChild(img);
      return img;
    });

    var inlines = rows.map(function (row, i) {
      var fig = document.createElement('div');
      fig.className = 'ind-inline';
      var im = document.createElement('img');
      im.setAttribute('data-src', IMAGES[i] || heroSrc);
      im.alt = rowTitle(row);
      im.loading = 'lazy';
      im.decoding = 'async';
      fallback(im);
      fig.appendChild(im);
      row.parentNode.insertBefore(fig, row.nextSibling);
      return fig;
    });

    function ensureSrc(img, eager) {
      if (eager) img.loading = 'eager';
      if (!img.getAttribute('src')) {
        img.src = img.getAttribute('data-src') || heroSrc;
      }
    }

    var current = -1;
    var shown = 0;
    var isDesktop = window.matchMedia(DESKTOP).matches;

    gsap.set(layers, { opacity: 0, scale: 1.08, zIndex: 0 });
    gsap.set(layers[0], { opacity: 1, scale: 1, zIndex: 1 });
    ensureSrc(layers[0]);

    function swapLayer(i) {
      if (i === shown) return;
      ensureSrc(layers[i], true);
      var inEl = layers[i], outEl = layers[shown];
      shown = i;
      gsap.killTweensOf([inEl, outEl]);
      gsap.set(inEl, { zIndex: 2 });
      gsap.set(outEl, { zIndex: 1 });
      gsap.fromTo(inEl,
        { opacity: 0, scale: 1.08 },
        { opacity: 1, scale: 1, duration: DUR, ease: 'power2.out', overwrite: true });
      gsap.to(outEl, {
        opacity: 0, scale: 0.97, duration: DUR, ease: 'power2.inOut', overwrite: true,
        onComplete: function () { gsap.set(outEl, { scale: 1.08, zIndex: 0 }); }
      });
    }

    function setActive(i) {
      if (i === current) return;
      current = i;
      rows.forEach(function (r, k) { r.classList.toggle('is-active', k === i); });
      inlines.forEach(function (f, k) {
        var on = k === i;
        f.classList.toggle('is-open', on);
        if (on) ensureSrc(f.querySelector('img'), true);
      });
      swapLayer(i);
    }

    rows.forEach(function (row, i) {
      row.setAttribute('tabindex', '0');
      row.setAttribute('role', 'button');
      function go() {
        if (isDesktop) {
          var b = row.getBoundingClientRect();
          scrollToY(window.pageYOffset + b.top + b.height / 2 - window.innerHeight / 2);
        }
        setActive(i);
      }
      row.addEventListener('click', go);
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });

    /* active row = the one closest to the viewport centre. Evaluated at most once per
       frame, only while the list is on screen, so it is correct scrolling up AND down. */
    var visible = false;
    function pickFromRects() {
      if (!isDesktop || !visible) return;
      var mid = window.innerHeight / 2, best = 0, bestD = Infinity;
      for (var k = 0; k < rows.length; k++) {
        var b = rows[k].getBoundingClientRect();
        var d = Math.abs(b.top + b.height / 2 - mid);
        if (d < bestD) { bestD = d; best = k; }
      }
      setActive(best);
    }
    var tick = rafThrottle(pickFromRects);
    window.addEventListener('scroll', tick, { passive: true });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) tick();
      }, { rootMargin: '0px' }).observe(layout);

      /* fetch every picture in idle time before the user reaches the list */
      var prefetched = false;
      new IntersectionObserver(function (entries, io) {
        if (!entries[0].isIntersecting || prefetched) return;
        prefetched = true;
        io.disconnect();
        var i = 0;
        (function step() {
          if (i >= rows.length) return;
          ensureSrc(isDesktop ? layers[i] : inlines[i].querySelector('img'), true);
          i++;
          idle(step);
        })();
      }, { rootMargin: '1500px 0px' }).observe(layout);
    } else {
      visible = true;
    }

    function applyMode() {
      isDesktop = window.matchMedia(DESKTOP).matches;
      if (isDesktop) {
        pickFromRects();
        if (current < 0) setActive(0);
      } else {
        var keep = current < 0 ? 0 : current;
        current = -1;
        setActive(keep);
      }
    }

    var mq = window.matchMedia(DESKTOP);
    if (mq.addEventListener) mq.addEventListener('change', applyMode);
    else if (mq.addListener) mq.addListener(applyMode);

    applyMode();
  }

  /* ------------------------------------------------------------------
     FAQ
     ------------------------------------------------------------------ */
  function initFaq() {
    var wrap = document.querySelector('.group-173 .group-175');
    var tabsBar = document.querySelector('.group-173 .frame-52');
    if (!wrap || !tabsBar || wrap.dataset.wcReady) return;
    wrap.dataset.wcReady = '1';

    var FAQS = [
      [
        { q: 'Where Is Whizcamp LLC Based, And Do You Work With US Clients?',
          a: 'Whizcamp LLC is headquartered in Texas, USA, serving clients across the United States, Australia, the United Kingdom, and some of the world’s most advanced technology and innovation hubs. We are committed to delivering seamless collaboration, reliable support, and exceptional client success worldwide.' },
        { q: 'How Long Has Whizcamp LLC Been Operating And What\'s Your Team Size?',
          a: 'We have 8+ years of experience, with 35+ engineers, designers and strategists under one roof. In that time we have delivered 4.1K+ projects and helped startups raise $9M in funding.' },
        { q: 'What Industries Do You Specialise In?',
          a: 'We work across healthcare and wellness, travel and hospitality, logistics and transportation, retail and e-commerce, food delivery, sports and fitness, education and e-learning, real estate, electric vehicles, finance, games and SaaS.' },
        { q: 'Is Whizcamp LLC A Registered And Legally Compliant Business?',
          a: 'Yes. Whizcamp LLC is a registered limited liability company based in Austin, Texas, and we operate in line with the legal and data-protection requirements of the regions we serve.' }
      ],
      [
        { q: 'How Do We Get Started Working Together?',
          a: 'Start with a free 30-minute consultation or our Free AI Readiness Assessment. We learn about your goals, recommend an approach, and share a clear scope and timeline before any work begins.' },
        { q: 'How Much Does A Project Cost?',
          a: 'Pricing depends on scope, complexity and timeline. After the initial consultation we provide a transparent proposal, so you know exactly what you are paying for before you commit.' },
        { q: 'Do You Offer A Trial Or Post-Launch Support?',
          a: 'Yes. New clients can enjoy a 1-week free trial, and every launch is backed by 45 days of post-launch support so issues are resolved quickly.' },
        { q: 'How Long Does A Typical Project Take?',
          a: 'AI modernization of an existing platform is typically delivered in 6–12 weeks, and we can launch a new AI-powered product in as little as 30 days depending on scope.' }
      ],
      [
        { q: 'What Services Do You Offer?',
          a: 'AI & machine learning, cyber security, mobile app development, website development, DevOps & cloud, digital marketing and IT staff augmentation.' },
        { q: 'Can You Add AI To Our Existing Platform Without A Rebuild?',
          a: 'Yes. We integrate LLM chatbots, predictive analytics, voice and NLP interfaces and intelligent automation directly into your existing stack, so you gain new capabilities without a costly rebuild.' },
        { q: 'Which Technologies Do You Work With?',
          a: 'React / Next.js, React Native and Flutter, Python and FastAPI, Kubernetes, AWS, Azure and GCP, Figma and Framer, plus LLM integration and data pipelines.' },
        { q: 'How Do You Keep Projects On Track?',
          a: 'We use agile development with clear milestones, regular check-ins and complete transparency, so you always know where your project stands.' }
      ],
      [
        { q: 'Is My Idea Protected?',
          a: 'Yes. Your idea is 100% protected by our non-disclosure agreement, which we are happy to sign before you share any details.' },
        { q: 'How Do You Keep Our Data And Systems Secure?',
          a: 'Security is built in from day one: zero-trust principles, threat detection, cloud security and SOC readiness are part of how we design and deploy every solution.' },
        { q: 'Do We Own The Code And Product You Build?',
          a: 'You do. Ownership and intellectual property terms are set out clearly in our agreement, so the finished product belongs to you.' },
        { q: 'How Do You Handle Communication And Accountability?',
          a: 'Trust and accountability are core values. We provide honest, regular updates and complete transparency at every step of the project.' }
      ]
    ];

    var CHEVRON =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';

    function esc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    wrap.classList.add('faq-panels');
    wrap.innerHTML = FAQS.map(function (set, p) {
      return '<div class="faq-tabpanel' + (p === 0 ? ' is-active' : '') + '" role="tabpanel" id="faq-panel-' + p + '" aria-labelledby="faq-tab-' + p + '">' +
        '<div class="faq-clip"><div class="faq-list">' +
        set.map(function (f, i) {
          var open = i === 0;
          var n = (i < 9 ? '0' : '') + (i + 1) + '.';
          return '<div class="faq-item' + (open ? ' is-open' : '') + '">' +
            '<button class="faq-item__head" type="button" aria-expanded="' + open + '" id="faq-q-' + p + '-' + i + '" aria-controls="faq-a-' + p + '-' + i + '">' +
              '<span class="faq-item__q"><span class="faq-item__n">' + n + '</span> ' + esc(f.q) + '</span>' +
              '<span class="faq-item__icon">' + CHEVRON + '</span>' +
            '</button>' +
            '<div class="faq-item__panel" id="faq-a-' + p + '-' + i + '" role="region" aria-labelledby="faq-q-' + p + '-' + i + '">' +
              '<div class="faq-item__panel-inner"><p class="faq-item__a">' + esc(f.a) + '</p></div>' +
            '</div></div>';
        }).join('') +
        '</div></div></div>';
    }).join('');

    var panels = Array.prototype.slice.call(wrap.querySelectorAll('.faq-tabpanel'));

    function setOpen(item, open) {
      item.classList.toggle('is-open', open);
      item.querySelector('.faq-item__head').setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function resetPanel(panel) {
      var items = panel.querySelectorAll('.faq-item');
      Array.prototype.forEach.call(items, function (it, idx) { setOpen(it, idx === 0); });
    }

    var tabs = Array.prototype.slice.call(tabsBar.children);
    tabsBar.setAttribute('role', 'tablist');

    function select(i, focus) {
      tabs.forEach(function (t, k) {
        var on = k === i, label = t.firstElementChild;
        t.classList.toggle('frame-53', on);
        t.classList.toggle('frame-54', !on);
        if (label) {
          label.classList.toggle('text-wrapper-110', on);
          label.classList.toggle('text-wrapper-111', !on);
        }
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.setAttribute('tabindex', on ? '0' : '-1');
      });
      panels.forEach(function (p, k) {
        var on = k === i;
        p.classList.toggle('is-active', on);
        if (on) resetPanel(p);
      });
      if (focus) tabs[i].focus();
    }

    tabs.forEach(function (t, i) {
      t.setAttribute('role', 'tab');
      t.id = 'faq-tab-' + i;
      t.setAttribute('aria-controls', 'faq-panel-' + i);
      t.addEventListener('click', function () { select(i); });
      t.addEventListener('keydown', function (e) {
        var n = tabs.length;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); select((i + 1) % n, true); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); select((i - 1 + n) % n, true); }
      });
    });
    select(0);

    wrap.addEventListener('click', function (e) {
      var head = e.target.closest('.faq-item__head');
      if (!head) return;
      var item = head.parentNode;
      var was = item.classList.contains('is-open');
      Array.prototype.forEach.call(item.parentNode.querySelectorAll('.faq-item.is-open'), function (it) { setOpen(it, false); });
      if (!was) setOpen(item, true);
    });
  }

  /* ------------------------------------------------------------------
     Testimonials nav — swap the two quote columns
     ------------------------------------------------------------------ */
  function initTestimonials() {
    var root = document.querySelector('.group-153');
    if (!root || root.dataset.wcReady) return;
    var prev = root.querySelector('.testy-nav__prev');
    var next = root.querySelector('.testy-nav__next');
    var a = root.querySelector('.group-162');
    var b = root.querySelector('.group-167');
    if (!prev || !next || !a || !b) return;
    root.dataset.wcReady = '1';

    function swap() {
      var parent = a.parentNode;
      var afterB = b.nextSibling;
      parent.insertBefore(b, a);
      parent.insertBefore(a, afterB);
      var tmp = a; a = b; b = tmp;
    }
    prev.addEventListener('click', swap);
    next.addEventListener('click', swap);
  }

  /* ------------------------------------------------------------------
     Skip painting big decorative glows while they are far off-screen
     ------------------------------------------------------------------ */
  function initOffscreenPaint() {
    var nodes = document.querySelectorAll(
      '.orbit-badge__ring, .ellipse-2, .ellipse-3, .ellipse-4, .ellipse-5, .ellipse-7, .ellipse-8, .ellipse-9, .group-101, .group-102, .group-190'
    );
    if (!nodes.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        entries[i].target.classList.toggle('wc-offpaint', !entries[i].isIntersecting);
      }
    }, { rootMargin: '900px 0px' });
    for (var i = 0; i < nodes.length; i++) io.observe(nodes[i]);
  }

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'IMG' || t.dataset.wcFb) return;
    var src = t.getAttribute('src') || '';
    if (!/\.webp$/i.test(src)) return;
    t.dataset.wcFb = '1';
    t.src = src.replace(/\.webp$/i, '.png');
  }, true);

  function init() {
    try { initImages(); } catch (e) { console.error('[images]', e); }
    try { initSmoothScroll(); } catch (e) { console.error('[smooth]', e); }
    try { initBrandMedia(); } catch (e) { console.error('[media]', e); }
    try { initAccordion(); } catch (e) { console.error('[accordion]', e); }
    try { initMarquees(); } catch (e) { console.error('[marquee]', e); }
    try { initCaseStudyCursor(); } catch (e) { console.error('[cursor]', e); }
    try { initCaseStudiesPin(); } catch (e) { console.error('[casestudies]', e); }
    try { initIndustries(); } catch (e) { console.error('[industries]', e); }
    try { initFaq(); } catch (e) { console.error('[faq]', e); }
    try { initTestimonials(); } catch (e) { console.error('[testimonials]', e); }
    try { initOffscreenPaint(); } catch (e) { console.error('[paint]', e); }

    /* ScrollTrigger refreshes itself on resize; we only rebuild our own width-dependent bits */
    window.addEventListener('resize', debounce(function () {
      for (var i = 0; i < resizeFns.length; i++) resizeFns[i]();
    }, 250), { passive: true });

    /* layout settles after fonts + images: one coalesced refresh each */
    if (document.readyState === 'complete') refreshST();
    else window.addEventListener('load', refreshST, { once: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refreshST);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();