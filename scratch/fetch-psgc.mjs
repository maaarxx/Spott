import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://psgc.gitlab.io/api";
const get = async (f) => {
  const r = await fetch(`${BASE}/${f}`);
  if (!r.ok) throw new Error(`${f}: ${r.status}`);
  return r.json();
};

const [regions, provinces, cities] = await Promise.all([
  get("regions.json"),
  get("provinces.json"),
  get("cities-municipalities.json"),
]);

const out = {
  source: BASE,
  fetchedAt: new Date().toISOString(),
  regions: regions.map((r) => ({ code: r.code, name: r.name, regionName: r.regionName })),
  provinces: provinces.map((p) => ({ code: p.code, name: p.name, regionCode: p.regionCode })),
  cities: cities.map((c) => ({
    code: c.code,
    name: c.name,
    regionCode: c.regionCode,
    provinceCode: c.provinceCode || null, // null for NCR and independent cities
    districtCode: c.districtCode || null,
  })),
};

mkdirSync("data", { recursive: true });
writeFileSync("data/psgc.json", JSON.stringify(out));
console.log({
  regions: out.regions.length,
  provinces: out.provinces.length,
  cities: out.cities.length,
  citiesWithoutProvince: out.cities.filter((c) => !c.provinceCode).length,
});