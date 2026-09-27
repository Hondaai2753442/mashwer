const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=30',
  'access-control-allow-origin': '*'
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function upstreamBase(env, key, fallback) {
  return String(env[key] || fallback).replace(/\/$/, '');
}

async function proxy(url, env, cacheSeconds = 30) {
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'accept-language': 'ar,en;q=0.8',
      'user-agent': 'Mashwer/1.0 (map service proxy)'
    }
  });
  if (!response.ok) return json({ error: 'map_provider_error' }, 502);
  const body = await response.json();
  const result = json(body, 200, { 'cache-control': `public, max-age=${cacheSeconds}` });
  await caches.default.put(cacheKey, result.clone());
  return result;
}

function mapRequest(url, env) {
  if (url.pathname === '/api/maps/geocode') {
    const q = String(url.searchParams.get('q') || '').trim();
    if (!q) return json({ error: 'missing_query' }, 400);
    const endpoint = new URL(`${upstreamBase(env, 'GEOCODING_URL', 'https://nominatim.openstreetmap.org')}/search`);
    endpoint.searchParams.set('format', 'jsonv2');
    endpoint.searchParams.set('limit', '1');
    endpoint.searchParams.set('countrycodes', 'eg');
    endpoint.searchParams.set('accept-language', 'ar');
    endpoint.searchParams.set('q', q);
    return proxy(endpoint, env, 300);
  }
  if (url.pathname === '/api/maps/reverse') {
    const lat = url.searchParams.get('lat');
    const lon = url.searchParams.get('lon');
    if (!lat || !lon) return json({ error: 'missing_coordinates' }, 400);
    const endpoint = new URL(`${upstreamBase(env, 'GEOCODING_URL', 'https://nominatim.openstreetmap.org')}/reverse`);
    endpoint.searchParams.set('format', 'jsonv2');
    endpoint.searchParams.set('zoom', '18');
    endpoint.searchParams.set('accept-language', 'ar');
    endpoint.searchParams.set('lat', lat);
    endpoint.searchParams.set('lon', lon);
    return proxy(endpoint, env, 300);
  }
  if (url.pathname === '/api/maps/route') {
    const pickup = String(url.searchParams.get('pickup') || '');
    const destination = String(url.searchParams.get('destination') || '');
    if (!pickup || !destination) return json({ error: 'missing_route_points' }, 400);
    const endpoint = new URL(`${upstreamBase(env, 'ROUTING_URL', 'https://router.project-osrm.org')}/route/v1/driving/${pickup};${destination}`);
    endpoint.searchParams.set('overview', 'full');
    endpoint.searchParams.set('alternatives', 'false');
    endpoint.searchParams.set('steps', 'false');
    endpoint.searchParams.set('geometries', 'geojson');
    return proxy(endpoint, env, 30);
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/maps/')) return mapRequest(url, env) || json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(request);
  }
};
