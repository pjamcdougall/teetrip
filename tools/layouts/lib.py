"""Shared pieces for the TeeTrip course layout drawings: read OSM, read scorecards, match holes."""
import json, os, re, html, math, xml.etree.ElementTree as ET
from pyproj import Transformer
from shapely.geometry import Polygon, LineString, Point, MultiPolygon
from shapely.ops import unary_union
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '../..'))
DATA = json.load(open(os.path.join(ROOT, 'assets/plan-data.27ec6bbe.json')))
TR = Transformer.from_crs('EPSG:4326', 'EPSG:32620', always_xy=True)
YD = 0.9144

def scorecard(slug):
    """Par and yards per hole exactly as published on the course page (official sources only)."""
    t = open(os.path.join(ROOT, 'courses', slug, 'index.html')).read()
    out = {}
    for m in re.finditer(r'Hole (\d+): par (\d)(?:, ([\d,]+) yards)?', html.unescape(re.sub(r'<[^>]+>', ' ', t))):
        out[int(m.group(1))] = {'par': int(m.group(2)), 'yards': int(m.group(3).replace(',', '')) if m.group(3) else None}
    return out

def read_osm(slug):
    r = ET.parse(os.path.join(HERE, 'osm', slug + '.osm')).getroot()
    nodes = {n.get('id'): TR.transform(float(n.get('lon')), float(n.get('lat'))) for n in r.iter('node')}
    ways = {}
    for w in r.iter('way'):
        pts = [nodes[nd.get('ref')] for nd in w.findall('nd') if nd.get('ref') in nodes]
        ways[w.get('id')] = (pts, {x.get('k'): x.get('v') for x in w.findall('tag')})
    feats = []
    def add(kind, pts, tags, wid):
        if len(pts) < 2: return
        closed = pts[0] == pts[-1] and len(pts) >= 4
        try:
            if kind in ('hole', 'cartpath', 'stream', 'road'): g = LineString(pts)
            elif closed: g = Polygon(pts).buffer(0)
            else: return
        except Exception: return
        if g.is_empty: return
        feats.append({'k': kind, 'g': g, 't': tags, 'id': wid})
    def kind_of(t):
        g = t.get('golf')
        if g in ('hole', 'fairway', 'green', 'tee', 'bunker', 'rough', 'cartpath', 'driving_range', 'clubhouse'): return g
        if g in ('water_hazard', 'lateral_water_hazard') or t.get('natural') == 'water' or t.get('waterway') == 'riverbank' or t.get('natural') == 'bay': return 'water'
        if t.get('natural') in ('wood', 'scrub') or t.get('landuse') == 'forest': return 'wood'
        if t.get('natural') in ('sand', 'beach'): return 'sand'
        if t.get('waterway') in ('stream', 'river', 'ditch', 'drain'): return 'stream'
        if t.get('leisure') == 'golf_course': return 'course'
        if t.get('building') and t.get('golf') != 'clubhouse': return 'building'
        if t.get('natural') == 'coastline': return 'coast'
        return None
    for wid, (pts, t) in ways.items():
        k = kind_of(t)
        if k == 'coast': feats.append({'k': 'coast', 'g': LineString(pts), 't': t, 'id': wid}) if len(pts) > 1 else None
        elif k: add(k, pts, t, wid)
    for rel in r.iter('relation'):
        t = {x.get('k'): x.get('v') for x in rel.findall('tag')}
        k = kind_of(t)
        if not k or k in ('hole', 'cartpath', 'stream', 'coast'): continue
        polys = []
        for mem in rel.findall('member'):
            if mem.get('type') == 'way' and mem.get('role') in ('outer', '') and mem.get('ref') in ways:
                pts = ways[mem.get('ref')][0]
                if len(pts) >= 4 and pts[0] == pts[-1]:
                    try: polys.append(Polygon(pts).buffer(0))
                    except Exception: pass
        if polys: feats.append({'k': k, 'g': unary_union(polys), 't': t, 'id': 'r' + rel.get('id')})
    return feats

def course_area(feats, c):
    """The golf_course outline that belongs to this course (by name, else the one containing its pin)."""
    x, y = TR.transform(*c['ll']); p = Point(x, y)
    cs = [f for f in feats if f['k'] == 'course']
    key = c['n'].replace('The Links at ', '').split()[0].lower()
    named = [f for f in cs if key in f['t'].get('name', '').lower()]
    if named: return unary_union([f['g'] for f in named])
    inside = [f for f in cs if f['g'].contains(p)]
    if inside: return min(inside, key=lambda f: f['g'].area)['g']
    if cs:
        n = min(cs, key=lambda f: f['g'].distance(p))
        if n['g'].distance(p) < 400: return n['g']
    return p.buffer(900)
