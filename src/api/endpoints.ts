export const DDB_CHARACTER_SERVICE = "https://character-service.dndbeyond.com";
export const DDB_MONSTER_SERVICE = "https://monster-service.dndbeyond.com";
export const DDB_WATERDEEP = "https://www.dndbeyond.com";

export const ENDPOINTS = {
  character: {
    get: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}?includeCustomItems=true`,
    list: (userId: number) => `${DDB_CHARACTER_SERVICE}/character/v5/characters/list?userId=${userId}`,
    updateHp: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/life/hp/damage-taken`,
    updateSpellSlots: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/spell/slots`,
    updateDeathSaves: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/life/death-saves`,
    updateLimitedUse: () => `${DDB_CHARACTER_SERVICE}/character/v5/action/limited-use`,
    updateCurrency: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/inventory/currency`,
    updatePactMagic: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/spell/pact-magic`,
    builder: {
      standardBuild: () => `${DDB_CHARACTER_SERVICE}/character/v5/builder/standard-build`,
      quickBuild: () => `${DDB_CHARACTER_SERVICE}/character/v5/builder/quick-build`,
    },
    addClass: () => `${DDB_CHARACTER_SERVICE}/character/v5/class`,
    setBackground: () => `${DDB_CHARACTER_SERVICE}/character/v5/background`,
    setBackgroundChoice: () => `${DDB_CHARACTER_SERVICE}/character/v5/background/choice`,
    setClassFeatureChoice: () => `${DDB_CHARACTER_SERVICE}/character/v5/class/feature/choice`,
    setRaceTraitChoice: () => `${DDB_CHARACTER_SERVICE}/character/v5/race/trait/choice`,
    setFeatChoice: () => `${DDB_CHARACTER_SERVICE}/character/v5/feat/choice`,
    setRace: () => `${DDB_CHARACTER_SERVICE}/character/v5/race`,
    setAbilityScore: () => `${DDB_CHARACTER_SERVICE}/character/v5/character/ability-score`,
    setPreferences: () => `${DDB_CHARACTER_SERVICE}/character/v5/character/preferences`,
    updateName: () => `${DDB_CHARACTER_SERVICE}/character/v5/description/name`,
    delete: () => `${DDB_CHARACTER_SERVICE}/character/v5/character`,
  },
  gameData: {
    items: (campaignId?: number) => {
      const campaign = campaignId ? `&campaignId=${campaignId}` : "";
      return `${DDB_CHARACTER_SERVICE}/character/v5/game-data/items?sharingSetting=2${campaign}`;
    },
    feats: () => `${DDB_CHARACTER_SERVICE}/character/v5/game-data/feats`,
    classes: () => `${DDB_CHARACTER_SERVICE}/character/v5/game-data/classes`,
    races: () => `${DDB_CHARACTER_SERVICE}/character/v5/game-data/races`,
    backgrounds: () => `${DDB_CHARACTER_SERVICE}/character/v5/game-data/backgrounds`,
    alwaysKnownSpells: (classId: number, classLevel: number = 20) =>
      `${DDB_CHARACTER_SERVICE}/character/v5/game-data/always-known-spells?classId=${classId}&classLevel=${classLevel}&sharingSetting=2`,
    alwaysPreparedSpells: (classId: number, classLevel: number = 20) =>
      `${DDB_CHARACTER_SERVICE}/character/v5/game-data/always-prepared-spells?classId=${classId}&classLevel=${classLevel}&sharingSetting=2`,
    classFeatureCollection: () => `${DDB_CHARACTER_SERVICE}/character/v5/game-data/class-feature/collection`,
    racialTraitCollection: () => `${DDB_CHARACTER_SERVICE}/character/v5/game-data/racial-trait/collection`,
  },
  monster: {
    search: (search: string = "", skip: number = 0, take: number = 20, showHomebrew?: boolean, sources?: string) => {
      const homebrewParam = showHomebrew ? "&showHomebrew=t" : "";
      const sourcesParam = sources ? `&sources=${encodeURIComponent(sources)}` : "";
      return `${DDB_MONSTER_SERVICE}/v1/Monster?search=${encodeURIComponent(search)}&skip=${skip}&take=${take}${homebrewParam}${sourcesParam}`;
    },
    get: (id: number) => `${DDB_MONSTER_SERVICE}/v1/Monster/${id}`,
    getByIds: (ids: number[]) => {
      const idParams = ids.map((id) => `ids=${id}`).join("&");
      return `${DDB_MONSTER_SERVICE}/v1/Monster?${idParams}`;
    },
  },
  campaign: {
    list: () => `${DDB_WATERDEEP}/api/campaign/stt/active-campaigns`,
    userCampaigns: () => `${DDB_WATERDEEP}/api/campaign/stt/user-campaigns`,
    characters: (campaignId: number) => `${DDB_WATERDEEP}/api/campaign/stt/active-short-characters/${campaignId}`,
  },
  config: {
    json: () => `${DDB_WATERDEEP}/api/config/json`,
  },
} as const;
