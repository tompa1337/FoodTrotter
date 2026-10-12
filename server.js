// Världens Mat – webbserver utan externa beroenden (Node 22.5+).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COUNTRIES, COUNTRY_BY_CODE, CONTINENTS } from './data/countries.js';
import { openDb, makeRepo } from './lib/db.js';
import { makeAuth, hashPassword, verifyPassword, validateSignup, COOKIE_NAME } from './lib/auth.js';
import {
  todayIn, mondayOf, addDays, parseDate, countriesInWeek, nextNationalDay,
  evaluateCook, validateCookDate, buildCollection,
} from './lib/rules.js';
import * as V from './lib/views.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const config = {
  port: Number(process.env.PORT) || 3000,
  dbFile: process.env.DB_FILE || join(ROOT, 'var', 'varldens-mat.db'),
  timeZone: process.env.APP_TIMEZONE || 'Europe/Stockholm',
  secureCookies: process.env.COOKIE_SECURE === '1',
};

const db = openDb(config.dbFile);
const repo = makeRepo(db);
const auth = makeAuth(repo, config);
repo.purgeSessions();

// ── Hjälpfunktioner ────────────────────────────────────────────

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((p) => p.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, v.join('=')]));
}

async function readForm(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw Object.assign(new Error('För stor förfrågan'), { status: 413 });
  }
  return new URLSearchParams(body);
}

/** Bara interna sökvägar får användas som omdirigering. */
const safeNext = (v) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : '/');

function withParams(path, params) {
  const url = new URL(path, 'http://x');
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return url.pathname + url.search;
}

function send(res, status, html, headers = {}) {
  let body = html;
  if (body.length > 1024 && /\bgzip\b/.test(res.req?.headers['accept-encoding'] || '')) {
    body = gzipSync(body);
    headers = { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' };
  }
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; style-src-attr 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    ...headers,
  });
  res.end(body);
}

const redirect = (res, location, headers = {}) => {
  res.writeHead(303, { Location: location, ...headers });
  res.end();
};

/** Enkelt CSRF-skydd: POST måste komma från samma ursprung. */
function sameOrigin(req) {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return true; // äldre webbläsare; cookien är dessutom SameSite=Lax
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

const collectionFor = (userId) => buildCollection(repo.cooksByUser(userId));

// ── Sidor ──────────────────────────────────────────────────────

const routes = {
  'GET /': ({ url, user, today }) => {
    const requested = url.searchParams.get('vecka');
    const monday = mondayOf(parseDate(requested) ? requested : today);
    const upcoming = [1, 2, 3].map((n) => {
      const m = addDays(monday, n * 7);
      return { monday: m, entries: countriesInWeek(m) };
    });
    const country = COUNTRY_BY_CODE.get(url.searchParams.get('land'));
    return {
      title: null,
      active: 'week',
      scripts: ['/static/map.js'],
      notice: V.noticeFor(url.searchParams, country),
      body: V.weekPage({
        user, today, monday,
        entries: countriesInWeek(monday),
        upcoming,
        collection: user ? collectionFor(user.id) : null,
        next: requested ? `/?vecka=${monday}` : '/',
      }),
    };
  },

  'GET /lander': ({ url, user, today }) => {
    const continent = url.searchParams.get('kontinent') || '';
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const rows = COUNTRIES
      .filter((c) => !continent || c.continent === continent)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.dish.toLowerCase().includes(q))
      .map((c) => {
        const next = nextNationalDay(c, today);
        return { country: c, next, daysLeft: Math.round((parseDate(next) - parseDate(today)) / 86_400_000) };
      })
      .sort((a, b) => a.next.localeCompare(b.next) || a.country.name.localeCompare(b.country.name, 'sv'));
    return {
      title: 'Alla länder',
      active: 'countries',
      body: V.countriesPage({ continent, q, rows, collection: user ? collectionFor(user.id) : null }),
    };
  },

  'GET /topplista': ({ user }) => {
    const cooksByUser = new Map();
    for (const c of repo.allCooks()) {
      if (!cooksByUser.has(c.user_id)) cooksByUser.set(c.user_id, []);
      cooksByUser.get(c.user_id).push(c);
    }
    const rows = repo.allUsers()
      .map((u) => ({ user: u, totals: buildCollection(cooksByUser.get(u.id) || []).totals }))
      .sort((a, b) => b.totals.flags - a.totals.flags || b.totals.golds - a.totals.golds || b.totals.dishes - a.totals.dishes)
      .slice(0, 100);
    return { title: 'Topplista', active: 'leaderboard', body: V.leaderboardPage({ rows, user }) };
  },

  'GET /registrera': ({ url, user }) => (user ? { redirect: '/' } : { title: 'Skapa konto', body: V.authPage({ mode: 'signup', next: safeNext(url.searchParams.get('next')) }) }),
  'GET /logga-in': ({ url, user }) => (user ? { redirect: '/' } : { title: 'Logga in', body: V.authPage({ mode: 'login', next: safeNext(url.searchParams.get('next')) }) }),

  'POST /registrera': ({ form }) => {
    const values = { username: (form.get('username') || '').trim(), displayName: (form.get('displayName') || '').trim() };
    const password = form.get('password') || '';
    const error = validateSignup({ ...values, password }) || (repo.userByName(values.username) ? 'Användarnamnet är upptaget.' : null);
    if (error) return { status: 400, title: 'Skapa konto', error, body: V.authPage({ mode: 'signup', values }) };
    const id = repo.createUser(values.username, values.displayName, hashPassword(password));
    return { redirect: '/?ok=welcome', cookie: auth.startSession(id) };
  },

  'POST /logga-in': ({ form }) => {
    const username = (form.get('username') || '').trim();
    const row = repo.userByName(username);
    if (!row || !verifyPassword(form.get('password') || '', row.password_hash)) {
      return { status: 401, title: 'Logga in', error: 'Fel användarnamn eller lösenord.', body: V.authPage({ mode: 'login', values: { username } }) };
    }
    return { redirect: safeNext(form.get('next')), cookie: auth.startSession(row.id) };
  },

  'POST /logga-ut': ({ cookies }) => ({ redirect: '/', cookie: auth.endSession(cookies[COOKIE_NAME]) }),

  'POST /laga': ({ form, user, today }) => {
    const next = safeNext(form.get('next'));
    if (!user) return { redirect: `/logga-in?next=${encodeURIComponent(next)}` };
    const country = COUNTRY_BY_CODE.get(form.get('land'));
    if (!country) return { status: 400, body: V.notFoundPage() };
    const date = form.get('datum') || today;
    const dateError = validateCookDate(date, today);
    if (dateError) return { redirect: withParams(`/land/${country.code}`, { fel: dateError }) };

    const before = collectionFor(user.id);
    const added = repo.addCook(user.id, country.code, date);
    if (!added) return { redirect: withParams(next, { ok: 'dup', land: country.code }) };

    const res = evaluateCook(country, date);
    const after = collectionFor(user.id);
    const won = after.continents.find((c) => c.complete && !before.continents.find((b) => b.id === c.id).complete);
    return { redirect: withParams(next, { ok: res.gold ? 'gold' : res.flag ? 'flag' : 'dish', land: country.code, vann: won?.id }) };
  },

  'POST /ta-bort': ({ form, user }) => {
    if (!user) return { redirect: '/logga-in' };
    repo.deleteCook(Number(form.get('id')), user.id);
    return { redirect: withParams(safeNext(form.get('next')), { ok: 'removed' }) };
  },
};

// Sidor med parametrar i sökvägen
function dynamicRoute(method, path, ctx) {
  let m;
  if (method === 'GET' && (m = path.match(/^\/land\/([a-z]{2})$/))) {
    const country = COUNTRY_BY_CODE.get(m[1]);
    if (!country) return null;
    const { user, today, url } = ctx;
    const next = nextNationalDay(country, today);
    const inWeek = evaluateCook(country, today);
    const collection = user ? collectionFor(user.id) : null;
    const history = user
      ? repo.cooksByUser(user.id).filter((c) => c.country_code === country.code).map((c) => ({ ...c, ...evaluateCook(country, c.cooked_on) }))
      : [];
    return {
      title: country.name,
      active: 'countries',
      notice: V.noticeFor(url.searchParams, country),
      error: url.searchParams.get('fel'),
      body: V.countryPage({
        country, user, today, next,
        daysLeft: Math.round((parseDate(next) - parseDate(today)) / 86_400_000),
        inWeek: inWeek.flag, weekDate: inWeek.nationalDay,
        state: collection?.byCountry.get(country.code), history, path: url.pathname,
      }),
    };
  }
  if (method === 'GET' && (m = path.match(/^\/land\/([a-z]{2})\/kort$/))) {
    const country = COUNTRY_BY_CODE.get(m[1]);
    if (!country) return null;
    const { user, today, url } = ctx;
    const nextDay = nextNationalDay(country, today);
    const week = evaluateCook(country, today);
    return {
      fragment: V.countryPanel({
        country, user, today, nextDay,
        next: safeNext(url.searchParams.get('next')),
        daysLeft: Math.round((parseDate(nextDay) - parseDate(today)) / 86_400_000),
        inWeek: week.flag, weekDate: week.nationalDay,
        state: user ? collectionFor(user.id).byCountry.get(country.code) : null,
      }),
    };
  }
  if (method === 'GET' && (m = path.match(/^\/kock\/([a-zA-Z0-9_.-]{1,24})$/))) {
    const owner = repo.userByName(m[1]);
    if (!owner) return null;
    return {
      title: owner.display_name,
      active: ctx.user?.id === owner.id ? 'collection' : null,
      body: V.collectionPage({ owner, isMe: ctx.user?.id === owner.id, collection: collectionFor(owner.id) }),
    };
  }
  if (method === 'GET' && path === '/samling') {
    return { redirect: ctx.user ? `/kock/${ctx.user.username}` : '/logga-in?next=/samling' };
  }
  return null;
}

// ── Server ─────────────────────────────────────────────────────

const STATIC = {
  '/static/style.css': ['public/style.css', 'text/css; charset=utf-8'],
  '/static/map.js': ['public/map.js', 'text/javascript; charset=utf-8'],
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const method = req.method;

    const flag = url.pathname.match(/^\/flags\/(4x3|1x1)\/([a-z]{2})\.svg$/);
    if (method === 'GET' && flag && COUNTRY_BY_CODE.has(flag[2])) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=604800, immutable' });
      return res.end(await readFile(join(ROOT, 'public', 'flags', flag[1], `${flag[2]}.svg`)));
    }
    if (method === 'GET' && STATIC[url.pathname]) {
      const [file, type] = STATIC[url.pathname];
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' });
      return res.end(await readFile(join(ROOT, file)));
    }
    if (method === 'GET' && url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }

    if (method === 'POST' && !sameOrigin(req)) return send(res, 403, 'Förbjuden förfrågan.');

    const cookies = parseCookies(req.headers.cookie);
    const user = auth.userFromToken(cookies[COOKIE_NAME]);
    const today = todayIn(config.timeZone);
    const form = method === 'POST' ? await readForm(req) : null;
    const ctx = { url, user, today, form, cookies };

    const handler = routes[`${method} ${url.pathname}`];
    const result = handler ? handler(ctx) : dynamicRoute(method, url.pathname, ctx);

    if (!result) {
      return send(res, 404, V.layout({ title: 'Hittades inte', user, body: V.notFoundPage() }));
    }
    const headers = result.cookie ? { 'Set-Cookie': result.cookie } : {};
    if (result.redirect) return redirect(res, result.redirect, headers);
    if (result.fragment) return send(res, 200, result.fragment, { 'Cache-Control': 'no-store' });

    const wonId = url.searchParams.get('vann');
    const continentWon = url.searchParams.get('ok') && CONTINENTS.find((c) => c.id === wonId)?.name;
    send(res, result.status || 200, V.layout({ ...result, user, continentWon }), headers);
  } catch (err) {
    console.error(err);
    send(res, err.status || 500, 'Något gick fel.');
  }
});

server.listen(config.port, () => {
  console.log(`Världens Mat kör på http://localhost:${config.port}  (tidszon ${config.timeZone}, databas ${config.dbFile})`);
});
