export interface DdbCharacter {
  id: number;
  readonlyUrl: string;
  name: string;
  race: DdbRace;
  classes: DdbClass[];
  level: number;
  background: DdbBackground;
  stats: DdbAbilityScore[];
  bonusStats: DdbAbilityScore[];
  overrideStats: DdbAbilityScore[];
  baseHitPoints: number;
  bonusHitPoints: number | null;
  overrideHitPoints: number | null;
  removedHitPoints: number;
  temporaryHitPoints: number;
  currentXp: number;
  alignmentId: number;
  lifestyleId: number;
  currencies: DdbCurrencies;
  spells: DdbSpellsContainer;
  inventory: DdbInventoryItem[];
  deathSaves: DdbDeathSaves;
  traits: DdbTraits;
  preferences: Record<string, unknown>;
  configuration: Record<string, unknown>;
  actions: Record<string, DdbAction[]>;
  modifiers: Record<string, DdbModifier[]>;
  campaign: { id: number; name: string } | null;
}

export interface DdbRace {
  fullName: string;
  baseRaceName: string;
  isHomebrew: boolean;
}

export interface DdbClass {
  id: number;
  definition: { name: string };
  subclassDefinition: { name: string } | null;
  level: number;
  isStartingClass: boolean;
}

export interface DdbBackground {
  definition: { name: string; description: string } | null;
}

export interface DdbAbilityScore {
  id: number; // 1=STR, 2=DEX, 3=CON, 4=INT, 5=WIS, 6=CHA
  value: number | null;
}

export interface DdbCurrencies {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface DdbSpellsContainer {
  race: DdbSpell[];
  class: DdbSpell[];
  background: DdbSpell[];
  item: DdbSpell[];
  feat: DdbSpell[];
}

export interface DdbSpell {
  id: number;
  definition: {
    name: string;
    level: number;
    school: string;
    description: string;
    range: { origin: string; value: number | null };
    duration: { durationType: string; durationInterval: number | null };
    castingTime: { castingTimeInterval: number };
    components: number[]; // 1=V, 2=S, 3=M
    concentration: boolean;
    ritual: boolean;
  };
  prepared: boolean;
  alwaysPrepared: boolean;
  usesSpellSlot: boolean;
}

export interface DdbInventoryItem {
  id: number;
  definition: {
    name: string;
    description: string;
    type: string;
    rarity: string;
    weight: number;
    cost: number | null;
    isHomebrew: boolean;
  };
  equipped: boolean;
  quantity: number;
}

export interface DdbDeathSaves {
  failCount: number | null;
  successCount: number | null;
  isStabilized: boolean;
}

export interface DdbTraits {
  personalityTraits: string | null;
  ideals: string | null;
  bonds: string | null;
  flaws: string | null;
  appearance: string | null;
}

export interface DdbLimitedUse {
  maxUses: number;
  numberUsed: number;
  resetType: number; // 1 = Long Rest, 2 = Short Rest
  resetTypeDescription: string;
}

export interface DdbAction {
  id: number;
  entityTypeId: number;
  name: string;
  componentId: number;
  componentTypeId: number;
  limitedUse: DdbLimitedUse | null;
}

export interface DdbModifier {
  id: string | number;
  type: string;
  subType: string;
  value: number | null;
  friendlyTypeName: string;
  friendlySubtypeName: string;
  componentId: number;
  componentTypeId: number;
}

export interface CharacterSummary {
  id: number;
  name: string;
  race: string;
  classes: string;
  level: number;
  hp: { current: number; max: number; temp: number };
  ac: number;
  campaignName: string | null;
}
