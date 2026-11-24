"""Draw the TeeTrip course layouts from OpenStreetMap data (ODbL).
Run: python3 fetch_osm.py && python3 build.py
Writes assets/layouts/<slug>/overview.svg, hole-NN.svg and layout.json.
Par and yards always come from the course's published scorecard on the course page, never from the map."""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from shapely.affinity import affine_transform
from shapely.geometry import box
from shapely.ops import substring

OUT = os.path.join(ROOT, 'assets', 'layouts')
C = dict(rough='#C3D8A6', rough2='#B3CC96', wood='#5F8F63', wood2='#4B7A52', fair='#74B26C', fair2='#82BF79', green='#A5DE86', collar='#86C873', sand='#EBDCAE', lip='#C9B783',
         water='#A8CFE2', water2='#8FBDD4', tee='#5C9D62', path='#EDE7D6', other='#B4D09B', ink='#1B2620', gold='#D2A33A', bldg='#D9D2C0', cream='#F7F4EB')
TOL = 0.08

def chaikin(pts, n=2, closed=True):
    for _ in range(n):
        out = []; m = len(pts); rng = range(m) if closed else range(m - 1)
        if not closed: out.append(pts[0])
        for i in rng:
            a, b = pts[i], pts[(i + 1) % m]
            out.append((a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25)); out.append((a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75))
        if not closed: out.append(pts[-1])
        pts = out
    return pts
def ring_path(coords, smooth=True):
    pts = list(coords)[:-1]
    if len(pts) < 3: return ''
    if smooth and len(pts) < 400: pts = chaikin(pts, 2)
    return 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z'
def poly_path(g, tol=0.5, smooth=True):
    if g is None or g.is_empty: return ''
    g = g.simplify(tol)
    polys = [g] if g.geom_type == 'Polygon' else [p for p in getattr(g, 'geoms', []) if p.geom_type == 'Polygon']
    d = ''
    for p in polys:
        if p.area < 1.5: continue
        d += ring_path(p.exterior.coords, smooth)
        for r in p.interiors: d += ring_path(r.coords, smooth)
    return d
def line_path(g, tol=0.5, smooth=True):
    if g is None or g.is_empty: return ''
    lines = [g] if g.geom_type == 'LineString' else [x for x in getattr(g, 'geoms', []) if x.geom_type == 'LineString']
    d = ''
    for l in lines:
        pts = list(l.simplify(tol).coords)
        if len(pts) < 2: continue
        if smooth and len(pts) > 2: pts = chaikin(pts, 2, closed=False)
        d += 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pts)
    return d
def centroid(g): p = g.centroid; return (p.x, p.y)
def dist(a, b): return math.hypot(a[0] - b[0], a[1] - b[1])

def own_features(c, feats):
    area = course_area(feats, c); x, y = TR.transform(*c['ll']); pin = Point(x, y)
    others = [f['g'] for f in feats if f['k'] == 'course' and not f['g'].buffer(5).contains(area.representative_point()) and f['g'].area > 2e5]
    golf = ('hole', 'fairway', 'green', 'tee', 'bunker', 'driving_range', 'clubhouse', 'cartpath', 'rough')
    own = [f for f in feats if f['k'] in golf and area.buffer(25).intersects(f['g'].representative_point())]
    want = c['h']
    if sum(1 for f in own if f['k'] == 'hole') < want * .8:
        ids = {f['id'] for f in own}
        for f in feats:
            if f['k'] in golf and f['id'] not in ids:
                rp = f['g'].representative_point()
                if rp.distance(pin) < 2300 and not any(o.contains(rp) for o in others): own.append(f)
    hull = unary_union([f['g'].buffer(45) for f in own if f['k'] in ('fairway', 'green', 'tee', 'hole')]) if own else area
    region = unary_union([hull, area]) if area.area < 4e6 and area.area > 1.5e5 and hull.intersection(area).area > .5 * hull.area else hull
    return own, region

def prepare(c):
    feats = read_osm(c['slug']); own, region = own_features(c, feats); sc = scorecard(c['slug'])
    by = lambda k, src=own: [f for f in src if f['k'] == k]
    greens, tees, fairs = by('green'), by('tee'), by('fairway')
    lines = {}
    for f in by('hole'):
        ref = f['t'].get('ref', '')
        if not ref.isdigit(): continue
        n = int(ref); g = f['g']
        if greens:   # make sure the line runs tee to green
            ds = min(x['g'].distance(Point(g.coords[0])) for x in greens); de = min(x['g'].distance(Point(g.coords[-1])) for x in greens)
            if ds < 12 and de > 30: g = LineString(list(g.coords)[::-1])
        lines.setdefault(n, []).append(g)
    holes = {}
    # which tee boxes and fairways belong to which hole
    def start_zone(g):
        a, b = g.coords[0], g.coords[1]; L = dist(a, b) or 1; back = (a[0] - (b[0] - a[0]) / L * 90, a[1] - (b[1] - a[1]) / L * 90)
        return LineString([back] + list(substring(g, 0, min(g.length * .45, 190)).coords))
    cand = {n: gs[0] if len(gs) == 1 else None for n, gs in lines.items()}
    for n, gs in lines.items():
        if len(gs) > 1:
            y = (sc.get(n) or {}).get('yards')
            cand[n] = min(gs, key=lambda g: abs(g.length / YD - y)) if y else max(gs, key=lambda g: g.length)
    zones = {n: start_zone(g) for n, g in cand.items()}
    tee_of = {}
    for t in tees:
        best = min(zones, key=lambda n: zones[n].distance(t['g']), default=None)
        if best is not None and zones[best].distance(t['g']) < 22: tee_of.setdefault(best, []).append(t['g'])
    fair_of = {}
    for f in fairs:
        best, score = None, 0
        for n, g in cand.items():
            s = g.intersection(f['g'].buffer(6)).length
            if s > score: best, score = n, s
        if best is None:
            best = min(cand, key=lambda n: cand[n].distance(f['g']), default=None)
            if best is None or cand[best].distance(f['g']) > 35: continue
        fair_of.setdefault(best, []).append(f['g'])
    for n, g in sorted(cand.items()):
        end = Point(g.coords[-1]); gr = min(greens, key=lambda x: x['g'].distance(end), default=None)
        green = gr['g'] if gr is not None and gr['g'].distance(end) < 45 else None
        card = sc.get(n) or {}; L = g.length
        endc = centroid(green) if green is not None else g.coords[-1]
        def play_len(t):
            if t is None: return LineString(list(g.coords)[:-1] + [endc]).length
            tc = centroid(t); s = g.project(Point(tc))
            mid = [p for p in list(g.coords)[1:-1] if g.project(Point(p)) > s + 25]
            return LineString([tc] + mid + [endc]).length
        opts = [(play_len(t) / YD, t) for t in tee_of.get(n, [])] + [(play_len(None) / YD, None)]
        y = card.get('yards')
        meas, tee = min(opts, key=lambda o: abs(o[0] - y)) if y else max(opts, key=lambda o: o[0])
        flag = ''
        if y and abs(meas / y - 1) > TOL: flag = f'Mapped length {meas:.0f} yards is {abs(meas / y - 1) * 100:.0f}% off the scorecard\'s {y}'
        if green is None: flag = flag or 'No green shape mapped for this hole'
        if not fair_of.get(n) and card.get('par', 4) > 3: flag = flag or 'No fairway shape mapped for this hole'
        holes[n] = dict(n=n, line=g, green=green, tees=tee_of.get(n, []), tee=tee, fairs=fair_of.get(n, []), par=card.get('par'), yards=y, measured=round(meas), flag=flag,
                        osm_par=None)
    return dict(c=c, feats=feats, own=own, region=region, sc=sc, holes=holes)

def play_of(h):
    """Line of play: chosen tee centre, the mapped turning points, green centre."""
    line = h['line']; pts = list(line.coords)
    start = centroid(h['tee']) if h['tee'] is not None else pts[0]
    s0 = line.project(Point(start)) if h['tee'] is not None else 0
    mid = [p for p in pts[1:-1] if line.project(Point(p)) > s0 + 25]
    endp = centroid(h['green']) if h['green'] is not None else pts[-1]
    return LineString([start] + mid + [endp]), start, mid, endp

def describe(h, ctx):
    g, par = h['play'], h['par'] or (3 if h['play'].length / YD < 250 else 4)
    pts = list(g.coords); parts = []
    if par == 3 or len(pts) < 3: parts.append('One shot to the green' if par == 3 else 'A straight hole')
    else:
        a0 = math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]); a1 = math.atan2(pts[-1][0] - pts[-2][0], pts[-1][1] - pts[-2][1])
        turn = math.degrees((a1 - a0 + math.pi) % (2 * math.pi) - math.pi)
        parts.append('Dog-leg right' if turn > 18 else 'Dog-leg left' if turn < -18 else 'Bends gently right' if turn > 8 else 'Bends gently left' if turn < -8 else 'A straight hole')
    water = [f['g'] for f in ctx['feats'] if f['k'] == 'water' and f['g'].distance(g) < 42]
    if water:
        w = unary_union(water)
        if w.intersects(g): parts.append('with water to carry')
        else:
            p = w.representative_point() if w.geom_type == 'Polygon' else max(getattr(w, 'geoms', [w]), key=lambda x: x.area).representative_point(); s = g.project(p); a = g.interpolate(max(0, s - 5)); b = g.interpolate(min(g.length, s + 5))
            cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
            near_green = s > g.length * .75
            parts.append(('with water ' + ('left' if cross > 0 else 'right') + ' of the green') if near_green else ('with water down the ' + ('left' if cross > 0 else 'right')))
    bs = [f['g'] for f in ctx['own'] if f['k'] == 'bunker' and f['g'].distance(g) < 48]
    gb = [b for b in bs if h['green'] is not None and b.distance(h['green']) < 28]; fb = len(bs) - len(gb)
    num = lambda n: ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] if n <= 10 else str(n)
    s = parts[0] + ((' ' + parts[1]) if len(parts) > 1 else '') + '.'
    if gb or fb:
        bits = []
        if gb: bits.append(num(len(gb)).capitalize() + (' bunker' if len(gb) == 1 else ' bunkers') + ' by the green')
        if fb: bits.append((num(fb).capitalize() if not gb else num(fb)) + (' bunker' if fb == 1 else ' bunkers') + (' short of it' if par == 3 else ' along the way'))
        s += ' ' + ' and '.join(bits) + '.'
    return s

def draw_hole(h, ctx, slug):
    line = h['line']; play, start, mid, endp = play_of(h); h['play'] = play
    par = h['par'] or 4; W = 46 if par == 3 else 56
    parts = [play.buffer(W), line.buffer(W * .8)] + [t.buffer(16) for t in h['tees']] + ([h['green'].buffer(30)] if h['green'] is not None else []) + [f.buffer(14) for f in h['fairs']]
    corr = unary_union(parts).buffer(18).buffer(-18)
    if corr.geom_type != 'Polygon': corr = max(corr.geoms, key=lambda p: p.area)
    # rotate so play runs up the page
    t = math.atan2(endp[0] - start[0], endp[1] - start[1]); ct, st = math.cos(t), math.sin(t)
    rot = lambda g: affine_transform(g, [ct, -st, st, ct, 0, 0])
    b = rot(corr).bounds; VW, VH, M = 360, 600, 14
    sc = min((VW - 2 * M) / (b[2] - b[0]), (VH - 2 * M) / (b[3] - b[1])); cx0, cy0 = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
    a, bb, d, e = sc * ct, -sc * st, -sc * st, -sc * ct
    T = lambda g: affine_transform(g, [a, bb, d, e, VW / 2 - sc * cx0, VH / 2 + sc * cy0])
    near = corr.buffer(6); box_ = lambda g: g.intersection(near)
    def col(kind, src=None, lines=False):
        gs = [f['g'] for f in (src if src is not None else ctx['feats']) if f['k'] == kind and f['g'].intersects(near)]
        if not gs: return ''
        u = unary_union([box_(g) for g in gs]); u = T(u)
        return line_path(u) if lines else poly_path(u)
    own_ids = {id(x) for x in h['fairs']} | ({id(h['green'])} if h['green'] is not None else set()) | {id(x) for x in h['tees']}
    others = [f for f in ctx['own'] if f['k'] in ('fairway', 'green', 'tee') and id(f['g']) not in own_ids and f['g'].intersects(near)]
    P = {}
    P['other'] = poly_path(T(unary_union([box_(f['g']) for f in others]))) if others else ''
    P['wood'] = col('wood'); P['water'] = col('water'); P['sandn'] = col('sand'); P['stream'] = col('stream', lines=True); P['bldg'] = col('building'); P['club'] = col('clubhouse', ctx['own'])
    P['fair'] = poly_path(T(unary_union(h['fairs']))) if h['fairs'] else ''
    P['bunker'] = col('bunker', ctx['own']); P['path'] = col('cartpath', ctx['own'], lines=True)
    P['green'] = poly_path(T(h['green'])) if h['green'] is not None else ''
    P['collar'] = poly_path(T(h['green'].buffer(3.2))) if h['green'] is not None else ''
    tees = ''
    for tg in h['tees']:
        sel = h['tee'] is not None and tg.equals(h['tee'])
        tees += f'<path d="{poly_path(T(tg), .2, False)}" fill="{C["tee"]}" stroke="{"#fff" if sel else "none"}" stroke-width="1.2" opacity="{1 if sel else .6}"/>'
    corr_d = poly_path(T(corr), .6); play_px = T(play); gp = T(Point(endp)); sp = T(Point(start))
    k = f'{slug}-{h["n"]}'
    arcs = ''
    for yd in (100, 150, 200):
        if yd > h['measured'] - 35: continue
        r = yd * YD * sc
        # label where the arc meets the line of play
        lp = None
        for i in range(200):
            q = play.interpolate(play.length * (1 - i / 200));
            if q.distance(Point(endp)) >= yd * YD: lp = T(q); break
        arcs += f'<circle cx="{gp.x:.1f}" cy="{gp.y:.1f}" r="{r:.1f}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1" stroke-dasharray="1 4" stroke-linecap="round"/>'
        if lp is not None: arcs += f'<g transform="translate({lp.x + 12:.1f} {lp.y - 3:.1f})"><rect x="-2" y="-9" width="26" height="13" rx="6.5" fill="#1B2620" fill-opacity=".62"/><text x="11" y="1" text-anchor="middle" font-size="9" font-weight="600" fill="#fff">{yd}</text></g>'
    dots = ''.join(f'<circle cx="{T(Point(p)).x:.1f}" cy="{T(Point(p)).y:.1f}" r="3.2" fill="#fff" stroke="{C["ink"]}" stroke-opacity=".35"/>' for p in mid)
    bar = 50 * YD * sc
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VW} {VH}" role="img" aria-label="Hole {h['n']} drawn from tee at the bottom to green at the top" font-family="Inter,system-ui,sans-serif">
<defs><clipPath id="c{k}"><path d="{corr_d}"/></clipPath>
<pattern id="s{k}" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="7" height="14" fill="{C['fair2']}"/></pattern>
<pattern id="t{k}" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2.2" cy="2.4" r="2" fill="{C['wood2']}" opacity=".55"/><circle cx="6.8" cy="6.9" r="1.6" fill="{C['wood2']}" opacity=".4"/></pattern>
<pattern id="w{k}" width="16" height="7" patternUnits="userSpaceOnUse"><path d="M0 4q4-3 8 0t8 0" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".8"/></pattern></defs>
<path d="{corr_d}" fill="{C['rough']}" stroke="{C['rough2']}" stroke-width="1.5"/>
<g clip-path="url(#c{k})">
<path d="{P['other']}" fill="{C['other']}"/>
<path d="{P['wood']}" fill="{C['wood']}"/><path d="{P['wood']}" fill="url(#t{k})"/>
<path d="{P['sandn']}" fill="{C['sand']}" opacity=".8"/>
<path d="{P['water']}" fill="{C['water']}" stroke="{C['water2']}" stroke-width="1"/><path d="{P['water']}" fill="url(#w{k})"/>
<path d="{P['stream']}" fill="none" stroke="{C['water']}" stroke-width="3" stroke-linecap="round"/>
<path d="{P['path']}" fill="none" stroke="{C['path']}" stroke-width="1.6" stroke-linecap="round" opacity=".9"/>
<path d="{P['fair']}" fill="{C['fair']}"/><path d="{P['fair']}" fill="url(#s{k})" opacity=".55"/>
<path d="{P['bldg']}" fill="{C['bldg']}"/><path d="{P['club']}" fill="{C['gold']}" opacity=".8"/>
<path d="{P['collar']}" fill="{C['collar']}"/>
<path d="{P['bunker']}" fill="{C['sand']}" stroke="{C['lip']}" stroke-width="1"/>
<path d="{P['green']}" fill="{C['green']}"/>
{tees}
{arcs}
<path d="{line_path(play_px, .1, False)}" fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="5 5" stroke-linecap="round" opacity=".92"/>
{dots}
</g>
<circle cx="{sp.x:.1f}" cy="{sp.y:.1f}" r="3.4" fill="#fff" stroke="{C['ink']}" stroke-opacity=".5"/>
<g transform="translate({gp.x:.1f} {gp.y:.1f})"><path d="M0 0V-17" stroke="{C['ink']}" stroke-width="1.3"/><path d="M0-17l10 3.6L0-9.8z" fill="{C['gold']}"/><circle r="1.8" fill="{C['ink']}"/></g>
<g transform="translate({VW - 26} 28)"><circle r="14" fill="#fff" fill-opacity=".92" stroke="#E2DCCD"/><g transform="rotate({-math.degrees(t):.1f})"><path d="M0-9l4 11-4-2.6-4 2.6z" fill="{C['ink']}"/></g><text y="24" text-anchor="middle" font-size="8" fill="#4B584F">North</text></g>
<g transform="translate(14 {VH - 14})"><path d="M0 0h{bar:.1f}M0-3v6M{bar:.1f}-3v6" stroke="{C['ink']}" stroke-width="1.2" fill="none"/><text x="{bar + 5:.1f}" y="3" font-size="8.5" fill="#4B584F">50 yards, approximate</text></g>
</svg>'''
    # small thumbnail
    tb = T(corr).bounds; tw = 54; ts = tw / VW
    thumb = f'<svg viewBox="0 0 {VW} {VH}" aria-hidden="true"><path d="{poly_path(T(corr), 2.5, False)}" fill="{C["rough"]}"/><path d="{poly_path(T(unary_union(h["fairs"])), 2, False) if h["fairs"] else ""}" fill="{C["fair"]}"/><path d="{poly_path(T(unary_union([f["g"] for f in ctx["feats"] if f["k"] == "water" and f["g"].intersects(corr)]).intersection(corr)), 2, False) if any(f["k"] == "water" and f["g"].intersects(corr) for f in ctx["feats"]) else ""}" fill="{C["water"]}"/><path d="{poly_path(T(unary_union([f["g"] for f in ctx["own"] if f["k"] == "bunker" and f["g"].intersects(corr)])), 1.2, False) if any(f["k"] == "bunker" and f["g"].intersects(corr) for f in ctx["own"]) else ""}" fill="{C["sand"]}"/><path d="{poly_path(T(h["green"].buffer(2)), 1, False) if h["green"] is not None else ""}" fill="{C["green"]}"/><circle cx="{sp.x:.0f}" cy="{sp.y:.0f}" r="7" fill="#fff"/></svg>'
    return svg, thumb

def draw_overview(ctx, slug, drawn):
    region = ctx['region'].buffer(40).buffer(-25); b = region.bounds; VW = 1000; M = 16
    sc = (VW - 2 * M) / (b[2] - b[0]); VH = round((b[3] - b[1]) * sc + 2 * M)
    T = lambda g: affine_transform(g, [sc, 0, 0, -sc, M - sc * b[0], M + sc * b[3]])
    def col(kind, src, lines=False, clip=True):
        gs = [f['g'] for f in src if f['k'] == kind and f['g'].intersects(region)]
        if not gs: return ''
        u = unary_union(gs); u = u.intersection(region) if clip else u
        return line_path(T(u), .8) if lines else poly_path(T(u), .7)
    F, O = ctx['feats'], ctx['own']
    hits = ''; badges = ''
    for n, h in sorted(ctx['holes'].items()):
        if n not in drawn: continue
        gp = T(Point(centroid(h['green']) if h['green'] is not None else h['line'].coords[-1])); pl = T(h['play'])
        # put the number badge just off the green, away from the fairway
        a = pl.coords[-2]; dx, dy = gp.x - a[0], gp.y - a[1]; L = math.hypot(dx, dy) or 1; bx, by = gp.x + dx / L * 24, gp.y + dy / L * 24
        bx = min(VW - 14, max(14, bx)); by = min(VH - 14, max(14, by))
        lab = f'Hole {n}{", par " + str(h["par"]) if h["par"] else ""}'
        hits += f'<g class="hh" data-hole="{n}" aria-hidden="true"><path d="{line_path(pl, .5, False)}" fill="none" stroke="#fff" stroke-opacity="0" stroke-width="26" stroke-linecap="round"/><path class="pl" d="{line_path(pl, .5, False)}" fill="none" stroke="#fff" stroke-width="1.3" stroke-dasharray="3 4" opacity=".7"/></g>'
        badges += f'<g class="hh" data-hole="{n}" tabindex="0" role="button" aria-label="{lab}"><circle cx="{bx:.1f}" cy="{by:.1f}" r="17" fill="#fff" fill-opacity="0"/><circle class="bd" cx="{bx:.1f}" cy="{by:.1f}" r="14" fill="#fff" stroke="{C["ink"]}" stroke-opacity=".25"/><text x="{bx:.1f}" y="{by + 5:.1f}" text-anchor="middle" font-size="14.5" font-weight="700" fill="{C["ink"]}">{n}</text></g>'
    hits += badges
    k = slug
    labels = ''
    for f in O:
        if f['k'] == 'clubhouse': p = T(f['g'].centroid); labels += f'<text x="{p.x:.0f}" y="{p.y - 9:.0f}" text-anchor="middle" font-size="11" font-weight="600" fill="{C["ink"]}" stroke="#fff" stroke-width="3" paint-order="stroke">Clubhouse</text>'
        if f['k'] == 'driving_range': p = T(f['g'].centroid); labels += f'<text x="{p.x:.0f}" y="{p.y + 4:.0f}" text-anchor="middle" font-size="11" font-weight="600" fill="#33503A" stroke="#fff" stroke-opacity=".7" stroke-width="3" paint-order="stroke">Practice</text>'
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VW} {VH}" role="img" aria-label="Map of the whole course, north at the top" font-family="Inter,system-ui,sans-serif">
<defs><clipPath id="oc{k}"><path d="{poly_path(T(region), 1)}"/></clipPath>
<pattern id="ot{k}" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2.2" cy="2.4" r="2" fill="{C['wood2']}" opacity=".5"/><circle cx="6.8" cy="6.9" r="1.6" fill="{C['wood2']}" opacity=".35"/></pattern></defs>
<path d="{poly_path(T(region), 1)}" fill="{C['rough']}" stroke="{C['rough2']}" stroke-width="2"/>
<g clip-path="url(#oc{k})">
<path d="{col('wood', F)}" fill="{C['wood']}"/><path d="{col('wood', F)}" fill="url(#ot{k})"/>
<path d="{col('sand', F)}" fill="{C['sand']}" opacity=".8"/>
<path d="{col('water', F)}" fill="{C['water']}" stroke="{C['water2']}"/>
<path d="{col('stream', F, True)}" fill="none" stroke="{C['water']}" stroke-width="2.5" stroke-linecap="round"/>
<path d="{col('driving_range', O)}" fill="{C['other']}"/>
<path d="{col('cartpath', O, True)}" fill="none" stroke="{C['path']}" stroke-width="1.3" opacity=".9"/>
<path d="{col('fairway', O)}" fill="{C['fair']}"/>
<path d="{col('tee', O)}" fill="{C['tee']}"/>
<path d="{col('bunker', O)}" fill="{C['sand']}" stroke="{C['lip']}" stroke-width=".6"/>
<path d="{col('green', O)}" fill="{C['green']}" stroke="{C['collar']}" stroke-width="1.5"/>
<path d="{col('building', F)}" fill="{C['bldg']}"/><path d="{col('clubhouse', O)}" fill="{C['gold']}"/>
</g>
{hits}{labels}
<g transform="translate({VW - 30} 32)"><circle r="15" fill="#fff" fill-opacity=".92" stroke="#E2DCCD"/><path d="M0-10l4.4 12-4.4-2.8-4.4 2.8z" fill="{C['ink']}"/><text y="27" text-anchor="middle" font-size="9.5" fill="#4B584F">North</text></g>
</svg>'''
    return svg

def build(only=None):
    report = []
    for c in DATA['courses']:
        if only and c['slug'] not in only: continue
        ctx = prepare(c); slug = c['slug']; H = ctx['holes']; want = c['h']
        ok = {n: h for n, h in H.items() if not h['flag'] and 1 <= n <= max(want, 18)}
        enough = len(ok) >= .6 * want
        rec = dict(slug=slug, name=c['n'], holesOnCard=want, mappedLines=len(H), drawn=sorted(ok) if enough else [], flagged={n: h['flag'] for n, h in H.items() if h['flag']},
                   missing=[n for n in range(1, want + 1) if n not in H], scorecard=bool(ctx['sc']), counts={k: sum(1 for f in ctx['own'] if f['k'] == k) for k in ('fairway', 'green', 'tee', 'bunker', 'hole')})
        report.append(rec)
        d = os.path.join(OUT, slug)
        if not enough:
            if os.path.isdir(d):
                for f in os.listdir(d): os.remove(os.path.join(d, f))
                os.rmdir(d)
            continue
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(d): os.remove(os.path.join(d, f))
        holes_json = []; page = []
        ep = os.path.join(HERE, 'elev', slug + '.json'); elev = json.load(open(ep)) if os.path.exists(ep) else {}
        for n in range(1, want + 1):
            h = ok.get(n); card = ctx['sc'].get(n) or {}
            if h is None:
                why = H[n]['flag'] if n in H else 'This hole is not mapped yet'
                holes_json.append(dict(number=n, par=card.get('par'), yardage=card.get('yards'), drawn=False, flag=why)); page.append(dict(n=n, par=card.get('par'), yards=card.get('yards'), drawn=False)); continue
            svg, thumb = draw_hole(h, ctx, slug)
            open(os.path.join(d, f'hole-{n:02d}.svg'), 'w').write(svg)
            text = describe(h, ctx); e = elev.get(str(n))
            holes_json.append(dict(number=n, par=h['par'], yardage=h['yards'], measuredYards=h['measured'], drawn=True, shapes='100% OpenStreetMap, 0% imagery', flag=None, sentence=text, file=f'hole-{n:02d}.svg'))
            page.append(dict(n=n, par=h['par'], yards=h['yards'], drawn=True, text=text, thumb=thumb, elev=e))
        open(os.path.join(d, 'overview.svg'), 'w').write(draw_overview(ctx, slug, set(ok)))
        json.dump(dict(course=c['n'], slug=slug, holes=holes_json, drawn=len(ok), of=want, parAndYardage='From the course\'s published scorecard, never measured',
                       sources=['OpenStreetMap contributors (ODbL), read November 24, 2026', 'Natural Resources Canada, High Resolution Digital Elevation Model, PEI 2020, 1 m (Open Government Licence - Canada), for ground heights only'],
                       note='Drawn by TeeTrip from OpenStreetMap. A guide to the hole, not a survey. Yardages are the course\'s own.'), open(os.path.join(d, 'layout.json'), 'w'), indent=0)
        os.makedirs(os.path.join(HERE, 'work'), exist_ok=True); json.dump(page, open(os.path.join(HERE, 'work', slug + '.json'), 'w'))
    json.dump(report, open(os.path.join(HERE, 'report.json'), 'w'), indent=1)
    return report

if __name__ == '__main__':
    rep = build(set(sys.argv[1:]) or None)
    for r in rep: print(r['slug'].ljust(25), 'drawn', len(r['drawn']), 'of', r['holesOnCard'], '| mapped lines', r['mappedLines'], '| flagged', r['flagged'] if r['flagged'] else '', '| missing', r['missing'] if r['mappedLines'] else 'all')
