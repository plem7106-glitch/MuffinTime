import { describe, it, expect } from 'vitest';
import { loadCards, indexCardsByCode, DEFAULT_SHEET_CSV_URL, DEFAULT_FALLBACK_URL } from './loadCards.js';

const CSV_TEXT = 'type,name_en,name_th,effect_th,code\naction,Alien Invasion,เอเลี่ยนบุก,มอบการ์ดทั้งหมด,A02\n';

function fakeFetch(responses) {
  let call = 0;
  return async (url) => {
    const r = responses[call];
    call++;
    return r(url);
  };
}

describe('loadCards', () => {
  it('loads and parses cards from the sheet when the fetch succeeds', async () => {
    const fetchImpl = fakeFetch([
      async () => ({ ok: true, status: 200, text: async () => CSV_TEXT }),
    ]);
    const { cards, source } = await loadCards({ fetchImpl });
    expect(source).toBe('sheet');
    expect(cards).toEqual([
      { type: 'action', en: 'Alien Invasion', th: 'เอเลี่ยนบุก', effect: 'มอบการ์ดทั้งหมด', code: 'A02' },
    ]);
  });

  it('falls back to the bundled JSON when the sheet fetch fails', async () => {
    const fallbackJson = {
      action: [{ en: 'Alien Invasion', th: 'เอเลี่ยนบุก', effect: 'มอบการ์ดทั้งหมด', code: 'A02' }],
      counter: [],
      trap: [],
    };
    const fetchImpl = fakeFetch([
      async () => ({ ok: false, status: 500 }),
      async () => ({ ok: true, status: 200, json: async () => fallbackJson }),
    ]);
    const { cards, source } = await loadCards({ fetchImpl });
    expect(source).toBe('fallback');
    expect(cards).toEqual([
      { type: 'action', en: 'Alien Invasion', th: 'เอเลี่ยนบุก', effect: 'มอบการ์ดทั้งหมด', code: 'A02' },
    ]);
  });

  it('falls back when the sheet CSV header does not match the expected shape', async () => {
    const fallbackJson = { action: [], counter: [], trap: [] };
    const fetchImpl = fakeFetch([
      async () => ({ ok: true, status: 200, text: async () => 'wrong,header\n1,2\n' }),
      async () => ({ ok: true, status: 200, json: async () => fallbackJson }),
    ]);
    const { source } = await loadCards({ fetchImpl });
    expect(source).toBe('fallback');
  });

  it('uses the real published sheet URL and local fallback URL by default', async () => {
    const seenUrls = [];
    const fetchImpl = async (url) => {
      seenUrls.push(url);
      return { ok: true, status: 200, text: async () => CSV_TEXT };
    };
    await loadCards({ fetchImpl });
    expect(seenUrls).toEqual([DEFAULT_SHEET_CSV_URL]);
    expect(DEFAULT_FALLBACK_URL).toBe('/data/cards.json');
  });

  it('indexCardsByCode builds a lookup map keyed by card code', () => {
    const cards = [{ code: 'A02', en: 'Alien Invasion' }];
    const index = indexCardsByCode(cards);
    expect(index.get('A02')).toEqual({ code: 'A02', en: 'Alien Invasion' });
  });
});
