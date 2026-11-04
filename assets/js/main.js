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