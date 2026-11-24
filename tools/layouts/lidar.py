"""Reading the federal 1 m LiDAR (ground and surface heights, Open Government Licence - Canada) for a course,
and finding the raised, level pads that tee boxes and greens are built on.

The LiDAR is a height model, not a photograph: it shows the shape of the ground (pads, hollows, banks)
and how tall whatever stands on it is (trees). It does not show mowing lines or grass colour."""
import os, numpy as np
from functools import lru_cache
from scipy import ndimage as ndi
from pyproj import Transformer
from shapely.geometry import Polygon, Point, shape
from shapely.ops import unary_union
from rasterio import features as rfeat
from affine import Affine
HERE = os.path.dirname(os.path.abspath(__file__))
U2L = Transformer.from_crs('EPSG:32620', 'EPSG:3979', always_xy=True)
L2U = Transformer.from_crs('EPSG:3979', 'EPSG:32620', always_xy=True)

class Lidar:
    def __init__(self, slug):
        z = np.load(os.path.join(HERE, 'lidar', slug + '.npz'))
        nd = float(z['nodata'])
        g = z['dtm'].astype('float32'); s = z['dsm'].astype('float32')
        bad = (g == nd) | (g < -50)
        self.ok = ~bad
        fill = np.nanmedian(np.where(bad, np.nan, g)) if (~bad).any() else 0
        self.dtm = np.where(bad, fill, g); self.dsm = np.where((s == nd) | (s < -50), self.dtm, s)
        self.T = Affine(*z['transform'].tolist()); self.Ti = ~self.T
        self.canopy = np.clip(self.dsm - self.dtm, 0, 60)
        gy, gx = np.gradient(self.dtm)
        self.slope = np.degrees(np.arctan(np.hypot(gx, gy)))
        self.relief = self.dtm - ndi.uniform_filter(self.dtm, 25)
    def px(self, x, y):
        lx, ly = U2L.transform(x, y); c, r = self.Ti * (lx, ly); return r, c
    def utm(self, r, c):
        lx, ly = self.T * (c, r); return L2U.transform(lx, ly)
    def height(self, x, y):
        r, c = self.px(x, y); r, c = int(round(r)), int(round(c))
        if 0 <= r < self.dtm.shape[0] and 0 <= c < self.dtm.shape[1] and self.ok[r, c]: return float(self.dtm[r, c])
        return None
    def to_utm_geom(self, mask):
        """Polygons (in UTM metres) of the cells set in mask."""
        out = []
        for geom, v in rfeat.shapes(mask.astype('uint8'), mask=mask, transform=self.T):
            p = shape(geom)
            ring = [L2U.transform(x, y) for x, y in p.exterior.coords]
            holes = [[L2U.transform(x, y) for x, y in h.coords] for h in p.interiors]
            out.append(Polygon(ring, holes).buffer(0))
        return out
    def trees(self, min_h=3.0, min_area=60):
        m = ndi.binary_opening(self.canopy > min_h, iterations=1)
        m = ndi.binary_closing(m, iterations=2)
        lab, n = ndi.label(m); sizes = ndi.sum(m, lab, range(1, n + 1))
        keep = np.isin(lab, np.nonzero(sizes >= min_area)[0] + 1)
        return [p for p in self.to_utm_geom(keep) if p.area >= min_area]

@lru_cache(maxsize=32)
def get(slug):
    p = os.path.join(HERE, 'lidar', slug + '.npz')
    return Lidar(slug) if os.path.exists(p) else None

def pads(L, min_area=40, max_area=1600):
    """Level ground raised a little above its surroundings: where tee boxes and greens are built.
    Returns UTM polygons with their area, average slope and rise above the ground around them."""
    level = (L.slope < 3.2) & (L.canopy < 1.0) & L.ok
    raised = L.relief > 0.12
    m = ndi.binary_opening(level & raised, iterations=1)
    lab, n = ndi.label(m)
    if not n: return []
    idx = np.arange(1, n + 1)
    area = ndi.sum(m, lab, idx); sl = ndi.mean(L.slope, lab, idx); rl = ndi.mean(L.relief, lab, idx)
    keep = idx[(area >= min_area) & (area <= max_area)]
    out = []
    for k in keep:
        mm = lab == k
        for p in L.to_utm_geom(mm):
            if p.area < min_area: continue
            out.append({'g': p, 'area': p.area, 'slope': float(sl[k - 1]), 'rise': float(rl[k - 1])})
    return out
