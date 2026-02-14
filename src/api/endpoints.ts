export const DDB_CHARACTER_SERVICE = "https://character-service.dndbeyond.com";
export const DDB_WATERDEEP = "https://www.dndbeyond.com";

export const ENDPOINTS = {
  character: {
    get: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}`,
    list: (userId: number) => `${DDB_CHARACTER_SERVICE}/character/v5/characters/list?userId=${userId}`,
    updateHp: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/life/hp/damage-taken`,
    updateSpellSlots: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/spell/slots`,
    updateDeathSaves: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/life/death-saves`,
    updateLimitedUse: () => `${DDB_CHARACTER_SERVICE}/character/v5/action/limited-use`,
    updateCurrency: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/inventory/currency`,
    updatePactMagic: (id: number) => `${DDB_CHARACTER_SERVICE}/character/v5/character/${id}/spell/pact-magic`,
  },
  campaign: {
    list: () => `${DDB_WATERDEEP}/api/campaign/stt/active-campaigns`,
  },
} as const;
