export const DDB_CHARACTER_SERVICE = "https://character-service.dndbeyond.com";
export const DDB_MONSTER_SERVICE = "https://monster-service.dndbeyond.com";
export const DDB_WATERDEEP = "https://www.dndbeyond.com";

export const ENDPOINTS = {
  character: {
    get: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}?includeCustomItems=true`,
    list: (userId: number) => `${DDB_CHARACTER_SERVICE}/character/v5/characters/list?userId=${userId}`,
    // New-style gameplay endpoints (characterId in body/query, not path)
    updateHp: () => `${DDB_CHARACTER_SERVICE}/character/v5/life/hp/damage-taken`,
    updateLimitedUse: () => `${DDB_CHARACTER_SERVICE}/character/v5/action/limited-use`,
    setInspiration: () => `${DDB_CHARACTER_SERVICE}/character/v5/character/inspiration`,
    condition: () => `${DDB_CHARACTER_SERVICE}/character/v5/condition`,
    rest: {
      short: (characterId: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/rest/short?characterId=${characterId}`,
      long: (characterId: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/rest/long?characterId=${characterId}`,
    },
    // Deprecated v5 endpoints (return 404, kept for reference)
    updateSpellSlots: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/spell/slots`,
    updateDeathSaves: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/life/death-saves`,
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
    setAbilityScoreType: () => `${DDB_CHARACTER_SERVICE}/character/v5/character/ability-score/type`,
    setClassLevel: () => `${DDB_CHARACTER_SERVICE}/character/v5/class/level`,
    updateName: () => `${DDB_CHARACTER_SERVICE}/character/v5/description/name`,
    updateAlignment: () => `${DDB_CHARACTER_SERVICE}/character/v5/description/alignment`,
    updateLifestyle: () => `${DDB_CHARACTER_SERVICE}/character/v5/description/lifestyle`,
    updateFaith: () => `${DDB_CHARACTER_SERVICE}/character/v5/description/faith`,
    updateTraits: () => `${DDB_CHARACTER_SERVICE}/character/v5/description/traits`,
    updateNotes: () => `${DDB_CHARACTER_SERVICE}/character/v5/description/notes`,
    updateAppearance: (field: string) => `${DDB_CHARACTER_SERVICE}/character/v5/description/${field}`,
    inventory: {
      addItems: () => `${DDB_CHARACTER_SERVICE}/character/v5/inventory/item`,
      setGold: () => `${DDB_CHARACTER_SERVICE}/character/v5/inventory/currency/gold`,
      setStartingType: () => `${DDB_CHARACTER_SERVICE}/character/v5/inventory/starting-type`,
    },
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
