export interface CampaignSummary {
  id: number;
  name: string;
  dmUsername: string;
  playerCount: number;
}

export interface PartySummary {
  campaignId: number;
  campaignName: string;
  characters: PartyMember[];
}

export interface PartyMember {
  characterId: number;
  characterName: string;
  username: string;
}
