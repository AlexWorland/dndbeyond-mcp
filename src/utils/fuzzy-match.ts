/**
 * D&D-specific query normalization and fuzzy matching utilities.
 */

/**
 * Common D&D abbreviations and their full names.
 */
const DND_ABBREVIATIONS: Record<string, string> = {
  // Stats and combat
  'hp': 'Hit Points',
  'ac': 'Armor Class',

  // Ability scores
  'str': 'Strength',
  'dex': 'Dexterity',
  'con': 'Constitution',
  'int': 'Intelligence',
  'wis': 'Wisdom',
  'cha': 'Charisma',
};

/**
 * Common D&D spell and monster name corrections (case-insensitive).
 */
const DND_NAME_CORRECTIONS: Record<string, string> = {
  'fireball': 'Fireball',
  'magic missile': 'Magic Missile',
  'beholder': 'Beholder',
  'tarrasque': 'Tarrasque',
};

/**
 * Normalizes a D&D query by expanding abbreviations and correcting common names.
 *
 * @param query - The search query to normalize
 * @returns Normalized query string
 *
 * @example
 * normalizeDndQuery("HP") // "Hit Points"
 * normalizeDndQuery("str") // "Strength"
 * normalizeDndQuery("fireball") // "Fireball"
 */
export function normalizeDndQuery(query: string): string {
  const lowerQuery = query.toLowerCase().trim();

  // Check abbreviations first
  if (DND_ABBREVIATIONS[lowerQuery]) {
    return DND_ABBREVIATIONS[lowerQuery];
  }

  // Check name corrections
  if (DND_NAME_CORRECTIONS[lowerQuery]) {
    return DND_NAME_CORRECTIONS[lowerQuery];
  }

  // Return original query if no normalization needed
  return query;
}

/**
 * Calculates the Levenshtein distance between two strings.
 *
 * @param a - First string
 * @param b - Second string
 * @returns The edit distance between the strings
 *
 * @example
 * levenshteinDistance("fireball", "fierball") // 1
 * levenshteinDistance("cat", "dog") // 3
 */
export function levenshteinDistance(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;

  // Early return for empty strings
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  // Create distance matrix
  const matrix: number[][] = Array(aLen + 1)
    .fill(null)
    .map(() => Array(bLen + 1).fill(0));

  // Initialize first column and row
  for (let i = 0; i <= aLen; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= bLen; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[aLen][bLen];
}

/**
 * Performs fuzzy matching on a list of candidates based on Levenshtein distance.
 * Returns candidates sorted by relevance (exact match first, then closest matches).
 *
 * @param query - The search query
 * @param candidates - List of candidate strings to match against
 * @param threshold - Maximum edit distance to consider a match (default: 3)
 * @returns Array of matching candidates sorted by relevance
 *
 * @example
 * fuzzyMatch("fireball", ["Fireball", "Fire Bolt", "Firebolt", "Lightning Bolt"])
 * // ["Fireball", "Firebolt", "Fire Bolt"]
 */
export function fuzzyMatch(
  query: string,
  candidates: string[],
  threshold: number = 3
): string[] {
  const normalizedQuery = normalizeDndQuery(query);
  const lowerQuery = normalizedQuery.toLowerCase();

  // Calculate distances for all candidates
  const matches = candidates
    .map(candidate => ({
      candidate,
      distance: levenshteinDistance(lowerQuery, candidate.toLowerCase()),
    }))
    .filter(match => match.distance <= threshold)
    .sort((a, b) => {
      // Sort by distance (closer matches first)
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      // If same distance, sort alphabetically
      return a.candidate.localeCompare(b.candidate);
    });

  return matches.map(match => match.candidate);
}
