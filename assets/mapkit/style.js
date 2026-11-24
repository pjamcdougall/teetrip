/* TeeTrip road map style. Map engine by Islandwise Technologies.
   Paper and ink: cream land, soft blue water, roads drawn in ink with white fill. Nothing but land, water,
   roads, ferries, place names and the grounds of golf courses. Green and gold are kept for TeeTrip's own marks. */
'use strict';
window.TTMapStyle = (function () {
  const C = {
    water: '#C7DDE6', waterLine: '#A4C5D3', waterLabel: '#4E7F95',
    earth: '#F6F2E8', golf: '#D5E6C8', golfLine: '#B4D0A6',
    hwy: '#FFFDF8', hwyCase: '#4E5B54', hwyLow: '#737D76',
    major: '#FFFFFF', majorCase: '#6F7972', majorLow: '#737D76',
    minor: '#FFFFFF', minorCase: '#A9A394', minorLow: '#C2BCAD',
    ferry: '#4E7F95', bridge: '#1B2620',
    label: '#1B2620', label2: '#55615A', halo: 'rgba(246,242,232,0.94)',
  };
  const FONT = { r: ['NotoSans-Regular'], m: ['NotoSans-Medium'], i: ['NotoSans-Regular'] };
  const name = ['coalesce', ['get', 'name:en'], ['get', 'name']];
  const minz = ['<=', ['coalesce', ['get', 'min_zoom'], 0], ['+', ['zoom'], 1.2]];
  /* well-known Island places come in a little earlier than the other villages, so names do not all appear at one zoom */
  const EARLY = ['in', ['get', 'name'], ['literal', ['Cavendish', 'Kensington', 'Montague', 'Souris', 'Georgetown', 'Tignish', 'Alberton', "O'Leary", 'Murray River', 'Morell', 'St. Peters Bay', 'Saint Peters Bay', 'North Rustico', 'Victoria', 'Wood Islands', 'Borden-Carleton', 'Cornwall', 'Stratford', 'Wellington', 'Murray Harbour', 'Tyne Valley', 'Mount Stewart', 'Hunter River', 'Crapaud']]];
  const isLine = ['==', ['geometry-type'], 'LineString'];
  const isPoly = ['==', ['geometry-type'], 'Polygon'];

  function build(opts) {
    const c = C, L = [], src = 'base';
    const add = (o) => L.push(Object.assign({ source: src }, o));
    /* the bridge by name on the Island side; the mainland half has no name in the map data, so it is picked out by its route number inside the strait */
    const BRIDGE = ['any', ['==', ['get', 'name'], 'Confederation Bridge'], ['all', ['==', ['get', 'ref'], 'NB 16;TCH'], ['within', { type: 'Polygon', coordinates: [[[-63.835, 46.158], [-63.803, 46.150], [-63.688, 46.248], [-63.712, 46.264], [-63.835, 46.158]]] }]]];
    L.push({ id: 'bg', type: 'background', paint: { 'background-color': c.water } });
    add({ id: 'earth', type: 'fill', 'source-layer': 'earth', paint: { 'fill-color': c.earth } });
    add({ id: 'golf', type: 'fill', 'source-layer': 'landuse', minzoom: 10.5, filter: ['all', isPoly, ['==', ['get', 'kind'], 'golf_course']],
      paint: { 'fill-color': c.golf, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 0, 11.5, 0.9] } });
    add({ id: 'golf-edge', type: 'line', 'source-layer': 'landuse', minzoom: 13, filter: ['all', isPoly, ['==', ['get', 'kind'], 'golf_course']],
      paint: { 'line-color': c.golfLine, 'line-width': 1, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.9] } });
    add({ id: 'water-line', type: 'line', 'source-layer': 'water', filter: isLine, minzoom: 9, paint: {
      'line-color': c.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, ['match', ['get', 'kind'], 'river', 3, 1.2], 18, ['match', ['get', 'kind'], 'river', 8, 2.5]] } });
    add({ id: 'water', type: 'fill', 'source-layer': 'water', filter: isPoly, paint: { 'fill-color': c.water } });
    add({ id: 'coast', type: 'line', 'source-layer': 'earth', paint: { 'line-color': c.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 12, 1.1, 16, 1.8] } });
    // roads
    const rk = ['get', 'kind'];
    const W = (h, m, n) => ['match', rk, 'highway', h, 'major_road', m, 'minor_road', n, 0];
    const roadW = ['interpolate', ['exponential', 1.6], ['zoom'], 6, W(0.75, 0.6, 0), 8, W(1.15, 1.0, 0), 10, W(1.9, 1.25, 0.35), 14, W(4.5, 3.4, 1.6), 18, W(18, 14, 9)];
    const roadCase = ['interpolate', ['exponential', 1.6], ['zoom'], 5, W(0.9, 0.3, 0), 10, W(2.4, 1.6, 0.6), 14, W(6.7, 5.1, 2.8), 18, W(22, 17, 11)];
    const roadF = ['in', rk, ['literal', ['highway', 'major_road', 'minor_road']]];
    const notTunnel = ['!=', ['get', 'is_tunnel'], true];
    const round = { 'line-cap': 'round', 'line-join': 'round' };
    /* The road tiles carry ferry routes only from z11, so further out the Wood Islands crossing is drawn from its own line (taken from the same map data). */
    L.push({ id: 'ferry-over', type: 'line', source: 'ferry', maxzoom: 11, paint: { 'line-color': c.ferry, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 11, 1.9], 'line-dasharray': [3, 2.5], 'line-opacity': 0.9 } });
    add({ id: 'ferry', type: 'line', 'source-layer': 'roads', minzoom: 11, filter: ['==', rk, 'ferry'], paint: {
      'line-color': c.ferry, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.9, 12, 2], 'line-dasharray': [3, 2.5], 'line-opacity': 0.9 } });
    add({ id: 'road-tunnel', type: 'line', 'source-layer': 'roads', filter: ['all', roadF, ['==', ['get', 'is_tunnel'], true]], minzoom: 11,
      paint: { 'line-color': c.majorCase, 'line-width': roadW, 'line-dasharray': [2, 1.5], 'line-opacity': 0.7 } });
    add({ id: 'road-service-case', type: 'line', 'source-layer': 'roads', minzoom: 14, filter: ['all', ['==', rk, 'other'], notTunnel], layout: round,
      paint: { 'line-color': c.minorCase, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 14, 1.6, 16, 3.6, 18, 8], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.6, 1] } });
    add({ id: 'road-service', type: 'line', 'source-layer': 'roads', minzoom: 14, filter: ['all', ['==', rk, 'other'], notTunnel], layout: round,
      paint: { 'line-color': c.minor, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 14, 0.6, 16, 2.2, 18, 6], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.6, 1] } });
    add({ id: 'road-case', type: 'line', 'source-layer': 'roads', filter: ['all', roadF, notTunnel], layout: Object.assign({ 'line-sort-key': ['get', 'sort_rank'] }, round),
      paint: { 'line-color': ['match', rk, 'highway', c.hwyCase, 'major_road', c.majorCase, c.minorCase], 'line-width': roadCase,
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, ['match', rk, 'highway', 1, 0], 11.5, ['match', rk, 'minor_road', 0, 1], 12.5, 1] } });
    /* far out the roads are single ink lines; from the regional zooms in they open into white roads with an ink edge */
    add({ id: 'road', type: 'line', 'source-layer': 'roads', filter: ['all', roadF, notTunnel], layout: Object.assign({ 'line-sort-key': ['get', 'sort_rank'] }, round),
      paint: { 'line-color': ['interpolate', ['linear'], ['zoom'], 10.5, ['match', rk, 'highway', c.hwyLow, 'major_road', c.majorLow, c.minorLow], 12, ['match', rk, 'highway', c.hwy, 'major_road', c.major, c.minor]], 'line-width': roadW } });
    /* Below z12 the road tiles do not carry the bridge's name, so the overview draws it from its own line. From z12 it comes from the street tiles. */
    L.push({ id: 'bridge-over-case', type: 'line', source: 'bridge', maxzoom: 12.4, layout: { 'line-cap': 'round' }, paint: { 'line-color': c.bridge, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2.2, 9, 3.6, 12, 7], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 11.9, 0.95, 12.4, 0] } });
    L.push({ id: 'bridge-over', type: 'line', source: 'bridge', maxzoom: 12.4, layout: { 'line-cap': 'round' }, paint: { 'line-color': c.hwy, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 9, 1.6, 12, 4], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 11.9, 1, 12.4, 0] } });
    add({ id: 'bridge-confed-case', type: 'line', 'source-layer': 'roads', minzoom: 11.9, filter: BRIDGE,
      paint: { 'line-color': c.bridge, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 3, 12, 7, 16, 16], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 11.9, 0, 12.4, 0.95] } });
    add({ id: 'bridge-confed', type: 'line', 'source-layer': 'roads', minzoom: 11.9, filter: BRIDGE,
      paint: { 'line-color': c.hwy, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.4, 12, 4, 16, 11], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 11.9, 0, 12.4, 1] } });
    // labels
    const halo = { 'text-halo-color': c.halo, 'text-halo-width': 1.4, 'text-halo-blur': 0.4 };
    add({ id: 'water-label', type: 'symbol', 'source-layer': 'water', maxzoom: 12, filter: ['all', ['==', ['geometry-type'], 'Point'], minz, ['in', ['get', 'kind'], ['literal', ['ocean', 'sea', 'strait', 'gulf']]]],
      layout: { 'text-field': name, 'text-font': FONT.i, 'text-size': 13, 'text-letter-spacing': 0.08, 'text-max-width': 8 },
      paint: Object.assign({ 'text-color': c.waterLabel }, halo, { 'text-halo-width': 1 }) });
    L.push({ id: 'ferry-over-label', type: 'symbol', source: 'ferrymid', minzoom: 8.4, maxzoom: 12,
      layout: { 'text-field': 'Ferry to\nNova Scotia', 'text-font': FONT.i, 'text-size': 11, 'text-anchor': 'left', 'text-offset': [0.8, 0], 'text-justify': 'left' },
      paint: Object.assign({ 'text-color': c.waterLabel }, halo) });
    add({ id: 'ferry-label', type: 'symbol', 'source-layer': 'roads', minzoom: 12, filter: ['all', ['==', rk, 'ferry'], ['has', 'name']],
      layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': FONT.i, 'text-size': 11, 'symbol-spacing': 420 },
      paint: Object.assign({ 'text-color': c.waterLabel }, halo) });
    add({ id: 'road-label', type: 'symbol', 'source-layer': 'roads', minzoom: 12, filter: ['all', ['any', roadF, ['all', ['==', rk, 'other'], ['>=', ['zoom'], 15.5]]], ['has', 'name']],
      layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': FONT.r, 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 12.5], 'symbol-spacing': 320 },
      paint: Object.assign({ 'text-color': c.label2 }, halo) });
    add({ id: 'shield', type: 'symbol', 'source-layer': 'roads', minzoom: 8, filter: ['all', ['in', rk, ['literal', ['highway', 'major_road']]], ['has', 'shield_text']],
      layout: { 'symbol-placement': 'line', 'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 8, 260, 14, 520], 'text-field': ['get', 'shield_text'], 'text-font': FONT.m, 'text-size': 9.5,
        'icon-image': ['match', rk, 'highway', 'shield-hwy', 'shield'], 'icon-text-fit': 'both', 'icon-text-fit-padding': [1.5, 4, 1.5, 4], 'text-rotation-alignment': 'viewport', 'icon-rotation-alignment': 'viewport' },
      paint: { 'text-color': ['match', rk, 'highway', '#FFFFFF', c.label] } });
    L.push({ id: 'bridge-label', type: 'symbol', source: 'bridge', minzoom: 8,
      layout: { 'symbol-placement': 'line-center', 'text-field': 'Confederation Bridge', 'text-font': FONT.m, 'text-size': 12, 'text-offset': [0, -1.1] },
      paint: Object.assign({ 'text-color': c.label }, halo) });
    add({ id: 'place-locality', type: 'symbol', 'source-layer': 'places', filter: ['all', ['any', minz, ['all', ['>=', ['zoom'], 9.5], EARLY]], ['==', ['get', 'kind'], 'locality']],
      layout: { 'text-field': name, 'text-font': ['case', ['<=', ['coalesce', ['get', 'population_rank'], 0], 8], ['literal', FONT.r], ['literal', FONT.m]],
        'symbol-sort-key': ['-', 20, ['coalesce', ['get', 'population_rank'], 0]],
        'text-size': ['interpolate', ['linear'], ['zoom'], 6, ['step', ['coalesce', ['get', 'population_rank'], 0], 9, 9, 10.5, 11, 12.5], 12, ['step', ['coalesce', ['get', 'population_rank'], 0], 11.5, 9, 13, 11, 16]],
        'text-max-width': 8, 'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.9, 'text-justify': 'auto', 'text-padding': 1 },
      paint: Object.assign({ 'text-color': c.label2, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 10.6, ['case', ['all', ['>=', ['coalesce', ['get', 'min_zoom'], 0], 11], ['!', EARLY]], 0, 1], 11.05, 1] }, halo) });
    return {
      version: 8, name: 'TeeTrip road map',
      glyphs: opts.base + 'fonts/{fontstack}/{range}.wasm',
      sources: {
        bridge: { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-63.70194, 46.25418], [-63.74691, 46.21424], [-63.75535, 46.2074], [-63.76185, 46.20244], [-63.79803, 46.17669], [-63.8125, 46.1664]] } } },
        ferry: { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-62.74906, 45.95413], [-62.75198, 45.95052], [-62.75009, 45.94082], [-62.71245, 45.87044], [-62.68438, 45.80514], [-62.68125, 45.79907], [-62.6737, 45.78566], [-62.66584, 45.77267], [-62.66361, 45.76767], [-62.66228, 45.7636], [-62.6616, 45.76019], [-62.67696, 45.75013], [-62.68803, 45.73872]] } } },
        ferrymid: { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-62.71245, 45.87044] } } },
        base: { type: 'vector', tiles: ['tt://base/{z}/{x}/{y}'], minzoom: 6, maxzoom: 15 },
      },
      layers: L,
    };
  }
  return { build: build, C: C };
})();
