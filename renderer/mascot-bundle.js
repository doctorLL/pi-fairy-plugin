/* Fairy mascot bundle — generated from Fairy-DSH d639887a (Apache-2.0). Do not edit by hand. */
(function () {
  var __mods = {};
  var __cache = {};
  function __require(id) {
    id = String(id);
    if (id.slice(0, 2) === './') id = id.slice(2);
    if (__cache[id]) return __cache[id].exports;
    var m = (__cache[id] = { exports: {} });
    if (!__mods[id]) throw new Error('missing module: ' + id);
    __mods[id](m, m.exports, __require);
    return m.exports;
  }

  __mods["dom-observer-manager.js"] = function (module, exports, require) {
// Fairy Visual owns many replaceable official DOM surfaces, but they all live
// below one stable document.body. Virtual observers preserve each subsystem's
// callback and target semantics while sharing one native body observer.

const managers = new WeakMap();
const diagnostics = {
  start: () => typeof performance === 'object' && performance?.now ? performance.now() : Date.now(),
  metric(operation, startedAt, context = {}, thresholdMs = 0) {
    const clock = typeof performance === 'object' && performance?.now ? performance.now() : Date.now();
    const duration = clock - startedAt;
    if (duration < thresholdMs) return;
    console.info(`DSH_FAIRY_LOG ${JSON.stringify({ schema: 1, timestamp: new Date().toISOString(), level: 'info', module: 'dsh-fairy-visual', operation, event: 'metric', context, duration_ms: Number(duration.toFixed(3)) })}`);
  },
  error(operation, error, context = {}) {
    console.error(`DSH_FAIRY_LOG ${JSON.stringify({ schema: 1, timestamp: new Date().toISOString(), level: 'error', module: 'dsh-fairy-visual', operation, event: 'failure', context, error: { name: String(error?.name || 'Error'), message: String(error?.message || error).slice(0, 320) } })}`);
  },
};

function containsTarget(root, target, subtree) {
  if (root === target) return true;
  return subtree === true && Boolean(root?.contains?.(target));
}

function acceptsRecord(subscription, record) {
  const options = subscription.options;
  if (!containsTarget(subscription.target, record.target, options.subtree)) return false;
  if (record.type === 'childList') return options.childList === true;
  if (record.type === 'characterData') return options.characterData === true;
  if (record.type !== 'attributes' || options.attributes !== true) return false;
  return !options.attributeFilter?.length || options.attributeFilter.includes(record.attributeName);
}

function createDomObserverManager(documentRef) {
  const subscriptions = new Set();
  const subscriptionsByTarget = new WeakMap();
  const frameCallbacks = new Map();
  let bodyObserver = null;
  let rootObserver = null;
  let frame = 0;
  let callbackCount = 0;
  let deliveredRecordCount = 0;
  let suspended = false;

  const dispatch = (records, rootOnly) => {
    callbackCount += 1;
    deliveredRecordCount += records.length;
    // Set iteration preserves registration order, matching independent native
    // observers created in the same order while avoiding repeated DOM passes.
    subscriptions.forEach((subscription) => {
      if (!subscription.active || subscription.rootOnly !== rootOnly) return;
      const accepted = records.filter((record) => acceptsRecord(subscription, record));
      if (!accepted.length) return;
      const startedAt = diagnostics.start();
      try {
        subscription.callback(accepted, subscription.virtualObserver);
      } catch (error) {
        diagnostics.error('observer.callback', error, { record_count: accepted.length, root_only: rootOnly });
        // Native MutationObservers report callback failures without preventing
        // other observers in the same microtask from receiving their records.
        if (typeof reportError === 'function') reportError(error);
        else setTimeout(() => { throw error; }, 0);
      } finally {
        diagnostics.metric('observer.callback', startedAt, { record_count: accepted.length, root_only: rootOnly }, 8);
      }
    });
  };

  const mergedOptions = (entries) => {
    const attributeEntries = entries.filter((entry) => entry.options.attributes);
    const observesAllAttributes = attributeEntries.some((entry) => !entry.options.attributeFilter?.length);
    const filters = new Set(attributeEntries.flatMap((entry) => entry.options.attributeFilter || []));
    return {
      childList: entries.some((entry) => entry.options.childList),
      subtree: entries.some((entry) => entry.options.subtree),
      attributes: attributeEntries.length > 0,
      ...(!observesAllAttributes && filters.size ? { attributeFilter: [...filters] } : {}),
      characterData: entries.some((entry) => entry.options.characterData),
    };
  };

  const rebuildObserver = (rootOnly) => {
    if (!rootOnly && suspended) {
      bodyObserver?.disconnect();
      bodyObserver = null;
      return;
    }
    const entries = [...subscriptions].filter((entry) => entry.active && entry.rootOnly === rootOnly);
    let observer = rootOnly ? rootObserver : bodyObserver;
    observer?.disconnect();
    if (!entries.length || typeof MutationObserver !== 'function') {
      if (rootOnly) rootObserver = null;
      else bodyObserver = null;
      return;
    }
    if (!observer) observer = new MutationObserver((records) => dispatch(records, rootOnly));
    const entriesByTarget = new Map();
    entries.forEach((entry) => {
      const targetEntries = entriesByTarget.get(entry.target) || [];
      targetEntries.push(entry);
      entriesByTarget.set(entry.target, targetEntries);
    });
    entriesByTarget.forEach((targetEntries, target) => observer.observe(target, mergedOptions(targetEntries)));
    if (rootOnly) rootObserver = observer;
    else bodyObserver = observer;
  };

  const removeSubscription = (subscription) => {
    if (!subscription.active) return;
    subscription.active = false;
    subscriptions.delete(subscription);
    subscriptionsByTarget.get(subscription.target)?.delete(subscription);
    rebuildObserver(subscription.rootOnly);
  };

  const observe = (virtualObserver, target, options = {}) => {
    if (!target || typeof options !== 'object') throw new TypeError('MutationObserver target and options are required');
    const normalized = {
      childList: options.childList === true,
      subtree: options.subtree === true,
      attributes: options.attributes === true || Array.isArray(options.attributeFilter),
      attributeFilter: Array.isArray(options.attributeFilter) ? [...new Set(options.attributeFilter)] : null,
      characterData: options.characterData === true,
    };
    if (!normalized.childList && !normalized.attributes && !normalized.characterData) {
      throw new TypeError('MutationObserver requires childList, attributes, or characterData');
    }
    const previous = virtualObserver._subscriptions.get(target);
    if (previous) removeSubscription(previous);
    const rootOnly = target === documentRef.documentElement && normalized.subtree !== true;
    const subscription = { active: true, callback: virtualObserver._callback, options: normalized, rootOnly, target, virtualObserver };
    virtualObserver._subscriptions.set(target, subscription);
    subscriptions.add(subscription);
    let targetSubscriptions = subscriptionsByTarget.get(target);
    if (!targetSubscriptions) {
      targetSubscriptions = new Set();
      subscriptionsByTarget.set(target, targetSubscriptions);
    }
    targetSubscriptions.add(subscription);
    rebuildObserver(rootOnly);
  };

  const disconnect = (virtualObserver) => {
    [...virtualObserver._subscriptions.values()].forEach(removeSubscription);
    virtualObserver._subscriptions.clear();
  };

  const scheduleFrame = (key, callback) => {
    frameCallbacks.set(key, callback);
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        const callbacks = [...frameCallbacks.values()];
        frameCallbacks.clear();
        callbacks.forEach((run) => run());
      });
    }
    return frame;
  };

  const cancelFrame = (key) => {
    frameCallbacks.delete(key);
    if (!frameCallbacks.size && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };

  return {
    observe,
    disconnect,
    scheduleFrame,
    cancelFrame,
    suspend() {
      if (suspended) return;
      suspended = true;
      rebuildObserver(false);
    },
    resume() {
      if (!suspended) return;
      suspended = false;
      rebuildObserver(false);
    },
    inspect() {
      return {
        nativeObserverCount: Number(Boolean(bodyObserver)) + Number(Boolean(rootObserver)),
        bodyObserverCount: Number(Boolean(bodyObserver)),
        rootObserverCount: Number(Boolean(rootObserver)),
        subscriptionCount: subscriptions.size,
        callbackCount,
        deliveredRecordCount,
        pendingFrameCount: frameCallbacks.size,
        suspended,
      };
    },
  };
}

function getDomObserverManager(documentRef = document) {
  let manager = managers.get(documentRef);
  if (!manager) {
    manager = createDomObserverManager(documentRef);
    managers.set(documentRef, manager);
  }
  return manager;
}

function createManagedMutationObserver(callback, documentRef = document) {
  if (typeof callback !== 'function') throw new TypeError('MutationObserver callback must be a function');
  const manager = getDomObserverManager(documentRef);
  return {
    _callback: callback,
    _subscriptions: new Map(),
    observe(target, options) { manager.observe(this, target, options); },
    disconnect() { manager.disconnect(this); },
    takeRecords() { return []; },
  };
}

module.exports = { createDomObserverManager, getDomObserverManager, createManagedMutationObserver };

  };

  __mods["mascot-style.js"] = function (module, exports, require) {
'use strict';

const CSS = `
/* The host owns fixed positioning; this child fills the centered stage without intercepting input. */
[data-dsh-fairy-mascot-root="true"] {
	position: relative;
	width: min(76%, 36vh, 450px);
	height: min(76%, 36vh);
	aspect-ratio: 1;
	z-index: 99999;
	pointer-events: none;
	user-select: none;
	/* Keep the root as a non-composited overflow host. Safari clips transformed
	 * descendants to an ancestor's layout box when that ancestor owns opacity,
	 * isolation, or containment. Opacity is applied per visual SVG below. */
	overflow: visible;
}
[data-dsh-fairy-mascot-root="true"], [data-dsh-fairy-mascot-root="true"] * { box-sizing: border-box; }
html[data-dsh-fairy-visual][data-dsh-fairy-theme="light"] [data-dsh-fairy-mascot-root="true"] .dsh-fairy-halo path,
html[data-dsh-fairy-visual][data-dsh-fairy-theme="light"] [data-dsh-fairy-mascot-root="true"] .dsh-fairy-lash-pulse {
	stroke: #172531;
}
[data-dsh-fairy-mascot-root="true"] { --dsh-fairy-outer-halo-color: #c9f8ff; }
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-halo { color: #c9efff; }
html[data-dsh-fairy-visual][data-dsh-fairy-theme="light"] [data-dsh-fairy-mascot-root="true"] { --dsh-fairy-outer-halo-color: #172531; }
html[data-dsh-fairy-visual][data-dsh-fairy-theme="light"] [data-dsh-fairy-mascot-root="true"] .dsh-fairy-halo { color: #172531; }
/* Low-power mode removes only the expensive decorative raster work. */
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-outer-disc,
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-sclera,
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-highlight-glow {
	filter: none;
}
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-outer-halo,
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-sclera-halo,
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-sclera-contact,
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-highlight-halo {
	display: none;
}
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-halo,
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-lash-pulse {
	display: none;
}
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-corners,
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-lash-pulse-wave,
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-sclera,
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-layer-three,
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-layer-two,
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-layer-one,
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-thinking-clip-shape,
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-comforting-clip-shape {
	will-change: auto;
}
/* The source image remains legible while a regular glitch is active. */
[data-dsh-fairy-mascot-root="true"][data-transition-glitch] .dsh-fairy-outer-disc,
[data-dsh-fairy-mascot-root="true"][data-transition-glitch] .dsh-fairy-sclera,
[data-dsh-fairy-mascot-root="true"][data-transition-glitch] .dsh-fairy-highlight-glow,
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-signal[data-glitch] .dsh-fairy-outer-disc,
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-signal[data-glitch] .dsh-fairy-sclera,
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-signal[data-glitch] .dsh-fairy-highlight-glow {
	filter: none;
}
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-float {
	position: relative;
	width: 100%;
	height: 100%;
	overflow: visible;
}
[data-dsh-fairy-mascot-root="true"] svg {
	display: block;
	width: 100%;
	height: 100%;
	overflow: visible;
}
/* The expanding pulse has its own three-times viewport.  Its largest frame now
 * stays inside a real SVG viewport instead of relying on root-SVG overflow,
 * whose first-layout clipping differs across browser raster paths. */
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-pulse-layer {
	position: absolute;
	left: -100%;
	top: -100%;
	width: 300%;
	height: 300%;
	z-index: 0;
	opacity: .92;
	display: block;
	visibility: visible;
	pointer-events: none;
}
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-halo-layer {
	position: absolute;
	left: -112.5%;
	top: -43.75%;
	width: 325%;
	height: 200%;
	z-index: 0;
	pointer-events: none;
	opacity: .92;
}
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-main {
	position: relative;
	z-index: 1;
	/* The main eye is the opaque boundary; halo/pulse layers stay behind it. */
	opacity: 1;
}
/* The two glitch modes are mutually exclusive and selected by data-glitch. */
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-signal {
	transform-origin: 80px 80px;
}
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-signal[data-glitch],
[data-dsh-fairy-mascot-root="true"][data-transition-glitch] .dsh-fairy-signal {
	/* Two full-surface chromatic drop shadows were the most expensive transient
	 * part of a fault. The retained level shift plus displacement preserves the
	 * glitch expression without rasterizing the eye two additional times. */
	will-change: transform, filter;
	filter:
		brightness(var(--dsh-g-bright, 1.12))
		contrast(var(--dsh-g-contrast, 1.18));
	transform: translateX(var(--dsh-g-x, 0)) skewX(var(--dsh-g-skew, 0deg));
}
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-image {
	opacity: 1;
}
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-glitch-blocks {
	opacity: 0;
	display: none;
}
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-signal[data-glitch="threads"] > .dsh-fairy-image,
[data-dsh-fairy-mascot-root="true"][data-transition-glitch] .dsh-fairy-signal > .dsh-fairy-image {
	filter: url(#dsh-fairy-interference);
}
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-signal[data-glitch="blocks"] .dsh-fairy-glitch-blocks {
	opacity: 1;
	display: block;
}
/* Block clones contain their own lash animation; freeze all copies on one frame. */
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-signal[data-glitch="blocks"] .dsh-fairy-corners {
	animation: none !important;
	transform: rotate(var(--dsh-lash-angle, 0deg));
}
/* The five <use> slices inherit the eye's continuous animations. Pausing their
 * copies at the current frame keeps the same fractured image while avoiding five
 * extra pulse timelines and compositor layers for each short block fault. */
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-signal[data-glitch="blocks"] .dsh-fairy-glitch-blocks .dsh-fairy-sclera,
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-signal[data-glitch="blocks"] .dsh-fairy-glitch-blocks .dsh-fairy-layer-three,
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-signal[data-glitch="blocks"] .dsh-fairy-glitch-blocks .dsh-fairy-layer-two,
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-signal[data-glitch="blocks"] .dsh-fairy-glitch-blocks .dsh-fairy-layer-one {
	animation-play-state: paused !important;
	will-change: auto;
}
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-glitch-1 { transform: translateX(var(--dsh-g-s1-x, 0)); }
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-glitch-2 { transform: translateX(var(--dsh-g-s2-x, 0)); }
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-glitch-3 { transform: translateX(var(--dsh-g-s3-x, 0)); }
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-glitch-4 { transform: translateX(var(--dsh-g-s4-x, 0)); }
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-glitch-5 { transform: translateX(var(--dsh-g-s5-x, 0)); }
/* Constant lash rotation plus staggered, continuous inside-to-outside eye breathing. */
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-corners {
	animation: dsh-fairy-lashes calc(15s / var(--dsh-fairy-steady-rate, 1)) linear infinite;
	animation-delay: var(--dsh-lash-delay, 0s);
	transform-origin: 80px 80px;
	will-change: transform;
}
/* Five nested strokes share one transform/opacity timeline. Their individual
 * stroke widths and opacities still form the same soft pulse without keeping
 * five identical SVG animation timelines alive. */
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-lash-pulse-wave {
	animation: dsh-fairy-lash-pulse var(--dsh-fairy-pulse-cycle, 4s) cubic-bezier(.42, 0, .22, 1) infinite;
	display: block;
	visibility: visible;
	opacity: 1;
	transform-box: view-box;
	transform-origin: 80px 80px;
	will-change: opacity, transform;
}
[data-dsh-fairy-mascot-root="true"][data-dsh-fairy-animation-rate=".7"] .dsh-fairy-lash-pulse-wave { animation-name: dsh-fairy-lash-pulse-slow; }
[data-dsh-fairy-mascot-root="true"][data-dsh-fairy-animation-rate="1.5"] .dsh-fairy-lash-pulse-wave { animation-name: dsh-fairy-lash-pulse-fast; }
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-eye {
	transform: scale(.90);
	transform-origin: 80px 80px;
}
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-eye-flicker {
	opacity: 0;
	animation: none;
}
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-image[data-flicker="true"] ~ .dsh-fairy-eye-flicker,
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-image[data-flicker="true"] .dsh-fairy-eye-flicker {
	animation: dsh-fairy-eye-flicker-overlay var(--dsh-fairy-flicker-duration, 210ms) cubic-bezier(.32, 0, .68, 1) both;
	will-change: opacity;
}
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-eye {
	animation: none !important;
	filter: none !important;
}
[data-dsh-fairy-mascot-root="true"][data-low-power] .dsh-fairy-eye-flicker {
	display: none !important;
}
[data-dsh-fairy-mascot-root="true"][data-state="thinking"] .dsh-fairy-eye {
	clip-path: url(#dsh-fairy-thinking-eye-clip);
}
[data-dsh-fairy-mascot-root="true"][data-state="comforting"] .dsh-fairy-eye {
	clip-path: url(#dsh-fairy-comforting-eye-clip);
}
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-thinking-clip-shape {
	animation: dsh-fairy-thinking-clip calc(.72s / var(--dsh-fairy-steady-rate, 1)) cubic-bezier(.72, 0, .28, 1) 0s infinite alternate;
	animation-play-state: paused;
	transform-box: view-box;
	transform-origin: 80px 60px;
	will-change: auto;
}
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-comforting-clip-shape {
	animation: dsh-fairy-comforting-clip calc(.72s / var(--dsh-fairy-steady-rate, 1)) cubic-bezier(.72, 0, .28, 1) 0s infinite alternate;
	animation-play-state: paused;
	transform-box: view-box;
	transform-origin: 80px 60px;
	will-change: auto;
}
/* The runtime disables these fallback timelines and evaluates the active eyelid
 * path from MascotMotionClock, keeping thinking/comfort on the same phase as the eye. */
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-sclera {
	animation: dsh-fairy-pulse-outer calc(.72s / var(--dsh-fairy-steady-rate, 1)) cubic-bezier(.72, 0, .28, 1) 0s infinite alternate;
	transform-box: view-box;
	transform-origin: 80px 80px;
	will-change: transform;
}
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-layer-three {
	animation: dsh-fairy-pulse-three calc(.72s / var(--dsh-fairy-steady-rate, 1)) cubic-bezier(.72, 0, .28, 1) calc(-.045s / var(--dsh-fairy-steady-rate, 1)) infinite alternate;
	transform-origin: 80px 80px;
	will-change: transform;
}
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-layer-two {
	animation: dsh-fairy-pulse-two calc(.72s / var(--dsh-fairy-steady-rate, 1)) cubic-bezier(.72, 0, .28, 1) calc(-.09s / var(--dsh-fairy-steady-rate, 1)) infinite alternate;
	transform-origin: 80px 80px;
	will-change: transform;
}
[data-dsh-fairy-mascot-root="true"] .dsh-fairy-layer-one {
	animation: dsh-fairy-pulse-inner calc(.72s / var(--dsh-fairy-steady-rate, 1)) cubic-bezier(.72, 0, .28, 1) calc(-.18s / var(--dsh-fairy-steady-rate, 1)) infinite alternate;
	transform-origin: 80px 80px;
	will-change: transform;
}
/* Visual lifecycle is owned by the HDD host contract. Pausing the whole SVG
 * freezes every eye layer on its exact frame; resume code realigns the active
 * eyelid clip to the retained sclera phase before scheduling faults again. */
[data-dsh-fairy-mascot-root="true"][data-visual-suspended],
[data-dsh-fairy-mascot-root="true"][data-visual-suspended] * {
	animation-play-state: paused !important;
	will-change: auto !important;
}
/* Scanline texture stays static; moving this full-size rect continuously causes
 * a needless SVG repaint without changing the state expression. */
/* Correct Fairy arc: the center of the upper lid pushes downward, not upward. */
@keyframes dsh-fairy-thinking-clip {
	from { transform: translateY(14.5px) scaleY(.55); }
	to { transform: translateY(15.5px); }
}
@keyframes dsh-fairy-comforting-clip {
	from { transform: translateY(-4px); }
	to { transform: translateY(4px); }
}
@keyframes dsh-fairy-lash-pulse {
	0% { opacity: 0; transform: scale(.98); }
	/* Transform stays on one continuous 0%-36% path; only opacity steps down. */
	5% { opacity: .72; }
	12% { opacity: .52; }
	20% { opacity: .19; }
	27% { opacity: 0; }
	36%, 100% { opacity: 0; transform: scale(2.78); }
}
@keyframes dsh-fairy-lash-pulse-slow {
	0% { opacity: 0; transform: scale(.98); }
	3.9% { opacity: .72; }
	9.4% { opacity: .52; }
	15.7% { opacity: .19; }
	21.2% { opacity: 0; }
	28.3%, 100% { opacity: 0; transform: scale(2.78); }
}
@keyframes dsh-fairy-lash-pulse-fast {
	0% { opacity: 0; transform: scale(.98); }
	6.4% { opacity: .72; }
	15.3% { opacity: .52; }
	25.4% { opacity: .19; }
	34.3% { opacity: 0; }
	45.8%, 100% { opacity: 0; transform: scale(2.78); }
}
@keyframes dsh-fairy-lashes { to { transform: rotate(360deg); } }
@keyframes dsh-fairy-pulse-outer {
	/* Keep the fully expanded sclera just inside the lid edge so the ring
	 * never becomes visibly thinner than the calibrated resting thickness. */
	from { transform: scale(.985); }
	to { transform: scale(.91); }
}
@keyframes dsh-fairy-pulse-three {
	from { transform: scale(1); }
	to { transform: scale(.90); }
}
@keyframes dsh-fairy-pulse-two {
	from { transform: scale(1); }
	to { transform: scale(.87); }
}
@keyframes dsh-fairy-pulse-inner {
	from { transform: scale(1); }
	to { transform: scale(.85); }
}
@keyframes dsh-fairy-eye-flicker-overlay {
	0%, 100% { opacity: 0; }
	22% { opacity: var(--dsh-fairy-flicker-opacity-1, .04); }
	48% { opacity: var(--dsh-fairy-flicker-opacity-mid, .012); }
	72% { opacity: var(--dsh-fairy-flicker-opacity-2, .03); }
}
@media (max-width: 520px) {
	[data-dsh-fairy-mascot-root="true"] { width: min(76%, 31vh, 324px); height: min(76%, 31vh); }
}
@media (prefers-reduced-motion: reduce) {
	[data-dsh-fairy-mascot-root="true"] *, [data-dsh-fairy-mascot-root="true"] *::before, [data-dsh-fairy-mascot-root="true"] *::after {
		animation: none !important;
	}
		[data-dsh-fairy-mascot-root="true"] .dsh-fairy-signal {
			opacity: 1 !important;
			filter: none !important;
		transform: none !important;
	}
	[data-dsh-fairy-mascot-root="true"] .dsh-fairy-image { opacity: 1 !important; }
	[data-dsh-fairy-mascot-root="true"] .dsh-fairy-glitch-blocks { opacity: 0 !important; }
}
`;

module.exports = CSS;

  };

  __mods["mascot-effects-svg.js"] = function (module, exports, require) {
'use strict';

/* Build the halo as a few deterministic static paths instead of hundreds of SVG nodes. */
function buildHaloLines() {
				const paths = new Map();
				for (let y = -34; y <= 194; y += 1) {
					const t = y + 34;
					/* Independent slow waves keep left/right endpoints asymmetric but static. */
					const leftWave = (Math.sin(t * 0.082 - 1.1) + 0.55 * Math.sin(t * 0.151 + 2.4) + 1.55) / 3.1;
					const rightWave = (Math.sin(t * 0.097 + 2.2) + 0.5 * Math.sin(t * 0.137 - 1.7) + 1.5) / 3;
					const leftLength = 158 + leftWave * 56;
					const rightLength = 158 + rightWave * 56;
					const length = leftLength + rightLength;
					const brightness = 0.50 + ((leftWave + rightWave) * .5) * 0.50;
					const x = 80 - leftLength;
					/* Four luminance buckets preserve the existing light falloff while allowing
					 * the browser to rasterize the complete halo in only a handful of paths. */
					const bucket = Math.max(.5, Math.min(1, Math.round(brightness * 8) / 8));
					const key = bucket.toFixed(3);
					if (!paths.has(key)) paths.set(key, []);
					paths.get(key).push("M" + x.toFixed(2) + " " + (y + .25).toFixed(2) + "h" + length.toFixed(2));
				}
				return Array.from(paths.entries()).map(function (entry) {
					return '<path d="' + entry[1].join("") + '" fill="none" stroke="currentColor" stroke-width=".62" stroke-linecap="butt" opacity="' + entry[0] + '"/>';
				}).join("");
			}
			const HALO_LINES = buildHaloLines();
			/* A deliberately oversized, independent viewport keeps the 2.78x pulse
			 * inside SVG paint bounds from its very first layout.  The 3x CSS surface
			 * and 3x viewBox preserve the eye's original pixel scale and center. */
	const PULSE_SVG = `
<svg class="dsh-fairy-pulse-layer" viewBox="-160 -160 480 480" xmlns="http://www.w3.org/2000/svg" role="presentation">
	<g class="dsh-fairy-lash-pulse" fill="none" stroke="#f4fdff">
		<g class="dsh-fairy-lash-pulse-wave">
			<circle cx="80" cy="80" r="52" stroke-width="20" stroke-opacity=".05"/>
			<circle cx="80" cy="80" r="52" stroke-width="16" stroke-opacity=".06"/>
			<circle cx="80" cy="80" r="52" stroke-width="12" stroke-opacity=".08"/>
			<circle cx="80" cy="80" r="52" stroke-width="8" stroke-opacity=".10"/>
			<circle cx="80" cy="80" r="52" stroke-width="4.5" stroke-opacity=".09"/>
		</g>
	</g>
</svg>`;
			/* Keep negative-x halo lines out of the body's 0..160 SVG viewport.
			 * Safari clips overflow from that viewport even when CSS overflow is
			 * visible; this independent user-space viewport preserves the original
			 * line coordinates and lets the halo/pulse fade continuously. */
			const HALO_SVG = `
<svg class="dsh-fairy-halo dsh-fairy-halo-layer" viewBox="-180 -70 520 320" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" role="presentation">
	<defs>
		<radialGradient id="dsh-fairy-halo-layer-fade" gradientUnits="userSpaceOnUse" color-interpolation="linearRGB" cx="80" cy="80" r="124">
			<stop offset="0" stop-color="black"/>
			<stop offset=".44" stop-color="black"/>
			<stop offset=".45" stop-color="white" stop-opacity=".08"/>
			<stop offset=".46" stop-color="white" stop-opacity=".30"/>
			<stop offset=".47" stop-color="white" stop-opacity=".65"/>
			<stop offset=".48" stop-color="white"/>
			<stop offset=".52" stop-color="white" stop-opacity=".72"/>
			<stop offset=".56" stop-color="white" stop-opacity=".56"/>
			<stop offset=".60" stop-color="white" stop-opacity=".44"/>
			<stop offset=".65" stop-color="white" stop-opacity=".30"/>
			<stop offset=".71" stop-color="white" stop-opacity=".19"/>
			<stop offset=".77" stop-color="white" stop-opacity=".135"/>
			<stop offset=".83" stop-color="white" stop-opacity=".09"/>
			<stop offset=".89" stop-color="white" stop-opacity=".058"/>
			<stop offset=".90" stop-color="white" stop-opacity=".052"/>
			<stop offset=".91" stop-color="white" stop-opacity=".046"/>
			<stop offset=".92" stop-color="white" stop-opacity=".039"/>
			<stop offset=".93" stop-color="white" stop-opacity=".032"/>
			<stop offset=".94" stop-color="white" stop-opacity=".025"/>
			<stop offset=".95" stop-color="white" stop-opacity=".019"/>
			<stop offset=".96" stop-color="white" stop-opacity=".013"/>
			<stop offset=".97" stop-color="white" stop-opacity=".0075"/>
			<stop offset=".98" stop-color="white" stop-opacity=".0035"/>
			<stop offset=".99" stop-color="white" stop-opacity=".001"/>
			<stop offset="1" stop-color="white" stop-opacity="0"/>
		</radialGradient>
		<mask id="dsh-fairy-halo-layer-mask" mask-type="luminance" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="-260" y="-120" width="680" height="440">
			<rect x="-260" y="-120" width="680" height="440" fill="url(#dsh-fairy-halo-layer-fade)"/>
		</mask>
	</defs>
	<g mask="url(#dsh-fairy-halo-layer-mask)" opacity=".99">${HALO_LINES}</g>
</svg>`;


module.exports = Object.freeze({ PULSE_SVG, HALO_SVG });

  };

  __mods["mascot-geometry.js"] = function (module, exports, require) {
'use strict';

const MASCOT_GEOMETRY = Object.freeze({
  outerDiscRadius: 68,
  outerStrokeWidth: 1.2,
  outerHaloRadius: 79,
  scleraRadius: 48,
  scleraContactStrokeWidth: 0.8,
  scleraHaloRadius: 56,
  pupilRadius: 16,
  highlightCenter: Object.freeze({ x: 98, y: 100.5 }),
  highlightRadius: 11,
  highlightHaloRadius: 18,
});

const finitePositive = (name, value) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid Fairy geometry: ${name}`);
  return value;
};

// Validate every primitive before deriving any dependent edge or ratio. Keeping
// this at the contract boundary prevents malformed settings from leaking into
// SVG attributes or producing an invisible/oversized halo.
for (const [name, value] of Object.entries(MASCOT_GEOMETRY)) {
  if (name === 'highlightCenter') continue;
  finitePositive(name, value);
}

const outerVisibleEdge = finitePositive('outerVisibleEdge', MASCOT_GEOMETRY.outerDiscRadius + MASCOT_GEOMETRY.outerStrokeWidth / 2);
const scleraVisibleEdge = finitePositive('scleraVisibleEdge', MASCOT_GEOMETRY.scleraRadius + MASCOT_GEOMETRY.scleraContactStrokeWidth / 2);
const outerHaloPeak = outerVisibleEdge / finitePositive('outerHaloRadius', MASCOT_GEOMETRY.outerHaloRadius);
const scleraHaloPeak = scleraVisibleEdge / finitePositive('scleraHaloRadius', MASCOT_GEOMETRY.scleraHaloRadius);
const highlightHaloPeak = MASCOT_GEOMETRY.highlightRadius / finitePositive('highlightHaloRadius', MASCOT_GEOMETRY.highlightHaloRadius);

for (const [edge, halo] of [[outerVisibleEdge, MASCOT_GEOMETRY.outerHaloRadius], [scleraVisibleEdge, MASCOT_GEOMETRY.scleraHaloRadius], [MASCOT_GEOMETRY.highlightRadius, MASCOT_GEOMETRY.highlightHaloRadius]]) {
  if (edge >= halo) throw new Error('Invalid Fairy geometry: visible edge must be inside its halo radius');
}
for (const [name, value] of Object.entries(MASCOT_GEOMETRY.highlightCenter)) {
  if (!Number.isFinite(value)) throw new Error(`Invalid Fairy geometry: highlightCenter.${name}`);
}

for (const [name, value] of Object.entries({ outerHaloPeak, scleraHaloPeak, highlightHaloPeak })) {
  if (!(value > 0 && value < 1)) throw new Error(`Invalid Fairy geometry ratio: ${name}`);
}

const formatRatio = (value) => value.toFixed(3).replace(/^0/, '');

module.exports = Object.freeze({
  ...MASCOT_GEOMETRY,
  outerVisibleEdge,
  scleraVisibleEdge,
  outerHaloPeak,
  scleraHaloPeak,
  highlightHaloPeak,
  formatRatio,
});

  };

  __mods["mascot-eye-svg.js"] = function (module, exports, require) {
'use strict';

const geometry = require('./mascot-geometry.js');
const {
	outerDiscRadius,
	outerStrokeWidth,
	outerHaloRadius,
	outerVisibleEdge,
	outerHaloPeak,
	scleraRadius,
	scleraContactStrokeWidth,
	scleraHaloRadius,
	scleraHaloPeak,
	pupilRadius,
	highlightCenter,
	highlightRadius,
	highlightHaloRadius,
	highlightHaloPeak,
	formatRatio,
} = geometry;

const SVG = `
<svg class="dsh-fairy-main" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" role="presentation">
	<defs>
		<!-- Color, glow, scanline, and horizontal-only displacement resources. -->
		<linearGradient id="dsh-fairy-outer-gradient" x1=".2" y1="0" x2=".8" y2="1">
			<stop stop-color="#4053f0"/>
			<stop offset=".54" stop-color="#3045dc"/>
			<stop offset="1" stop-color="#3d50c8"/>
		</linearGradient>
		<!-- One static radial field replaces separate halo strokes, avoiding alpha seams. -->
		<radialGradient id="dsh-fairy-sclera-halo-gradient" gradientUnits="userSpaceOnUse" cx="80" cy="80" r="${scleraHaloRadius}" color-interpolation="linearRGB">
			<stop offset=".82" stop-color="#ffffff" stop-opacity="0"/>
			<stop offset="${formatRatio(scleraHaloPeak)}" stop-color="#ffffff" stop-opacity=".22"/>
			<stop offset=".875" stop-color="#ffffff" stop-opacity=".28"/>
			<stop offset=".89" stop-color="#ffffff" stop-opacity=".19"/>
			<stop offset=".91" stop-color="#ffffff" stop-opacity=".11"/>
			<stop offset=".94" stop-color="#ffffff" stop-opacity=".07"/>
			<stop offset=".96" stop-color="#ffffff" stop-opacity=".035"/>
			<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
		</radialGradient>
		<radialGradient id="dsh-fairy-outer-halo-gradient" gradientUnits="userSpaceOnUse" cx="80" cy="80" r="${outerHaloRadius}" color-interpolation="linearRGB">
			<stop offset=".80" stop-color="var(--dsh-fairy-outer-halo-color)" stop-opacity="0"/>
			<stop offset=".84" stop-color="var(--dsh-fairy-outer-halo-color)" stop-opacity=".10"/>
			<stop offset="${formatRatio(outerHaloPeak)}" stop-color="var(--dsh-fairy-outer-halo-color)" stop-opacity=".28"/>
			<stop offset=".90" stop-color="var(--dsh-fairy-outer-halo-color)" stop-opacity=".18"/>
			<stop offset=".95" stop-color="var(--dsh-fairy-outer-halo-color)" stop-opacity=".06"/>
			<stop offset=".99" stop-color="var(--dsh-fairy-outer-halo-color)" stop-opacity=".02"/>
			<stop offset="1" stop-color="var(--dsh-fairy-outer-halo-color)" stop-opacity="0"/>
		</radialGradient>
		<radialGradient id="dsh-fairy-highlight-halo-gradient" gradientUnits="userSpaceOnUse" cx="${highlightCenter.x}" cy="${highlightCenter.y}" r="${highlightHaloRadius}" color-interpolation="linearRGB">
			<stop offset=".53" stop-color="#f5f8fd" stop-opacity="0"/>
			<stop offset=".56" stop-color="#f5f8fd" stop-opacity=".16"/>
			<stop offset="${formatRatio(highlightHaloPeak)}" stop-color="#f5f8fd" stop-opacity=".43"/>
			<stop offset=".72" stop-color="#f5f8fd" stop-opacity=".19"/>
			<stop offset=".77" stop-color="#f5f8fd" stop-opacity=".12"/>
			<stop offset=".83" stop-color="#f5f8fd" stop-opacity=".055"/>
			<stop offset=".89" stop-color="#f5f8fd" stop-opacity=".02"/>
			<stop offset=".96" stop-color="#f5f8fd" stop-opacity=".004"/>
			<stop offset="1" stop-color="#f5f8fd" stop-opacity="0"/>
		</radialGradient>
		<pattern id="dsh-fairy-lines" width="4" height="4" patternUnits="userSpaceOnUse">
			<!-- Keep the internal scanline texture present but quieter against the eye. -->
			<rect width="4" height="1" fill="#c9f8ff" opacity=".055"/>
		</pattern>
			<!-- Blue is forced to 0.5 so the displacement map moves pixels horizontally only. -->
			<!-- Horizontal glitch noise is intentionally low-resolution. The map never
			     moves pixels vertically, so its filter cache needs less vertical coverage
			     and resolution while interpolation keeps the tear continuous. -->
			<filter id="dsh-fairy-interference" x="-30%" y="0%" width="160%" height="100%" filterRes="96 72" color-interpolation-filters="sRGB">
			<feTurbulence id="dsh-fairy-noise" type="fractalNoise" baseFrequency=".012 .72" numOctaves="1" seed="1" result="noise"/>
			<feColorMatrix in="noise" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 0 0 .5  0 0 0 1 0" result="horizontal-noise"/>
			<feDisplacementMap id="dsh-fairy-displace" in="SourceGraphic" in2="horizontal-noise" scale="5" xChannelSelector="R" yChannelSelector="B"/>
		</filter>
		<clipPath id="dsh-fairy-disc-clip"><circle cx="80" cy="80" r="${outerDiscRadius - 1}"/></clipPath>
		<clipPath id="dsh-fairy-thinking-eye-clip">
			<path class="dsh-fairy-thinking-clip-shape" d="M20 60 Q80 90 140 60 V160 H20 Z"/>
			<!-- This fixed lower region prevents curve scaling from clipping the lower eye. -->
			<rect x="0" y="108" width="160" height="52"/>
		</clipPath>
		<!-- A shallow reversed arc gives Fairy the gentle, slightly drooped brow. -->
		<clipPath id="dsh-fairy-comforting-eye-clip">
			<path class="dsh-fairy-comforting-clip-shape" d="M20 60 Q80 30 140 60 V160 H20 Z"/>
			<rect x="0" y="108" width="160" height="52"/>
		</clipPath>
		<!-- These five rectangles are resized slightly for every block-glitch event. -->
		<clipPath id="dsh-fairy-slice-1"><rect x="4" y="12" width="152" height="25"/></clipPath>
		<clipPath id="dsh-fairy-slice-2"><rect x="4" y="37" width="152" height="28"/></clipPath>
		<clipPath id="dsh-fairy-slice-3"><rect x="4" y="65" width="152" height="26"/></clipPath>
		<clipPath id="dsh-fairy-slice-4"><rect x="4" y="91" width="152" height="30"/></clipPath>
		<clipPath id="dsh-fairy-slice-5"><rect x="4" y="121" width="152" height="27"/></clipPath>
		</defs>
	
		<g class="dsh-fairy-body">
	<!-- Stable outer radial halo stays outside the fault signal so it is not
	     filtered or duplicated by the block-glitch clones. -->
		<circle class="dsh-fairy-outer-halo" cx="80" cy="80" r="${outerHaloRadius}" fill="url(#dsh-fairy-outer-halo-gradient)"/>
	<g class="dsh-fairy-signal" data-fault-source="true">
	<!-- The complete normal visual. Glitch modes filter or slice this entire group. -->
	<g id="dsh-fairy-image" class="dsh-fairy-image">
		<circle class="dsh-fairy-outer-disc" cx="80" cy="80" r="${outerDiscRadius}" fill="url(#dsh-fairy-outer-gradient)" stroke="#f2fbff" stroke-width="${outerStrokeWidth}"/>
	<!-- Dark circle + square form the four rotating lashes / eyelids. -->
	<g class="dsh-fairy-corners" clip-path="url(#dsh-fairy-disc-clip)" fill="#2b3388">
		<!-- Slightly open the eye: reduce the lid ring without changing its silhouette. -->
		<circle cx="80" cy="80" r="51.75"/>
		<rect x="37" y="37" width="86" height="86" rx="2" transform="rotate(3 80 80)"/>
	</g>

	<!-- Eye anatomy: sclera, layered eyeball, pupil, then highlight. -->
	<g class="dsh-fairy-eye">
			<!-- One animated group keeps the vector rim pixel-locked to the sclera. -->
			<g class="dsh-fairy-sclera">
				<circle cx="80" cy="80" r="${scleraRadius}" fill="#eef0f5"/>
				<circle class="dsh-fairy-sclera-halo" cx="80" cy="80" r="${scleraHaloRadius}" fill="url(#dsh-fairy-sclera-halo-gradient)"/>
				<!-- A thin contact rim closes subpixel seams at the sclera/halo boundary. -->
				<circle class="dsh-fairy-sclera-contact" cx="80" cy="80" r="${scleraRadius}" fill="none" stroke="#ffffff" stroke-width="${scleraContactStrokeWidth}" stroke-opacity=".16"/>
			</g>
		<g class="dsh-fairy-eyeball">
			<circle class="dsh-fairy-layer-three" cx="80" cy="80" r="33" fill="#9daee0"/>
			<circle class="dsh-fairy-layer-two" cx="80" cy="80" r="24.15" fill="#eef0f5"/>
			<circle class="dsh-fairy-layer-two" cx="80" cy="80" r="23.5" fill="#317bcf"/>
			<circle class="dsh-fairy-layer-one" cx="80" cy="80" r="16.6" fill="none" stroke="#f5f8fd" stroke-width=".1"/>
			<circle class="dsh-fairy-layer-one" cx="80" cy="80" r="${pupilRadius}" fill="#3b3d8a"/>
				<g class="dsh-fairy-highlight dsh-fairy-layer-two">
					<circle class="dsh-fairy-highlight-halo" cx="${highlightCenter.x}" cy="${highlightCenter.y}" r="${highlightHaloRadius}" fill="url(#dsh-fairy-highlight-halo-gradient)"/>
					<circle class="dsh-fairy-highlight-glow" cx="${highlightCenter.x}" cy="${highlightCenter.y}" r="${highlightRadius}" fill="#f5f8fd"/>
			</g>
		</g>
	</g>
	<!-- Full-eye flicker layer stays outside the scaled eye group and is not part
	     of the fault clone source; it covers the disc and brows only. -->
	<circle class="dsh-fairy-eye-flicker" cx="80" cy="80" r="${outerVisibleEdge}" fill="#ffffff" pointer-events="none"/>

	<g clip-path="url(#dsh-fairy-disc-clip)" opacity=".42">
		<rect class="dsh-fairy-scanlines" x="12" y="10" width="136" height="146" fill="url(#dsh-fairy-lines)"/>
	</g>
	</g>
	<!-- Five complete-image clones clipped into horizontal blocks for left/right displacement. -->
	<g class="dsh-fairy-glitch-blocks">
		<use href="#dsh-fairy-image" class="dsh-fairy-glitch-1" clip-path="url(#dsh-fairy-slice-1)"/>
		<use href="#dsh-fairy-image" class="dsh-fairy-glitch-2" clip-path="url(#dsh-fairy-slice-2)"/>
		<use href="#dsh-fairy-image" class="dsh-fairy-glitch-3" clip-path="url(#dsh-fairy-slice-3)"/>
		<use href="#dsh-fairy-image" class="dsh-fairy-glitch-4" clip-path="url(#dsh-fairy-slice-4)"/>
		<use href="#dsh-fairy-image" class="dsh-fairy-glitch-5" clip-path="url(#dsh-fairy-slice-5)"/>
	</g>
	</g>
	</g>
		</svg>`;



module.exports = SVG;

  };

  __mods["mascot-assets.js"] = function (module, exports, require) {
'use strict';

const CSS = require('./mascot-style.js');
const { PULSE_SVG, HALO_SVG } = require('./mascot-effects-svg.js');
const SVG = require('./mascot-eye-svg.js');
const geometry = require('./mascot-geometry.js');

module.exports = Object.freeze({ CSS, PULSE_SVG, HALO_SVG, SVG, geometry });

  };

  __mods["mascot-motion-clock.js"] = function (module, exports, require) {
'use strict';

/* One monotonic, normalized phase for every Fairy eye motion consumer. */
function createMascotMotionClock({ now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), cycleMs = 1440, rate = 1 } = {}) {
  if (!Number.isFinite(cycleMs) || cycleMs <= 0) throw new Error('Invalid Fairy motion clock cycle');
  let epoch = now();
  let phase = 0;
  let currentRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  let paused = false;
  let pausedAt = epoch;
  const read = () => {
    if (paused) return phase;
    const elapsed = Math.max(0, now() - epoch) * currentRate;
    return ((phase + elapsed / cycleMs) % 1 + 1) % 1;
  };
  return Object.freeze({
    phase: read,
    timeline: (nextCycleMs = cycleMs) => read() * nextCycleMs,
    rate: () => currentRate,
    setRate: (nextRate) => {
      const timestamp = now();
      phase = read();
      currentRate = Number.isFinite(nextRate) && nextRate > 0 ? nextRate : 1;
      epoch = timestamp;
      pausedAt = timestamp;
    },
    pause: () => {
      if (paused) return;
      pausedAt = now();
      phase = read();
      paused = true;
    },
    resume: () => {
      if (!paused) return;
      epoch = now();
      paused = false;
    },
    reset: () => {
      epoch = now();
      phase = 0;
      pausedAt = epoch;
      paused = false;
    },
    isPaused: () => paused,
    pausedAt: () => pausedAt,
  });
}

module.exports = { createMascotMotionClock };

  };

  __mods["mascot-event-scheduler.js"] = function (module, exports, require) {
'use strict';

/* Bounded one-shot scheduler: one live callback per logical animation task. */
function createMascotEventScheduler() {
  const tasks = new Map();
  const schedule = (name, callback, delay) => {
    const previous = tasks.get(name);
    if (previous) clearTimeout(previous.timer);
    const token = (previous?.token || 0) + 1;
    const entry = { token, timer: null };
    entry.timer = setTimeout(() => {
      if (tasks.get(name) !== entry) return;
      tasks.delete(name);
      callback();
    }, Math.max(0, Number(delay) || 0));
    tasks.set(name, entry);
    return entry.timer;
  };
  const cancel = (name) => {
    const entry = tasks.get(name);
    if (!entry) return;
    clearTimeout(entry.timer);
    tasks.delete(name);
  };
  return Object.freeze({
    schedule,
    cancel,
    cancelAll: () => [...tasks.keys()].forEach(cancel),
    has: (name) => tasks.has(name),
    activeCount: () => tasks.size,
  });
}

module.exports = { createMascotEventScheduler };

  };

  __mods["mascot-runtime.js"] = function (module, exports, require) {
const { createManagedMutationObserver } = require('./dom-observer-manager.js');
const { CSS, PULSE_SVG, HALO_SVG, SVG } = require('./mascot-assets.js');
const { createMascotMotionClock } = require('./mascot-motion-clock.js');
const { createMascotEventScheduler } = require('./mascot-event-scheduler.js');

function createMascotRuntime() {
	let mascotRuntime = null;
		(function fairyVisualRuntime() {
			/*
			 * Fairy mascot runtime: mount ownership, state transitions, animation timing,
			 * and lifecycle cleanup. Static CSS and SVG templates live in mascot-assets.js.
			 *
			 * Visual model, from outside to inside:
			 * 1. Blue outer disc and thin white rim.
			 * 2. Rotating dark four-corner shape: Fairy's lashes / eyelids.
			 * 3. White disc: sclera.
			 * 4. Gray-blue, thin white, blue, and dark circles: eyeball layers.
			 * 5. White circle near the lower-right: highlight attached to the blue eyeball layer.
			 *
			 * Motion model:
			 * - Lashes rotate clockwise at constant speed.
			 * - Eye layers continuously contract and expand from the inside outward.
			 * - Glitches alternate between horizontal threads and five displaced horizontal blocks.
			 */
			if (typeof document === "undefined") return;

			/* The host is supplied by Harness; this ID belongs only to Fairy's child node. */
			const ROOT_ID = "dsh-fairy-root";
			const HOST_SELECTOR = ".dsh-fairy-stage";
			const STYLE_ID = "dsh-fairy-mascot-style";
				let root = null;
				let mountedHost = null;
				let mountedOwner = null;
				let mountGeneration = 0;
				let hostObserver = null;
				let observedHost = null;
			let glitchTimer = null;
			let animationRate = 1;
			let speedListener = null;
			let eyeFlickerTimer = null;
			let eyeFlickerToken = 0;
			let glitchToken = 0;
			let stateTransitionTimer = null;
				let stateTransitionToken = 0;
			let appliedState = null;
			let signalElement = null;
			let scleraElement = null;
			let layerThreeElements = [];
			let layerTwoElements = [];
			let layerOneElements = [];
			let imageElement = null;
			let thinkingClipShape = null;
			let comfortingClipShape = null;
			let noiseElement = null;
			let displacementElement = null;
			let blockSliceRects = [];
				let motionQuery = null;
				let motionOwner = null;
				let motionGeneration = 0;
			const motionClock = createMascotMotionClock();
			const eventScheduler = createMascotEventScheduler();
			let visualSuspended = false;
			/* The host can announce its active state before the slot has a DOM node.
			 * Keep that request separate from the first mounted frame so startup takes
			 * the same resume path as an explicit HDD re-enable. */
			let requestedVisualActive = false;
				function isLifecycleVisible() {
					return document.visibilityState !== "hidden";
				}
				let lifecycleVisible = isLifecycleVisible();
				function isCurrentMount(owner, generation, stage) {
					return Boolean(
						owner &&
						owner.active !== false &&
						mountedOwner === owner &&
						mountGeneration === generation &&
						(!stage || mountedHost === stage),
					);
				}

				function isValidOwner(owner, stage) {
					return Boolean(owner && owner.active !== false && owner.stage === stage);
				}

				function unbindMotionListener() {
					if (motionQuery && motionChangeListener) {
						if (typeof motionQuery.removeEventListener === "function") motionQuery.removeEventListener("change", motionChangeListener);
						else if (typeof motionQuery.removeListener === "function") motionQuery.removeListener(motionChangeListener);
					}
					motionQuery = null;
					motionChangeListener = null;
					motionOwner = null;
					motionGeneration = 0;
				}

				function cancelLifecycleResume() {
					if (lifecycleResumeFrame) cancelAnimationFrame(lifecycleResumeFrame);
					lifecycleResumeFrame = 0;
					lifecycleToken += 1;
				}

				/* A new owner or root invalidates every callback created by the old mount. */
			function invalidateMountResources() {
					stopGlitch();
					cancelLifecycleResume();
					hostObserver?.disconnect();
					hostObserver = null;
					observedHost = null;
					unbindMotionListener();
					unbindLifecycleListeners();
					if (speedListener) window.removeEventListener("dsh-fairy-mascot-animation-speed", speedListener);
					speedListener = null;
					mountGeneration += 1;
				}

				let visualActiveInitialized = false;
			let lifecycleResumeFrame = 0;
			let motionFrame = 0;
			let lifecycleToken = 0;
			let motionChangeListener = null;
				let lifecycleVisibilityListener = null;
			let lifecyclePageHideListener = null;
				let lifecyclePageShowListener = null;
				let lifecycleListenerOwner = null;
				let lifecycleListenerGeneration = 0;
			/* Modes alternate so both effects are guaranteed to appear during observation. */
			let lastGlitchMode = Math.random() < .5 ? "threads" : "blocks";
			const FAULT_TIMING = Object.freeze({
				threads: Object.freeze({ pulses: 4, gapMin: 30, gapMax: 42, fadeMin: 34, fadeMax: 76 }),
				blocks: Object.freeze({ gapMin: 56, gapMax: 104, fadeMin: 48, fadeMax: 96 }),
			});

				function randomBetween(min, max) {
					return min + Math.random() * (max - min);
				}

				/* Cache the small, fixed SVG surface once per mount. Fault pulses can then
				 * update attributes directly without repeating selector walks. */
			function cacheVisualNodes() {
				signalElement = root ? root.querySelector(".dsh-fairy-signal") : null;
				scleraElement = root ? root.querySelector(".dsh-fairy-sclera") : null;
				imageElement = root ? root.querySelector(".dsh-fairy-image") : null;
				thinkingClipShape = root ? root.querySelector(".dsh-fairy-thinking-clip-shape") : null;
				comfortingClipShape = root ? root.querySelector(".dsh-fairy-comforting-clip-shape") : null;
				noiseElement = root ? root.querySelector("#dsh-fairy-noise") : null;
				displacementElement = root ? root.querySelector("#dsh-fairy-displace") : null;
				blockSliceRects = root ? Array.from(root.querySelectorAll("[id^=dsh-fairy-slice-] rect")) : [];
				layerThreeElements = root ? Array.from(root.querySelectorAll(".dsh-fairy-layer-three")) : [];
				layerTwoElements = root ? Array.from(root.querySelectorAll(".dsh-fairy-layer-two")) : [];
				layerOneElements = root ? Array.from(root.querySelectorAll(".dsh-fairy-layer-one")) : [];
				/* The browser must not create a second playback clock for any continuously
				 * breathing layer. Their transforms are committed by renderMotionFrame(). */
					[scleraElement,
					...layerThreeElements, ...layerTwoElements, ...layerOneElements].forEach((element) => {
						if (element) element.style.animation = "none";
					});
				[thinkingClipShape, comfortingClipShape].forEach((element) => {
					if (element) element.style.animation = "none";
				});
			}

			/* One normalized phase is the only animation state owned by JavaScript. */
			function currentEyeMotionPhase() { return motionClock.phase(); }

			/* The concentric eye layers must never own separate browser timelines. The
			 * renderer below evaluates the original cubic-bezier keyframes from one
			 * normalized phase and commits every transform in the same animation frame. */
			function easeEyePhase(value) {
				const x = Math.max(0, Math.min(1, value));
				let low = 0;
				let high = 1;
				for (let i = 0; i < 12; i += 1) {
					const t = (low + high) / 2;
					const xValue = 3 * (1 - t) * (1 - t) * t * .72 + 3 * (1 - t) * t * t * .28 + t * t * t;
					if (xValue < x) low = t;
					else high = t;
				}
				const t = (low + high) / 2;
				return 3 * (1 - t) * t * t + t * t * t;
			}
			function readEyeProgress(phase) {
			const cyclePhase = ((phase % 1) + 1) % 1;
			return easeEyePhase(cyclePhase <= .5 ? cyclePhase * 2 : 2 - cyclePhase * 2);
			}
			function normalizeMotionTargets(value) {
				return Array.isArray(value) ? value : value ? [value] : [];
			}
			function renderMotionFrame() {
				if (!root || visualSuspended) return;
				const phase = currentEyeMotionPhase();
				const layers = [
					[scleraElement, .985, .91, 0],
					[layerThreeElements, 1, .90, 45],
					[layerTwoElements, 1, .87, 90],
					[layerOneElements, 1, .85, 180],
				];
				layers.forEach(([elements, from, to, leadMs]) => {
					const targets = normalizeMotionTargets(elements);
					if (!targets.length) return;
					const progress = readEyeProgress(phase + leadMs / 1440);
					const transform = "scale(" + (from + (to - from) * progress).toFixed(6) + ")";
					targets.forEach((element) => { element.style.transform = transform; });
				});
				const state = root.getAttribute("data-state");
				const clip = state === "thinking" ? thinkingClipShape : state === "comforting" ? comfortingClipShape : null;
				[thinkingClipShape, comfortingClipShape].forEach((element) => {
					if (element && element !== clip) element.style.transform = "";
				});
				if (clip) {
					const clipProgress = readEyeProgress(phase);
					clip.style.willChange = "transform";
					clip.style.transform = state === "thinking"
						? "translateY(" + (14.5 + clipProgress).toFixed(6) + "px) scaleY(" + (.55 + .45 * clipProgress).toFixed(6) + ")"
						: "translateY(" + (-4 + 8 * clipProgress).toFixed(6) + "px)";
				}
			}
			function startMotionLoop() {
				if (motionFrame || visualSuspended || !root) return;
				const tick = () => {
					motionFrame = 0;
					if (!root || visualSuspended) return;
					renderMotionFrame();
					motionFrame = requestAnimationFrame(tick);
				};
				renderMotionFrame();
				motionFrame = requestAnimationFrame(tick);
			}

			function stopMotionLoop() {
				if (motionFrame) cancelAnimationFrame(motionFrame);
				motionFrame = 0;
			}

			function alignEyeLayersToClock() {
				renderMotionFrame();
			}

			function pauseClipAnimation(shape) {
				if (!shape) return;
				/* Freeze the inactive path before assigning the next master-clock frame. */
				shape.style.animationDelay = "0s";
				shape.style.animationPlayState = "paused";
				shape.style.willChange = "auto";
			}

			function synchronizeActiveClipPhase(nextState) {
				if (!root) return;
				/* All continuous layers and the active clip are rendered from the same phase. */
				alignEyeLayersToClock();
				pauseClipAnimation(thinkingClipShape);
				pauseClipAnimation(comfortingClipShape);
				if (nextState !== "normal" && !(motionQuery && motionQuery.matches)) renderMotionFrame();
			}

			/* Build five mildly uneven blocks. Weights are constrained to avoid extreme sizes. */
			function setBlockLayout() {
				const weights = [];
				let weightTotal = 0;
				for (let i = 0; i < 5; i += 1) {
					const weight = randomBetween(.9, 1.1);
					weights.push(weight);
					weightTotal += weight;
				}

				let y = 12;
				for (let i = 0; i < 5; i += 1) {
					const rect = blockSliceRects[i] || (root && root.querySelector("#dsh-fairy-slice-" + (i + 1) + " rect"));
					if (!rect) continue;
					const height = i === 4 ? 148 - y : 136 * weights[i] / weightTotal;
					rect.setAttribute("y", y.toFixed(1));
					rect.setAttribute("height", height.toFixed(1));
					y += height;
				}
			}

			/* Removing the attribute restores the untouched normal visual immediately. */
			function clearGlitchVisual() {
				if (!root) return;
				const signal = signalElement || root.querySelector(".dsh-fairy-signal");
				if (!signal) return;
				signal.removeAttribute("data-glitch");
				["--dsh-g-x", "--dsh-g-skew", "--dsh-g-bright", "--dsh-g-contrast", "--dsh-g-s1-x", "--dsh-g-s2-x", "--dsh-g-s3-x", "--dsh-g-s4-x", "--dsh-g-s5-x"].forEach(function (name) {
					signal.style.removeProperty(name);
				});
			}

			function stopEyeFlicker() {
				eyeFlickerToken += 1;
				eventScheduler.cancel('flicker');
				eyeFlickerTimer = null;
				if (imageElement) imageElement.removeAttribute("data-flicker");
				if (imageElement) ["--dsh-fairy-flicker-duration", "--dsh-fairy-flicker-opacity-1", "--dsh-fairy-flicker-opacity-mid", "--dsh-fairy-flicker-opacity-2"].forEach(function (name) { imageElement.style.removeProperty(name); });
			}

			function scheduleEyeFlicker(owner, generation) {
				if (!isCurrentMount(owner, generation) || eventScheduler.has('flicker') || !root || root.getAttribute("data-state") !== "normal" || root.hasAttribute("data-low-power") || visualSuspended || (motionQuery && motionQuery.matches)) return;
				const token = eyeFlickerToken;
				eyeFlickerTimer = eventScheduler.schedule('flicker', function () {
					eyeFlickerTimer = null;
					if (!isCurrentMount(owner, generation) || token !== eyeFlickerToken || !root || root.getAttribute("data-state") !== "normal" || root.hasAttribute("data-low-power") || visualSuspended || (motionQuery && motionQuery.matches)) return;
					if (!imageElement) imageElement = root.querySelector(".dsh-fairy-image");
					if (!imageElement) return;
					const duration = randomBetween(155, 255);
					imageElement.style.setProperty("--dsh-fairy-flicker-duration", duration.toFixed(0) + "ms");
					imageElement.style.setProperty("--dsh-fairy-flicker-opacity-1", randomBetween(.026, .048).toFixed(3));
					imageElement.style.setProperty("--dsh-fairy-flicker-opacity-mid", randomBetween(.006, .016).toFixed(3));
					imageElement.style.setProperty("--dsh-fairy-flicker-opacity-2", randomBetween(.018, .040).toFixed(3));
					imageElement.setAttribute("data-flicker", "true");
					eyeFlickerTimer = eventScheduler.schedule('flicker', function () {
						eyeFlickerTimer = null;
						if (imageElement) imageElement.removeAttribute("data-flicker");
						if (token === eyeFlickerToken) scheduleEyeFlicker(owner, generation);
					}, duration);
				}, randomBetween(1750, 3600) / animationRate);
			}

			/*
			 * SVG <use> block clones can advance their nested CSS animations on
			 * slightly different timelines. Capture one angle before exposing the
			 * clones, then share its phase so every lash copy is identical.
			 */
			function lockLashFrame(signal) {
				const corners = signal && signal.querySelector(".dsh-fairy-image .dsh-fairy-corners");
				if (!signal || !corners) return;
				const transform = window.getComputedStyle(corners).transform;
				let angle = 0;
				const match = transform && transform.match(/^matrix\(([^)]+)\)$/);
				if (match) {
					const values = match[1].split(",");
					const a = parseFloat(values[0]);
					const b = parseFloat(values[1]);
					if (Number.isFinite(a) && Number.isFinite(b)) angle = Math.atan2(b, a) * 180 / Math.PI;
				}
				const normalized = (angle + 360) % 360;
				signal.style.setProperty("--dsh-lash-angle", normalized.toFixed(3) + "deg");
				signal.style.setProperty("--dsh-lash-delay", (-normalized / 360 * 15).toFixed(4) + "s");
			}

			/*
			 * Generate one short randomized pulse.
			 * threads: vertically varying noise displaces pixels only along the horizontal axis.
			 * blocks: five adjacent clips move left/right with alternating polarity.
			 */
			function setGlitchPulse(signal, mode, isTransition) {
				const style = signal.style;
				style.setProperty("--dsh-g-x", randomBetween(isTransition ? -1.6 : -.9, isTransition ? 1.6 : .9).toFixed(2) + "px");
				style.setProperty("--dsh-g-skew", randomBetween(isTransition ? -.32 : -.24, isTransition ? .32 : .24).toFixed(2) + "deg");
				style.setProperty("--dsh-g-bright", randomBetween(isTransition ? 1.06 : 1.02, isTransition ? 1.18 : 1.14).toFixed(2));
				style.setProperty("--dsh-g-contrast", randomBetween(isTransition ? 1.08 : 1.02, isTransition ? 1.22 : 1.16).toFixed(2));

				const noise = noiseElement;
				const displacement = displacementElement;
				if (mode === "threads") {
					/* Turbulence generation is the costliest fault primitive. A short burst
					 * already jitters via the signal variables above, so generate one noise field
					 * at its first frame and reuse it for the remaining 24-48ms pulses. */
					const beginsThreadBurst = signal.getAttribute("data-glitch") !== "threads";
					if (beginsThreadBurst && noise) {
						noise.setAttribute("seed", String(Math.floor(randomBetween(1, 999))));
						noise.setAttribute("baseFrequency", randomBetween(.004, .011).toFixed(3) + " " + randomBetween(isTransition ? .78 : .65, isTransition ? 1.18 : 1).toFixed(2));
					}
					if (beginsThreadBurst && displacement) displacement.setAttribute("scale", randomBetween(isTransition ? 30 : 17, isTransition ? 46 : 29).toFixed(1));
				} else {
					/* Lock the rotating lashes once per block event; rewriting the delay on
					 * every short pulse would restart the CSS animation timeline. */
					if (!signal.hasAttribute("data-glitch")) lockLashFrame(signal);
					const slicePolarity = Math.random() < .5 ? -1 : 1;
					const sliceStrength = randomBetween(isTransition ? 4.2 : 1.4, isTransition ? 6.8 : 3);
					for (let i = 1; i <= 5; i += 1) {
						const direction = i % 2 === 0 ? slicePolarity : -slicePolarity;
						const offset = direction * (sliceStrength + randomBetween(-.35, .35));
						style.setProperty("--dsh-g-s" + i + "-x", offset.toFixed(2) + "px");
					}
				}
				signal.setAttribute("data-glitch", mode);
			}

			/* Match the preview's two-burst transition: a short threaded tear followed by
			 * a longer blocks-and-threads burst. The target expression is already committed
			 * before this starts, so the original visual is retained without old-state flash. */
			function playStateTransition(nextState, owner, generation) {
				if (!isCurrentMount(owner, generation) || !root || visualSuspended || (motionQuery && motionQuery.matches)) return;
				stopGlitch();
				const signal = signalElement || root.querySelector(".dsh-fairy-signal");
				if (!signal) return;
				const token = ++stateTransitionToken;
				root.setAttribute("data-transition-target", nextState);

				function runBurst(pulseCount, blockPulseCount, keepVisual, onComplete) {
					let pulseIndex = 0;
					root.setAttribute("data-transition-glitch", "true");
					function pulse() {
						if (!isCurrentMount(owner, generation) || token !== stateTransitionToken || (motionQuery && motionQuery.matches)) {
							return;
						}
						if (pulseIndex < blockPulseCount) {
							if (pulseIndex === 0) setBlockLayout();
							setGlitchPulse(signal, "blocks", true);
						} else {
							setGlitchPulse(signal, "threads", true);
						}
						pulseIndex += 1;
						if (pulseIndex < pulseCount) {
							stateTransitionTimer = eventScheduler.schedule('transition', pulse, 40);
							return;
						}
						stateTransitionTimer = eventScheduler.schedule('transition', function () {
							if (!isCurrentMount(owner, generation) || token !== stateTransitionToken) return;
							stateTransitionTimer = null;
							if (!keepVisual) {
								root.removeAttribute("data-transition-glitch");
								clearGlitchVisual();
							}
							onComplete();
						}, 28);
					}
					pulse();
				}

				runBurst(2, 0, true, function () {
					if (!isCurrentMount(owner, generation) || token !== stateTransitionToken || (motionQuery && motionQuery.matches)) return;
					runBurst(6, 2, false, function () {
						if (!isCurrentMount(owner, generation) || token !== stateTransitionToken) return;
						root.removeAttribute("data-transition-target");
						scheduleGlitch(owner, generation);
						scheduleEyeFlicker(owner, generation);
					});
				});
			}

			/* Schedule the next event after 2.3-4.6 seconds, then emit several short pulses. */
				function armGlitchTimer(callback, delay) {
					let timer = null;
					timer = eventScheduler.schedule('glitch', function () {
						/* A stale callback must never clear a timer owned by a newer mount. */
						if (glitchTimer === timer) glitchTimer = null;
						callback();
					}, delay);
					glitchTimer = timer;
					return timer;
				}

				function scheduleGlitch(owner, generation) {
				if (!isCurrentMount(owner, generation) || eventScheduler.has('glitch') || !root || visualSuspended || (motionQuery && motionQuery.matches)) return;
				const token = glitchToken;
				armGlitchTimer(function () {
					if (!isCurrentMount(owner, generation) || token !== glitchToken || !root || visualSuspended || (motionQuery && motionQuery.matches)) return;
						const signal = signalElement || root.querySelector(".dsh-fairy-signal");
					if (!signal) return;
					const mode = lastGlitchMode === "threads" ? "blocks" : "threads";
					lastGlitchMode = mode;
					if (mode === "blocks") setBlockLayout();
					/* Threads remain brief. Each block event doubles its original 1-2 pulse window. */
					/* Threads are intentionally given a longer readable window than the
					 * block fault: three to four short pulses, followed by a slightly
					 * longer fade, keeps the tear visible without making it persistent. */
					const pulseCount = mode === "threads" ? FAULT_TIMING.threads.pulses : 2 * (1 + Math.floor(Math.random() * 2));
					let pulseIndex = 0;

					function pulse() {
						if (!isCurrentMount(owner, generation) || token !== glitchToken || visualSuspended || (motionQuery && motionQuery.matches)) {
							return;
						}
						setGlitchPulse(signal, mode);
						pulseIndex += 1;
						if (pulseIndex < pulseCount) {
							const timing = FAULT_TIMING[mode];
							armGlitchTimer(pulse, randomBetween(timing.gapMin, timing.gapMax));
						} else {
							armGlitchTimer(function () {
								if (!isCurrentMount(owner, generation) || token !== glitchToken) return;
								clearGlitchVisual();
								scheduleGlitch(owner, generation);
							}, mode === "threads" ? randomBetween(FAULT_TIMING.threads.fadeMin, FAULT_TIMING.threads.fadeMax) : randomBetween(FAULT_TIMING.blocks.fadeMin, FAULT_TIMING.blocks.fadeMax));
						}
					}

					pulse();
				}, randomBetween(2300, 4600) / animationRate);
			}

			/* Invalidating the token also cancels callbacks already queued by an older event. */
				function stopGlitch() {
					glitchToken += 1;
				stateTransitionToken += 1;
				eventScheduler.cancel('glitch');
				eventScheduler.cancel('transition');
				glitchTimer = null;
				stateTransitionTimer = null;
				if (root) root.removeAttribute("data-transition-glitch");
						if (root) root.removeAttribute("data-transition-target");
						clearGlitchVisual();
						stopEyeFlicker();
			}

				/* Reduced-motion changes stop both CSS motion and JavaScript-driven glitches. */
			function ensureGlitchScheduler(owner, generation) {
						if (!isCurrentMount(owner, generation)) return;
						if (motionQuery && (motionOwner !== owner || motionGeneration !== generation)) unbindMotionListener();
						if (!motionQuery && typeof window !== "undefined" && typeof window.matchMedia === "function") {
						motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
						motionOwner = owner;
						motionGeneration = generation;
						motionChangeListener = function () {
							if (!isCurrentMount(owner, generation)) return;
							if (motionQuery.matches) {
								stopGlitch();
								synchronizeActiveClipPhase("normal");
							} else {
								synchronizeActiveClipPhase(root && root.getAttribute("data-state"));
								scheduleGlitch(owner, generation);
						}
					};
					if (typeof motionQuery.addEventListener === "function") motionQuery.addEventListener("change", motionChangeListener);
					else if (typeof motionQuery.addListener === "function") motionQuery.addListener(motionChangeListener);
				}
				if (visualSuspended || (motionQuery && motionQuery.matches)) {
					synchronizeActiveClipPhase("normal");
					return;
				}
					scheduleGlitch(owner, generation);
					scheduleEyeFlicker(owner, generation);
			}
			/* Styles may be removed by the host application, so mounting always rechecks them. */
			function ensureStyle() {
				if (document.getElementById(STYLE_ID)) return;
				const style = document.createElement("style");
				style.id = STYLE_ID;
				style.setAttribute("data-plugin", "dsh-fairy-visual");
				style.textContent = CSS;
				(document.head || document.documentElement).appendChild(style);
			}
				function setAnimationRate(nextRate) {
					const numericRate = typeof nextRate === "string" ? Number(nextRate) : nextRate;
					const rate = numericRate === .7 || numericRate === 1.5 ? numericRate : 1;
					const changed = rate !== animationRate;
				if (changed) motionClock.setRate(rate);
				animationRate = rate;
				if (!root) return;
				root.setAttribute("data-dsh-fairy-animation-rate", String(rate));
				root.style.setProperty("--dsh-fairy-steady-rate", String(rate));
				/* Keep the pulse-ring motion itself unchanged; only its idle portion
				 * contracts/expands with the selected cadence. */
				root.style.setProperty("--dsh-fairy-pulse-cycle", (1.44 + 2.56 / rate) + "s");
				if (changed) {
					alignEyeLayersToClock();
					/* Thinking/comfort clips are independent CSS animations and must be
					 * re-anchored at the same boundary as the eye layers. */
					synchronizeActiveClipPhase(root.getAttribute("data-state"));
				}
				/* A rate change is a new cadence boundary. Do not leave already queued
				 * glitch/flicker timers running on the old cadence. Transition bursts are
				 * allowed to finish; steady-state schedules restart immediately. */
				if (changed && !root.hasAttribute("data-transition-glitch") && !visualSuspended) {
					stopGlitch();
					if (root.getAttribute("data-state") === "normal") {
						scheduleGlitch(mountedOwner, mountGeneration);
						scheduleEyeFlicker(mountedOwner, mountGeneration);
					}
				}
			}
			function bindSpeedListener() {
				if (speedListener) return;
				speedListener = function (event) { setAnimationRate(event?.detail?.rate); };
				window.addEventListener("dsh-fairy-mascot-animation-speed", speedListener);
			}
			/* Build once; MutationObserver will reconnect this same node if the host removes it. */
			function build() {
				root = document.createElement("div");
				root.id = ROOT_ID;
				root.setAttribute("data-dsh-fairy-mascot-root", "true");
				root.setAttribute("aria-hidden", "true");
				root.innerHTML = '<div class="dsh-fairy-float">' + HALO_SVG + PULSE_SVG + SVG + "</div>";
				return root;
			}
			/* Commits the visual state after the harness has committed its matching host state.
			 * Repeated state notifications are ignored; a real change cancels its predecessor. */
				function applyVisualState(nextState, playTransition, owner, generation) {
				if (!isCurrentMount(owner, generation) || !root) return;
					const normalized = nextState === "comforting" ? "comforting" : nextState === "thinking" ? "thinking" : "normal";
				if (appliedState === normalized && root.getAttribute("data-state") === normalized) {
					if (!visualSuspended) ensureGlitchScheduler(owner, generation);
					return;
				}
				const stateChanged = appliedState !== null && appliedState !== normalized;
				root.setAttribute("data-state", normalized);
					appliedState = normalized;
					if (visualSuspended) return;
				synchronizeActiveClipPhase(normalized);
				if (stateChanged && playTransition !== false) playStateTransition(normalized, owner, generation);
				else ensureGlitchScheduler(owner, generation);
			}
			function setVisualActive(active, owner, generation = mountGeneration) {
				if (!isCurrentMount(owner, generation)) return;
				requestedVisualActive = active === true;
				const nextActive = requestedVisualActive && lifecycleVisible;
				if (!root) {
					visualSuspended = !nextActive;
					return;
				}
				if (!nextActive) {
					stopMotionLoop();
					motionClock.pause();
					visualSuspended = true;
					lifecycleToken += 1;
					if (lifecycleResumeFrame) cancelAnimationFrame(lifecycleResumeFrame);
					lifecycleResumeFrame = 0;
					stopGlitch();
					root.setAttribute("data-visual-suspended", "true");
					return;
				}
				const shouldResume = !visualActiveInitialized || visualSuspended || root.hasAttribute("data-visual-suspended");
				visualActiveInitialized = true;
				if (!shouldResume) return;
				visualSuspended = false;
				motionClock.resume();
				root.removeAttribute("data-visual-suspended");
				startMotionLoop();
				const token = ++lifecycleToken;
				lifecycleResumeFrame = requestAnimationFrame(function () {
					if (!isCurrentMount(owner, generation) || token !== lifecycleToken || visualSuspended || !root) return;
					lifecycleResumeFrame = 0;
					synchronizeActiveClipPhase(root.getAttribute("data-state"));
					startMotionLoop();
					ensureGlitchScheduler(owner, generation);
				});
			}
			function bindLifecycleListeners(owner, generation) {
				if (lifecycleVisibilityListener && lifecycleListenerOwner === owner && lifecycleListenerGeneration === generation) return;
				unbindLifecycleListeners();
				lifecycleListenerOwner = owner;
				lifecycleListenerGeneration = generation;
				lifecycleVisibilityListener = function () {
					if (!isCurrentMount(owner, generation)) return;
					lifecycleVisible = isLifecycleVisible();
					setVisualActive(requestedVisualActive, owner, generation);
				};
				lifecyclePageHideListener = function () {
					if (!isCurrentMount(owner, generation)) return;
					lifecycleVisible = false;
					setVisualActive(requestedVisualActive, owner, generation);
				};
				lifecyclePageShowListener = function () {
					if (!isCurrentMount(owner, generation)) return;
					lifecycleVisible = isLifecycleVisible();
					setVisualActive(requestedVisualActive, owner, generation);
				};
				document.addEventListener("visibilitychange", lifecycleVisibilityListener);
				window.addEventListener("pagehide", lifecyclePageHideListener);
				window.addEventListener("pageshow", lifecyclePageShowListener);
				}
			function unbindLifecycleListeners() {
				if (!lifecycleVisibilityListener) return;
				document.removeEventListener("visibilitychange", lifecycleVisibilityListener);
				window.removeEventListener("pagehide", lifecyclePageHideListener);
				window.removeEventListener("pageshow", lifecyclePageShowListener);
				lifecycleVisibilityListener = null;
				lifecyclePageHideListener = null;
				lifecyclePageShowListener = null;
				lifecycleListenerOwner = null;
				lifecycleListenerGeneration = 0;
			}
				/* The visual never falls back to document.body: only the official shell-overlay
				 * stage may own it, so application boot cannot flash a temporary second eye. */
				function mount(stageNode, owner, persistedRate) {
					if (!document.body) return;
					const stage = stageNode || owner?.stage;
					if (!isValidOwner(owner, stage) || stage.isConnected === false || (typeof stage.matches === "function" && !stage.matches(HOST_SELECTOR))) return;
					/* A later Stage must take ownership before it can bind any resource. */
					if (mountedOwner && mountedOwner !== owner) dispose(mountedOwner);
					if (mountedOwner !== owner || mountedHost !== stage) {
						mountedOwner = owner;
						mountedHost = stage;
						mountGeneration += 1;
					}
					const stageRoot = stage.id !== ROOT_ID ? stage.querySelector("#" + ROOT_ID) : null;
					const previousRoot = root;
					const rootWasReparented = Boolean(root && root.parentNode !== stage);
					const nextRoot = stageRoot || root || build();
					if ((previousRoot && nextRoot !== previousRoot) || rootWasReparented) {
						invalidateMountResources();
					}
					root = nextRoot;
					root.setAttribute("data-dsh-fairy-mascot-root", "true");
					if (root.parentNode !== stage) {
						stage.appendChild(root);
						motionClock.reset();
						visualActiveInitialized = false;
					}
					if (root !== previousRoot) visualActiveInitialized = false;
					const generation = mountGeneration;
					bindLifecycleListeners(owner, generation);
					lifecycleVisible = isLifecycleVisible();
					ensureStyle();
					bindSpeedListener();
					cacheVisualNodes();
					setAnimationRate(persistedRate === undefined ? animationRate : persistedRate);
					setVisualActive(stage.getAttribute("data-fairy-visual-active") === "true", owner, generation);
					const requestedState = stage.getAttribute("data-fairy-state");
					/* Low-power mode is host-controlled and never changes Fairy's expression state. */
					if (stage.getAttribute("data-fairy-low-power") === "true") root.setAttribute("data-low-power", "");
					else root.removeAttribute("data-low-power");
					applyVisualState(requestedState, true, owner, generation);
					if (!visualSuspended) startMotionLoop();

					if (stage !== observedHost || !hostObserver) {
						if (hostObserver) hostObserver.disconnect();
						observedHost = stage;
						if (typeof MutationObserver !== "undefined") {
							const observedGeneration = generation;
							hostObserver = createManagedMutationObserver(function () {
								if (isCurrentMount(owner, observedGeneration, stage)) mount(stage, owner);
							});
							hostObserver.observe(stage, { childList: true });
						}
					}
				}

				function dispose(owner) {
					if (owner && mountedOwner !== owner) return;
					if (mountedOwner) mountedOwner.active = false;
					invalidateMountResources();
					stopMotionLoop();
					mountedOwner = null;
					mountedHost = null;
					root?.remove();
					root = null;
					cacheVisualNodes();
					appliedState = null;
					motionClock.pause();
					visualSuspended = true;
					requestedVisualActive = false;
					lifecycleVisible = true;
					visualActiveInitialized = false;
					document.getElementById(STYLE_ID)?.remove();
				}
			mascotRuntime = { mount: mount, setVisualActive: setVisualActive, ownsHost: (owner) => mountedOwner === owner || mountedHost === owner, ownsOwner: (owner) => mountedOwner === owner, activeTimerCount: () => eventScheduler.activeCount(), dispose: dispose }; })();
	return mascotRuntime;
}
module.exports = { createMascotRuntime };

  };

  window.FairyMascot = __require('mascot-runtime.js');
  window.FairyMascotAssets = __require('mascot-assets.js');
})();
