// Spelreglerna, helt fria från databas och webbserver så att de går att testa.
// Alla datum hanteras som strängar "YYYY-MM-DD" och räknas i UTC för att
// slippa sommartidsproblem.

import { COUNTRIES, CONTINENTS, COUNTRY_BY_CODE } from '../data/countries.js';

/** Hur många dagar bakåt man får registrera en lagad rätt (inklusive idag). */
export const MAX_DAYS_BACK = 6;

const DAY_MS = 86_400_000;

export function parseDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || fmt(d) !== s ? null : d;
}

export function fmt(d) {
  return d.toISOString().slice(0, 10);
}

export function addDays(s, n) {
  return fmt(new Date(parseDate(s).getTime() + n * DAY_MS));
}

/** Måndagen i den kalendervecka (mån–sön) som datumet tillhör. */
export function mondayOf(s) {
  const dow = parseDate(s).getUTCDay(); // 0 = söndag
  return addDays(s, -((dow + 6) % 7));
}

/** ISO-veckonummer, t.ex. { year: 2026, week: 42 }. */
export function isoWeek(s) {
  const thursday = addDays(mondayOf(s), 3);
  const year = Number(thursday.slice(0, 4));
  const jan1 = parseDate(`${year}-01-01`);
  const week = Math.floor((parseDate(thursday) - jan1) / DAY_MS / 7) + 1;
  return { year, week };
}

/** Dagens datum i given tidszon, som "YYYY-MM-DD". */
export function todayIn(timeZone) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

/** Datum för landets nationaldag ett visst år. */
export function nationalDayIn(country, year) {
  const { day } = country;
  if (typeof day === 'string') {
    const s = `${year}-${day}`;
    // 29 februari ett icke-skottår → 28 februari
    return parseDate(s) ? s : `${year}-${day.slice(0, 2)}-28`;
  }
  // Regel: n:te veckodagen i månaden
  const first = `${year}-${String(day.month).padStart(2, '0')}-01`;
  const offset = (day.weekday - parseDate(first).getUTCDay() + 7) % 7;
  return addDays(first, offset + (day.nth - 1) * 7);
}

/** Nationaldagar kring ett datum (året innan, samma år, året efter). */
function occurrencesAround(country, s) {
  const y = Number(s.slice(0, 4));
  return [y - 1, y, y + 1].map((year) => nationalDayIn(country, year));
}

/**
 * Bedömer en lagad rätt.
 *  flag: lagad samma kalendervecka (mån–sön) som nationaldagen
 *  gold: lagad exakt på nationaldagen
 */
export function evaluateCook(country, cookedOn) {
  const week = mondayOf(cookedOn);
  for (const nd of occurrencesAround(country, cookedOn)) {
    if (mondayOf(nd) === week) {
      return { flag: true, gold: nd === cookedOn, nationalDay: nd };
    }
  }
  return { flag: false, gold: false, nationalDay: null };
}

/** Länder vars nationaldag infaller i samma kalendervecka som datumet. */
export function countriesInWeek(s) {
  const monday = mondayOf(s);
  const result = [];
  for (const country of COUNTRIES) {
    for (const nd of occurrencesAround(country, s)) {
      if (mondayOf(nd) === monday) result.push({ country, date: nd });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.country.name.localeCompare(b.country.name, 'sv'));
}

/** Nästa nationaldag för ett land, räknat från och med ett datum. */
export function nextNationalDay(country, from) {
  return occurrencesAround(country, from).find((nd) => nd >= from);
}

/** Kontroll av datumet man anger när man bockar av en rätt. */
export function validateCookDate(cookedOn, today) {
  if (!parseDate(cookedOn)) return 'Ogiltigt datum.';
  if (cookedOn > today) return 'Du kan inte registrera en rätt i framtiden.';
  if (cookedOn < addDays(today, -MAX_DAYS_BACK)) {
    return `Du kan bara registrera rätter från de senaste ${MAX_DAYS_BACK + 1} dagarna.`;
  }
  return null;
}

/**
 * Bygger en användares samling utifrån alla registrerade lagningar.
 * cooks: [{ country_code, cooked_on }]
 */
export function buildCollection(cooks) {
  const byCountry = new Map();
  for (const cook of cooks) {
    const country = COUNTRY_BY_CODE.get(cook.country_code);
    if (!country) continue;
    const res = evaluateCook(country, cook.cooked_on);
    const entry = byCountry.get(country.code) || { cooks: 0, flag: false, gold: false, earnedOn: null };
    entry.cooks += 1;
    if (res.flag) {
      entry.flag = true;
      if (!entry.earnedOn || cook.cooked_on < entry.earnedOn) entry.earnedOn = cook.cooked_on;
    }
    if (res.gold) entry.gold = true;
    byCountry.set(country.code, entry);
  }

  const continents = CONTINENTS.map((cont) => {
    const members = COUNTRIES.filter((c) => c.continent === cont.id);
    const flags = members.filter((c) => byCountry.get(c.code)?.flag).length;
    const golds = members.filter((c) => byCountry.get(c.code)?.gold).length;
    return {
      ...cont,
      total: members.length,
      flags,
      golds,
      complete: flags === members.length,
      goldComplete: golds === members.length,
    };
  });

  const flags = [...byCountry.values()].filter((e) => e.flag).length;
  const golds = [...byCountry.values()].filter((e) => e.gold).length;
  const dishes = [...byCountry.values()].reduce((sum, e) => sum + e.cooks, 0);

  return {
    byCountry,
    continents,
    totals: {
      flags,
      golds,
      dishes,
      countriesCooked: byCountry.size,
      continentBadges: continents.filter((c) => c.complete).length,
    },
  };
}
