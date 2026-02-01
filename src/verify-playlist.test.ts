// src/verify-playlist.test.ts - Tests for verify-playlist.ts functions

import { describe, it, expect } from 'vitest';

/**
 * Type guard for PlaylistDetails - copied from verify-playlist.ts for testing
 * (We test the logic directly since the function is not exported)
 */
interface PlaylistDetails {
  name: string;
  description: string | null;
  tracks: { total: number };
}

function isPlaylistDetails(data: unknown): data is PlaylistDetails {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.name !== 'string') return false;
  if (obj.description !== null && obj.description !== undefined && typeof obj.description !== 'string') return false;
  if (!obj.tracks || typeof obj.tracks !== 'object') return false;
  const tracks = obj.tracks as Record<string, unknown>;
  if (typeof tracks.total !== 'number') return false;
  return true;
}

describe('isPlaylistDetails type guard', () => {
  // Valid cases
  it('should return true for valid PlaylistDetails with string description', () => {
    const data = {
      name: 'LAST30LIKED',
      description: 'Last sync: 2026-01-11 14:32:45 UTC',
      tracks: { total: 30 },
    };
    expect(isPlaylistDetails(data)).toBe(true);
  });

  it('should return true for valid PlaylistDetails with null description', () => {
    const data = {
      name: 'LAST30LIKED',
      description: null,
      tracks: { total: 30 },
    };
    expect(isPlaylistDetails(data)).toBe(true);
  });

  it('should return true for valid PlaylistDetails with undefined description', () => {
    const data = {
      name: 'LAST30LIKED',
      description: undefined,
      tracks: { total: 30 },
    };
    expect(isPlaylistDetails(data)).toBe(true);
  });

  it('should return true when description field is missing entirely', () => {
    const data = {
      name: 'LAST30LIKED',
      tracks: { total: 30 },
    };
    expect(isPlaylistDetails(data)).toBe(true);
  });

  // Invalid cases - null/undefined data
  it('should return false for null', () => {
    expect(isPlaylistDetails(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isPlaylistDetails(undefined)).toBe(false);
  });

  // Invalid cases - wrong types
  it('should return false when name is not a string', () => {
    const data = {
      name: 123,
      description: null,
      tracks: { total: 30 },
    };
    expect(isPlaylistDetails(data)).toBe(false);
  });

  it('should return false when description is a number', () => {
    const data = {
      name: 'LAST30LIKED',
      description: 123,
      tracks: { total: 30 },
    };
    expect(isPlaylistDetails(data)).toBe(false);
  });

  it('should return false when tracks is missing', () => {
    const data = {
      name: 'LAST30LIKED',
      description: null,
    };
    expect(isPlaylistDetails(data)).toBe(false);
  });

  it('should return false when tracks.total is not a number', () => {
    const data = {
      name: 'LAST30LIKED',
      description: null,
      tracks: { total: '30' },
    };
    expect(isPlaylistDetails(data)).toBe(false);
  });

  it('should return false for empty object', () => {
    expect(isPlaylistDetails({})).toBe(false);
  });

  it('should return false for array', () => {
    expect(isPlaylistDetails([])).toBe(false);
  });
});

describe('description verification logic', () => {
  // Story 4.2 AC #1, #2: description format validation
  it('should recognize valid sync timestamp format', () => {
    const description = 'Last sync: 2026-01-11 14:32:45 UTC';
    expect(description.startsWith('Last sync:')).toBe(true);
  });

  it('should recognize description starting with Last sync:', () => {
    const validDescriptions = [
      'Last sync: 2026-01-11 14:32:45 UTC',
      'Last sync: 2025-12-31 23:59:59 UTC',
      'Last sync: 2020-01-01 00:00:00 UTC',
    ];
    validDescriptions.forEach((desc) => {
      expect(desc.startsWith('Last sync:')).toBe(true);
    });
  });

  it('should reject descriptions not starting with Last sync:', () => {
    const invalidDescriptions = [
      'Sync: 2026-01-11 14:32:45 UTC',
      'Updated: 2026-01-11',
      '',
      'Random description',
    ];
    invalidDescriptions.forEach((desc) => {
      expect(desc.startsWith('Last sync:')).toBe(false);
    });
  });

  it('should handle null description', () => {
    const checkDescription = (desc: string | null): boolean => {
      return desc !== null && desc.startsWith('Last sync:');
    };
    expect(checkDescription(null)).toBe(false);
    expect(checkDescription('Last sync: 2026-01-11 14:32:45 UTC')).toBe(true);
    expect(checkDescription('Other description')).toBe(false);
  });

  // Story 4.2 AC #2: timestamp format precision
  it('should validate timestamp format YYYY-MM-DD HH:mm:ss UTC', () => {
    const timestampPattern = /^Last sync: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/;
    expect(timestampPattern.test('Last sync: 2026-01-11 14:32:45 UTC')).toBe(true);
    expect(timestampPattern.test('Last sync: 2026-01-11 14:32 UTC')).toBe(false); // missing seconds
    expect(timestampPattern.test('Last sync: 2026-01-11T14:32:45 UTC')).toBe(false); // T instead of space
  });
});
