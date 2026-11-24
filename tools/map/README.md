# The TeeTrip map

Roads and the 18 course pins on our own street-level map engine. Nothing is loaded from another server when the map is viewed.

## What is where

- `assets/mapkit/maplibre-gl.js` the open-source drawing library (MapLibre GL JS 4.7.1, BSD licence, licence text beside it).
- `assets/mapkit/tilework.js` our tile worker: picks the most detailed stored tile, cuts one out of a coarser tile where none is stored, retries failed downloads.
- `assets/mapkit/style.js` the paper-and-ink style in TeeTrip colours.
- `assets/mapkit/fonts/` Noto Sans letter shapes for the map (SIL Open Font Licence).
- `assets/mapkit/tiles/` the map itself: OpenStreetMap data (ODbL) in the Protomaps layout, cut down to land, water, roads, ferries, place names and golf course grounds.
- `assets/map.<hash>.js` the map page script (pins, cards, the stay picker, the fallback).

## Rebuilding

1. `python3 tools/map/cut_tiles.py <folder with the regional tile archives>` cuts the tiles and writes `tools/map/budget.json`.
2. `python3 tools/map/build_page.py` builds the page script from `tools/map/web/` and refreshes `map/index.html`.

Binary files end in `.wasm` only so every host serves them as plain binary; they are not programs.

## Rules the map keeps

- Drawn: land, water, shoreline, every road with names and route numbers, ferries (dashed), the Confederation Bridge, town and village names, golf course grounds as a soft green shape, the 18 course pins.
- Not drawn: any other place, building, park, trail, hill shading or 3D.
- Pin positions, names, towns, holes, par and drive times come from the site's own data. Pins that would sit on top of each other are nudged apart on screen (never more than 30 pixels); Brudenell River and Dundarave share one position on file.
