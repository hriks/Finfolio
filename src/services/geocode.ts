// Reverse-geocode lat/lon → human-readable place name via OpenStreetMap
// Nominatim. Free, no API key. Their TOS requires a real User-Agent and
// max ~1 req/sec — fine for our use case (manual entry only).
//
// Returns a compact label like "Indiranagar, Bengaluru" derived from the
// `address` object, falling back to `display_name`, then to `null`.

interface NominatimAddress {
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  country?: string;
}

interface NominatimResponse {
  display_name?: string;
  address?: NominatimAddress;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

const compactLabel = (
  addr: NominatimAddress | undefined,
  fallback: string | undefined,
): string | null => {
  if (addr) {
    const locality = addr.neighbourhood ?? addr.suburb ?? addr.city_district ?? addr.road;
    const place = addr.city ?? addr.town ?? addr.village;
    if (locality && place) return `${locality}, ${place}`;
    if (locality) return locality;
    if (place) return place;
    if (addr.state) return addr.state;
  }
  if (fallback) {
    // Nominatim's display_name is comma-joined and very long; keep first 2 parts.
    const parts = fallback
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
    return parts[0] ?? null;
  }
  return null;
};

export const reverseGeocode = async (lat: number, lon: number): Promise<string | null> => {
  try {
    const url = `${ENDPOINT}?lat=${lat}&lon=${lon}&format=json&zoom=16&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        // Nominatim TOS: identify the app.
        'User-Agent': 'ExpenseManager/1.0 (https://github.com/hriks)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimResponse;
    return compactLabel(data.address, data.display_name);
  } catch {
    return null;
  }
};

// Matches "12.34567, 78.90123" or similar coord-pair strings — used to detect
// legacy entries whose locationName is just the raw coordinates.
const COORD_PAIR_RE = /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/;

export const looksLikeCoordsString = (s: string | null | undefined): boolean =>
  !!s && COORD_PAIR_RE.test(s.trim());
