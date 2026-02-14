import { describe, it, expect } from 'vitest';
import {
  normalizeDndQuery,
  fuzzyMatch,
  levenshteinDistance,
} from '../../src/utils/fuzzy-match.js';

describe('normalizeDndQuery', () => {
  it('should map HP abbreviation', () => {
    expect(normalizeDndQuery('HP')).toBe('Hit Points');
  });

  it('should map AC abbreviation', () => {
    expect(normalizeDndQuery('AC')).toBe('Armor Class');
  });

  it('should map ability score abbreviations', () => {
    expect(normalizeDndQuery('STR')).toBe('Strength');
    expect(normalizeDndQuery('DEX')).toBe('Dexterity');
    expect(normalizeDndQuery('CON')).toBe('Constitution');
    expect(normalizeDndQuery('INT')).toBe('Intelligence');
    expect(normalizeDndQuery('WIS')).toBe('Wisdom');
    expect(normalizeDndQuery('CHA')).toBe('Charisma');
  });

  it('should be case-insensitive for abbreviations', () => {
    expect(normalizeDndQuery('hp')).toBe('Hit Points');
    expect(normalizeDndQuery('Hp')).toBe('Hit Points');
    expect(normalizeDndQuery('str')).toBe('Strength');
    expect(normalizeDndQuery('Str')).toBe('Strength');
  });

  it('should correct common spell names', () => {
    expect(normalizeDndQuery('fireball')).toBe('Fireball');
    expect(normalizeDndQuery('magic missile')).toBe('Magic Missile');
  });

  it('should correct common monster names', () => {
    expect(normalizeDndQuery('beholder')).toBe('Beholder');
    expect(normalizeDndQuery('tarrasque')).toBe('Tarrasque');
  });

  it('should be case-insensitive for name corrections', () => {
    expect(normalizeDndQuery('FIREBALL')).toBe('Fireball');
    expect(normalizeDndQuery('Beholder')).toBe('Beholder');
  });

  it('should return original query if no normalization needed', () => {
    expect(normalizeDndQuery('Unknown Spell')).toBe('Unknown Spell');
    expect(normalizeDndQuery('Random Text')).toBe('Random Text');
  });

  it('should trim whitespace', () => {
    expect(normalizeDndQuery('  HP  ')).toBe('Hit Points');
    expect(normalizeDndQuery('  fireball  ')).toBe('Fireball');
  });
});

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('test', 'test')).toBe(0);
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('should return length for empty string comparisons', () => {
    expect(levenshteinDistance('', 'test')).toBe(4);
    expect(levenshteinDistance('test', '')).toBe(4);
  });

  it('should calculate single character substitution', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
    expect(levenshteinDistance('cat', 'cot')).toBe(1);
  });

  it('should calculate single character insertion', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
    expect(levenshteinDistance('fire', 'fires')).toBe(1);
  });

  it('should calculate single character deletion', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
    expect(levenshteinDistance('fires', 'fire')).toBe(1);
  });

  it('should calculate multiple operations', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('saturday', 'sunday')).toBe(3);
  });

  it('should be case-sensitive', () => {
    expect(levenshteinDistance('Cat', 'cat')).toBe(1);
    expect(levenshteinDistance('FIRE', 'fire')).toBe(4);
  });

  it('should handle completely different strings', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
    expect(levenshteinDistance('cat', 'dog')).toBe(3);
  });
});

describe('fuzzyMatch', () => {
  const spells = [
    'Fireball',
    'Fire Bolt',
    'Firebolt',
    'Lightning Bolt',
    'Magic Missile',
    'Fire Storm',
  ];

  it('should return exact match first', () => {
    const results = fuzzyMatch('Fireball', spells);
    expect(results[0]).toBe('Fireball');
  });

  it('should return close matches within threshold', () => {
    const results = fuzzyMatch('firball', spells);
    expect(results).toContain('Fireball');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should return matches sorted by distance', () => {
    const results = fuzzyMatch('firebolt', spells);
    // "Firebolt" is exact match (distance 0)
    // "Fireball" has distance 1
    // "Fire Bolt" has distance 1
    expect(results[0]).toBe('Firebolt');
  });

  it('should return empty array when no matches within threshold', () => {
    const results = fuzzyMatch('completely_different', spells);
    expect(results).toEqual([]);
  });

  it('should respect custom threshold', () => {
    // "firbal" has distance 2 from "Fireball"
    const resultsThreshold1 = fuzzyMatch('firbal', spells, 1);
    expect(resultsThreshold1).toEqual([]);

    const resultsThreshold2 = fuzzyMatch('firbal', spells, 2);
    expect(resultsThreshold2).toContain('Fireball');
  });

  it('should use default threshold of 3', () => {
    // "fireb" has distance 3 from "Fireball"
    const results = fuzzyMatch('fireb', spells);
    expect(results).toContain('Fireball');
  });

  it('should normalize query before matching', () => {
    const results = fuzzyMatch('HP', ['Hit Points', 'Health Points', 'HP']);
    // "HP" should be normalized to "Hit Points"
    expect(results).toContain('Hit Points');
  });

  it('should be case-insensitive', () => {
    const results = fuzzyMatch('FIREBALL', spells);
    expect(results).toContain('Fireball');
  });

  it('should handle empty candidates array', () => {
    const results = fuzzyMatch('test', []);
    expect(results).toEqual([]);
  });

  it('should sort alphabetically when distances are equal', () => {
    const candidates = ['Zebra', 'Apple', 'Banana'];
    // Apple and Zebra have distance 5 from "xyz", Banana has distance 6
    const results = fuzzyMatch('xyz', candidates, 10);
    // Verify alphabetical order among equal-distance results (Apple, Zebra)
    // then Banana (higher distance)
    expect(results).toEqual(['Apple', 'Zebra', 'Banana']);
  });

  it('should handle multiple close matches', () => {
    const monsters = ['Beholder', 'Beholderkin', 'Behir', 'Basilisk'];
    const results = fuzzyMatch('beholder', monsters);
    expect(results[0]).toBe('Beholder');
    expect(results).toContain('Beholderkin');
  });
});
