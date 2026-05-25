export interface DdbCharacter {
  id: number;
  readonlyUrl: string;
  name: string;
  race: DdbRace;
  classes: DdbClass[];
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
  customItems?: DdbCustomItem[];
  deathSaves: DdbDeathSaves;
  traits: DdbTraits;
  preferences: Record<string, unknown>;
  configuration: Record<string, unknown>;
  actions: Record<string, DdbAction[]>;
  modifiers: Record<string, DdbModifier[]>;
  campaign: { id: number; name: string } | null;
  feats: DdbFeat[];
  notes: DdbNotes;
  level?: number;
  pactMagic?: Array<{
    level: number;
    used: number;
    available: number;
  }> | {
    level: number;
    used: number;
    available: number;
  } | null;
  classSpells?: DdbClassSpells[];
  spellSlots?: Array<{
    level: number;
    used: number;
    available: number;
  }>;
  hitDiceUsed?: number;
}

export interface DdbRace {
  fullName: string;
  baseRaceName: string;
  isHomebrew: boolean;
  racialTraits: DdbRacialTrait[];
}

export interface DdbClass {
  id: number;
  definition: { id: number; name: string };
  subclassDefinition: { name: string; classFeatures: DdbClassFeature[] } | null;
  level: number;
  isStartingClass: boolean;
  classFeatures: DdbClassFeature[];
}

export interface DdbBackground {
  definition: {
    name: string;
    description: string;
    featureName: string | null;
    featureDescription: string | null;
    snippet: string | null;
    skillProficienciesDescription: string | null;
    toolProficienciesDescription: string | null;
    equipmentDescription: string | null;
  } | null;
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
  race: DdbSpell[] | null;
  class: DdbSpell[] | null;
  background: DdbSpell[] | null;
  item: DdbSpell[] | null;
  feat: DdbSpell[] | null;
}

export interface DdbClassSpells {
  entityTypeId: number;
  characterClassId: number;
  spells: DdbSpell[];
}

export interface DdbSpell {
  id: number;
  entityTypeId?: number;
  spellListId?: number | null;
  characterClassId?: number;
  definition: {
    id?: number;
    name: string;
    level: number;
    school: string;
    description: string;
    range: {
      origin: string;
      rangeValue: number | null;
      aoeType: string | null;
      aoeValue: number | null;
    } | null;
    duration: {
      durationInterval: number | null;
      durationUnit: string | null; // "Hour", "Minute", etc.
      durationType: string; // "Concentration" or "Time"
    } | null;
    activation: {
      activationTime: number;
      activationType: number; // 1=Action, 3=Bonus Action, 6=Reaction
    } | null;
    components: number[] | null; // 1=V, 2=S, 3=M
    componentsDescription: string | null;
    concentration: boolean;
    ritual: boolean;
  };
  prepared: boolean;
  alwaysPrepared: boolean;
  usesSpellSlot: boolean;
}

export interface DdbInventoryItem {
  /** Inventory mapping id used by inventory write endpoints. */
  id: number;
  entityTypeId?: number;
  definition: DdbItemDefinition;
  definitionId?: number;
  definitionTypeId?: number;
  equipped?: boolean;
  isAttuned?: boolean;
  quantity: number;
  chargesUsed?: number | null;
  limitedUse?: unknown;
  containerEntityId?: number | null;
  containerEntityTypeId?: number | null;
  currency?: DdbCurrencies | null;
}

export interface DdbItemDefinition {
  id?: number;
  baseTypeId?: number;
  entityTypeId?: number;
  definitionKey?: string;
  name: string;
  description?: string | null;
  type?: string | null;
  rarity?: string | null;
  weight?: number | null;
  cost?: number | null;
  isHomebrew?: boolean;
  isCustomItem?: boolean;
  canEquip?: boolean;
  canAttune?: boolean;
  isContainer?: boolean;
  armorClass?: number | null;
  filterType?: string | null;
  grantedModifiers?: DdbModifier[];
}

export interface DdbCustomItem {
  id: number;
  mappingId?: number;
  name: string;
  description?: string | null;
  quantity?: number;
  weight?: number | null;
  cost?: number | null;
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

export interface DdbFeat {
  definition: {
    name: string;
    description: string;
    snippet: string | null;
    prerequisite: string | null;
  };
  componentId: number;
  componentTypeId: number;
}

export interface DdbClassFeature {
  // Class features nest under .definition; subclass features are flat
  definition?: {
    name: string;
    requiredLevel: number;
    description: string;
    snippet: string | null;
  };
  // Flat fields (subclass features)
  name?: string;
  requiredLevel?: number;
  description?: string;
}

export interface DdbRacialTrait {
  definition: {
    name: string;
    description: string;
    snippet: string | null;
  };
}

export interface DdbNotes {
  personalPossessions: string | null;
  backstory: string | null;
  otherNotes: string | null;
  allies: string | null;
  organizations: string | null;
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
