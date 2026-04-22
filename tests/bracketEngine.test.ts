import { describe, it, expect } from 'vitest';
import {
  generateGenericBracket,
  getFeederIds,
  getDownstreamIds,
  getRoundLabel,
  computeEffectiveMatchups,
  cascadeClear,
  parseMatchId,
  totalRounds,
  matchId,
} from '@/lib/bracketEngine';

describe('bracketEngine', () => {
  describe('generateGenericBracket', () => {
    it('generates 8-team bracket with 7 matches', () => {
      const bracket = generateGenericBracket(8);
      expect(bracket).toHaveLength(7); // 4 + 2 + 1
      expect(bracket.filter((m) => m.round === 0)).toHaveLength(4);
      expect(bracket.filter((m) => m.round === 1)).toHaveLength(2);
      expect(bracket.filter((m) => m.round === 2)).toHaveLength(1);
    });

    it('generates 32-team bracket with 31 matches', () => {
      const bracket = generateGenericBracket(32);
      expect(bracket).toHaveLength(31);
      expect(bracket.filter((m) => m.round === 0)).toHaveLength(16);
      expect(bracket.filter((m) => m.round === 1)).toHaveLength(8);
      expect(bracket.filter((m) => m.round === 2)).toHaveLength(4);
      expect(bracket.filter((m) => m.round === 3)).toHaveLength(2);
      expect(bracket.filter((m) => m.round === 4)).toHaveLength(1);
    });

    it('includes 3rd place match when requested', () => {
      const bracket = generateGenericBracket(32, true);
      expect(bracket).toHaveLength(32);
      expect(bracket.find((m) => m.id === '3RD')).toBeDefined();
    });
  });

  describe('getFeederIds', () => {
    it('returns null for round 0', () => {
      expect(getFeederIds('R0-1', 32)).toBeNull();
    });

    it('returns correct feeders for R1-1', () => {
      expect(getFeederIds('R1-1', 32)).toEqual(['R0-1', 'R0-2']);
    });

    it('returns correct feeders for R1-3', () => {
      expect(getFeederIds('R1-3', 32)).toEqual(['R0-5', 'R0-6']);
    });

    it('returns correct feeders for R2-1 (QF)', () => {
      expect(getFeederIds('R2-1', 32)).toEqual(['R1-1', 'R1-2']);
    });

    it('returns SF feeders for 3RD', () => {
      // For 32 teams, SF is round 3
      expect(getFeederIds('3RD', 32)).toEqual(['R3-1', 'R3-2']);
    });

    it('returns correct feeders for Final (R4-1 in 32-team)', () => {
      expect(getFeederIds('R4-1', 32)).toEqual(['R3-1', 'R3-2']);
    });
  });

  describe('getDownstreamIds', () => {
    it('returns all downstream from R0-1 in 8-team bracket', () => {
      const ds = getDownstreamIds('R0-1', 8);
      expect(ds).toContain('R1-1');
      expect(ds).toContain('R2-1');
    });

    it('includes 3RD for SF matches', () => {
      const ds = getDownstreamIds('R3-1', 32, true);
      expect(ds).toContain('R4-1');
      expect(ds).toContain('3RD');
    });
  });

  describe('getRoundLabel', () => {
    it('labels correctly for 32-team bracket (5 rounds)', () => {
      expect(getRoundLabel(0, 5)).toBe('Round of 32');
      expect(getRoundLabel(1, 5)).toBe('Round of 16');
      expect(getRoundLabel(2, 5)).toBe('Quarterfinals');
      expect(getRoundLabel(3, 5)).toBe('Semifinals');
      expect(getRoundLabel(4, 5)).toBe('Final');
    });
  });

  describe('computeEffectiveMatchups', () => {
    it('propagates picks through bracket', () => {
      const bracket = generateGenericBracket(8);
      // Set R0 teams
      bracket[0].teamA = 'A'; bracket[0].teamB = 'B';
      bracket[1].teamA = 'C'; bracket[1].teamB = 'D';
      bracket[2].teamA = 'E'; bracket[2].teamB = 'F';
      bracket[3].teamA = 'G'; bracket[3].teamB = 'H';

      const picks: Record<string, string> = {
        'R0-1': 'A', 'R0-2': 'C', 'R0-3': 'E', 'R0-4': 'G',
        'R1-1': 'A', 'R1-2': 'E',
      };

      const effective = computeEffectiveMatchups(bracket, picks, 8);
      const sf1 = effective.find((m) => m.id === 'R1-1')!;
      expect(sf1.teamA).toBe('A');
      expect(sf1.teamB).toBe('C');

      const final = effective.find((m) => m.id === 'R2-1')!;
      expect(final.teamA).toBe('A');
      expect(final.teamB).toBe('E');
    });

    it('propagates losers to 3RD match', () => {
      const bracket = generateGenericBracket(8, true);
      bracket[0].teamA = 'A'; bracket[0].teamB = 'B';
      bracket[1].teamA = 'C'; bracket[1].teamB = 'D';
      bracket[2].teamA = 'E'; bracket[2].teamB = 'F';
      bracket[3].teamA = 'G'; bracket[3].teamB = 'H';

      const picks: Record<string, string> = {
        'R0-1': 'A', 'R0-2': 'C', 'R0-3': 'E', 'R0-4': 'G',
        'R1-1': 'A', 'R1-2': 'E',
      };

      const effective = computeEffectiveMatchups(bracket, picks, 8);
      const sf1 = effective.find((m) => m.id === 'R1-1')!;
      const sf2 = effective.find((m) => m.id === 'R1-2')!;

      // SF teams are set
      expect(sf1.teamA).toBe('A');
      expect(sf1.teamB).toBe('C');
      expect(sf2.teamA).toBe('E');
      expect(sf2.teamB).toBe('G');

      // 3RD gets losers: C and G
      const third = effective.find((m) => m.id === '3RD')!;
      expect(third.teamA).toBe('C');
      expect(third.teamB).toBe('G');

      // Final gets winners: A and E
      const final = effective.find((m) => m.id === 'R2-1')!;
      expect(final.teamA).toBe('A');
      expect(final.teamB).toBe('E');
    });
  });

  describe('cascadeClear', () => {
    it('clears downstream picks when a pick changes', () => {
      const bracket = generateGenericBracket(8);
      bracket[0].teamA = 'A'; bracket[0].teamB = 'B';
      bracket[1].teamA = 'C'; bracket[1].teamB = 'D';

      const picks: Record<string, string> = {
        'R0-1': 'A', 'R0-2': 'C',
        'R1-1': 'A', 'R2-1': 'A',
      };

      const cleared = cascadeClear(picks, 'R0-1', bracket, 8);
      expect(cleared['R0-1']).toBe('A'); // unchanged (it's the changed match itself)
      expect(cleared['R1-1']).toBeUndefined(); // cleared
      expect(cleared['R2-1']).toBeUndefined(); // cleared
      expect(cleared['R0-2']).toBe('C'); // unrelated, kept
    });
  });

  describe('parseMatchId', () => {
    it('parses valid IDs', () => {
      expect(parseMatchId('R0-1')).toEqual({ round: 0, position: 1 });
      expect(parseMatchId('R4-1')).toEqual({ round: 4, position: 1 });
    });

    it('returns null for 3RD', () => {
      expect(parseMatchId('3RD')).toBeNull();
    });
  });
});
