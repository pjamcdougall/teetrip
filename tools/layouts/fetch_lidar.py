"""Download 1 m ground (DTM) and surface (DSM) heights around each course from the federal open LiDAR for PEI, 2020.
Source: Natural Resources Canada, High Resolution Digital Elevation Model (HRDEM), Open Government Licence - Canada.
Writes tools/layouts/lidar/<slug>.npz (dtm, dsm, transform, crs). Not committed: rebuild with this script."""
import os, sys, numpy as np
for _k in ('CURL_CA_BUNDLE', 'SSL_CERT_FILE'): os.environ[_k] = os.path.expanduser('~/.ccr/ca-bundle.crt')
import rasterio
from rasterio.windows import from_bounds
from pyproj import Transformer
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import DATA, HERE, read_osm, course_area, TR
B = 'https://canelevation-dem.s3.ca-central-1.amazonaws.com/hrdem-lidar/PEI-Prince_Edward_Island_2020-1m-'
OUT = os.path.join(HERE, 'lidar'); os.makedirs(OUT, exist_ok=True)
env = rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', GDAL_HTTP_MAX_RETRY='4', GDAL_HTTP_RETRY_DELAY='2', GDAL_CURL_CA_BUNDLE=os.path.expanduser('~/.ccr/ca-bundle.crt'), CURL_CA_BUNDLE=os.path.expanduser('~/.ccr/ca-bundle.crt'), SSL_CERT_FILE=os.path.expanduser('~/.ccr/ca-bundle.crt'))
def box_for(c):
    f = read_osm(c['slug']); a = course_area(f, c)
    x, y = TR.transform(*c['ll'])
    b = a.bounds if a.area > 2e5 and a.area < 5e6 else (x - 900, y - 900, x + 900, y + 900)
    pad = 120; return (b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad)
with env, rasterio.open(B + 'dtm.tif') as dtm, rasterio.open(B + 'dsm.tif') as dsm:
    tr = Transformer.from_crs('EPSG:32620', dtm.crs, always_xy=True)
    for c in DATA['courses']:
        if sys.argv[1:] and c['slug'] not in sys.argv[1:]: continue
        p = os.path.join(OUT, c['slug'] + '.npz')
        if os.path.exists(p): continue
        b = box_for(c)
        xs, ys = zip(*[tr.transform(b[i], b[j]) for i in (0, 2) for j in (1, 3)])
        w = from_bounds(min(xs), min(ys), max(xs), max(ys), dtm.transform).round_offsets().round_lengths()
        g = dtm.read(1, window=w).astype('float32'); s = dsm.read(1, window=w).astype('float32')
        np.savez_compressed(p, dtm=g, dsm=s, transform=np.array(dtm.window_transform(w))[:6], crs=str(dtm.crs), nodata=dtm.nodata)
        print(c['slug'], g.shape, round(os.path.getsize(p) / 1e6, 1), 'MB', flush=True)
