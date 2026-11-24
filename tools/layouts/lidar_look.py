"""Pictures of the LiDAR around a course, for checking what the ground model shows."""
import sys, numpy as np
from scipy import ndimage as ndi
from PIL import Image
def load(slug):
    z = np.load(f'lidar/{slug}.npz'); g = z['dtm']; s = z['dsm']; nd = z['nodata']
    g = np.where(g == nd, np.nan, g); s = np.where(s == nd, np.nan, s); return g, s, z
def shade(g, az=315, alt=40):
    gy, gx = np.gradient(np.nan_to_num(g, nan=np.nanmean(g)))
    sl = np.pi / 2 - np.arctan(np.hypot(gx, gy)); asp = np.arctan2(-gx, gy)
    a, b = np.radians(az), np.radians(alt)
    return np.clip(np.sin(b) * np.sin(sl) + np.cos(b) * np.cos(sl) * np.cos(a - asp), 0, 1)
def relief(g, r=12):
    f = np.nan_to_num(g, nan=np.nanmean(g)); return f - ndi.uniform_filter(f, 2 * r + 1)
if __name__ == '__main__':
    slug = sys.argv[1]; g, s, z = load(slug)
    h = shade(g); can = np.nan_to_num(s - g); rl = relief(g)
    rgb = np.dstack([h * 235 + 20] * 3)
    tree = can > 2.5
    rgb[tree] = rgb[tree] * [0.45, 0.62, 0.45]
    lo = rl < -0.45; hi = rl > 0.35
    rgb[lo & ~tree] = [235, 215, 150]; rgb[hi & ~tree] = rgb[hi & ~tree] * [0.75, 1.0, 0.75]
    water = (np.abs(np.gradient(np.nan_to_num(g))[0]) + np.abs(np.gradient(np.nan_to_num(g))[1]) < 0.003) & (g < 3)
    rgb[water] = [170, 205, 225]
    im = Image.fromarray(np.clip(rgb, 0, 255).astype('uint8'))
    im.save(f'/tmp/ms/lidar-{slug}.png'); print(im.size)
