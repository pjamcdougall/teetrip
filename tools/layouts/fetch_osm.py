"""Download OpenStreetMap data around each course (OSM API, ODbL). Run: python3 fetch_osm.py"""
import json, os, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, '../../assets/plan-data.27ec6bbe.json')))
PAD = {'default': (0.022, 0.015)}
for c in D['courses']:
    lon, lat = c['ll']; dx, dy = PAD.get(c['id'], PAD['default'])
    out = os.path.join(HERE, 'osm', c['slug'] + '.osm')
    if os.path.exists(out) and os.path.getsize(out) > 2000: continue
    url = f'https://api.openstreetmap.org/api/0.6/map?bbox={lon-dx:.5f},{lat-dy:.5f},{lon+dx:.5f},{lat+dy:.5f}'
    req = urllib.request.Request(url, headers={'User-Agent': 'TeeTrip course layouts (hello@teetrip.ca)'})
    try:
        data = urllib.request.urlopen(req, timeout=90).read(); open(out, 'wb').write(data); print(c['slug'], len(data) // 1024, 'KB')
    except Exception as e: print(c['slug'], 'FAILED', e)
    time.sleep(2)
