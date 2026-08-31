export type CardType = 'action' | 'trap' | 'counter';

export type ExecutionTier = 'automated' | 'prompt_outcome' | 'social_honor';

export interface Card {
  id: string;
  number: number;
  type: CardType;

  name_en: string;
  name_th: string;

  description_en: string;
  description_th: string;

  category?: string;
  executionTier?: ExecutionTier;

  image?: string;
}
