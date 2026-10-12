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

  async function open(code) {
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
      panel.querySelector('.panel-close')?.focus({ preventScroll: true });
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
    open(link.dataset.code);
  });

  panel.addEventListener('click', (e) => {
    if (e.target.closest('.panel-close')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });

  // På smala skärmar är kartan bredare än skärmen: centrera på veckans första land.
  if (scroller && scroller.scrollWidth > scroller.clientWidth) {
    const first = svg.querySelector('a.active');
    if (first) {
      const box = first.getBoundingClientRect();
      const host = scroller.getBoundingClientRect();
      scroller.scrollLeft += box.left + box.width / 2 - (host.left + host.width / 2);
    }
  }
})();
