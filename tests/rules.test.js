import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRY_BY_CODE } from '../data/countries.js';
import {
  mondayOf, isoWeek, nationalDayIn, evaluateCook, countriesInWeek,
  validateCookDate, buildCollection, nextNationalDay,
} from '../lib/rules.js';
import { COUNTRIES } from '../data/countries.js';

const es = COUNTRY_BY_CODE.get('es'); // 12 oktober
const ht = COUNTRY_BY_CODE.get('ht'); // 1 januari
const gb = COUNTRY_BY_CODE.get('gb'); // andra lördagen i juni

test('kalenderveckan börjar på måndag', () => {
  assert.equal(mondayOf('2026-10-12'), '2026-10-12'); // måndag
  assert.equal(mondayOf('2026-10-18'), '2026-10-12'); // söndag
  assert.equal(mondayOf('2026-10-19'), '2026-10-19');
  assert.deepEqual(isoWeek('2026-10-12'), { year: 2026, week: 42 });
  assert.deepEqual(isoWeek('2027-01-01'), { year: 2026, week: 53 });
});

test('flagga samma vecka, guld på själva dagen', () => {
  assert.deepEqual(evaluateCook(es, '2026-10-12'), { flag: true, gold: true, nationalDay: '2026-10-12' });
  assert.deepEqual(evaluateCook(es, '2026-10-18'), { flag: true, gold: false, nationalDay: '2026-10-12' });
  assert.equal(evaluateCook(es, '2026-10-11').flag, false); // söndagen veckan innan
  assert.equal(evaluateCook(es, '2026-10-19').flag, false); // måndagen veckan efter
});

test('veckor som går över nyår', () => {
  // 1 jan 2027 är en fredag → veckan börjar måndag 28 dec 2026
  assert.deepEqual(evaluateCook(ht, '2026-12-28'), { flag: true, gold: false, nationalDay: '2027-01-01' });
  assert.equal(evaluateCook(ht, '2027-01-01').gold, true);
  assert.equal(evaluateCook(ht, '2027-01-04').flag, false);
});

test('rörlig nationaldag (n:te veckodagen)', () => {
  assert.equal(nationalDayIn(gb, 2026), '2026-06-13');
  assert.equal(nationalDayIn(gb, 2027), '2027-06-12');
  assert.equal(evaluateCook(gb, '2026-06-13').gold, true);
});

test('veckans länder', () => {
  const codes = countriesInWeek('2026-10-14').map((x) => x.country.code);
  assert.ok(codes.includes('es'));
  assert.ok(codes.includes('gq'));
  assert.ok(!codes.includes('fj')); // 10 okt ligger veckan innan
});

test('alla länder har en giltig nationaldag', () => {
  for (const c of COUNTRIES) {
    for (const year of [2026, 2027, 2028]) {
      assert.match(nationalDayIn(c, year), /^\d{4}-\d{2}-\d{2}$/, c.code);
    }
    assert.ok(nextNationalDay(c, '2026-10-12') >= '2026-10-12', c.code);
  }
});

test('datumkontroll', () => {
  assert.equal(validateCookDate('2026-10-12', '2026-10-12'), null);
  assert.equal(validateCookDate('2026-10-06', '2026-10-12'), null);
  assert.ok(validateCookDate('2026-10-05', '2026-10-12'));
  assert.ok(validateCookDate('2026-10-13', '2026-10-12'));
  assert.ok(validateCookDate('2026-02-30', '2026-10-12'));
});

test('samling och kontinentbadge', () => {
  const sa = COUNTRIES.filter((c) => c.continent === 'sydamerika');
  const cooks = sa.map((c) => ({ country_code: c.code, cooked_on: nationalDayIn(c, 2026) }));
  cooks.push({ country_code: 'es', cooked_on: '2026-10-01' }); // utanför veckan: ingen flagga
  const col = buildCollection(cooks);
  const southAmerica = col.continents.find((c) => c.id === 'sydamerika');
  assert.equal(southAmerica.complete, true);
  assert.equal(southAmerica.goldComplete, true);
  assert.equal(col.continents.find((c) => c.id === 'europa').complete, false);
  assert.equal(col.byCountry.get('es').flag, false);
  assert.equal(col.totals.flags, 12);
  assert.equal(col.totals.dishes, 13);
  assert.equal(col.totals.continentBadges, 1);
});

test('alla länder har karta, huvudstad och matkultur', async () => {
  const { SHAPES } = await import('../data/worldmap.js');
  for (const c of COUNTRIES) {
    assert.ok(SHAPES[c.code], `karta saknas: ${c.code}`);
    assert.ok(c.capital && c.culture, `info saknas: ${c.code}`);
  }
});
