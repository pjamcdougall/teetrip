"""Cut the TeeTrip road map tiles for Prince Edward Island.

Reads our own regional tile archives (OpenStreetMap data in the Protomaps basemap layout, ODbL), keeps only what the
TeeTrip map draws (land, water, roads, ferries, place names, golf course grounds) and repacks the tiles into small
chunk files plus a compact directory, so the map needs no range requests.

Run:  python3 cut_tiles.py /path/to/source/tiles
Writes assets/mapkit/tiles/ and tools/map/budget.json."""
import gzip, json, math, os, sys
from pmtiles.reader import Reader, MmapSource, all_tiles
from pmtiles.tile import zxy_to_tileid

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..'))
OUT = os.path.join(ROOT, 'assets', 'mapkit', 'tiles')
WIDE = [-66.4, 44.5, -60.2, 48.4]     # overview: the Island with the New Brunswick and Nova Scotia shore
NEAR = [-64.75, 45.5, -61.7, 47.2]     # regional detail: the Island, the bridge approach, the Caribou ferry landing
PEI = [-64.48, 45.89, -61.92, 47.13]
ARCH = [  # name, minz, maxz, bbox, source archives, chunk size
    ('o', 6, 9, WIDE, ['a-west', 'a-east'], 110_000),
    ('r', 10, 11, NEAR, ['b-pe', 'b-ns', 'b-nb'], 150_000),
    ('s-w', 12, 15, [-64.48, 45.89, -63.25, 47.13], ['c-pe-w'], 450_000),
    ('s-e', 12, 15, [-63.25, 45.89, -61.92, 47.13], ['c-pe-e'], 450_000),
]
ROADS = {'highway', 'major_road', 'minor_road', 'other', 'ferry'}
WATER_NAMES = {'ocean', 'sea', 'strait', 'bay', 'gulf'}

# ---- just enough protobuf to keep or drop whole layers and features without re-encoding geometry ----
def varint(b, p):
    v = 0; s = 0
    while True:
        c = b[p]; p += 1; v |= (c & 0x7f) << s; s += 7
        if not c & 0x80: return v, p
def enc(v):
    out = bytearray()
    while v > 0x7f: out.append((v & 0x7f) | 0x80); v >>= 7
    out.append(v); return bytes(out)
def fields(b, start=0, end=None):
    p = start; end = len(b) if end is None else end
    while p < end:
        s0 = p; tag, p = varint(b, p); f, wt = tag >> 3, tag & 7
        if wt == 0: v, p = varint(b, p); yield f, wt, v, s0, p
        elif wt == 2: l, p = varint(b, p); yield f, wt, (p, p + l), s0, p + l; p += l
        elif wt == 1: p += 8; yield f, wt, None, s0, p
        elif wt == 5: p += 4; yield f, wt, None, s0, p
        else: raise ValueError('wire type')
def value(b, s, e):
    for f, wt, v, _, _ in fields(b, s, e):
        if f == 1: return b[v[0]:v[1]].decode('utf8', 'replace')
        if f == 7: return bool(v)
        if wt == 0: return v
    return None
def keep_feature(layer, kind, gtype):
    if layer == 'roads': return kind in ROADS
    if layer == 'water': return gtype != 1 or kind in WATER_NAMES
    if layer == 'places': return kind == 'locality'
    if layer == 'landuse': return kind == 'golf_course' and gtype == 3
    return True
def filter_layer(b, s, e):
    name = None; keys = []; vals = []
    for f, wt, v, _, _ in fields(b, s, e):
        if wt != 2: continue
        if f == 1: name = b[v[0]:v[1]].decode()
        elif f == 3: keys.append(b[v[0]:v[1]].decode('utf8', 'replace'))
        elif f == 4: vals.append(v)
    if name not in ('earth', 'water', 'roads', 'places', 'landuse'): return None
    if name == 'earth': return b[s:e]
    ki = keys.index('kind') if 'kind' in keys else -1
    kinds = {}
    out = bytearray(); n = 0
    for f, wt, v, s0, e0 in fields(b, s, e):
        if f == 2 and wt == 2:
            kind = None; gtype = 0
            for ff, fw, fv, _, _ in fields(b, v[0], v[1]):
                if ff == 3 and fw == 0: gtype = fv
                elif ff == 2 and fw == 2:
                    p = fv[0]
                    while p < fv[1]:
                        k, p = varint(b, p); vi, p = varint(b, p)
                        if k == ki:
                            if vi not in kinds: kinds[vi] = value(b, *vals[vi])
                            kind = kinds[vi]
            if not keep_feature(name, kind, gtype): continue
            n += 1
        out += b[s0:e0]
    return bytes(out) if n else None
def filter_tile(raw):
    out = bytearray()
    for f, wt, v, s0, e0 in fields(raw):
        if f == 3 and wt == 2:
            lb = filter_layer(raw, v[0], v[1])
            if lb: out += enc((3 << 3) | 2) + enc(len(lb)) + lb
    return bytes(out)

def tbox(z, x, y):
    n = 2 ** z; la = lambda v: math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * v / n))))
    return [x / n * 360 - 180, la(y + 1), (x + 1) / n * 360 - 180, la(y)]
hits = lambda a, b: a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]

def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))
    index = {'archives': []}; budget = []
    for name, minz, maxz, bbox, srcs, CH in ARCH:
        tiles = {}; before = 0
        for sname in srcs:
            with open(os.path.join(SRC, sname + '.pmtiles'), 'rb') as fh:
                for (z, x, y), data in all_tiles(Reader(MmapSource(fh)).get_bytes):
                    if z < minz or z > maxz or not hits(tbox(z, x, y), bbox): continue
                    tid = zxy_to_tileid(z, x, y)
                    if tid in tiles: continue
                    before += len(data)
                    raw = gzip.decompress(data) if data[:2] == b'\x1f\x8b' else data
                    cut = filter_tile(raw)
                    if not cut: continue
                    tiles[tid] = (z, gzip.compress(cut, 9, mtime=0))
        ids = []; ch = []; off = []; ln = []; cur = bytearray(); ci = 0; total = 0; byz = {}
        def flush():
            nonlocal cur, ci, total
            open(os.path.join(OUT, f'{name}-{ci}.wasm'), 'wb').write(cur); total += len(cur); ci += 1; cur = bytearray()
        for tid in sorted(tiles):
            z, data = tiles[tid]; byz[z] = byz.get(z, 0) + len(data)
            if len(cur) + len(data) > CH and len(cur): flush()
            ids.append(tid); ch.append(ci); off.append(len(cur)); ln.append(len(data)); cur += data
        if len(cur): flush()
        d = [ids[0]] + [ids[i] - ids[i - 1] for i in range(1, len(ids))]
        a = {'name': name, 'minz': minz, 'maxz': maxz, 'bbox': bbox, 'chunks': ci, 'n': len(ids), 'gz': True}
        sub = {'id': d, 'c': ch, 'o': off, 'l': ln}
        if minz >= 12:
            open(os.path.join(OUT, f'idx-{name}.wasm'), 'wb').write(gzip.compress(json.dumps(sub, separators=(',', ':')).encode(), 9, mtime=0)); a['lazy'] = True
        else: a.update(sub)
        index['archives'].append(a)
        budget.append({'name': name, 'zooms': f'{minz}-{maxz}', 'tiles': len(ids), 'files': ci, 'bytes': total, 'sourceBytes': before, 'byZoom': byz})
        print(name, len(ids), 'tiles', ci, 'files', round(total / 1e6, 2), 'MB (was', round(before / 1e6, 2), 'MB)', {z: round(v / 1e6, 2) for z, v in sorted(byz.items())}, flush=True)
    open(os.path.join(OUT, 'index.wasm'), 'wb').write(gzip.compress(json.dumps(index, separators=(',', ':')).encode(), 9, mtime=0))
    json.dump(budget, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'budget.json'), 'w'), indent=1)
    print('index', os.path.getsize(os.path.join(OUT, 'index.wasm')), 'bytes; total', round(sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)) / 1e6, 2), 'MB in', len(os.listdir(OUT)), 'files')
if __name__ == '__main__': main()
