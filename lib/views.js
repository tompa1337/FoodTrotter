// HTML-mallar. Allt dynamiskt innehåll går genom esc().

import { CONTINENTS, COUNTRIES } from '../data/countries.js';
import { addDays, isoWeek, mondayOf, MAX_DAYS_BACK } from './rules.js';
import { MAP_WIDTH, MAP_HEIGHT, BACKGROUND, SHAPES, MARKERS } from '../data/worldmap.js';

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const continentName = (id) => CONTINENTS.find((c) => c.id === id)?.name ?? id;

export function dayMonth(s) {
  return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${s}T00:00:00Z`));
}
export function weekday(s) {
  return new Intl.DateTimeFormat('sv-SE', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${s}T00:00:00Z`));
}
function weekRange(monday) {
  const sunday = addDays(monday, 6);
  const sameMonth = monday.slice(5, 7) === sunday.slice(5, 7);
  return sameMonth ? `${Number(monday.slice(8))}–${dayMonth(sunday)}` : `${dayMonth(monday)} – ${dayMonth(sunday)}`;
}

export function flagImg(code, name, cls = 'flag') {
  return `<img class="${cls}" src="/flags/4x3/${esc(code)}.svg" alt="${esc(name ? `Flagga: ${name}` : '')}" loading="lazy" width="40" height="30">`;
}

/** Rund flaggbadge. state: { flag, gold } eller null */
export function badge(country, state, size = 'md') {
  const cls = ['badge', `badge-${size}`, state?.flag ? 'earned' : 'locked', state?.gold ? 'gold' : ''].join(' ');
  const title = state?.gold ? `${country.name} – guld!` : state?.flag ? country.name : `${country.name} (ej tagen)`;
  return `<a class="${cls}" href="/land/${esc(country.code)}" title="${esc(title)}">
    <span class="badge-disc"><img src="/flags/1x1/${esc(country.code)}.svg" alt="" loading="lazy"></span>
    ${state?.gold ? '<span class="badge-star" aria-hidden="true">★</span>' : ''}
    <span class="sr">${esc(title)}</span>
  </a>`;
}

export function statusPill(state) {
  if (state?.gold) return '<span class="pill pill-gold">★ Guldflagga</span>';
  if (state?.flag) return '<span class="pill pill-flag">Flagga tagen</span>';
  if (state?.cooks) return '<span class="pill">Lagad</span>';
  return '';
}

export function cookForm({ country, today, next, compact = false, idPrefix = 'd' }) {
  return `<form class="cook-form${compact ? ' compact' : ''}" method="post" action="/laga">
    <input type="hidden" name="land" value="${esc(country.code)}">
    <input type="hidden" name="next" value="${esc(next)}">
    <label class="${compact ? 'sr' : ''}" for="${idPrefix}-${esc(country.code)}">Lagad den</label>
    <input id="${idPrefix}-${esc(country.code)}" type="date" name="datum" value="${today}" min="${addDays(today, -MAX_DAYS_BACK)}" max="${today}" required>
    <button type="submit" class="btn">Jag har lagat den!</button>
  </form>`;
}

export const recipeUrl = (c) => `https://www.google.com/search?q=${encodeURIComponent(`${c.dish} recept`)}`;

export function countryCard({ country, date, state, user, today, next }) {
  const isToday = date === today;
  return `<article class="card${isToday ? ' card-today' : ''}">
    <a class="card-flag" href="/land/${esc(country.code)}">${flagImg(country.code, country.name, 'flag flag-lg')}</a>
    <div class="card-body">
      <p class="eyebrow">${isToday ? '<strong>Idag!</strong> · ' : ''}${esc(weekday(date))} ${esc(dayMonth(date))} · ${esc(country.occasion)}</p>
      <h3><a href="/land/${esc(country.code)}">${esc(country.name)}</a> ${statusPill(state)}</h3>
      <p class="dish"><span class="dish-name">${esc(country.dish)}</span> — ${esc(country.description)}</p>
      <div class="card-actions">
        ${user ? cookForm({ country, today, next, compact: true }) : '<a class="btn btn-ghost" href="/registrera">Skapa konto för att samla flaggor</a>'}
        <a class="link" href="${esc(recipeUrl(country))}" target="_blank" rel="noopener">Hitta recept ↗</a>
      </div>
    </div>
  </article>`;
}

const gen = (name = '') => (/[sxz]$/i.test(name) ? name : `${name}s`);

const MESSAGES = {
  gold: (c) => `★ Guldflagga! Du lagade ${c.dish} på ${gen(c.name)} nationaldag.`,
  flag: (c) => `Flagga tagen! ${c.dish} lagad samma vecka som ${gen(c.name)} nationaldag.`,
  dish: (c) => `${c.dish} är registrerad. Laga den under nationaldagsveckan för att få ${gen(c.name)} flagga.`,
  dup: (c) => `Du har redan registrerat ${c.name} det datumet.`,
  removed: () => 'Lagningen är borttagen.',
  welcome: () => 'Välkommen! Kolla vilka länder som firar nationaldag den här veckan.',
};

export function layout({ title, user, body, active, notice, error, continentWon, scripts = [] }) {
  const nav = [
    ['/', 'Veckan', 'week'],
    ['/lander', 'Alla länder', 'countries'],
    ...(user ? [[`/kock/${user.username}`, 'Min samling', 'collection']] : []),
    ['/topplista', 'Topplista', 'leaderboard'],
  ];
  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ? `${title} · Världens Mat` : 'Världens Mat')}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🍲</text></svg>">
<link rel="stylesheet" href="/static/style.css">
</head>
<body>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="logo" href="/"><span class="logo-mark">◉</span> Världens Mat</a>
    <nav class="nav">${nav.map(([href, label, id]) => `<a href="${esc(href)}"${active === id ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
    <div class="account">
      ${user
        ? `<span class="who">${esc(user.display_name)}</span><form method="post" action="/logga-ut"><button class="link">Logga ut</button></form>`
        : '<a href="/logga-in">Logga in</a><a class="btn btn-sm" href="/registrera">Skapa konto</a>'}
    </div>
  </div>
</header>
<main class="wrap">
${continentWon ? `<div class="notice notice-gold">🏆 Grattis! Du har samlat alla flaggor i ${esc(continentWon)} och fått kontinentbadgen!</div>` : ''}
${notice ? `<div class="notice">${esc(notice)}</div>` : ''}
${error ? `<div class="notice notice-error">${esc(error)}</div>` : ''}
${body}
</main>
<footer class="site-footer wrap">
  <p>Laga ett lands nationalrätt samma vecka (mån–sön) som landets nationaldag och få dess flagga. Lagar du den <em>på</em> nationaldagen blir flaggan guldkantad. Samla alla flaggor i en kontinent för kontinentbadgen.</p>
  <p class="muted">Flaggor: <a href="https://github.com/lipis/flag-icons">flag-icons</a> (MIT).</p>
</footer>
${scripts.map((src) => `<script src="${esc(src)}" defer></script>`).join('')}
</body>
</html>`;
}

export function noticeFor(query, country) {
  const fn = MESSAGES[query.get('ok')];
  return fn ? fn(country || {}) : null;
}

// ── Sidor ────────────────────────────────────────────────────────

export function weekPage({ user, today, monday, entries, upcoming, collection, next }) {
  const { year, week } = isoWeek(monday);
  const isThisWeek = mondayOf(today) === monday;
  const stateOf = (code) => collection?.byCountry.get(code);
  return `
<section class="hero">
  <p class="eyebrow">${isThisWeek ? 'Den här veckan' : `År ${year}`}</p>
  <h1>Vecka ${week} <span class="hero-dates">${esc(weekRange(monday))}</span></h1>
  <p class="lead">${entries.length
    ? `${entries.length === 1 ? 'Ett land firar' : `${entries.length} länder firar`} nationaldag. Laga deras nationalrätt före söndag så får du flaggan${isThisWeek ? '' : ' – men bara under rätt vecka'}.`
    : 'Inga nationaldagar den här veckan. Passa på att planera inför nästa!'}</p>
  <nav class="week-nav">
    <a href="/?vecka=${addDays(monday, -7)}">← Förra veckan</a>
    ${isThisWeek ? '' : '<a href="/">Denna vecka</a>'}
    <a href="/?vecka=${addDays(monday, 7)}">Nästa vecka →</a>
  </nav>
</section>

${worldMap({ entries, collection })}

<section class="cards">
  ${entries.map(({ country, date }) => countryCard({ country, date, state: stateOf(country.code), user, today, next })).join('')}
</section>

${upcoming.length ? `
<section class="upcoming">
  <h2>Kommande veckor</h2>
  ${upcoming.map((w) => `
    <div class="upcoming-week">
      <h3><a href="/?vecka=${w.monday}">Vecka ${isoWeek(w.monday).week}</a> <span class="muted">${esc(weekRange(w.monday))}</span></h3>
      ${w.entries.length ? `<ul class="mini-list">${w.entries.map(({ country, date }) => `
        <li><a href="/land/${esc(country.code)}">${flagImg(country.code, '', 'flag flag-sm')} <span>${esc(country.name)}</span></a>
        <span class="muted">${esc(dayMonth(date))} · ${esc(country.dish)}</span></li>`).join('')}</ul>` : '<p class="muted">Inga nationaldagar.</p>'}
    </div>`).join('')}
</section>` : ''}`;
}

export function countriesPage({ continent, q, rows, collection }) {
  const stateOf = (code) => collection?.byCountry.get(code);
  return `
<section class="page-head">
  <h1>Alla länder</h1>
  <p class="lead">193 länder, sorterade efter nästa nationaldag.</p>
  <form class="filters" method="get" action="/lander">
    <input type="search" name="q" value="${esc(q)}" placeholder="Sök land eller rätt…" aria-label="Sök">
    <select name="kontinent" aria-label="Kontinent">
      <option value="">Alla kontinenter</option>
      ${CONTINENTS.map((c) => `<option value="${c.id}"${continent === c.id ? ' selected' : ''}>${c.name}</option>`).join('')}
    </select>
    <button class="btn btn-sm">Filtrera</button>
  </form>
</section>
<p class="muted">${rows.length} länder</p>
<div class="table">
  ${rows.map(({ country, next, daysLeft }) => `
  <a class="row" href="/land/${esc(country.code)}">
    ${flagImg(country.code, '', 'flag flag-sm')}
    <span class="row-name">${esc(country.name)} ${statusPill(stateOf(country.code))}</span>
    <span class="row-dish">${esc(country.dish)}</span>
    <span class="row-date">${esc(dayMonth(next))}<span class="muted"> · ${daysLeft === 0 ? 'idag' : `om ${daysLeft} d`}</span></span>
  </a>`).join('')}
</div>`;
}

export function countryPage({ country, user, today, next, daysLeft, inWeek, weekDate, state, history, path }) {
  return `
<section class="country-hero">
  ${flagImg(country.code, country.name, 'flag flag-xl')}
  <div>
    <p class="eyebrow"><a href="/lander?kontinent=${country.continent}">${esc(continentName(country.continent))}</a>${country.capital ? ` · Huvudstad: ${esc(country.capital)}` : ''}</p>
    <h1>${esc(country.name)} ${statusPill(state)}</h1>
    <p class="lead">${esc(country.occasion)} · ${esc(dayMonth(next))}${daysLeft === 0 ? ' – <strong>idag!</strong>' : ` (om ${daysLeft} dagar)`}</p>
    ${country.note ? `<p class="muted">${esc(country.note)}</p>` : ''}
  </div>
</section>

<section class="dish-box">
  <p class="eyebrow">Nationalrätt</p>
  <h2>${esc(country.dish)}</h2>
  <p>${esc(country.description)}</p>
  <p><a class="link" href="${esc(recipeUrl(country))}" target="_blank" rel="noopener">Hitta recept ↗</a></p>
  ${country.culture ? `<p class="eyebrow">Matkultur i ${esc(country.name)}</p><p>${esc(country.culture)}</p>` : ''}
  <div class="status-line">
    ${inWeek
      ? `<p><strong>Nationaldagsvecka nu!</strong> Laga ${esc(country.dish)} senast söndag för flaggan${weekDate === today ? ' – och idag ger guldkant' : ` – på ${esc(dayMonth(weekDate))} blir den guldkantad`}.</p>`
      : `<p class="muted">Flaggan kan tas veckan för ${esc(dayMonth(next))}. Du kan ändå registrera rätten när som helst.</p>`}
  </div>
  ${user ? cookForm({ country, today, next: path }) : '<p><a class="btn" href="/registrera">Skapa konto för att samla flaggor</a></p>'}
</section>

${user && history.length ? `
<section>
  <h2>Dina lagningar</h2>
  <ul class="history">
    ${history.map((h) => `<li>
      <span>${esc(weekday(h.cooked_on))} ${esc(dayMonth(h.cooked_on))} ${h.cooked_on.slice(0, 4)}</span>
      ${h.gold ? '<span class="pill pill-gold">★ Guld</span>' : h.flag ? '<span class="pill pill-flag">Flagga</span>' : '<span class="pill">Utanför veckan</span>'}
      <form method="post" action="/ta-bort"><input type="hidden" name="id" value="${h.id}"><input type="hidden" name="next" value="${esc(path)}"><button class="link link-danger">Ta bort</button></form>
    </li>`).join('')}
  </ul>
</section>` : ''}`;
}

export function collectionPage({ owner, isMe, collection }) {
  const t = collection.totals;
  return `
<section class="page-head">
  <p class="eyebrow">${isMe ? 'Min samling' : 'Kock'}</p>
  <h1>${esc(owner.display_name)}</h1>
  <div class="stats">
    <div><strong>${t.flags}</strong><span>flaggor av 193</span></div>
    <div><strong>${t.golds}</strong><span>guldflaggor</span></div>
    <div><strong>${t.continentBadges}</strong><span>kontinentbadges</span></div>
    <div><strong>${t.dishes}</strong><span>lagade rätter</span></div>
  </div>
</section>

<section>
  <h2>Kontinentbadges</h2>
  <div class="continents">
    ${collection.continents.map((c) => {
      const pct = Math.round((c.flags / c.total) * 100);
      return `<div class="continent ${c.complete ? 'complete' : ''} ${c.goldComplete ? 'gold' : ''}" style="--pct:${pct}">
        <div class="continent-ring"><span>${c.complete ? (c.goldComplete ? '★' : '✓') : `${pct}%`}</span></div>
        <strong>${esc(c.name)}</strong>
        <span class="muted">${c.flags}/${c.total} flaggor${c.golds ? ` · ${c.golds} guld` : ''}</span>
      </div>`;
    }).join('')}
  </div>
</section>

${CONTINENTS.map((cont) => `
<section class="flag-section">
  <h2>${esc(cont.name)}</h2>
  <div class="badge-grid">
    ${COUNTRIES.filter((c) => c.continent === cont.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
      .map((c) => badge(c, collection.byCountry.get(c.code))).join('')}
  </div>
</section>`).join('')}`;
}

export function leaderboardPage({ rows, user }) {
  return `
<section class="page-head">
  <h1>Topplista</h1>
  <p class="lead">Flest flaggor vinner. Vid lika avgör guldflaggorna.</p>
</section>
${rows.length ? `<ol class="leaderboard">
  ${rows.map((r, i) => `<li class="${user?.id === r.user.id ? 'me' : ''}">
    <span class="rank">${i + 1}</span>
    <a href="/kock/${esc(r.user.username)}">${esc(r.user.display_name)}</a>
    <span class="lb-stats"><span title="Flaggor">⚑ ${r.totals.flags}</span><span title="Guldflaggor" class="gold-text">★ ${r.totals.golds}</span><span title="Kontinentbadges">🏆 ${r.totals.continentBadges}</span></span>
  </li>`).join('')}
</ol>` : '<p class="muted">Ingen har registrerat sig än.</p>'}`;
}

export function authPage({ mode, values = {}, next = '/' }) {
  const signup = mode === 'signup';
  return `
<section class="auth">
  <h1>${signup ? 'Skapa konto' : 'Logga in'}</h1>
  <form method="post" action="${signup ? '/registrera' : '/logga-in'}" class="stack">
    <input type="hidden" name="next" value="${esc(next)}">
    <label>Användarnamn
      <input name="username" value="${esc(values.username)}" autocomplete="username" required autofocus>
    </label>
    ${signup ? `<label>Visningsnamn
      <input name="displayName" value="${esc(values.displayName)}" maxlength="40" required>
    </label>` : ''}
    <label>Lösenord
      <input type="password" name="password" autocomplete="${signup ? 'new-password' : 'current-password'}" ${signup ? 'minlength="8"' : ''} required>
    </label>
    <button class="btn">${signup ? 'Skapa konto' : 'Logga in'}</button>
  </form>
  <p class="muted">${signup ? 'Har du redan ett konto? <a href="/logga-in">Logga in</a>' : 'Ny här? <a href="/registrera">Skapa konto</a>'}</p>
</section>`;
}

export function notFoundPage() {
  return '<section class="page-head"><h1>Sidan finns inte</h1><p><a href="/">Till veckans länder</a></p></section>';
}

// ── Världskarta ──────────────────────────────────────────────────

const NAME_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c.name]));

/**
 * Inline-SVG av världen. Veckans länder lyser, tagna flaggor färgas.
 * Varje land är en länk till landsidan; map.js öppnar istället en infopanel.
 */
export function worldMap({ entries, collection }) {
  const active = new Set(entries.map((e) => e.country.code));
  const stateOf = (code) => collection?.byCountry.get(code);
  const classFor = (code) => {
    const st = stateOf(code);
    return ['c', active.has(code) ? 'active' : '', st?.gold ? 'gold' : st?.flag ? 'earned' : ''].filter(Boolean).join(' ');
  };
  // Aktiva länder ritas sist så att deras kant hamnar överst.
  const codes = Object.keys(SHAPES).sort((a, b) => active.has(a) - active.has(b));
  const shapes = codes.map((code) => {
    const name = NAME_BY_CODE.get(code);
    return `<a href="/land/${code}" class="${classFor(code)}" data-code="${code}" aria-label="${esc(name)}"><title>${esc(name)}</title><path d="${SHAPES[code]}"/></a>`;
  }).join('');
  const markers = Object.entries(MARKERS)
    .filter(([code]) => active.has(code) || stateOf(code)?.flag)
    .map(([code, [x, y]]) => `<a href="/land/${code}" class="${classFor(code)} dot" data-code="${code}" aria-label="${esc(NAME_BY_CODE.get(code))}">
      <title>${esc(NAME_BY_CODE.get(code))}</title>
      ${active.has(code) ? `<circle class="halo" cx="${x}" cy="${y}" r="12"/>` : ''}<circle cx="${x}" cy="${y}" r="${active.has(code) ? 5.5 : 4}"/></a>`)
    .join('');

  return `<section class="map-card" aria-label="Världskarta">
  <div class="map-scroll" id="map-scroll">
    <svg class="world" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" role="img" aria-label="Världskarta där veckans nationaldagsländer är markerade">
      <path class="land-bg" d="${BACKGROUND}"/>
      ${shapes}
      ${markers}
    </svg>
  </div>
  <ul class="map-legend">
    <li><span class="sw sw-active"></span>Nationaldag denna vecka</li>
    ${collection ? '<li><span class="sw sw-earned"></span>Din flagga</li><li><span class="sw sw-gold"></span>Guldflagga</li>' : ''}
    <li class="muted">Tryck på ett land för info</li>
  </ul>
  <aside class="map-panel" id="map-panel" hidden></aside>
</section>`;
}

/** Innehållet i infopanelen (hämtas av map.js). */
export function countryPanel({ country, user, today, next, nextDay, daysLeft, inWeek, weekDate, state }) {
  let when;
  if (inWeek && weekDate === today) when = `<strong>Nationaldag idag!</strong> Laga ${esc(country.dish)} idag för guldflagga.`;
  else if (inWeek && weekDate > today) when = `<strong>Nationaldag ${esc(weekday(weekDate))} ${esc(dayMonth(weekDate))}.</strong> Laga rätten denna vecka för flaggan – på dagen för guld.`;
  else if (inWeek) when = `<strong>Nationaldagen var ${esc(dayMonth(weekDate))}.</strong> Hinner du laga rätten före söndag får du ändå flaggan.`;
  else when = `${esc(country.occasion)} ${esc(dayMonth(nextDay))} – om ${daysLeft} dagar.`;

  return `<button type="button" class="panel-close" aria-label="Stäng">×</button>
<div class="panel-head">
  ${flagImg(country.code, country.name, 'flag flag-md')}
  <div>
    <p class="eyebrow">${esc(continentName(country.continent))}${country.capital ? ` · ${esc(country.capital)}` : ''}</p>
    <h3>${esc(country.name)} ${statusPill(state)}</h3>
  </div>
</div>
<p class="panel-when${inWeek ? ' is-active' : ''}">${when}</p>
<div class="panel-block">
  <p class="eyebrow">Nationalrätt</p>
  <p class="panel-dish">${esc(country.dish)}</p>
  <p>${esc(country.description)}</p>
</div>
${country.culture ? `<div class="panel-block"><p class="eyebrow">Matkultur</p><p>${esc(country.culture)}</p></div>` : ''}
${inWeek ? (user ? cookForm({ country, today, next, idPrefix: 'p' }) : '<p><a class="btn" href="/registrera">Skapa konto för att ta flaggan</a></p>') : ''}
<p class="panel-links"><a href="/land/${esc(country.code)}">Mer om ${esc(country.name)} →</a><a class="link" href="${esc(recipeUrl(country))}" target="_blank" rel="noopener">Hitta recept ↗</a></p>`;
}
