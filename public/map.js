// Världskartan: klick på ett land öppnar en infopanel istället för att byta sida.
(() => {
  const svg = document.querySelector('svg.world');
  const panel = document.getElementById('map-panel');
  const scroller = document.getElementById('map-scroll');
  if (!svg || !panel) return;

  let selected = null;
  let request = 0;

  function select(code) {
    svg.querySelectorAll('.selected').forEach((el) => el.classList.remove('selected'));
    svg.querySelectorAll(`[data-code="${code}"]`).forEach((el) => el.classList.add('selected'));
    selected = code;
  }

  async function open(code, fromKeyboard = false) {
    select(code);
    const id = ++request;
    panel.hidden = false;
    panel.classList.add('loading');
    const next = location.pathname + location.search;
    try {
      const res = await fetch(`/land/${code}/kort?next=${encodeURIComponent(next)}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(res.status);
      const html = await res.text();
      if (id !== request) return; // ett nyare klick hann före
      panel.innerHTML = html;
      panel.classList.remove('loading');
      if (fromKeyboard) panel.querySelector('.panel-close')?.focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 899px)').matches) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch {
      location.href = `/land/${code}`; // fall tillbaka till landsidan
    }
  }

  function close() {
    panel.hidden = true;
    panel.innerHTML = '';
    svg.querySelectorAll('.selected').forEach((el) => el.classList.remove('selected'));
    if (selected) svg.querySelector(`a[data-code="${selected}"]`)?.focus({ preventScroll: true });
    selected = null;
  }

  svg.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-code]');
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (e.detail > 1) { e.preventDefault(); return; } // andra klicket i ett dubbelklick zoomar bara
    e.preventDefault();
    open(link.dataset.code, e.detail === 0); // detail 0 = aktiverad med tangentbordet
  });

  panel.addEventListener('click', (e) => {
    if (e.target.closest('.panel-close')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });

  // ── Zoom och panorering ─────────────────────────────────────
  // För att det ska gå mjukt flyttas och skalas kartan med CSS-transform medan man zoomar/drar
  // (grafikkortet gör jobbet). När rörelsen är klar ritas kartan om skarpt via viewBox.
  const [, , W, H] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const MAX_ZOOM = 10;
  const host = scroller || svg.parentElement;
  const zoomBox = host.querySelector('.map-zoom');
  const resetBtn = zoomBox?.querySelector('[data-zoom="reset"]');
  const dots = [...svg.querySelectorAll('circle[data-r]')];

  let view = { x: 0, y: 0, w: W, h: H }; // det som just nu är ritat (viewBox)
  let cur = { ...view };                  // det som visas (viewBox + transform)
  let frame = 0;
  let tween = null;

  const box = () => host.getBoundingClientRect();
  // Rutans form (på mobil är den högre än själva världskartan).
  const aspect = () => { const r = box(); return r.width ? r.height / r.width : H / W; };

  function clamp(v) {
    const w = Math.min(W, Math.max(W / MAX_ZOOM, v.w));
    const h = w * aspect();
    const x = Math.min(W - w, Math.max(0, v.x));
    const y = h >= H ? (H - h) / 2 : Math.min(H - h, Math.max(0, v.y));
    return { x, y, w, h };
  }

  function paint() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const r = box();
      const s = view.w / cur.w;
      const tx = ((view.x - cur.x) / cur.w) * r.width;
      const ty = ((view.y - cur.y) / cur.h) * r.height;
      svg.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    });
  }

  function commit() {
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    cur = clamp(cur);
    view = { ...cur };
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    svg.style.transform = '';
    svg.classList.remove('moving');
    const k = W / view.w;
    // Prickarna för små länder växer inte i samma takt som kartan.
    for (const c of dots) c.setAttribute('r', (Number(c.dataset.r) / Math.pow(k, 0.75)).toFixed(2));
    svg.classList.toggle('zoomed', k > 1.01);
    if (resetBtn) resetBtn.hidden = k <= 1.01;
  }

  function show(v) {
    cur = clamp(v);
    svg.classList.add('moving');
    paint();
  }

  /** Skärmpunkt → kartkoordinat (i det som visas just nu). */
  function toMap(clientX, clientY, v = cur) {
    const r = box();
    return { x: v.x + ((clientX - r.left) / r.width) * v.w, y: v.y + ((clientY - r.top) / r.height) * v.h };
  }

  /** Ny vy, inzoomad med faktorn f kring kartpunkten (mx, my) som stannar på samma ställe. */
  function zoomedView(v, f, mx, my) {
    const w = Math.min(W, Math.max(W / MAX_ZOOM, v.w / f));
    const ratio = w / v.w;
    return { x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio, w, h: v.h * ratio };
  }

  const ease = (t) => 1 - Math.pow(1 - t, 3);

  /** Glid mjukt till en ny vy. */
  function animateTo(target, ms = 280) {
    const to = clamp(target);
    const from = { ...cur };
    const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
    const tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
    const t0 = performance.now();
    if (tween) cancelAnimationFrame(tween.raf);
    tween = { to };
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = ease(t);
      const w = from.w * Math.pow(to.w / from.w, e); // logaritmiskt känns jämnast
      const h = w * aspect();
      const cx = fc.x + (tc.x - fc.x) * e, cy = fc.y + (tc.y - fc.y) * e;
      cur = { x: cx - w / 2, y: cy - h / 2, w, h };
      svg.classList.add('moving');
      paint();
      if (t < 1) tween.raf = requestAnimationFrame(step);
      else { tween = null; cur = to; commit(); }
    };
    tween.raf = requestAnimationFrame(step);
  }

  function stopTween() {
    if (tween) { cancelAnimationFrame(tween.raf); tween = null; }
  }

  zoomBox?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-zoom]');
    if (!btn) return;
    const base = tween?.to || cur;
    const c = { x: base.x + base.w / 2, y: base.y + base.h / 2 };
    if (btn.dataset.zoom === 'in') animateTo(zoomedView(base, 1.8, c.x, c.y));
    else if (btn.dataset.zoom === 'out') animateTo(zoomedView(base, 1 / 1.8, c.x, c.y));
    else animateTo({ x: 0, y: 0, w: W, h: H }, 350);
  });

  // Dator: Ctrl/Cmd + scroll (eller nypning på styrplattan). Vanlig scroll rullar sidan som vanligt.
  svg.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const base = tween?.to || cur;
    const p = toMap(e.clientX, e.clientY, base);
    const delta = Math.max(-100, Math.min(100, e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY));
    animateTo(zoomedView(base, Math.exp(-delta * 0.006), p.x, p.y), 160);
  }, { passive: false });

  svg.addEventListener('dblclick', (e) => {
    e.preventDefault();
    const base = tween?.to || cur;
    const p = toMap(e.clientX, e.clientY, base);
    animateTo(zoomedView(base, e.shiftKey ? 1 / 2 : 2, p.x, p.y));
  });

  // Dra för att flytta, nyp med två fingrar för att zooma.
  const pointers = new Map();
  let gesture = null;
  let dragged = false;

  function startGesture() {
    const pts = [...pointers.values()];
    const r = box();
    if (pts.length === 1) {
      gesture = { type: 'pan', sx: pts[0].x, sy: pts[0].y, start: { ...cur }, scale: cur.w / r.width };
    } else if (pts.length >= 2) {
      const [a, b] = pts;
      gesture = {
        type: 'pinch',
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        start: { ...cur },
        mid: toMap((a.x + b.x) / 2, (a.y + b.y) / 2),
      };
    }
  }

  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stopTween();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) dragged = false;
    startGesture();
  });

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture?.type === 'pan') {
      const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
      if (!dragged && Math.hypot(dx, dy) < 6) return;
      if (W / cur.w <= 1.01) return; // hela världen syns redan
      dragged = true;
      svg.setPointerCapture?.(e.pointerId);
      show({ ...gesture.start, x: gesture.start.x - dx * gesture.scale, y: gesture.start.y - dy * gesture.scale });
    } else if (gesture?.type === 'pinch' && pointers.size >= 2 && gesture.dist) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      dragged = true;
      const r = box();
      const w = Math.min(W, Math.max(W / MAX_ZOOM, gesture.start.w * (gesture.dist / dist)));
      const h = w * aspect();
      // Håll punkten mellan fingrarna på samma ställe.
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      show({ x: gesture.mid.x - ((cx - r.left) / r.width) * w, y: gesture.mid.y - ((cy - r.top) / r.height) * h, w, h });
    }
  });

  function endPointer(e) {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size) startGesture(); // från två fingrar till ett: fortsätt dra utan hopp
    else { gesture = null; if (svg.classList.contains('moving')) commit(); }
  }
  // Två fingrar på kartan ska zooma kartan, inte rulla eller zooma hela sidan.
  svg.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  // Ett klick efter att man dragit ska inte öppna ett land.
  svg.addEventListener('click', (e) => {
    if (dragged) { e.preventDefault(); e.stopImmediatePropagation(); dragged = false; }
  }, true);

  // På mobil: börja inzoomat kring veckans första land (eller första tagna flagga).
  if (window.matchMedia('(max-width: 699px)').matches) {
    const first = svg.querySelector('a.active') || svg.querySelector('a.earned, a.gold');
    let cx = W / 2, cy = H / 2;
    if (first) {
      const b = first.getBBox();
      cx = b.x + b.width / 2;
      cy = b.y + b.height / 2;
    }
    const w = W / 2.2, h = w * aspect();
    cur = { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  commit();
  window.addEventListener('resize', () => { stopTween(); commit(); });
})();
