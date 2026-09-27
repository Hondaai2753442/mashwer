window.MASHAWER_CONFIG = {
  SUPABASE_URL: 'https://wjlhkvkanvssxvveljan.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable__XLHpBh1G4AAr64R2HRX-g_3KjDmcfQ',
  MAPS_API_BASE: '/api/maps',
  MAP_DEFAULT_CENTER: [31.1107, 30.9398],
  // Local fallback only. Cloudflare should proxy these endpoints in production.
  GEOCODING_URL: 'https://nominatim.openstreetmap.org/search',
  REVERSE_GEOCODING_URL: 'https://nominatim.openstreetmap.org/reverse',
  ROUTING_URL: 'https://router.project-osrm.org/route/v1/driving',
  MAP_TILE_URL: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  MAP_TILE_ATTRIBUTION: 'Tiles &copy; Esri',
  ALLOW_DIRECT_MAP_FALLBACK: true
};
