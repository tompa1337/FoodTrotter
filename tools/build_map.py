"""Bygger data/worldmap.js från Natural Earth (public domain).

Användning:
    python3 tools/build_map.py ne_50m_admin_0_countries.geojson

Hämta källfilen från https://github.com/nvkelso/natural-earth-vector (geojson/).
Projektion: Equal Earth. Länder utan FN-kod (t.ex. Somaliland) ritas som
neutral landyta. Små länder får dessutom en klickbar prick.
"""
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WIDTH = 1000
EPSILON = 0.55          # förenkling (Douglas–Peucker) i SVG-enheter
MIN_RING_AREA = 0.6     # mindre öar än så tas bort (om landet har större delar)
SMALL_COUNTRY_AREA = 40 # länder mindre än så får en prick

A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
M = math.sqrt(3) / 2


def equal_earth(lon, lat):
    lam, phi = math.radians(lon), math.radians(lat)
    t = math.asin(M * math.sin(phi))
    t2, t6 = t * t, t ** 6
    x = 2 * math.sqrt(3) * lam * math.cos(t) / (3 * (9 * A4 * t6 * t2 + 7 * A3 * t6 + 3 * A2 * t2 + A1))
    y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
    return x, y


X_MAX = equal_earth(180, 0)[0]
SCALE = WIDTH / (2 * X_MAX)
Y_TOP = equal_earth(0, 84)[1]
Y_BOTTOM = equal_earth(0, -58)[1]
HEIGHT = round((Y_TOP - Y_BOTTOM) * SCALE)


def project(lon, lat):
    x, y = equal_earth(lon, lat)
    return ((x + X_MAX) * SCALE, (Y_TOP - y) * SCALE)


def dp(points, eps):
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-9
    idx, dmax = 0, 0.0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm if (dx or dy) else math.hypot(px - x1, py - y1)
        if d > dmax:
            idx, dmax = i, d
    if dmax > eps:
        return dp(points[: idx + 1], eps)[:-1] + dp(points[idx:], eps)
    return [points[0], points[-1]]


def area(ring):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]))) / 2


def rings_of(geom):
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    for poly in polys:
        for ring in poly:
            if all(lat >= -58 for _, lat in ring):
                yield [project(lon, lat) for lon, lat in ring]


def path_for(rings):
    out = []
    for ring in rings:
        pts = dp(ring, EPSILON)
        if len(pts) < 4:
            pts = ring[:: max(1, len(ring) // 4)]
        coords = [f'{x:.1f},{y:.1f}' for x, y in pts]
        dedup = [c for i, c in enumerate(coords) if i == 0 or c != coords[i - 1]]
        if len(dedup) >= 3:
            out.append('M' + 'L'.join(dedup) + 'Z')
    return ''.join(out)


def main(src):
    codes = set(re.findall(r"\['([a-z]{2})',", (ROOT / 'data' / 'countries.js').read_text()))
    data = json.loads(Path(src).read_text())
    countries, other = {}, []
    for f in data['features']:
        p = f['properties']
        code = (p.get('ISO_A2_EH') or p.get('ISO_A2') or '').lower()
        rings = list(rings_of(f['geometry']))
        if not rings:
            continue
        if code in codes:
            countries.setdefault(code, []).extend(rings)
        else:
            other.extend(rings)

    shapes, markers = {}, {}
    for code, rings in sorted(countries.items()):
        biggest = max(rings, key=area)
        total = sum(area(r) for r in rings)
        kept = [r for r in rings if area(r) >= MIN_RING_AREA] or [biggest]
        shapes[code] = path_for(kept)
        if total < SMALL_COUNTRY_AREA:
            xs, ys = [x for x, _ in biggest], [y for _, y in biggest]
            markers[code] = [round((min(xs) + max(xs)) / 2, 1), round((min(ys) + max(ys)) / 2, 1)]

    background = path_for([r for r in other if area(r) >= MIN_RING_AREA])
    missing = sorted(codes - shapes.keys())
    if missing:
        sys.exit(f'Saknar former för: {missing}')

    out = ROOT / 'data' / 'worldmap.js'
    out.write_text(
        '// Genererad av tools/build_map.py från Natural Earth (public domain). Ändra inte för hand.\n'
        f'export const MAP_WIDTH = {WIDTH};\n'
        f'export const MAP_HEIGHT = {HEIGHT};\n'
        f'export const BACKGROUND = {json.dumps(background)};\n'
        f'export const MARKERS = {json.dumps(markers)};\n'
        f'export const SHAPES = {json.dumps(shapes, separators=(",", ":"))};\n'
    )
    print(f'{out}: {out.stat().st_size // 1024} kB, {len(shapes)} länder, {len(markers)} prickar, höjd {HEIGHT}')


if __name__ == '__main__':
    main(sys.argv[1])
