"""Put "The course, hole by hole" on every course page, from the files build.py wrote.
Safe to run again: it replaces its own block between the layout markers."""
import hashlib, html, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import DATA, HERE, ROOT

NOTE = "Drawn by TeeTrip from OpenStreetMap and federal open LiDAR. A guide to the hole, not a survey. Yardages are the course's own."
CREDIT = ('Shapes &copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a> (ODbL), read November 2026. '
          'Ground shading, tree lines, heights and some tee boxes: Natural Resources Canada, High Resolution Digital Elevation Model, PEI 2020, 1 m LiDAR (Open Government Licence &ndash; Canada).')
A, B = '<!--layout:start-->', '<!--layout:end-->'

def asset(name, ext):
    src = open(os.path.join(HERE, 'web', name + '.' + ext)).read()
    h = hashlib.sha1(src.encode()).hexdigest()[:8]; fn = f'{name}.{h}.{ext}'
    for f in os.listdir(os.path.join(ROOT, 'assets')):
        if re.fullmatch(name + r'\.[0-9a-f]{8}\.' + ext, f): os.remove(os.path.join(ROOT, 'assets', f))
    open(os.path.join(ROOT, 'assets', fn), 'w').write(src)
    return fn

def block(c, css, js):
    slug = c['slug']; wp = os.path.join(HERE, 'work', slug + '.json'); d = os.path.join(ROOT, 'assets', 'layouts', slug)
    head = f'<link rel="stylesheet" href="../../assets/{css}">'
    if not (os.path.exists(wp) and os.path.isdir(d)):
        return (f'{A}{head}<section class="sec tight lay" id="layout"><div class="wrap"><h2>The course, <em>hole by hole.</em></h2>'
                f'<div class="laycoming"><b>Layout coming.</b> We draw holes only from open map data, and this course is not mapped in enough detail yet. We would rather show nothing than guess.</div></div></section>{B}')
    holes = json.load(open(wp)); ov = open(os.path.join(d, 'overview.svg')).read()
    drawn = sum(1 for h in holes if h['drawn']); strip = ''
    for h in holes:
        par = f'Par <span class="num">{h["par"]}</span>' if h['par'] else 'Par not yet on file'
        if h['drawn']: strip += f'<button type="button" class="layth" data-hole="{h["n"]}" aria-label="Hole {h["n"]}, {html.escape(re.sub("<[^>]+>", "", par)).lower()}">{h["thumb"]}<b class="num">{h["n"]}</b><span>{par}</span></button>'
        else: strip += f'<button type="button" class="layth soon" data-hole="{h["n"]}" aria-label="Hole {h["n"]}, layout coming"><i>Layout coming</i><b class="num">{h["n"]}</b><span>{par}</span></button>'
    data = [dict(n=h['n'], par=h['par'], yards=h['yards'], drawn=h['drawn'], text=h.get('text'), elev=h.get('elev')) for h in holes]
    some = '' if drawn == len(holes) else f' <span class="laycount">{drawn} of {len(holes)} holes drawn so far. The rest say &ldquo;Layout coming&rdquo;.</span>'
    return (f'{A}{head}<section class="sec tight lay" id="layout" data-slug="{slug}"><div class="wrap"><h2>The course, <em>hole by hole.</em></h2>'
            f'<p class="laysub">Tap a hole on the map, or pick one from the strip below.{some}</p>'
            f'<div class="laymap">{ov}</div><div class="laystrip" role="list">{strip}</div>'
            f'<p class="laynote">{NOTE}</p><p class="laycred">{CREDIT}</p></div>'
            f'<dialog class="hcard" aria-labelledby="hcT"><div class="hin"><div class="hhead"><div><h3 id="hcT">Hole <span class="num" id="hcN"></span></h3><p class="hfacts" id="hcF"></p></div><button type="button" class="hx" id="hcX" aria-label="Close">&times;</button></div>'
            f'<div class="hpic" id="hcP"></div><p class="htext" id="hcD"></p><div class="helev" id="hcE"></div>'
            f'<div class="hnav"><button type="button" id="hcPrev">&larr; Previous</button><button type="button" id="hcBack">Back to the whole course</button><button type="button" id="hcNext">Next &rarr;</button></div>'
            f'<p class="laynote">{NOTE}</p></div></dialog>'
            f'<script type="application/json" id="layData">{json.dumps(data, separators=(",", ":"))}</script><script src="../../assets/{js}" defer></script></section>{B}')

def main():
    css, js = asset('layouts', 'css'), asset('layouts', 'js')
    for c in DATA['courses']:
        p = os.path.join(ROOT, 'courses', c['slug'], 'index.html'); t = open(p).read()
        t = re.sub(re.escape(A) + '.*?' + re.escape(B), '', t, flags=re.S)
        i = t.index('</section>', t.index('<section class="chero">')) + len('</section>')
        t = t[:i] + block(c, css, js) + t[i:]
        open(p, 'w').write(t); print(c['slug'], round(len(t) / 1024), 'KB')
    # About page: credit the sources
    p = os.path.join(ROOT, 'about', 'index.html'); t = open(p).read()
    t = re.sub(r'<li data-lay>.*?</li>', '', t, flags=re.S)
    li = ('<li data-lay><b>Hole drawings</b><span>Drawn by TeeTrip from OpenStreetMap contributors (ODbL), read November 2026, and federal open LiDAR. A guide to the hole, not a survey. Par and yards are each course\'s own scorecard.</span></li>'
          '<li data-lay><b>Ground shading, tree lines and heights on hole drawings</b><span>Natural Resources Canada, High Resolution Digital Elevation Model, Prince Edward Island 2020, 1 metre LiDAR (Open Government Licence &ndash; Canada)</span></li>')
    k = t.index('</li>', t.index('<b>Map, roads and land</b>')) + 5
    open(p, 'w').write(t[:k] + li + t[k:])

if __name__ == '__main__': main()
