/* ============================================================
   OYLA — PURE FORM · SS/01
   State machine:
   loading → intro → hero → macro-playing → macro
           → reveal-playing → product
   Videos chain seamlessly (v1 end ≈ v2 start, v2 end ≈ v3 start);
   when each video settles, the matching hi-res still snaps in
   underneath and the video fades away — no flash, full quality.
   ============================================================ */

const $ = (s) => document.querySelector(s);

const body = document.body;
const v1 = $("#v1"), v2 = $("#v2"), v3 = $("#v3");
const stills = {
  hero: $("#still-hero"),
  macro: $("#still-macro"),
  product: $("#still-product"),
};
const vprogress = $("#vprogress");
const indicator = $("#indicator");

const VIDEO_W = 1916, VIDEO_H = 1080;
/* Signet-ring position in video space (u,v of the hero end frame). */
const RING_UV = { u: 0.589, v: 0.338 };

/* Spec callouts anchored in macro-frame space. */
const CALLOUTS = [
  { sel: "#co-stone", u: 0.565, v: 0.26, flip: false },
  { sel: "#co-material", u: 0.695, v: 0.52, flip: false },
  { sel: "#co-finish", u: 0.425, v: 0.615, flip: true },
];

/* Cinematics run at 4x (~0.75s each) — the site should feel immediate. */
const RATE = { v1: 4, v2: 4, v3: 4 };

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- state ---------------- */

let state = "loading";
let lastChange = 0;

const chrome = $("#chrome");
const uiHero = $("#ui-hero"), uiMacro = $("#ui-macro"), uiProduct = $("#ui-product");

/* User-initiated transitions must not re-fire on double-dispatched
   clicks or a click replayed right after a state change. */
function unlocked() {
  if (performance.now() - lastChange < 600) return false;
  return true;
}

function setState(next) {
  state = next;
  lastChange = performance.now();
  body.dataset.state = next;

  if (next === "macro") placeCallouts();

  chrome.classList.toggle("show", next === "hero" || next === "product");
  uiHero.classList.toggle("show", next === "hero");
  uiMacro.classList.toggle("show", next === "macro");
  uiProduct.classList.toggle("show", next === "product");
  body.classList.toggle("show-indicator", next === "hero");
  cursorHint();
}

/* ---------------- media helpers ---------------- */

function layerOn(...els) {
  [v1, v2, v3, stills.hero, stills.macro, stills.product].forEach((el) => {
    el.classList.toggle("on", els.includes(el));
  });
}

/* Snap the hi-res still on underneath the frozen video, then fade
   the video out over it — the resting frame ends up full quality. */
function settle(still, video) {
  layerOn(still, video);
  setTimeout(() => layerOn(still), 60);
}

function trackProgress(video) {
  const tick = () => {
    if (video.paused || video.ended) {
      vprogress.style.transform = "scaleX(1)";
      return;
    }
    vprogress.style.transform =
      "scaleX(" + (video.currentTime / (video.duration || 1)) + ")";
    requestAnimationFrame(tick);
  };
  vprogress.style.transform = "scaleX(0)";
  requestAnimationFrame(tick);
}

function playVideo(video, rate, onEnded) {
  video.currentTime = 0;
  video.playbackRate = rate;
  trackProgress(video);
  video.onended = onEnded;
  const p = video.play();
  if (p) p.catch(() => onEnded());
}

/* ---------------- preload ---------------- */
/* Critical assets gate the intro; the rest stream in behind it. */

const ASSETS = [
  { el: v1, url: "assets/video1.mp4", bytes: 4115730, critical: true },
  { el: stills.hero, url: "assets/hero-hd.jpg", bytes: 235578, img: true, critical: true },
  { el: v2, url: "assets/video2.mp4", bytes: 3546297 },
  { el: v3, url: "assets/video3.mp4", bytes: 4076175 },
  { el: stills.macro, url: "assets/macro-hd.jpg", bytes: 280036, img: true },
  { el: stills.product, url: "assets/product-hd.jpg", bytes: 175892, img: true },
];
const CRITICAL_BYTES = ASSETS.filter(a => a.critical)
  .reduce((a, x) => a + x.bytes, 0);

const pctEl = $("#loader-pct");
const fillEl = $("#loader-fill");
let criticalLoaded = 0;

function paintProgress() {
  const p = Math.min(1, criticalLoaded / CRITICAL_BYTES);
  pctEl.textContent = String(Math.floor(p * 100)).padStart(2, "0");
  fillEl.style.clipPath = "inset(0 " + (100 - p * 100) + "% 0 0)";
}

async function fetchAsset({ el, url, bytes, img, critical }) {
  try {
    const res = await fetch(url);
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.byteLength;
      if (critical) { criticalLoaded += value.byteLength; paintProgress(); }
    }
    if (critical) criticalLoaded += Math.max(0, bytes - got);
    const type = img ? "image/jpeg" : "video/mp4";
    el.src = URL.createObjectURL(new Blob(chunks, { type }));
  } catch {
    el.src = url; // fall back to streaming
    if (critical) criticalLoaded += bytes;
  }
  if (critical) paintProgress();
  await new Promise((resolve) => {
    if (img ? el.complete : el.readyState >= 3) return resolve();
    const ev = img ? "load" : "canplaythrough";
    el.addEventListener(ev, resolve, { once: true });
    el.addEventListener("error", resolve, { once: true });
    setTimeout(resolve, 6000);
  });
}

async function boot() {
  /* Critical assets get the full pipe first; the rest stream in
     behind the intro so they never delay the first frame. */
  await Promise.all(ASSETS.filter(a => a.critical).map(fetchAsset));
  startIntro();
  ASSETS.filter(a => !a.critical).forEach(fetchAsset);
}

/* ---------------- flow ---------------- */

function startIntro() {
  if (REDUCED) return toHero(true);
  layerOn(stills.hero, v1);
  setState("intro");
  playVideo(v1, RATE.v1, () => toHero(false));
}

function toHero(skipped) {
  v1.onended = null;
  if (skipped) {
    v1.pause();
    layerOn(stills.hero); // hi-res hero replaces mid-frame video
  } else {
    settle(stills.hero, v1); // fade frozen video into the hi-res still
  }
  placeIndicator();
  setState("hero");
}

function playMacro() {
  if (state !== "hero" || !unlocked()) return;
  setState("macro-playing");
  v2.currentTime = 0;
  setTimeout(() => {
    layerOn(stills.hero, v2);
    playVideo(v2, RATE.v2, () => {
      settle(stills.macro, v2);
      setState("macro");
    });
  }, REDUCED ? 0 : 80);
}

function playReveal() {
  if (state !== "macro" || !unlocked()) return;
  setState("reveal-playing");
  v3.currentTime = 0;
  setTimeout(() => {
    layerOn(stills.macro, v3);
    playVideo(v3, RATE.v3, () => {
      settle(stills.product, v3);
      setState("product");
      history.pushState({ s: "product" }, "", "#piece");
    });
  }, REDUCED ? 0 : 80);
}

function backToHero() {
  if (state !== "product" || !unlocked()) return;
  v2.pause(); v3.pause();
  layerOn(stills.hero);
  placeIndicator();
  if (location.hash === "#piece") {
    history.replaceState(null, "", location.pathname);
  }
  setState("hero");
}

/* ---------------- frame-space mapping ---------------- */

/* Maps a point in video space (u,v ∈ [0,1]) to screen pixels,
   assuming object-fit: cover with centered object-position. */
function videoToScreen(u, v) {
  const W = innerWidth, H = innerHeight;
  const scale = Math.max(W / VIDEO_W, H / VIDEO_H);
  const dw = VIDEO_W * scale, dh = VIDEO_H * scale;
  return {
    x: (W - dw) / 2 + u * dw,
    y: (H - dh) / 2 + v * dh,
  };
}

function placeIndicator() {
  const { x, y } = videoToScreen(RING_UV.u, RING_UV.v);
  /* core sits on the ring; label flows to the right */
  indicator.style.left = x - 7 + "px";
  indicator.style.top = y - 7 + "px";
  /* keep the label on-screen on narrow viewports */
  const flip = x > innerWidth - 320;
  indicator.style.flexDirection = flip ? "row-reverse" : "row";
  indicator.querySelector(".ind-line").style.margin = flip
    ? "0 8px 0 0" : "0 0 0 8px";
  indicator.style.transform = flip ? "translateX(-100%) translateX(14px)" : "none";
}

function placeCallouts() {
  CALLOUTS.forEach((c) => {
    const el = $(c.sel);
    const { x, y } = videoToScreen(c.u, c.v);
    el.classList.toggle("flip", c.flip);
    el.style.top = y + "px";
    if (c.flip) {
      el.style.left = "auto";
      el.style.right = innerWidth - x + 4 + "px";
    } else {
      el.style.right = "auto";
      el.style.left = x - 4 + "px";
    }
    el.style.transform = "translateY(-50%)";
  });
}

let resizeRaf = 0;
addEventListener("resize", () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    if (state === "hero") placeIndicator();
    if (state === "macro") placeCallouts();
  });
});

/* ---------------- ticker ---------------- */

(function fillTicker() {
  const base = "STERLING SILVER — PRECIOUS DETAILS — " +
    "PURE FORM — OYLA SS/01 — ";
  const text = base.repeat(8);
  $("#tk-a").textContent = text;
  $("#tk-b").textContent = text;
})();

/* ---------------- spec accordion ---------------- */

document.querySelectorAll(".specs li").forEach((li) => {
  const head = li.querySelector(".spec-head");
  head.addEventListener("click", () => {
    const wasOpen = li.classList.contains("open");
    document.querySelectorAll(".specs li.open").forEach((o) => {
      o.classList.remove("open");
      o.querySelector(".spec-head").setAttribute("aria-expanded", "false");
    });
    if (!wasOpen) {
      li.classList.add("open");
      head.setAttribute("aria-expanded", "true");
    }
  });
});

/* ---------------- events ---------------- */

indicator.addEventListener("click", playMacro);
$("#btn-discover").addEventListener("click", playMacro);
$("#btn-open").addEventListener("click", playReveal);
$("#skip").addEventListener("click", () => {
  if (state === "intro") toHero(true);
});
$("#btn-back").addEventListener("click", backToHero);

/* in macro state the whole stage opens the piece */
addEventListener("click", (e) => {
  if (state === "macro" && !e.target.closest("#ui-macro")) playReveal();
});

addEventListener("popstate", () => {
  if (state === "product") backToHero();
});

addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (state === "intro") toHero(true);
    else if (state === "product") backToHero();
  }
});

/* ---------------- cursor ---------------- */

const cursor = $("#cursor");
const cursorLabel = $("#cursor-label");
let mx = -100, my = -100, cx = -100, cy = -100;
let hoverEl = null;

addEventListener("mousemove", (e) => {
  mx = e.clientX; my = e.clientY;
  if (e.target !== hoverEl) { hoverEl = e.target; cursorHint(); }
}, { passive: true });

(function cursorLoop() {
  cx += (mx - cx) * 0.22;
  cy += (my - cy) * 0.22;
  cursor.style.transform =
    "translate(" + (cx - cursor.offsetWidth / 2) + "px," +
    (cy - cursor.offsetHeight / 2) + "px)";
  cursorLabel.style.transform =
    "translate(" + (cx + 18) + "px," + (cy + 18) + "px)";
  requestAnimationFrame(cursorLoop);
})();

/* Only re-evaluates when the hovered element actually changes. */
function cursorHint() {
  let label = "";
  const el = hoverEl instanceof Element ? hoverEl : null;
  if (state === "macro") label = "OPEN";
  if (el && el.closest("#indicator")) label = "INSPECT";
  const interactive = el && el.closest("button, a, #indicator");
  cursor.classList.toggle("big", Boolean(interactive) || state === "macro");
  cursorLabel.textContent = label;
  cursorLabel.classList.toggle("on", Boolean(label));
}

/* ---------------- go ---------------- */

if (location.hash === "#piece") {
  history.replaceState(null, "", location.pathname);
}
boot();
