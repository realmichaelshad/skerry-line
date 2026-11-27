// Where the sun is, from the NOAA solar position equations (Meeus, low precision): declination and the equation of
// time from Julian centuries, then the hour angle for the place. Accurate to well under a minute for sunrise and
// sunset at these latitudes. The moon is approximate: its phase is real (from a known new moon and the synodic
// month), its path is the sun's path delayed by the moon's age, on the celestial equator.

export const PLACE = {
  name: 'Harrowick',
  /** Same latitude and longitude as Stornoway, so the sun times can be checked against a published almanac. */
  lat: 58 + 13 / 60,
  lon: -(6 + 23 / 60),
  timeZone: 'Europe/London',
};

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export function julianDay(utcMs: number): number {
  return utcMs / 86400000 + 2440587.5;
}

export interface SunPos {
  /** Geometric elevation in degrees (no refraction). */
  elev: number;
  /** Azimuth in degrees, clockwise from north. */
  az: number;
  /** Hour angle in degrees (0 at local solar noon). */
  ha: number;
  decl: number;
}

export function sunPosition(utcMs: number, lat = PLACE.lat, lon = PLACE.lon): SunPos {
  const jd = julianDay(utcMs);
  const T = (jd - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const L0r = L0 * RAD;
  const eot = 4 * DEG * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  const utcMin = (((utcMs / 60000) % 1440) + 1440) % 1440;
  const tst = (((utcMin + eot + 4 * lon) % 1440) + 1440) % 1440;
  const ha = tst / 4 - 180;
  return { ...altAz(ha, decl, lat), ha, decl };
}

/** Elevation and azimuth for an hour angle and declination (degrees). */
export function altAz(ha: number, decl: number, lat: number): { elev: number; az: number } {
  const latr = lat * RAD, dr = decl * RAD, har = ha * RAD;
  const cz = Math.sin(latr) * Math.sin(dr) + Math.cos(latr) * Math.cos(dr) * Math.cos(har);
  const zen = Math.acos(Math.max(-1, Math.min(1, cz)));
  const elev = 90 - zen * DEG;
  // Azimuth measured from north, clockwise.
  const az = (Math.atan2(Math.sin(har), Math.cos(har) * Math.sin(latr) - Math.tan(dr) * Math.cos(latr)) * DEG + 180 + 360) % 360;
  return { elev, az };
}

// ---------------------------------------------------------------- the moon (approximate)

const SYNODIC = 29.530588853;
/** A new moon: 2000-01-06 18:14 UTC. */
export const NEW_MOON_JD = 2451550.26;

export interface MoonPos { elev: number; az: number; age: number; illum: number; waxing: boolean; }

export function moonPosition(utcMs: number, lat = PLACE.lat): MoonPos {
  const jd = julianDay(utcMs);
  const age = ((((jd - NEW_MOON_JD) / SYNODIC) % 1) + 1) % 1;
  const sun = sunPosition(utcMs);
  // The moon trails the sun by its age (a full moon is opposite the sun); approximate path on the equator.
  const ha = ((sun.ha - age * 360 + 540) % 360) - 180;
  const { elev, az } = altAz(ha, 0, lat);
  return { elev, az, age, illum: (1 - Math.cos(age * 2 * Math.PI)) / 2, waxing: age < 0.5 };
}
