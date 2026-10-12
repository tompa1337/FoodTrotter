# Världens Mat

Laga världens nationalrätter och samla flaggor.

- **Flagga:** laga ett lands nationalrätt samma kalendervecka (måndag–söndag) som landets nationaldag.
- **Guldkant:** laga den *på* nationaldagen.
- **Kontinentbadge:** samla alla flaggor i en kontinent. Är alla flaggor guld blir badgen guld.
- **Världskarta på startsidan:** veckans nationaldagsländer lyser, dina flaggor färgas gröna/guld. Tryck på ett land för huvudstad, nationalrätt och matkultur – och lagningsknappen om landet firar den veckan. Kartan kan zoomas (knappar, Ctrl + scroll, dubbelklick, nypning på mobil) och dras.
- Konton, egen samling (`/kock/<användarnamn>`) med alla tagna flaggor på en världskarta, och topplista.

## Kom igång

Kräver bara **Node.js 22.5 eller senare** – inga paket att installera.

```bash
npm start          # http://localhost:3000
npm run dev        # startar om vid ändringar
npm test           # testar spelreglerna
```

## Inställningar (miljövariabler)

| Variabel | Standard | Beskrivning |
|---|---|---|
| `PORT` | `3000` | Port |
| `DB_FILE` | `var/varldens-mat.db` | SQLite-fil |
| `APP_TIMEZONE` | `Europe/Stockholm` | Avgör vilket datum som är "idag" |
| `COOKIE_SECURE` | – | Sätt till `1` när sajten körs över HTTPS |

## Drift

Appen är en enda Node-process med en SQLite-fil, så den passar t.ex. Fly.io, Railway, Render eller en egen VPS. Det viktiga är att `DB_FILE` ligger på en **beständig disk/volym**. Serverless-plattformar som Vercel passar inte, eftersom filsystemet där inte sparas. Se `Dockerfile`.

## Struktur

```
server.js            webbserver och routes
data/countries.js    alla 193 FN-länder: nationaldag, nationalrätt, kontinent
data/details.js      huvudstad och matkultur per land
data/worldmap.js     kartans former (genererad av tools/build_map.py)
lib/rules.js         spelreglerna (veckor, flaggor, guld, kontinenter)
lib/db.js            databas (node:sqlite)
lib/auth.js          konton, lösenord (scrypt) och sessioner
lib/views.js         HTML-sidor
public/              CSS, kartans JavaScript och flaggor
tools/build_map.py   bygger om kartan från Natural Earth
tests/               tester för reglerna
```

## Regler i detalj

- Man kan registrera rätter lagade **idag eller upp till 6 dagar bakåt** (inte i framtiden), så att det inte går att efterregistrera guld.
- Samma land kan lagas flera gånger; flaggan och guldkanten behålls när de väl är tagna.
- Rätter lagade utanför nationaldagsveckan räknas som lagade rätter men ger ingen flagga.
- Veckor över nyår hanteras: lagar du Haitis soppa måndag 28 dec får du flaggan för nationaldagen 1 jan.

## Om landsdatan

- 193 FN-medlemsländer. Gränsländer: Ryssland och Cypern → Europa; Turkiet, Georgien, Armenien, Azerbajdzjan och Kazakstan → Asien; Centralamerika och Karibien → Nordamerika.
- Många länder saknar officiell nationalrätt; då är det den rätt som oftast nämns. Granska och justera fritt i `data/countries.js`.
- Storbritannien har ingen officiell nationaldag; appen använder kungens officiella födelsedag (andra lördagen i juni). Israels självständighetsdag följer den hebreiska kalendern och är satt till 14 maj.

Karta: [Natural Earth](https://www.naturalearthdata.com/) (public domain), Equal Earth-projektion. Små länder visas som prickar när de är aktuella.

Flaggor: [flag-icons](https://github.com/lipis/flag-icons), MIT-licens (se `public/flags/LICENSE`).
