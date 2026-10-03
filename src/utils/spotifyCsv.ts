/**
 * Chosic / Exportify style Spotify playlist CSV parser.
 * Detects Song/Track + Artist columns (same rules as Musify).
 */

export type SpotifyCsvRow = {
  index: number;
  title: string;
  artist: string;
};

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && i + 1 < input.length && input[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && i + 1 < input.length && input[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((v) => v.trim().length > 0)) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((v) => v.trim().length > 0)) rows.push(row);
  }
  return rows;
}

function isNameColumn(header: string): boolean {
  return (
    !header.includes('id') &&
    !header.includes('uri') &&
    !header.includes('url') &&
    !header.includes('genre')
  );
}

export function extractSpotifyTracks(csvText: string): {
  rows: SpotifyCsvRow[];
  error?: string;
} {
  const records = parseCsv(csvText);
  if (records.length < 2) {
    return { rows: [], error: 'CSV empty or invalid' };
  }

  const headers = records[0].map((h) =>
    h.replace(/^\uFEFF/, '').trim().toLowerCase()
  );

  const songIndex = headers.findIndex(
    (h) => (h.includes('song') || h.includes('track')) && isNameColumn(h)
  );
  const artistIndex = headers.findIndex(
    (h) => h.includes('artist') && isNameColumn(h)
  );

  if (songIndex === -1 || artistIndex === -1) {
    return {
      rows: [],
      error: 'Need Song/Track and Artist columns (Chosic CSV)',
    };
  }

  const rows: SpotifyCsvRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const r = records[i];
    if (r.length <= songIndex || r.length <= artistIndex) continue;
    const title = (r[songIndex] || '').trim();
    const artist = (r[artistIndex] || '').trim();
    if (!title) continue;
    rows.push({ index: rows.length, title, artist });
  }

  if (!rows.length) return { rows: [], error: 'No songs found in CSV' };
  return { rows };
}
