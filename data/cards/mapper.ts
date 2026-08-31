import type { Card, CardType } from '../../types/card';

export interface RawCard {
  code: string;
  name_en: string;
  name_th: string;
  description_en: string;
  description_th: string;
}

export function parseCardNumber(code: string): number {
  const digits = code.replace(/^[A-Za-z]+/, '');
  const parsed = parseInt(digits, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid card code format: ${code}`);
  }
  return parsed;
}

export function getCardImagePath(type: CardType, id: string): string {
  return `/cards/${type}/${id}.jpg`;
}

export function mapRawCard(raw: RawCard, type: CardType): Card {
  return {
    id: raw.code,
    number: parseCardNumber(raw.code),
    type,
    name_en: raw.name_en,
    name_th: raw.name_th,
    description_en: raw.description_en,
    description_th: raw.description_th,
    image: getCardImagePath(type, raw.code),
  };
}
