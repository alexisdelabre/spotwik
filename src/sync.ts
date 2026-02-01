// src/sync.ts - Spotify Likes Sync
import { log } from './sync-logger';

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Obtains a valid Spotify access token using the refresh token flow.
 * Uses OAuth 2.0 client credentials with refresh token grant type.
 *
 * @returns Access token string on success, null on failure
 */
export async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) { log.tokenMissingCredentials(); return null; }

  log.tokenRefreshing();

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') log.tokenTimeout();
    else log.tokenNetworkError();
    return null;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    try {
      const errorData: unknown = await response.json();
      const errorType = (errorData as { error?: string })?.error ?? 'unknown';
      log.tokenApiError(errorType, response.status);
    } catch { log.tokenStatusError(response.status); }
    return null;
  }

  let data: unknown;
  try { data = await response.json(); }
  catch { log.tokenInvalidFormat(); return null; }

  const accessToken =
    data &&
    typeof data === 'object' &&
    'access_token' in data &&
    typeof (data as { access_token: unknown }).access_token === 'string'
      ? (data as { access_token: string }).access_token
      : null;

  if (!accessToken || accessToken.trim() === '') { log.tokenMissingInResponse(); return null; }

  return accessToken;
}

/**
 * Fetches the user's N most recently liked tracks from Spotify.
 * Returns tracks in chronological order (most recent first - API default).
 *
 * @param accessToken - Valid Spotify access token
 * @returns Array of track URIs (e.g., "spotify:track:xxx"), null on API failure
 */
export async function getRecentLikes(accessToken: string): Promise<string[] | null> {
  const trackCountEnv = process.env.TRACK_COUNT;
  let trackCount = trackCountEnv ? parseInt(trackCountEnv, 10) : 30;

  if (isNaN(trackCount) || trackCount < 1) trackCount = 30;
  if (trackCount > 50) { log.trackCountExceedsLimit(trackCountEnv!); trackCount = 50; }

  log.fetchingLikes(trackCount);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`https://api.spotify.com/v1/me/tracks?limit=${trackCount}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') log.fetchLikesTimeout();
    else log.fetchLikesNetworkError();
    return null;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    try {
      const errorData: unknown = await response.json();
      const errorMsg = (errorData as { error?: { message?: string } })?.error?.message ?? 'unknown';
      log.fetchLikesApiError(errorMsg, response.status);
    } catch { log.fetchLikesStatusError(response.status); }
    return null;
  }

  let data: unknown;
  try { data = await response.json(); }
  catch { log.fetchLikesInvalidFormat(); return null; }

  const items = (data as { items?: unknown[] })?.items;
  if (!Array.isArray(items)) { log.fetchLikesUnexpectedStructure(); return null; }

  const trackUris: string[] = [];
  for (const item of items) {
    const uri = (item as { track?: { uri?: string } })?.track?.uri;
    if (typeof uri === 'string' && uri.startsWith('spotify:track:')) trackUris.push(uri);
  }

  return trackUris;
}

/**
 * Fetches the current tracks from the target playlist.
 * Used for idempotency check before updating.
 *
 * @param accessToken - Valid Spotify access token
 * @returns Array of track URIs, null on any error (fail-safe)
 */
export async function getPlaylistTracks(accessToken: string): Promise<string[] | null> {
  const playlistId = process.env.PLAYLIST_ID;

  if (!playlistId || playlistId.trim() === '') { log.playlistNotConfigured(); return null; }

  log.fetchingPlaylistTracks();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(uri))&limit=50`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') log.fetchPlaylistTracksTimeout();
    else log.fetchPlaylistTracksNetworkError();
    return null;
  }
  clearTimeout(timeoutId);

  if (!response.ok) { log.fetchPlaylistTracksError(); return null; }

  let data: unknown;
  try { data = await response.json(); }
  catch { log.fetchPlaylistTracksInvalidFormat(); return null; }

  const items = (data as { items?: unknown[] })?.items;
  if (!Array.isArray(items)) { log.fetchPlaylistTracksUnexpectedStructure(); return null; }

  const trackUris: string[] = [];
  for (const item of items) {
    const uri = (item as { track?: { uri?: string } })?.track?.uri;
    if (typeof uri === 'string' && uri.startsWith('spotify:track:')) trackUris.push(uri);
  }

  log.fetchPlaylistTracks(trackUris.length);
  return trackUris;
}

/**
 * Updates a Spotify playlist with the given track URIs.
 * Replaces all existing tracks with the provided list.
 *
 * @param accessToken - Valid Spotify access token
 * @param trackUris - Array of track URIs (e.g., "spotify:track:xxx")
 * @returns true on success, false on failure
 */
export async function updatePlaylist(accessToken: string, trackUris: string[]): Promise<boolean> {
  const playlistId = process.env.PLAYLIST_ID;

  if (!playlistId || playlistId.trim() === '') { log.playlistNotConfigured(); return false; }

  log.updatingPlaylist(trackUris.length);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ uris: trackUris }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') log.updatePlaylistTimeout();
    else log.updatePlaylistNetworkError();
    return false;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    try {
      const errorData: unknown = await response.json();
      const errorMsg = (errorData as { error?: { message?: string } })?.error?.message ?? 'unknown';
      if (response.status === 404) log.updatePlaylistNotFound();
      else if (response.status === 403) log.updatePlaylistForbidden();
      else if (response.status === 401) log.updatePlaylistUnauthorized();
      else log.updatePlaylistApiError(errorMsg, response.status);
    } catch { log.updatePlaylistStatusError(response.status); }
    return false;
  }

  return true;
}

/**
 * Updates playlist metadata (name and/or description).
 * Failure is non-fatal - logs warning but doesn't fail the sync.
 *
 * @param accessToken - Valid Spotify access token
 * @param metadata - Object with optional name and description
 * @returns true on success, false on failure
 */
export async function updatePlaylistMetadata(
  accessToken: string,
  metadata: { name?: string; description?: string }
): Promise<boolean> {
  const playlistId = process.env.PLAYLIST_ID;

  if (!playlistId || playlistId.trim() === '') { log.playlistNotConfigured(); return false; }

  if (metadata.name) log.updatingPlaylistTitle(metadata.name);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(metadata),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') log.playlistTitleTimeout();
    else log.playlistTitleNetworkError();
    return false;
  }
  clearTimeout(timeoutId);

  if (!response.ok) { log.playlistTitleUpdateFailed(); return false; }

  if (metadata.name) log.playlistTitleUpdated();
  return true;
}

/**
 * Main entry point for the Spotify sync script.
 */
export async function main(): Promise<void> {
  log.syncInitialized();

  const accessToken = await getAccessToken();
  if (!accessToken) { log.syncFailedNoToken(); process.exit(1); }
  log.tokenSuccess();

  const trackUris = await getRecentLikes(accessToken);
  if (trackUris === null) { log.syncFailedNoLikes(); process.exit(1); }

  const validTracks = trackUris.filter(uri => uri.length > 14);
  if (validTracks.length !== trackUris.length) { log.syncFailedInvalidUris(trackUris.length - validTracks.length); process.exit(1); }

  if (validTracks.length === 0) { log.syncNoTracksFound(); log.syncCompletedNoChanges(); process.exit(0); }

  const expectedCount = parseInt(process.env.TRACK_COUNT || '30', 10);
  log.syncFetchedTracks(validTracks.length, expectedCount);

  // Idempotency check: compare current playlist with new tracks
  const currentTracks = await getPlaylistTracks(accessToken);
  const playlistTitle = `LAST${validTracks.length}LIKED`;
  const syncTimestamp = `Last sync: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC`;

  if (currentTracks !== null && JSON.stringify(currentTracks) === JSON.stringify(validTracks)) {
    log.playlistAlreadyUpToDate();
    // Still update metadata (timestamp changes)
    await updatePlaylistMetadata(accessToken, { name: playlistTitle, description: syncTimestamp });
    log.syncSuccess(validTracks.length);
    process.exit(0);
  }

  log.syncReplacingPlaylist(validTracks.length);

  const updateSuccess = await updatePlaylist(accessToken, validTracks);
  if (!updateSuccess) { log.syncFailedUpdatePlaylist(); process.exit(1); }

  // Update playlist metadata (non-fatal if fails)
  await updatePlaylistMetadata(accessToken, { name: playlistTitle, description: syncTimestamp });

  log.syncSuccess(validTracks.length);
  process.exit(0);
}

// Only run main() when executed directly (not when imported for tests)
if (require.main === module) {
  main().catch(() => { log.syncUnexpectedError(); process.exit(1); });
}
