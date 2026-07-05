// open-meteo から天気・波高・水温を取得（lib/weather.py の移植）
// 座標キャッシュは localStorage に保持する。

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL   = "https://archive-api.open-meteo.com/v1/archive";
const MARINE_URL    = "https://marine-api.open-meteo.com/v1/marine";
const CACHE_KEY     = "divelog_coords_cache";

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; }
  catch { return {}; }
}

async function geocode(locationName) {
  const cache = loadCache();
  if (cache[locationName]) return cache[locationName];
  try {
    const params = new URLSearchParams({ name: locationName, count: "1", language: "ja", format: "json" });
    const res = await (await fetch(`${GEOCODING_URL}?${params}`)).json();
    if (res.results?.length) {
      const coords = { lat: res.results[0].latitude, lon: res.results[0].longitude };
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cache, [locationName]: coords }));
      return coords;
    }
  } catch { /* 取得失敗時は null */ }
  return null;
}

function wmoToJa(code) {
  if (code == null) return null;
  if (code === 0) return "快晴";
  if (code >= 1 && code <= 3) return ["晴れ", "晴れ時々曇り", "曇り"][code - 1];
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "雨";
  if (code >= 71 && code <= 77) return "雪";
  return "曇り";
}

function avgRange(hourly, variable, startH, endH) {
  const times  = hourly.time ?? [];
  const values = hourly[variable] ?? [];
  const vals = times
    .map((t, i) => ({ h: parseInt(t.slice(11, 13), 10), v: values[i] }))
    .filter(({ h, v }) => v != null && startH <= h && h <= endH)
    .map(({ v }) => v);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/** 天気・波高・水温を取得。失敗した項目は含まれない。 */
export async function getWeatherAndMarine(location, date, startTime, endTime) {
  const coords = await geocode(location);
  if (!coords) return {};

  const startH = startTime ? parseInt(startTime.split(":")[0], 10) : 0;
  const endH   = endTime   ? parseInt(endTime.split(":")[0], 10)   : 23;
  const result = {};

  try {
    const params = new URLSearchParams({
      latitude: coords.lat, longitude: coords.lon,
      start_date: date, end_date: date,
      hourly: "weathercode", timezone: "Asia/Tokyo",
    });
    const w = await (await fetch(`${WEATHER_URL}?${params}`)).json();
    const hourly = w.hourly ?? {};
    for (let i = 0; i < (hourly.time ?? []).length; i++) {
      const h = parseInt(hourly.time[i].slice(11, 13), 10);
      if (startH <= h && h <= endH) {
        result.weather = wmoToJa(hourly.weathercode[i]);
        break;
      }
    }
  } catch { /* skip */ }

  try {
    const params = new URLSearchParams({
      latitude: coords.lat, longitude: coords.lon,
      start_date: date, end_date: date,
      hourly: "wave_height,sea_surface_temperature", timezone: "Asia/Tokyo",
    });
    const m = await (await fetch(`${MARINE_URL}?${params}`)).json();
    const hourly = m.hourly ?? {};
    const wh = avgRange(hourly, "wave_height", startH, endH);
    const wt = avgRange(hourly, "sea_surface_temperature", startH, endH);
    if (wh != null) result.wave_height = wh;
    if (wt != null) result.water_temp = wt;
  } catch { /* skip */ }

  return result;
}
