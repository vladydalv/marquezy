/**
 * Marquezy — Frontend JS
 * Vanilla JS. No jQuery. No JSX.
 *
 * Every scrolling line is a `.marquezy-loop` element: .marquezy-loop > .marquezy-track > .marquezy-group > .marquezy-cycle.
 * The track holds [group A][group B]; CSS animates translateX(-50%) (reversed for `.marquezy-row--right`).
 * JS only fills group A to cover the line width, mirrors it into B and sets --marquezy-duration.
 * One ResizeObserver per loop rebuilds when the line width or the content width (web fonts) changes.
 *
 * The global bar (#marquezy-bar) additionally gets placement, sticky, pause and close behavior.
 * window.marquezy.initLoop(el) is used by the block editor preview.
 */
;(function () {
	'use strict';

	/* ═══════════════════════════════════════
	 * LOOP (global bar and block rows)
	 * ═══════════════════════════════════════ */
	var io = typeof IntersectionObserver !== 'undefined'
		? new IntersectionObserver(function (entries) {
			entries.forEach(function (e) {
				e.target.classList.toggle('is-marquezy-offscreen', !e.isIntersecting);
			});
		})
		: null;

	function makeClone(node) {
		var c = node.cloneNode(true);
		c.setAttribute('aria-hidden', 'true');
		c.setAttribute('inert', ''); // clones are not focusable / not announced
		return c;
	}

	/**
	 * @param {Element} root .marquezy-loop element
	 * @return {Function} destroy — restores the original markup and removes observers
	 */
	function initLoop(root) {
		if (root.__marquezyDestroy) return root.__marquezyDestroy;

		var track  = root.querySelector('.marquezy-track');
		var groupA = track && track.querySelector('.marquezy-group');
		var cycle  = groupA && groupA.querySelector('.marquezy-cycle');
		if (!cycle) return function () {};

		var speedEl      = root.closest('[data-marquezy-speed]');
		var speed        = Math.max(5, parseFloat(speedEl && speedEl.getAttribute('data-marquezy-speed')) || 60);
		var lastViewport = 0;
		var lastCycle    = 0;
		var frame        = 0;
		var ro           = null;
		var win          = root.ownerDocument.defaultView || window;

		function build() {
			frame = 0;
			// Layout sizes (offsetWidth / clientWidth) ignore transforms — tilted rows are measured unrotated.
			var viewport = root.clientWidth;
			var cycleW   = cycle.offsetWidth;
			if (!viewport || !cycleW) return; // hidden — the observer calls again when shown
			if (viewport === lastViewport && cycleW === lastCycle) return;
			lastViewport = viewport;
			lastCycle    = cycleW;

			// Group A must be at least as wide as the line.
			var need = Math.max(1, Math.ceil((viewport + 1) / cycleW)); // +1px: offsetWidth is rounded
			while (groupA.children.length < need) groupA.appendChild(makeClone(cycle));
			while (groupA.children.length > need) groupA.removeChild(groupA.lastElementChild);

			var groupB = makeClone(groupA);
			if (track.children[1]) track.replaceChild(groupB, track.children[1]);
			else track.appendChild(groupB);

			root.style.setProperty('--marquezy-duration', (need * cycleW / speed).toFixed(3) + 's');
			root.classList.add('is-marquezy-ready');
		}

		function schedule() {
			if (!frame) frame = win.requestAnimationFrame(build);
		}

		if (typeof win.ResizeObserver !== 'undefined') {
			ro = new win.ResizeObserver(schedule);
			ro.observe(root);  // line width, display:none ↔ visible
			ro.observe(cycle); // content width (web fonts loaded)
		} else {
			win.addEventListener('resize', schedule);
		}
		if (io && root.ownerDocument === document) io.observe(root);
		schedule();

		root.__marquezyDestroy = function () {
			if (frame) win.cancelAnimationFrame(frame);
			if (ro) ro.disconnect(); else win.removeEventListener('resize', schedule);
			if (io) io.unobserve(root);
			while (groupA.children.length > 1) groupA.removeChild(groupA.lastElementChild);
			while (track.children.length > 1) track.removeChild(track.lastElementChild);
			root.classList.remove('is-marquezy-ready', 'is-marquezy-offscreen');
			root.style.removeProperty('--marquezy-duration');
			delete root.__marquezyDestroy;
		};
		return root.__marquezyDestroy;
	}

	window.marquezy = { initLoop: initLoop };

	/* ═══════════════════════════════════════
	 * GLOBAL BAR
	 * ═══════════════════════════════════════ */
	function initGlobalBar(marquee) {
		if (document.documentElement.classList.contains('marquezy-closed')) { // flagged in <head>
			marquee.remove();
			return;
		}

		var cfg      = window.marquezyConfig || {};
		var cleanups = [];
		var HEADER_SELECTORS = [
			'header.wp-block-template-part',
			'.elementor-location-header',
			'#Header_wrapper', '.fusion-header-wrapper',
			'#masthead', '.site-header', '#site-header', '#header',
			'header[role="banner"]', 'body > header', 'header'
		];

		var header = place();
		cleanups.push(initLoop(marquee));
		initSticky();
		initPause();
		initClose();

		/* Placement */
		function isHeaderCandidate(el) {
			return el !== marquee &&
				!el.contains(marquee) &&
				!marquee.contains(el) &&
				!el.closest('main, article, [role="main"]');
		}

		function findHeader() {
			if (cfg.headerSelector) {
				try {
					var custom = document.querySelector(cfg.headerSelector);
					if (custom && isHeaderCandidate(custom)) return custom;
				} catch (e) { /* invalid selector — fall back to auto-detect */ }
			}
			for (var i = 0; i < HEADER_SELECTORS.length; i++) {
				var list = document.querySelectorAll(HEADER_SELECTORS[i]);
				for (var j = 0; j < list.length; j++) {
					if (isHeaderCandidate(list[j])) return list[j];
				}
			}
			return null;
		}

		function place() {
			// Placed by the server right after the header template part.
			if (marquee.getAttribute('data-marquezy-pos') === 'header') {
				return marquee.previousElementSibling;
			}
			var h = findHeader();
			if (h) {
				if (h.nextElementSibling !== marquee) h.after(marquee);
			} else if (marquee.getAttribute('data-marquezy-pos') === 'footer') {
				document.body.prepend(marquee);
			}
			return h;
		}

		/* Sticky */
		function findStickyElement(el) {
			if (!el) return null;
			var candidates = [el, el.firstElementChild, el.parentElement];
			for (var i = 0; i < candidates.length; i++) {
				var c = candidates[i];
				if (!c || c === document.body || c === marquee) continue;
				var pos = window.getComputedStyle(c).position;
				if (pos === 'sticky' || pos === 'fixed') return c;
			}
			return null;
		}

		function initSticky() {
			var mode = cfg.stickyMode;
			if (mode !== 'always' && mode !== 'smart') return;

			var stickyHeader = findStickyElement(header);
			var adminBar     = document.getElementById('wpadminbar');
			var barFixed     = false;
			var ticking      = false;
			var stuck        = false;
			var ph           = null;

			function refreshBar() {
				barFixed = !!adminBar && window.getComputedStyle(adminBar).position === 'fixed';
			}

			function topOffset() {
				var el = stickyHeader || (barFixed ? adminBar : null);
				return el ? Math.max(0, Math.round(el.getBoundingClientRect().bottom)) : 0;
			}

			if (mode === 'smart') {
				// Placeholder sits before the marquee: its top is always the marquee's natural top.
				ph = document.createElement('div');
				ph.className = 'marquezy-bar-placeholder';
				ph.setAttribute('aria-hidden', 'true');
				marquee.parentNode.insertBefore(ph, marquee);
			}

			function update() {
				ticking = false;
				var top = topOffset();

				if (mode === 'always') {
					marquee.style.setProperty('--marquezy-top', top + 'px');
					return;
				}

				// smart: read first, then write
				var naturalTop = ph.getBoundingClientRect().top;
				var height     = marquee.offsetHeight;
				if (naturalTop < top) {
					if (!stuck) {
						stuck = true;
						ph.style.height = height + 'px';
						marquee.classList.add('marquezy-bar--stuck');
					}
					marquee.style.setProperty('--marquezy-top', top + 'px');
				} else if (stuck) {
					stuck = false;
					ph.style.height = '';
					marquee.classList.remove('marquezy-bar--stuck');
				}
			}

			function requestUpdate() {
				if (!ticking) {
					ticking = true;
					requestAnimationFrame(update);
				}
			}

			function onResize() {
				refreshBar();
				requestUpdate();
			}

			refreshBar();
			update();

			// "always" without a sticky header / fixed admin bar has a constant top — no scroll work.
			var needsScroll = mode === 'smart' || !!stickyHeader || barFixed;
			if (needsScroll) window.addEventListener('scroll', requestUpdate, { passive: true });
			window.addEventListener('resize', onResize, { passive: true });

			cleanups.push(function () {
				window.removeEventListener('scroll', requestUpdate);
				window.removeEventListener('resize', onResize);
				if (ph) ph.remove();
			});
		}

		/* Pause button */
		function initPause() {
			var btn = marquee.querySelector('.marquezy-pause');
			if (!btn) return;
			btn.addEventListener('click', function () {
				var paused = marquee.classList.toggle('marquezy-bar--paused');
				btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
			});
		}

		/* Close — remembered per content hash: new announcements show up again */
		function initClose() {
			var btn = marquee.querySelector('.marquezy-close');
			if (!btn) return;
			btn.addEventListener('click', function (e) {
				e.preventDefault();
				persistClose();
				while (cleanups.length) cleanups.pop()();
				marquee.remove();
			}, { once: true });
		}

		function persistClose() {
			var k    = 'marquezy_closed';
			var hash = cfg.contentHash || '';
			try {
				if ((cfg.closePersist || 'session') === 'session') {
					sessionStorage.setItem(k, hash);
				} else {
					var days = cfg.closePersist === 'week' ? 7 : 1;
					localStorage.setItem(k, hash + '|' + (Date.now() + days * 864e5));
				}
			} catch (e) { /* storage blocked */ }
		}
	}

	/* ═══════════════════════════════════════
	 * BOOT
	 * ═══════════════════════════════════════ */
	var bar = document.getElementById('marquezy-bar');
	if (bar) initGlobalBar(bar);

	function initRows(scope) {
		var loops = scope.querySelectorAll ? scope.querySelectorAll('.marquezy-row.marquezy-loop') : [];
		for (var i = 0; i < loops.length; i++) {
			if (!loops[i].__marquezyDestroy) initLoop(loops[i]);
		}
		if (scope.matches && scope.matches('.marquezy-row.marquezy-loop') && !scope.__marquezyDestroy) initLoop(scope);
	}
	initRows(document);

	// Rows added later (page-builder previews, AJAX content, popups) start too.
	if (typeof MutationObserver !== 'undefined' && document.body) {
		var pending = [];
		var queued  = false;
		new MutationObserver(function (records) {
			for (var r = 0; r < records.length; r++) {
				var added = records[r].addedNodes;
				for (var n = 0; n < added.length; n++) {
					var node = added[n];
					// Skip our own clones (inside a track) and non-elements.
					if (node.nodeType === 1 && !(node.closest && node.closest('.marquezy-track'))) pending.push(node);
				}
			}
			if (pending.length && !queued) {
				queued = true;
				requestAnimationFrame(function () {
					queued = false;
					var list = pending.splice(0);
					for (var k = 0; k < list.length; k++) {
						if (list[k].isConnected) initRows(list[k]);
					}
				});
			}
		}).observe(document.body, { childList: true, subtree: true });
	}
})();
