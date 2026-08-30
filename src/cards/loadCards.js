import { parseCsv } from './parseCsv.js';

export const DEFAULT_SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRoB5uoPb0NOmZAr7G9t2CVzOgJI26OYMgA4ugyqwtaC5fXSaRu-32W7gPqyIAkgZp1r-04sJTj9FC4/pub?output=csv';
export const DEFAULT_FALLBACK_URL = '/data/cards.json';

const EXPECTED_HEADER = ['type', 'name_en', 'name_th', 'effect_th', 'code'];

function rowsToCards(rows) {
  const [header, ...dataRows] = rows;
  if (!header || EXPECTED_HEADER.some((col, i) => header[i] !== col)) {
    throw new Error('unexpected CSV header shape');
  }
  return dataRows
    .filter((row) => row.length >= 5 && row[4])
    .map((row) => ({ type: row[0], en: row[1], th: row[2], effect: row[3], code: row[4] }));
}

function fallbackJsonToCards(json) {
  const cards = [];
  for (const type of ['action', 'counter', 'trap']) {
    for (const c of json[type] || []) {
      cards.push({ type, en: c.en, th: c.th, effect: c.effect, code: c.code });
    }
  }
  return cards;
}

export async function loadCards({
  sheetUrl = DEFAULT_SHEET_CSV_URL,
  fallbackUrl = DEFAULT_FALLBACK_URL,
  fetchImpl = (...args) => fetch(...args),
} = {}) {
  let sheetError;
  try {
    const res = await fetchImpl(sheetUrl);
    if (!res.ok) throw new Error(`sheet fetch failed with status ${res.status}`);
    const text = await res.text();
    const cards = rowsToCards(parseCsv(text));
    if (cards.length === 0) throw new Error('sheet returned no cards');
    return { cards, source: 'sheet' };
  } catch (err) {
    sheetError = err;
  }
  try {
    const res = await fetchImpl(fallbackUrl);
    if (!res.ok) throw new Error(`fallback fetch failed with status ${res.status}`);
    const json = await res.json();
    return { cards: fallbackJsonToCards(json), source: 'fallback' };
  } catch (fallbackError) {
    throw new Error(
      `failed to load cards from sheet (${sheetError?.message}) and fallback (${fallbackError.message})`,
      { cause: fallbackError }
    );
  }
}

export function indexCardsByCode(cards) {
  return new Map(cards.map((c) => [c.code, c]));
}
