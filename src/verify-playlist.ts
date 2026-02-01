// src/verify-playlist.ts - Verify playlist title matches LAST{N}LIKED format

import { getAccessToken } from './sync';
import { log } from './verify-playlist-logger';

const REQUEST_TIMEOUT_MS = 10_000;

interface PlaylistDetails {
  name: string;
  description: string | null;
  tracks: { total: number };
}

/**
 * Validates that data matches PlaylistDetails structure.
 */
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

/**
 * Fetches playlist details from Spotify API.
 */
async function getPlaylistDetails(accessToken: string): Promise<PlaylistDetails | null> {
  const playlistId = process.env.PLAYLIST_ID;

  if (!playlistId || playlistId.trim() === '') { log.playlistNotConfigured(); return null; }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=name,description,tracks.total`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeoutId);
    log.playlistRequestFailed();
    return null;
  }
  clearTimeout(timeoutId);

  if (!response.ok) { log.playlistApiError(response.status); return null; }

  let data: unknown;
  try { data = await response.json(); }
  catch { log.invalidPlaylistResponse(); return null; }

  if (!isPlaylistDetails(data)) { log.invalidPlaylistStructure(); return null; }

  return data;
}

/**
 * Main verification function.
 */
async function verify(): Promise<void> {
  log.verifying();

  const accessToken = await getAccessToken();
  if (!accessToken) { process.exit(1); }

  const playlist = await getPlaylistDetails(accessToken);
  if (!playlist) { process.exit(1); }

  const { name, description, tracks } = playlist;
  const expectedPattern = /^LAST(\d+)LIKED$/;
  const match = name.match(expectedPattern);

  log.playlistName(name);
  log.trackCount(tracks.total);

  // Verify description (Story 4.2)
  if (description && description.startsWith('Last sync:')) {
    log.descriptionVerified(description);
  } else {
    log.descriptionMissing();
  }

  log.separator();

  if (!match || match[1] === undefined) { log.titleFormatInvalid(name); process.exit(1); }

  const titleCount = parseInt(match[1], 10);

  if (titleCount === tracks.total) {
    log.pass(titleCount, tracks.total);
  } else {
    log.countMismatch(titleCount, tracks.total);
  }
}

// Only run verify() when executed directly (not when imported for tests)
if (require.main === module) {
  verify().catch((err) => { log.unexpectedError(err); process.exit(1); });
}
