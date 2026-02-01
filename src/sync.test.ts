// src/sync.test.ts - Tests for sync.ts functions

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRecentLikes, getAccessToken, updatePlaylist, updatePlaylistMetadata, getPlaylistTracks, main } from './sync';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Suppress console output during tests
vi.stubGlobal('console', {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
});

describe('getRecentLikes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TRACK_COUNT', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // AC #1: Returns N most recently liked tracks from /me/tracks endpoint
  it('should fetch tracks from /me/tracks endpoint with default limit of 30', async () => {
    const mockResponse = {
      items: [
        { track: { uri: 'spotify:track:abc123' } },
        { track: { uri: 'spotify:track:def456' } },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await getRecentLikes('valid-token');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me/tracks?limit=30',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-token',
          Accept: 'application/json',
        },
      })
    );
    expect(result).toEqual(['spotify:track:abc123', 'spotify:track:def456']);
  });

  // AC #3: Response contains track URIs in spotify:track:xxx format
  it('should return track URIs in spotify:track:xxx format', async () => {
    const mockResponse = {
      items: [
        { track: { uri: 'spotify:track:track1' } },
        { track: { uri: 'spotify:track:track2' } },
        { track: { uri: 'spotify:track:track3' } },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await getRecentLikes('valid-token');

    expect(result).toHaveLength(3);
    result!.forEach((uri) => {
      expect(uri).toMatch(/^spotify:track:/);
    });
  });

  // AC #4: Custom TRACK_COUNT value
  it('should use TRACK_COUNT environment variable when set', async () => {
    vi.stubEnv('TRACK_COUNT', '50');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await getRecentLikes('valid-token');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me/tracks?limit=50',
      expect.any(Object)
    );
  });

  // AC #7: TRACK_COUNT > 50 should be capped at 50
  it('should cap TRACK_COUNT at 50 when exceeds Spotify API limit', async () => {
    vi.stubEnv('TRACK_COUNT', '100');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await getRecentLikes('valid-token');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me/tracks?limit=50',
      expect.any(Object)
    );
  });

  // AC #5 & #6: Error handling - API error
  it('should return null on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'The access token expired' } }),
    });

    const result = await getRecentLikes('invalid-token');

    expect(result).toBeNull();
  });

  // AC #5 & #6: Error handling - Network error
  it('should return null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await getRecentLikes('valid-token');

    expect(result).toBeNull();
  });

  // AC #5 & #6: Error handling - Timeout
  it('should return null on timeout', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    const result = await getRecentLikes('valid-token');

    expect(result).toBeNull();
  });

  // Edge case: Invalid TRACK_COUNT defaults to 30
  it('should default to 30 when TRACK_COUNT is invalid', async () => {
    vi.stubEnv('TRACK_COUNT', 'invalid');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await getRecentLikes('valid-token');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me/tracks?limit=30',
      expect.any(Object)
    );
  });

  // Edge case: Invalid response structure
  it('should return null on invalid response structure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ wrongStructure: true }),
    });

    const result = await getRecentLikes('valid-token');

    expect(result).toBeNull();
  });

  // Edge case: Filters out non-track URIs
  it('should filter out items with invalid track URIs', async () => {
    const mockResponse = {
      items: [
        { track: { uri: 'spotify:track:valid1' } },
        { track: { uri: 'spotify:episode:podcast1' } }, // Not a track
        { track: { uri: 'spotify:track:valid2' } },
        { track: {} }, // Missing uri
        { wrongField: {} }, // Missing track
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await getRecentLikes('valid-token');

    expect(result).toEqual(['spotify:track:valid1', 'spotify:track:valid2']);
  });

  // TRACK_COUNT less than 1 defaults to 30
  it('should default to 30 when TRACK_COUNT is less than 1', async () => {
    vi.stubEnv('TRACK_COUNT', '0');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await getRecentLikes('valid-token');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me/tracks?limit=30',
      expect.any(Object)
    );
  });

  // AC #2: Tracks are returned in chronological order (preserves API order)
  it('should preserve chronological order from API response (most recent first)', async () => {
    const mockResponse = {
      items: [
        { track: { uri: 'spotify:track:newest' } },
        { track: { uri: 'spotify:track:middle' } },
        { track: { uri: 'spotify:track:oldest' } },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await getRecentLikes('valid-token');

    // Verify order is preserved (most recent first, as returned by API)
    expect(result).toEqual([
      'spotify:track:newest',
      'spotify:track:middle',
      'spotify:track:oldest',
    ]);
  });

  // M2: Negative TRACK_COUNT defaults to 30
  it('should default to 30 when TRACK_COUNT is negative', async () => {
    vi.stubEnv('TRACK_COUNT', '-5');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await getRecentLikes('valid-token');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me/tracks?limit=30',
      expect.any(Object)
    );
  });
});

// H3: Tests for getAccessToken function
describe('getAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default valid env vars
    vi.stubEnv('SPOTIFY_CLIENT_ID', 'test-client-id');
    vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv('SPOTIFY_REFRESH_TOKEN', 'test-refresh-token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return access token on successful refresh', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'new-access-token' }),
    });

    const result = await getAccessToken();

    expect(result).toBe('new-access-token');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://accounts.spotify.com/api/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      })
    );
  });

  it('should return null when SPOTIFY_CLIENT_ID is missing', async () => {
    vi.stubEnv('SPOTIFY_CLIENT_ID', '');

    const result = await getAccessToken();

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return null when SPOTIFY_CLIENT_SECRET is missing', async () => {
    vi.stubEnv('SPOTIFY_CLIENT_SECRET', '');

    const result = await getAccessToken();

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return null when SPOTIFY_REFRESH_TOKEN is missing', async () => {
    vi.stubEnv('SPOTIFY_REFRESH_TOKEN', '');

    const result = await getAccessToken();

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return null on API error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    });

    const result = await getAccessToken();

    expect(result).toBeNull();
  });

  it('should return null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await getAccessToken();

    expect(result).toBeNull();
  });

  it('should return null on timeout', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    const result = await getAccessToken();

    expect(result).toBeNull();
  });

  it('should return null when response has no access_token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_type: 'Bearer' }), // Missing access_token
    });

    const result = await getAccessToken();

    expect(result).toBeNull();
  });

  it('should return null when access_token is empty string', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: '   ' }), // Whitespace only
    });

    const result = await getAccessToken();

    expect(result).toBeNull();
  });

  it('should return null on invalid JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error('Invalid JSON'); },
    });

    const result = await getAccessToken();

    expect(result).toBeNull();
  });
});

// Tests for updatePlaylist function
describe('updatePlaylist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PLAYLIST_ID', 'test-playlist-id');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // AC #1: Replace playlist tracks via PUT /playlists/{id}/tracks
  it('should make PUT request to Spotify playlists endpoint with track URIs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ snapshot_id: 'snapshot123' }),
    });

    const trackUris = ['spotify:track:abc123', 'spotify:track:def456'];
    const result = await updatePlaylist('valid-token', trackUris);

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/playlists/test-playlist-id/tracks',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          Authorization: 'Bearer valid-token',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ uris: trackUris }),
      })
    );
  });

  // AC #2: Playlist contains exactly the provided tracks in order
  it('should return true on successful playlist update (201 response)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ snapshot_id: 'snapshot123' }),
    });

    const result = await updatePlaylist('valid-token', ['spotify:track:abc123']);

    expect(result).toBe(true);
  });

  // AC #7: Empty trackUris array clears the playlist (valid state)
  it('should succeed with empty trackUris array (clears playlist)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ snapshot_id: 'snapshot123' }),
    });

    const result = await updatePlaylist('valid-token', []);

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ uris: [] }),
      })
    );
  });

  // AC #5: Missing PLAYLIST_ID logs specific error message
  it('should return false with correct error message when PLAYLIST_ID is missing', async () => {
    vi.stubEnv('PLAYLIST_ID', '');

    const result = await updatePlaylist('valid-token', ['spotify:track:abc123']);

    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('PLAYLIST_ID not configured')
    );
  });

  // AC #5: Empty PLAYLIST_ID (whitespace only)
  it('should return false when PLAYLIST_ID is whitespace only', async () => {
    vi.stubEnv('PLAYLIST_ID', '   ');

    const result = await updatePlaylist('valid-token', ['spotify:track:abc123']);

    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // AC #3 & #4: 404 error with context-specific message
  it('should return false with "Playlist not found" message on 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: { status: 404, message: 'Non existing id' } }),
    });

    const result = await updatePlaylist('valid-token', ['spotify:track:abc123']);

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Playlist not found')
    );
  });

  // AC #3 & #4: 403 error with context-specific message
  it('should return false with "Permission denied" message on 403', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { status: 403, message: "You cannot add tracks" } }),
    });

    const result = await updatePlaylist('valid-token', ['spotify:track:abc123']);

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Permission denied')
    );
  });

  // AC #3 & #4: 401 error with context-specific message
  it('should return false with "Authentication failed" message on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { status: 401, message: 'The access token expired' } }),
    });

    const result = await updatePlaylist('valid-token', ['spotify:track:abc123']);

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Authentication failed')
    );
  });

  // AC #3 & #4: Network timeout
  it('should return false on network timeout', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    const result = await updatePlaylist('valid-token', ['spotify:track:abc123']);

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('request timeout')
    );
  });

  // AC #3 & #4: Network error
  it('should return false on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await updatePlaylist('valid-token', ['spotify:track:abc123']);

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('network error')
    );
  });

  // Generic API error
  it('should return false on generic API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Internal server error' } }),
    });

    const result = await updatePlaylist('valid-token', ['spotify:track:abc123']);

    expect(result).toBe(false);
  });
});

// Tests for updatePlaylistMetadata function
describe('updatePlaylistMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PLAYLIST_ID', 'test-playlist-id');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Story 4.2 AC #5: sends both name and description in single API call
  it('should send both name and description in single request', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await updatePlaylistMetadata('valid-token', {
      name: 'LAST30LIKED',
      description: 'Last sync: 2026-01-11 14:32:45 UTC',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/playlists/test-playlist-id',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          name: 'LAST30LIKED',
          description: 'Last sync: 2026-01-11 14:32:45 UTC',
        }),
      })
    );
  });

  // Story 4.2 AC #1, #2: description format is correct
  it('should format timestamp correctly as YYYY-MM-DD HH:mm:ss UTC', () => {
    const date = new Date('2026-01-11T14:32:45.123Z');
    const timestamp = `Last sync: ${date.toISOString().replace('T', ' ').substring(0, 19)} UTC`;
    expect(timestamp).toBe('Last sync: 2026-01-11 14:32:45 UTC');
  });

  // AC #1: Successful playlist title update (200 response)
  it('should return true on successful metadata update (200 OK)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const result = await updatePlaylistMetadata('valid-token', { name: 'LAST30LIKED' });

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/playlists/test-playlist-id',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          Authorization: 'Bearer valid-token',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ name: 'LAST30LIKED' }),
      })
    );
  });

  // AC #2: Title format is correct for 30 tracks
  it('should send correct title format LAST30LIKED', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await updatePlaylistMetadata('valid-token', { name: 'LAST30LIKED' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ name: 'LAST30LIKED' }),
      })
    );
  });

  // AC #3: Title format for different counts (25 tracks)
  it('should send correct title format LAST25LIKED for 25 tracks', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await updatePlaylistMetadata('valid-token', { name: 'LAST25LIKED' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ name: 'LAST25LIKED' }),
      })
    );
  });

  // AC #3: Title format for different counts (50 tracks)
  it('should send correct title format LAST50LIKED for 50 tracks', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await updatePlaylistMetadata('valid-token', { name: 'LAST50LIKED' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ name: 'LAST50LIKED' }),
      })
    );
  });

  // AC #4 & #5: Metadata update failure logs warning but returns false
  it('should return false and log warning on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await updatePlaylistMetadata('valid-token', { name: 'LAST30LIKED' });

    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Could not update playlist title')
    );
  });

  // AC #4 & #5: Network timeout logs warning but returns false
  it('should return false and log warning on network timeout', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    const result = await updatePlaylistMetadata('valid-token', { name: 'LAST30LIKED' });

    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Playlist title update timed out')
    );
  });

  // AC #4 & #5: 403 error logs warning but returns false
  it('should return false and log warning on 403 forbidden', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
    });

    const result = await updatePlaylistMetadata('valid-token', { name: 'LAST30LIKED' });

    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Could not update playlist title')
    );
  });

  // AC #4 & #5: 401 error logs warning but returns false
  it('should return false and log warning on 401 unauthorized', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const result = await updatePlaylistMetadata('valid-token', { name: 'LAST30LIKED' });

    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Could not update playlist title')
    );
  });

  // AC #4 & #5: Network error logs warning but returns false
  it('should return false and log warning on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await updatePlaylistMetadata('valid-token', { name: 'LAST30LIKED' });

    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Playlist title update network error')
    );
  });

  // Missing PLAYLIST_ID returns false
  it('should return false when PLAYLIST_ID is missing', async () => {
    vi.stubEnv('PLAYLIST_ID', '');

    const result = await updatePlaylistMetadata('valid-token', { name: 'LAST30LIKED' });

    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Whitespace PLAYLIST_ID returns false
  it('should return false when PLAYLIST_ID is whitespace only', async () => {
    vi.stubEnv('PLAYLIST_ID', '   ');

    const result = await updatePlaylistMetadata('valid-token', { name: 'LAST30LIKED' });

    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Logs updating message when name is provided
  it('should log updating message when name is provided', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await updatePlaylistMetadata('valid-token', { name: 'LAST30LIKED' });

    expect(console.log).toHaveBeenCalledWith('🔄 Updating playlist title to LAST30LIKED...');
  });

  // Logs success message when metadata update succeeds
  it('should log success message when metadata update succeeds', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await updatePlaylistMetadata('valid-token', { name: 'LAST30LIKED' });

    expect(console.log).toHaveBeenCalledWith('✅ Playlist title updated');
  });
});

// Tests for getPlaylistTracks function (Story 3.5)
describe('getPlaylistTracks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PLAYLIST_ID', 'test-playlist-id');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // AC #1: Successfully fetches current playlist tracks
  it('should fetch tracks from playlist endpoint with field filtering', async () => {
    const mockResponse = {
      items: [
        { track: { uri: 'spotify:track:abc123' } },
        { track: { uri: 'spotify:track:def456' } },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await getPlaylistTracks('valid-token');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/playlists/test-playlist-id/tracks?fields=items(track(uri))&limit=50',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-token',
          Accept: 'application/json',
        },
      })
    );
    expect(result).toEqual(['spotify:track:abc123', 'spotify:track:def456']);
  });

  // AC #1: Returns track URIs in correct format
  it('should return track URIs in spotify:track:xxx format', async () => {
    const mockResponse = {
      items: [
        { track: { uri: 'spotify:track:track1' } },
        { track: { uri: 'spotify:track:track2' } },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await getPlaylistTracks('valid-token');

    expect(result).toHaveLength(2);
    result!.forEach((uri) => {
      expect(uri).toMatch(/^spotify:track:/);
    });
  });

  // AC #3: Returns null on timeout (fail-safe)
  it('should return null on timeout', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    const result = await getPlaylistTracks('valid-token');

    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Fetch playlist tracks timed out')
    );
  });

  // AC #3: Returns null on network error (fail-safe)
  it('should return null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await getPlaylistTracks('valid-token');

    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Fetch playlist tracks network error')
    );
  });

  // AC #3: Returns null on API error (fail-safe)
  it('should return null on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const result = await getPlaylistTracks('valid-token');

    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Fetch playlist tracks failed')
    );
  });

  // AC #3: Returns null on invalid JSON (fail-safe)
  it('should return null on invalid JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error('Invalid JSON'); },
    });

    const result = await getPlaylistTracks('valid-token');

    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Fetch playlist tracks invalid format')
    );
  });

  // AC #3: Returns null on unexpected structure (fail-safe)
  it('should return null on unexpected response structure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ wrongStructure: true }),
    });

    const result = await getPlaylistTracks('valid-token');

    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Fetch playlist tracks unexpected structure')
    );
  });

  // Returns null when PLAYLIST_ID is missing
  it('should return null when PLAYLIST_ID is missing', async () => {
    vi.stubEnv('PLAYLIST_ID', '');

    const result = await getPlaylistTracks('valid-token');

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Returns null when PLAYLIST_ID is whitespace only
  it('should return null when PLAYLIST_ID is whitespace only', async () => {
    vi.stubEnv('PLAYLIST_ID', '   ');

    const result = await getPlaylistTracks('valid-token');

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Filters out non-track URIs
  it('should filter out items with invalid track URIs', async () => {
    const mockResponse = {
      items: [
        { track: { uri: 'spotify:track:valid1' } },
        { track: { uri: 'spotify:episode:podcast1' } }, // Not a track
        { track: { uri: 'spotify:track:valid2' } },
        { track: {} }, // Missing uri
        { wrongField: {} }, // Missing track
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await getPlaylistTracks('valid-token');

    expect(result).toEqual(['spotify:track:valid1', 'spotify:track:valid2']);
  });

  // Logs success with track count
  it('should log success with track count', async () => {
    const mockResponse = {
      items: [
        { track: { uri: 'spotify:track:abc123' } },
        { track: { uri: 'spotify:track:def456' } },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    await getPlaylistTracks('valid-token');

    expect(console.log).toHaveBeenCalledWith('✅ Fetched 2 current playlist tracks');
  });

  // Logs fetching message before request
  it('should log fetching message before request', async () => {
    const mockResponse = {
      items: [{ track: { uri: 'spotify:track:abc123' } }],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    await getPlaylistTracks('valid-token');

    expect(console.log).toHaveBeenCalledWith('🔄 Fetching current playlist tracks...');
  });
});

// Tests for main() function with updatePlaylist integration
describe('main', () => {
  // Mock process.exit to throw an error so execution stops (simulating real behavior)
  const mockExit = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
    throw new Error(`process.exit(${code})`);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SPOTIFY_CLIENT_ID', 'test-client-id');
    vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv('SPOTIFY_REFRESH_TOKEN', 'test-refresh-token');
    vi.stubEnv('PLAYLIST_ID', 'test-playlist-id');
    vi.stubEnv('TRACK_COUNT', '30');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // AC #6: Exit code 1 when updatePlaylist fails
  it('should exit with code 1 when updatePlaylist returns false', async () => {
    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock successful getRecentLikes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{ track: { uri: 'spotify:track:abc123' } }],
      }),
    });
    // Mock getPlaylistTracks returning different tracks (to trigger update)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });
    // Mock failed updatePlaylist
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Not found' } }),
    });

    await expect(main()).rejects.toThrow('process.exit(1)');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  // Exit code 1 when updatePlaylist fails with 401 (token expired)
  it('should exit with code 1 when updatePlaylist fails with 401', async () => {
    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock successful getRecentLikes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{ track: { uri: 'spotify:track:abc123' } }],
      }),
    });
    // Mock getPlaylistTracks returning different tracks (to trigger update)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });
    // Mock failed updatePlaylist with 401
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'The access token expired' } }),
    });

    await expect(main()).rejects.toThrow('process.exit(1)');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  // Exit code 1 when updatePlaylist fails with 403 (permission denied)
  it('should exit with code 1 when updatePlaylist fails with 403', async () => {
    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock successful getRecentLikes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{ track: { uri: 'spotify:track:abc123' } }],
      }),
    });
    // Mock getPlaylistTracks returning different tracks (to trigger update)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });
    // Mock failed updatePlaylist with 403
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'You cannot add tracks to this playlist' } }),
    });

    await expect(main()).rejects.toThrow('process.exit(1)');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  // Successful full flow
  it('should exit with code 0 on successful sync', async () => {
    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock successful getRecentLikes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { track: { uri: 'spotify:track:abc123' } },
          { track: { uri: 'spotify:track:def456' } },
        ],
      }),
    });
    // Mock getPlaylistTracks returning different tracks (to trigger update)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });
    // Mock successful updatePlaylist
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ snapshot_id: 'snapshot123' }),
    });
    // Mock successful updatePlaylistMetadata
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await expect(main()).rejects.toThrow('process.exit(0)');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  // AC #1: Successful sync logs "Synced {count} tracks to playlist"
  it('should log "Synced {count} tracks to playlist" on successful sync', async () => {
    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock successful getRecentLikes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { track: { uri: 'spotify:track:abc123' } },
          { track: { uri: 'spotify:track:def456' } },
        ],
      }),
    });
    // Mock getPlaylistTracks returning different tracks (to trigger update)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });
    // Mock successful updatePlaylist
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ snapshot_id: 'snapshot123' }),
    });
    // Mock successful updatePlaylistMetadata
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await expect(main()).rejects.toThrow('process.exit(0)');

    expect(console.log).toHaveBeenCalledWith('✅ Synced 2 tracks to playlist');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  // AC #4: Sync succeeds even when metadata update fails
  it('should exit with code 0 even when metadata update fails', async () => {
    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock successful getRecentLikes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{ track: { uri: 'spotify:track:abc123' } }],
      }),
    });
    // Mock getPlaylistTracks returning different tracks (to trigger update)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });
    // Mock successful updatePlaylist
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ snapshot_id: 'snapshot123' }),
    });
    // Mock FAILED updatePlaylistMetadata
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(main()).rejects.toThrow('process.exit(0)');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Could not update playlist title')
    );
    expect(console.log).toHaveBeenCalledWith('✅ Synced 1 tracks to playlist');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  // AC #3: Token failure logs "Sync failed" message
  it('should log "Sync failed" when token refresh fails', async () => {
    // Token refresh fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    });

    await expect(main()).rejects.toThrow('process.exit(1)');

    expect(console.error).toHaveBeenCalledWith('❌ Sync failed: could not obtain access token');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  // AC #3: Token failure when missing credentials
  it('should log "Sync failed" when credentials are missing', async () => {
    vi.stubEnv('SPOTIFY_CLIENT_ID', '');

    await expect(main()).rejects.toThrow('process.exit(1)');

    expect(console.error).toHaveBeenCalledWith('❌ Sync failed: could not obtain access token');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  // AC #3: Playlist update failure logs "Sync failed" message
  it('should log "Sync failed" when updatePlaylist fails', async () => {
    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock successful getRecentLikes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{ track: { uri: 'spotify:track:abc123' } }],
      }),
    });
    // Mock getPlaylistTracks returning different tracks (to trigger update)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });
    // Mock failed updatePlaylist
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Not found' } }),
    });

    await expect(main()).rejects.toThrow('process.exit(1)');

    expect(console.error).toHaveBeenCalledWith('❌ Sync failed: could not update playlist');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  // AC #3: getRecentLikes API failure should fail the sync (protect playlist)
  it('should fail sync when getRecentLikes fails (protect playlist from clearing)', async () => {
    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock failed getRecentLikes (API error)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Token expired' } }),
    });

    await expect(main()).rejects.toThrow('process.exit(1)');

    // Sync should fail (exit 1) to protect the playlist from being cleared
    expect(console.error).toHaveBeenCalledWith('❌ Sync failed: could not fetch likes');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  // Validation: logs action before updating playlist
  it('should log the action before updating playlist', async () => {
    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock successful getRecentLikes with 2 tracks
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { track: { uri: 'spotify:track:abc123' } },
          { track: { uri: 'spotify:track:def456' } },
        ],
      }),
    });
    // Mock getPlaylistTracks returning different tracks (to trigger update)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });
    // Mock successful updatePlaylist
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ snapshot_id: 'snapshot123' }),
    });
    // Mock successful updatePlaylistMetadata
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await expect(main()).rejects.toThrow('process.exit(0)');

    // Should log the action we're about to take
    expect(console.log).toHaveBeenCalledWith('🔄 Action: replacing playlist contents with 2 tracks');
  });

  // Story 4.2: main() includes description in metadata update
  it('should include sync timestamp description in metadata update', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-11T14:32:45.000Z'));

    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock successful getRecentLikes with 2 tracks
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { track: { uri: 'spotify:track:abc123' } },
          { track: { uri: 'spotify:track:def456' } },
        ],
      }),
    });
    // Mock getPlaylistTracks returning different tracks (to trigger update)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });
    // Mock successful updatePlaylist
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ snapshot_id: 'snapshot123' }),
    });
    // Mock successful updatePlaylistMetadata
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await expect(main()).rejects.toThrow('process.exit(0)');

    // Verify the 5th fetch call (updatePlaylistMetadata) includes description
    const metadataCall = mockFetch.mock.calls[4];
    expect(metadataCall).toBeDefined();
    const body = JSON.parse(metadataCall![1].body);
    expect(body.name).toBe('LAST2LIKED');
    expect(body.description).toBe('Last sync: 2026-01-11 14:32:45 UTC');

    vi.useRealTimers();
  });

  // New test: logs playlist title update
  it('should log playlist title update during successful sync', async () => {
    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock successful getRecentLikes with 2 tracks
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { track: { uri: 'spotify:track:abc123' } },
          { track: { uri: 'spotify:track:def456' } },
        ],
      }),
    });
    // Mock getPlaylistTracks returning different tracks (to trigger update)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });
    // Mock successful updatePlaylist
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ snapshot_id: 'snapshot123' }),
    });
    // Mock successful updatePlaylistMetadata
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await expect(main()).rejects.toThrow('process.exit(0)');

    // Should log the playlist title update
    expect(console.log).toHaveBeenCalledWith('🔄 Updating playlist title to LAST2LIKED...');
    expect(console.log).toHaveBeenCalledWith('✅ Playlist title updated');
  });

  // SAFETY: Empty likes does NOT update playlist (never clear)
  it('should NOT update playlist when no tracks found (safety: never clear)', async () => {
    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock empty getRecentLikes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await expect(main()).rejects.toThrow('process.exit(0)');

    // Should NOT call updatePlaylist - only 2 API calls (token + likes)
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(console.log).toHaveBeenCalledWith('ℹ️ No liked tracks found - playlist unchanged (safety: never clear)');
    expect(console.log).toHaveBeenCalledWith('✅ Sync completed - no changes made');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  // Story 3.5 AC #1: Skip update when playlist already contains same tracks
  it('should skip update when playlist already up-to-date (idempotency)', async () => {
    const tracks = [
      { track: { uri: 'spotify:track:abc123' } },
      { track: { uri: 'spotify:track:def456' } },
    ];

    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock successful getRecentLikes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: tracks }),
    });
    // Mock getPlaylistTracks returning SAME tracks
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: tracks }),
    });
    // Mock successful updatePlaylistMetadata (still updates timestamp)
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await expect(main()).rejects.toThrow('process.exit(0)');

    // Should only make 4 calls: token, likes, playlistTracks, metadata
    // Should NOT call updatePlaylist (PUT /playlists/{id}/tracks)
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(console.log).toHaveBeenCalledWith('ℹ️ Playlist already up-to-date, skipping update');
    expect(console.log).toHaveBeenCalledWith('✅ Synced 2 tracks to playlist');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  // Story 3.5 AC #2: Proceed with update when tracks are different
  it('should proceed with update when tracks are different', async () => {
    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock successful getRecentLikes (new tracks)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { track: { uri: 'spotify:track:new1' } },
          { track: { uri: 'spotify:track:new2' } },
        ],
      }),
    });
    // Mock getPlaylistTracks returning DIFFERENT tracks
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { track: { uri: 'spotify:track:old1' } },
          { track: { uri: 'spotify:track:old2' } },
        ],
      }),
    });
    // Mock successful updatePlaylist
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ snapshot_id: 'snapshot123' }),
    });
    // Mock successful updatePlaylistMetadata
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await expect(main()).rejects.toThrow('process.exit(0)');

    // Should make 5 calls: token, likes, playlistTracks, updatePlaylist, metadata
    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(console.log).toHaveBeenCalledWith('🔄 Action: replacing playlist contents with 2 tracks');
    expect(console.log).toHaveBeenCalledWith('✅ Synced 2 tracks to playlist');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  // Story 3.5 AC #2: Proceed with update when order is different
  it('should proceed with update when track order is different', async () => {
    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock successful getRecentLikes (same tracks, different order)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { track: { uri: 'spotify:track:abc123' } },
          { track: { uri: 'spotify:track:def456' } },
        ],
      }),
    });
    // Mock getPlaylistTracks returning SAME tracks in DIFFERENT order
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { track: { uri: 'spotify:track:def456' } },
          { track: { uri: 'spotify:track:abc123' } },
        ],
      }),
    });
    // Mock successful updatePlaylist
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ snapshot_id: 'snapshot123' }),
    });
    // Mock successful updatePlaylistMetadata
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await expect(main()).rejects.toThrow('process.exit(0)');

    // Order matters - should proceed with update
    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(console.log).toHaveBeenCalledWith('🔄 Action: replacing playlist contents with 2 tracks');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  // Story 3.5 AC #3: Proceed with update when getPlaylistTracks fails (fail-safe)
  it('should proceed with update when getPlaylistTracks fails (fail-safe)', async () => {
    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock successful getRecentLikes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          { track: { uri: 'spotify:track:abc123' } },
          { track: { uri: 'spotify:track:def456' } },
        ],
      }),
    });
    // Mock getPlaylistTracks FAILING
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    // Mock successful updatePlaylist
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ snapshot_id: 'snapshot123' }),
    });
    // Mock successful updatePlaylistMetadata
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await expect(main()).rejects.toThrow('process.exit(0)');

    // Should proceed with update despite getPlaylistTracks failure
    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Fetch playlist tracks failed')
    );
    expect(console.log).toHaveBeenCalledWith('🔄 Action: replacing playlist contents with 2 tracks');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  // Story 3.5: Still updates metadata when skipping playlist update
  it('should still update metadata when skipping playlist update', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-11T15:00:00.000Z'));

    const tracks = [{ track: { uri: 'spotify:track:abc123' } }];

    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock successful getRecentLikes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: tracks }),
    });
    // Mock getPlaylistTracks returning SAME tracks
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: tracks }),
    });
    // Mock successful updatePlaylistMetadata
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await expect(main()).rejects.toThrow('process.exit(0)');

    // Verify metadata call was made with correct timestamp
    const metadataCall = mockFetch.mock.calls[3];
    expect(metadataCall).toBeDefined();
    expect(metadataCall![0]).toBe('https://api.spotify.com/v1/playlists/test-playlist-id');
    const body = JSON.parse(metadataCall![1].body);
    expect(body.name).toBe('LAST1LIKED');
    expect(body.description).toBe('Last sync: 2026-01-11 15:00:00 UTC');

    vi.useRealTimers();
  });

  // Story 3.5: Exit success even when metadata fails during idempotent skip
  it('should exit with code 0 when playlist up-to-date even if metadata update fails', async () => {
    const tracks = [{ track: { uri: 'spotify:track:abc123' } }];

    // Mock successful token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'valid-token' }),
    });
    // Mock successful getRecentLikes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: tracks }),
    });
    // Mock getPlaylistTracks returning SAME tracks (triggers idempotent path)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: tracks }),
    });
    // Mock FAILED updatePlaylistMetadata
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(main()).rejects.toThrow('process.exit(0)');

    // Should still succeed (metadata is non-fatal)
    expect(console.log).toHaveBeenCalledWith('ℹ️ Playlist already up-to-date, skipping update');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Could not update playlist title')
    );
    expect(console.log).toHaveBeenCalledWith('✅ Synced 1 tracks to playlist');
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
