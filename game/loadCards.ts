import { parseCsv } from './parseCsv';

export const DEFAULT_SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRoB5uoPb0NOmZAr7G9t2CVzOgJI26OYMgA4ugyqwtaC5fXSaRu-32W7gPqyIAkgZp1r-04sJTj9FC4/pub?output=csv';
export const DEFAULT_FALLBACK_URL = '/data/cards.json';

const EXPECTED_HEADER = ['type', 'name_en', 'name_th', 'effect_th', 'code'];

export interface Card {
  type: string;
  en: string;
  th: string;
  effect: string;
  code: string;
}

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  text?: () => Promise<string>;
  json?: () => Promise<unknown>;
}

export type FetchLike = (url: string) => Promise<FetchLikeResponse>;

export interface LoadCardsOptions {
  sheetUrl?: string;
  fallbackUrl?: string;
  fetchImpl?: FetchLike;
}

export interface LoadCardsResult {
  cards: Card[];
  source: 'sheet' | 'fallback';
}

interface FallbackCardEntry {
  code: string;
  name_en?: string;
  name_th?: string;
  description_en?: string;
  description_th?: string;
  // legacy aliases for backward compatibility
  en?: string;
  th?: string;
  effect?: string;
}

interface FallbackJson {
  action?: FallbackCardEntry[];
  counter?: FallbackCardEntry[];
  trap?: FallbackCardEntry[];
}

function rowsToCards(rows: string[][]): Card[] {
  const [header, ...dataRows] = rows;
  if (!header || EXPECTED_HEADER.some((col, i) => header[i] !== col)) {
    throw new Error('unexpected CSV header shape');
  }
  return dataRows
    .filter((row) => row.length >= 5 && row[4])
    .map((row) => ({ type: row[0], en: row[1], th: row[2], effect: row[3], code: row[4] }));
}

function fallbackJsonToCards(json: FallbackJson): Card[] {
  const cards: Card[] = [];
  for (const type of ['action', 'counter', 'trap'] as const) {
    for (const c of json[type] || []) {
      cards.push({
        type,
        en: c.name_en ?? c.en ?? '',
        th: c.name_th ?? c.th ?? '',
        effect: c.description_th ?? c.effect ?? '',
        code: c.code,
      });
    }
  }
  return cards;
}

export async function loadCards({
  sheetUrl = DEFAULT_SHEET_CSV_URL,
  fallbackUrl = DEFAULT_FALLBACK_URL,
  fetchImpl = (url: string) => fetch(url),
}: LoadCardsOptions = {}): Promise<LoadCardsResult> {
  let sheetError: Error | undefined;
  try {
    const res = await fetchImpl(sheetUrl);
    if (!res.ok) throw new Error(`sheet fetch failed with status ${res.status}`);
    const text = await res.text!();
    const cards = rowsToCards(parseCsv(text));
    if (cards.length === 0) throw new Error('sheet returned no cards');
    return { cards, source: 'sheet' };
  } catch (err) {
    sheetError = err as Error;
  }
  try {
    const res = await fetchImpl(fallbackUrl);
    if (!res.ok) throw new Error(`fallback fetch failed with status ${res.status}`);
    const json = (await res.json!()) as FallbackJson;
    return { cards: fallbackJsonToCards(json), source: 'fallback' };
  } catch (fallbackError) {
    throw new Error(
      `failed to load cards from sheet (${sheetError?.message}) and fallback (${(fallbackError as Error).message})`,
      { cause: fallbackError }
    );
  }
}

export function indexCardsByCode<T extends { code: string }>(cards: T[]): Map<string, T> {
  return new Map(cards.map((c) => [c.code, c]));
}
