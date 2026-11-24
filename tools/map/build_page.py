"""Build the map page script and refresh the map page data. Run after cut_tiles.py."""
import hashlib, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '../..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'layouts'))
from lib import scorecard
P = json.load(open(os.path.join(ROOT, 'assets', 'plan-data.27ec6bbe.json')))
css = open(os.path.join(HERE, 'web', 'maplibre-gl.css')).read().strip() + open(os.path.join(HERE, 'web', 'map.css')).read().replace('\n', '')
js = open(os.path.join(HERE, 'web', 'map.js')).read().replace('"/*MLCSS*/"+"/*TTCSS*/"', json.dumps(css))
h = hashlib.sha1(js.encode()).hexdigest()[:8]
for f in os.listdir(os.path.join(ROOT, 'assets')):
    if re.fullmatch(r'map\.[0-9a-f]{8}\.js', f): os.remove(os.path.join(ROOT, 'assets', f))
open(os.path.join(ROOT, 'assets', f'map.{h}.js'), 'w').write(js)
p = os.path.join(ROOT, 'map', 'index.html'); t = open(p).read()
m = re.search(r'(<script type="application/json" id="mapData">)(.*?)(</script>)', t, flags=re.S); d = json.loads(m.group(2))
holes = {c['id']: c['h'] for c in P['courses']}
for c in d['courses']:
    c['h'] = holes.get(c['id'])
    sc = scorecard(c['slug']); c.pop('par', None)
    if sc and len(sc) == c['h'] and all(v['par'] for v in sc.values()): c['par'] = sum(v['par'] for v in sc.values())
t = t[:m.start(2)] + json.dumps(d, separators=(',', ':')).replace('</', '<\\/') + t[m.end(2):]
t = re.sub(r'assets/map\.[0-9a-f]{8}\.js', f'assets/map.{h}.js', t)
t = re.sub(r'(<p class="src"[^>]*id="smapNote">).*?(</p>)', r'\1Map data &copy; OpenStreetMap contributors, Protomaps. Map engine by Islandwise Technologies. Drive times are estimates.\2', t, flags=re.S)
t = t.replace("All 18 courses on a full road map of Prince Edward Island. Pick where you're staying to see how far each course is by road.", "All 18 courses on a road map of Prince Edward Island that zooms from the whole Island down to a single lane. Pick where you're staying to see how far each course is by road.")
t = re.sub(r'<link rel="preload" data-mapkit[^>]*>', '', t)
t = t.replace('<link rel="stylesheet" href="../assets/fonts/fonts.css">', '<link rel="stylesheet" href="../assets/fonts/fonts.css"><link rel="preload" data-mapkit href="../assets/mapkit/maplibre-gl.js" as="script"><link rel="preload" data-mapkit href="../assets/mapkit/style.js" as="script">', 1)
assert 'data-mapkit' in t
open(p, 'w').write(t); print('map.' + h + '.js', len(js), 'bytes;', sum(1 for c in d['courses'] if c.get('par')), 'courses with par')
