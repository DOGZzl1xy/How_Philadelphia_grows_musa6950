// The assistant's data: /data/explore/tables.json (built by pipeline/export_explore.py, the same file the page reads),
// parsed once per isolate. Aggregates only: 250 m cells, 2019 block groups, ZIP codes, neighbourhoods, city results.

export type Row = Record<string, any>;
export interface Tables {
  city: Row;
  by: Record<string, Row[]>;
  cells: Record<string, Row>;
  bgs: Record<string, Row>;
  zips: Record<string, Row>;
  hoods: Record<string, Row>;
  tracts: Record<string, Row>;
  places: { hoods: Record<string, Row>; zips: Record<string, Row>; tracts: Record<string, Row> };
  stations: Record<string, Row>;
}

let cache: Promise<Tables> | null = null;

const rows = (t: { cols: string[]; rows: any[][] }) =>
  Object.fromEntries(t.rows.map((r) => [String(r[0]), Object.fromEntries(t.cols.slice(1).map((c, i) => [c, r[i + 1]]))]));

export function tables(assets: Fetcher, origin: string): Promise<Tables> {
  if (!cache) {
    cache = assets.fetch(new Request(`${origin}/data/explore/tables.json`)).then(async (res) => {
      if (!res.ok) throw new Error(`tables.json: ${res.status}`);
      const t: any = await res.json();
      return { city: t.city, by: t.by, cells: rows(t.cells), bgs: rows(t.bgs), zips: rows(t.zips), hoods: rows(t.hoods), tracts: rows(t.tracts),
        places: t.places, stations: t.stations };
    });
    cache.catch(() => (cache = null));
  }
  return cache;
}
