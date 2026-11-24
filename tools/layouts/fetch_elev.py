"""Ground height along each hole's line of play, from the federal 1 m LiDAR terrain model for PEI (2020).
Source: Natural Resources Canada, High Resolution Digital Elevation Model (HRDEM), Open Government Licence - Canada.
Writes tools/layouts/elev/<slug>.json. Run after fetch_osm.py and before build.py."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rasterio
for _k in ('CURL_CA_BUNDLE', 'SSL_CERT_FILE'): os.environ[_k] = os.path.expanduser('~/.ccr/ca-bundle.crt')
from pyproj import Transformer
import build
from lib import DATA, HERE
URL = 'https://canelevation-dem.s3.ca-central-1.amazonaws.com/hrdem-lidar/PEI-Prince_Edward_Island_2020-1m-dtm.tif'
os.makedirs(os.path.join(HERE, 'elev'), exist_ok=True)
env = rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', GDAL_HTTP_MAX_RETRY='3', GDAL_CURL_CA_BUNDLE=os.path.expanduser('~/.ccr/ca-bundle.crt'), CURL_CA_BUNDLE=os.path.expanduser('~/.ccr/ca-bundle.crt'), SSL_CERT_FILE=os.path.expanduser('~/.ccr/ca-bundle.crt'))
with env, rasterio.open(URL) as ds:
    print(ds.crs, ds.res, ds.nodata)
    tr = Transformer.from_crs('EPSG:32620', ds.crs, always_xy=True)
    for c in DATA['courses']:
        if sys.argv[1:] and c['slug'] not in sys.argv[1:]: continue
        ctx = build.prepare(c); out = {}
        for n, h in ctx['holes'].items():
            if h['flag']: continue
            play = build.play_of(h)[0]; k = max(12, int(play.length / 8))
            pts = [play.interpolate(i / k, normalized=True) for i in range(k + 1)]
            xy = [tr.transform(p.x, p.y) for p in pts]
            vals = [float(v[0]) for v in ds.sample(xy)]
            if any(v == ds.nodata or v < -50 or v > 300 for v in vals): continue
            out[n] = [round(v, 1) for v in vals]
        if out: json.dump(out, open(os.path.join(HERE, 'elev', c['slug'] + '.json'), 'w'), separators=(',', ':'))
        print(c['slug'], len(out), 'holes', flush=True)
