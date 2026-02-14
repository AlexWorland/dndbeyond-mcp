export interface SpellSearchParams {
  name?: string;
  level?: number;
  class?: string;
  school?: string;
  concentration?: boolean;
  ritual?: boolean;
}

export interface MonsterSearchParams {
  name?: string;
  cr?: number;
  type?: string;
  size?: string;
  environment?: string;
  page?: number;
  showHomebrew?: boolean;
}

export interface ItemSearchParams {
  name?: string;
  rarity?: string;
  type?: string;
  attunement?: boolean;
}

export interface FeatSearchParams {
  name?: string;
  prerequisite?: string;
}

export interface RaceSearchParams {
  name?: string;
}

export interface BackgroundSearchParams {
  name?: string;
}
