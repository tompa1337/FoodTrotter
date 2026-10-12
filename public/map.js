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
  const [, , W, H] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const MAX_ZOOM = 10;
  const view = { x: 0, y: 0, w: W, h: H };
  const zoomBox = scroller?.querySelector('.map-zoom');
  const resetBtn = zoomBox?.querySelector('[data-zoom="reset"]');
  const dots = [...svg.querySelectorAll('circle[data-r]')];

  const zoomLevel = () => W / view.w;
  // Rutans form (på mobil är den högre än själva världskartan).
  const aspect = () => { const r = svg.getBoundingClientRect(); return r.width ? r.height / r.width : H / W; };

  function apply() {
    // Håll kartan inom sina kanter; är rutan högre än kartan centreras den lodrätt.
    view.w = Math.min(W, Math.max(W / MAX_ZOOM, view.w));
    view.h = view.w * aspect();
    view.x = Math.min(W - view.w, Math.max(0, view.x));
    view.y = view.h >= H ? (H - view.h) / 2 : Math.min(H - view.h, Math.max(0, view.y));
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    const k = zoomLevel();
    // Prickarna för små länder växer inte i samma takt som kartan.
    for (const c of dots) c.setAttribute('r', (Number(c.dataset.r) / Math.pow(k, 0.75)).toFixed(2));
    const zoomed = k > 1.01;
    svg.classList.toggle('zoomed', zoomed);
    if (resetBtn) resetBtn.hidden = !zoomed;
  }

  /** Skärmpunkt → kartkoordinat. */
  function toMap(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return { x: view.x + ((clientX - r.left) / r.width) * view.w, y: view.y + ((clientY - r.top) / r.height) * view.h };
  }

  /** Zooma med faktorn f kring en kartpunkt (som stannar kvar under fingret/musen). */
  function zoomAt(f, mx, my) {
    const newW = Math.min(W, Math.max(W / MAX_ZOOM, view.w / f));
    const ratio = newW / view.w;
    view.x = mx - (mx - view.x) * ratio;
    view.y = my - (my - view.y) * ratio;
    view.w = newW;
    apply();
  window.addEventListener('resize', apply);
  }

  function zoomCenter(f) {
    zoomAt(f, view.x + view.w / 2, view.y + view.h / 2);
  }

  zoomBox?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-zoom]');
    if (!btn) return;
    if (btn.dataset.zoom === 'in') zoomCenter(1.6);
    else if (btn.dataset.zoom === 'out') zoomCenter(1 / 1.6);
    else { view.x = 0; view.y = 0; view.w = W; apply(); }
  });

  // Dator: Ctrl/Cmd + scroll (eller nypning på styrplattan). Vanlig scroll rullar sidan som vanligt.
  svg.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const p = toMap(e.clientX, e.clientY);
    zoomAt(Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.006), p.x, p.y);
  }, { passive: false });

  svg.addEventListener('dblclick', (e) => {
    e.preventDefault();
    const p = toMap(e.clientX, e.clientY);
    zoomAt(e.shiftKey ? 1 / 2 : 2, p.x, p.y);
  });

  // Dra för att flytta, nyp med två fingrar för att zooma.
  const pointers = new Map();
  let gesture = null;
  let dragged = false;

  function startGesture() {
    const pts = [...pointers.values()];
    if (pts.length === 1) {
      gesture = { type: 'pan', sx: pts[0].x, sy: pts[0].y, vx: view.x, vy: view.y };
    } else if (pts.length >= 2) {
      const [a, b] = pts;
      const mid = toMap((a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), w: view.w, mid, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    }
  }

  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) dragged = false;
    startGesture();
  });

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = svg.getBoundingClientRect();
    const scale = view.w / r.width;
    if (gesture?.type === 'pan') {
      const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
      if (!dragged && Math.hypot(dx, dy) < 6) return;
      if (zoomLevel() <= 1.01) return; // hela världen syns redan
      dragged = true;
      svg.setPointerCapture?.(e.pointerId);
      view.x = gesture.vx - dx * scale;
      view.y = gesture.vy - dy * scale;
      apply();
    } else if (gesture?.type === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (!gesture.dist) return;
      dragged = true;
      view.w = Math.min(W, Math.max(W / MAX_ZOOM, gesture.w * (gesture.dist / dist)));
      view.h = view.w * aspect();
      // Håll punkten mellan fingrarna på samma ställe.
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      view.x = gesture.mid.x - ((cx - r.left) / r.width) * view.w;
      view.y = gesture.mid.y - ((cy - r.top) / r.height) * view.h;
      apply();
    }
  });

  function endPointer(e) {
    if (!pointers.delete(e.pointerId)) return;
    startGesture(); // från två fingrar till ett: fortsätt panorera utan hopp
    if (!pointers.size) gesture = null;
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
      const box = first.getBBox();
      cx = box.x + box.width / 2;
      cy = box.y + box.height / 2;
    }
    view.w = W / 2.2;
    view.h = view.w * aspect();
    view.x = cx - view.w / 2;
    view.y = cy - view.h / 2;
  }
  apply();
})();
