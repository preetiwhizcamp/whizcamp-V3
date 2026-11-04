/**
 * Whizcamp Main Application Script
 */
(function () {
  'use strict';

  /**
   * Services Accordion — auto-play + progress bar + manual row click
   * A click opens that row and auto-play continues from it.
   */
  function initAccordion() {
    var root = document.querySelector('.services-accordion');
    if (!root) { console.warn('[accordion] .services-accordion not found'); return; }
    var items = Array.prototype.slice.call(root.querySelectorAll('[data-service-item]'));
    if (!items.length) { console.warn('[accordion] no items found'); return; }

    var AUTOPLAY_MS = 6000; // how long each row stays open

    root.style.setProperty('--svc-duration', AUTOPLAY_MS + 'ms');

    var current = -1;
    var started = false;
    var inView = false;

    function syncPlayState() {
      // Progress bar pauses while the section is off-screen or the tab is hidden
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
      void items[current].offsetWidth; // force reflow so the animation restarts at 0
      items[current].classList.add('is-playing');
    }

    function openItem(index) {
      current = index;
      items.forEach(function (it, i) { setExpanded(it, i === index); }); // only one open
      restartProgress();
    }

    function next() {
      openItem((current + 1) % items.length);
    }

    items.forEach(function (item, index) {
      var row = item.querySelector('.services-accordion__row');
      var toggle = item.querySelector('.services-accordion__toggle');
      var panel = item.querySelector('.services-accordion__panel');
      var title = item.querySelector('.services-accordion__title');

      // Remove anything the old accordion code left behind
      panel.hidden = false;
      panel.removeAttribute('hidden');
      panel.style.maxHeight = '';
      panel.style.opacity = '';

      // Progress bar (shown at the top of the row)
      var bar = document.createElement('span');
      bar.className = 'services-accordion__progress';
      bar.setAttribute('aria-hidden', 'true');
      item.appendChild(bar);
      bar.addEventListener('animationend', function () {
        if (current === index) next();
      });

      // Accessibility: the whole row is the control
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
        openItem(index); // opens this row, restarts its bar, then auto-play continues
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
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var was = inView;
          inView = entry.isIntersecting;
          syncPlayState();
          if (inView && !was) onEnter();
        });
      }, { threshold: 0.15 }).observe(root);
    } else {
      inView = true;
      syncPlayState();
      onEnter();
    }

    console.log('[accordion] ready,', items.length, 'items');
  }

  /**
   * AI Modernization — GSAP scroll reveals
   */
  function initModernizationMotion() {
    if (!window.gsap || !window.ScrollTrigger) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.registerPlugin(ScrollTrigger);

    var section = document.querySelector('.ai-modernization-section');
    if (!section) return;

    var leftItems = gsap.utils.toArray('.ai-modernization__sticky-inner > *');
    if (leftItems.length) {
      gsap.from(leftItems, {
        y: 30, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08,
        clearProps: 'transform,opacity',
        scrollTrigger: { trigger: section, start: 'top 85%', once: true }
      });
    }

    gsap.utils.toArray('.ai-modernization__right > div').forEach(function (card) {
      gsap.from(card, {
        y: 50, opacity: 0, duration: 0.9, ease: 'power3.out',
        clearProps: 'transform,opacity',
        scrollTrigger: { trigger: card, start: 'top 90%', once: true }
      });
    });

    window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  }

  function init() {
    try { initAccordion(); } catch (e) { console.error('[accordion] failed:', e); }
    try { initModernizationMotion(); } catch (e) { console.error('[motion] failed:', e); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/**
 * Whizcamp — continuous GSAP marquees
 *  1) top announcement ticker
 *  2) "Trusted by industry-leading brands" logo strip
 * Right -> left, seamless loop, eased pause on hover, pauses off-screen,
 * rebuilds on resize, respects prefers-reduced-motion.
 * Needs GSAP (already on the page). Replaces the Slick slider automatically.
 */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setupMarquee(cfg) {
    var track = document.querySelector(cfg.track);
    var view = document.querySelector(cfg.view);
    if (!track || !view || !window.gsap) return;

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
          track.appendChild(c);
        });
      }

      // one clone set -> measure the exact loop distance (works with gaps/padding)
      addSet();
      var firstClone = track.querySelector('[data-marquee-clone]');
      var W = firstClone.offsetLeft - items[0].offsetLeft;
      if (W <= 0) return;

      // add enough sets that the strip is always wider than viewport + one loop
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

    // eased pause / resume on hover (feels smoother than an abrupt stop)
    view.addEventListener('mouseenter', function () {
      if (state.tween) gsap.to(state.tween, { timeScale: 0, duration: 0.6, ease: 'power2.out', overwrite: true });
    });
    view.addEventListener('mouseleave', function () {
      if (state.tween) gsap.to(state.tween, { timeScale: 1, duration: 0.8, ease: 'power2.inOut', overwrite: true });
    });

    // don't animate while off-screen
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          state.visible = e.isIntersecting;
          if (state.tween) state.tween.paused(!state.visible);
        });
      }, { threshold: 0 }).observe(view);
    }

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (Math.abs(view.offsetWidth - state.lastWidth) > 1) init();
      }, 200);
    });

    init();
  }

  function start() {
    // switch the Slick slider off; GSAP drives the logo strip now
    if (window.jQuery && jQuery.fn && jQuery.fn.slick) {
      var $s = jQuery('.brands-slider');
      if ($s.hasClass('slick-initialized')) $s.slick('unslick');
    }

    setupMarquee({ view: '.frame-wrapper .frame', track: '.frame-wrapper .frame .div', speed: 55 });
    setupMarquee({ view: '.brands-slider-wrap', track: '.brands-slider', speed: 70 });
  }

  // 'load' runs after Slick's DOM-ready init, so unslick works and images have sized
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();
/**
 * Whizcamp — "View Case Study" circle follows the mouse inside the project image.
 * Pops in at the cursor, trails it smoothly (GSAP quickTo), shrinks away on leave.
 * Desktop / mouse only. Touch devices keep the default behaviour.
 */
(function () {
  'use strict';
  if (!window.gsap) return;
  if (window.matchMedia('(hover: none)').matches) return;

  var SIZE = 134;        // circle diameter in the design (px)
  var HALF = SIZE / 2;

  function init() {
    document.querySelectorAll('.cs-card__media').forEach(function (media) {
      var circle = media.querySelector('.group-42');
      if (!circle) return;

      gsap.set(circle, { x: 0, y: 0, scale: 0, autoAlpha: 0, transformOrigin: '50% 50%' });

      var moveX = gsap.quickTo(circle, 'x', { duration: 0.45, ease: 'power3.out' });
      var moveY = gsap.quickTo(circle, 'y', { duration: 0.45, ease: 'power3.out' });
      var inside = false;

      // pointer position in the image's own (unscaled) coordinates
      function local(e) {
        var r = media.getBoundingClientRect();
        var s = r.width / media.offsetWidth || 1;   // page / pin / card scaling
        return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
      }

      function enter(e) {
        var p = local(e);
        inside = true;
        gsap.killTweensOf(circle, 'scale,opacity,visibility');
        gsap.set(circle, { x: p.x - HALF, y: p.y - HALF });   // appear exactly under the cursor
        gsap.to(circle, { scale: 1, autoAlpha: 1, duration: 0.5, ease: 'back.out(1.6)' });
      }

      function leave() {
        inside = false;
        gsap.to(circle, { scale: 0, autoAlpha: 0, duration: 0.3, ease: 'power2.in' });
      }

      media.addEventListener('mousemove', function (e) {
        if (!inside) { enter(e); return; }      // also covers a card becoming active under a still pointer
        var p = local(e);
        moveX(p.x - HALF);
        moveY(p.y - HALF);
      });
      media.addEventListener('mouseenter', enter);
      media.addEventListener('mouseleave', leave);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

