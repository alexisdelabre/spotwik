// src/sync.ts - Spotify Likes Sync

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Obtains a valid Spotify access token using the refresh token flow.
 * Uses OAuth 2.0 client credentials with refresh token grant type.
 *
 * @returns Access token string on success, null on failure
 */
export async function getAccessToken(): Promise<string | null> {
  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  const refreshToken = Deno.env.get("SPOTIFY_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('❌ Missing Spotify credentials in environment');
    return null;
  }

  console.log('🔄 Refreshing access token...');

  const basicAuth = btoa(`${clientId}:${clientSecret}`);
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
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('❌ Token refresh failed: request timeout');
    } else {
      console.error('❌ Token refresh failed: network error');
    }
    return null;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    try {
      const errorData: unknown = await response.json();
      const errorType = (errorData as { error?: string })?.error ?? 'unknown';
      console.error(`❌ Token refresh failed: ${errorType} (${response.status})`);
    } catch {
      console.error(`❌ Token refresh failed: ${response.status}`);
    }
    return null;
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    console.error('❌ Token refresh failed: invalid response format');
    return null;
  }

  const accessToken =
    data &&
    typeof data === 'object' &&
    'access_token' in data &&
    typeof (data as { access_token: unknown }).access_token === 'string'
      ? (data as { access_token: string }).access_token
      : null;

  if (!accessToken || accessToken.trim() === '') {
    console.error('❌ Token refresh failed: missing or empty access_token in response');
    return null;
  }

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
  const trackCountEnv = Deno.env.get("TRACK_COUNT");
  let trackCount = trackCountEnv ? parseInt(trackCountEnv, 10) : 50;

  if (isNaN(trackCount) || trackCount < 1) trackCount = 50;
  if (trackCount > 50) {
    console.log(`ℹ️ TRACK_COUNT ${trackCountEnv} exceeds API limit, using 50`);
    trackCount = 50;
  }

  console.log(`🔄 Fetching ${trackCount} most recent likes...`);

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
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('❌ Fetch likes failed: request timeout');
    } else {
      console.error('❌ Fetch likes failed: network error');
    }
    return null;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    try {
      const errorData: unknown = await response.json();
      const errorMsg = (errorData as { error?: { message?: string } })?.error?.message ?? 'unknown';
      console.error(`❌ Fetch likes failed: ${errorMsg} (${response.status})`);
    } catch {
      console.error(`❌ Fetch likes failed: ${response.status}`);
    }
    return null;
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    console.error('❌ Fetch likes failed: invalid response format');
    return null;
  }

  const items = (data as { items?: unknown[] })?.items;
  if (!Array.isArray(items)) {
    console.error('❌ Fetch likes failed: unexpected response structure');
    return null;
  }

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
  const playlistId = Deno.env.get("PLAYLIST_ID");

  if (!playlistId || playlistId.trim() === '') {
    console.error('❌ PLAYLIST_ID not configured');
    return null;
  }

  console.log('🔄 Fetching current playlist tracks...');

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
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('⚠️ Fetch playlist tracks timed out - proceeding with update');
    } else {
      console.warn('⚠️ Fetch playlist tracks network error - proceeding with update');
    }
    return null;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    console.warn('⚠️ Fetch playlist tracks failed - proceeding with update');
    return null;
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    console.warn('⚠️ Fetch playlist tracks invalid format - proceeding with update');
    return null;
  }

  const items = (data as { items?: unknown[] })?.items;
  if (!Array.isArray(items)) {
    console.warn('⚠️ Fetch playlist tracks unexpected structure - proceeding with update');
    return null;
  }

  const trackUris: string[] = [];
  for (const item of items) {
    const uri = (item as { track?: { uri?: string } })?.track?.uri;
    if (typeof uri === 'string' && uri.startsWith('spotify:track:')) trackUris.push(uri);
  }

  console.log(`✅ Fetched ${trackUris.length} current playlist tracks`);
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
  const playlistId = Deno.env.get("PLAYLIST_ID");

  if (!playlistId || playlistId.trim() === '') {
    console.error('❌ PLAYLIST_ID not configured');
    return false;
  }

  console.log(`🔄 Updating playlist with ${trackUris.length} tracks...`);

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
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('❌ Update playlist failed: request timeout');
    } else {
      console.error('❌ Update playlist failed: network error');
    }
    return false;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    try {
      const errorData: unknown = await response.json();
      const errorMsg = (errorData as { error?: { message?: string } })?.error?.message ?? 'unknown';
      if (response.status === 404) {
        console.error('❌ Update playlist failed: Playlist not found');
      } else if (response.status === 403) {
        console.error('❌ Update playlist failed: Permission denied');
      } else if (response.status === 401) {
        console.error('❌ Update playlist failed: Authentication failed');
      } else {
        console.error(`❌ Update playlist failed: ${errorMsg} (${response.status})`);
      }
    } catch {
      console.error(`❌ Update playlist failed: ${response.status}`);
    }
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
  const playlistId = Deno.env.get("PLAYLIST_ID");

  if (!playlistId || playlistId.trim() === '') {
    console.error('❌ PLAYLIST_ID not configured');
    return false;
  }

  if (metadata.name) {
    console.log(`🔄 Updating playlist title to ${metadata.name}...`);
  }

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
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('⚠️ Playlist title update timed out');
    } else {
      console.warn('⚠️ Playlist title update network error');
    }
    return false;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    console.warn('⚠️ Could not update playlist title');
    return false;
  }

  if (metadata.name) {
    console.log('✅ Playlist title updated');
  }
  return true;
}

/**
 * Main entry point for the Spotify sync script.
 */
export async function main(): Promise<void> {
  console.log('🔄 Spotify sync script initialized');

  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.error('❌ Sync failed: could not obtain access token');
    Deno.exit(1);
  }
  console.log('✅ Access token obtained');

  const trackUris = await getRecentLikes(accessToken);
  if (trackUris === null) {
    console.error('❌ Sync failed: could not fetch likes');
    Deno.exit(1);
  }

  const validTracks = trackUris.filter(uri => uri.length > 14);
  if (validTracks.length !== trackUris.length) {
    console.error(`❌ Sync failed: ${trackUris.length - validTracks.length} invalid track URIs detected`);
    Deno.exit(1);
  }

  if (validTracks.length === 0) {
    console.log('ℹ️ No liked tracks found - playlist unchanged');
    console.log('✅ Sync completed - no changes made');
    Deno.exit(0);
  }

  const expectedCount = parseInt(Deno.env.get("TRACK_COUNT") || '50', 10);
  if (validTracks.length < expectedCount) {
    console.log(`✅ Fetched ${validTracks.length} tracks (user has fewer than ${expectedCount} likes)`);
  } else {
    console.log(`✅ Fetched ${validTracks.length} tracks`);
  }

  // Idempotency check: compare current playlist with new tracks
  const currentTracks = await getPlaylistTracks(accessToken);
  const playlistTitle = `LAST${validTracks.length}LIKED`;
  const syncTimestamp = `Last sync: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC`;

  if (currentTracks !== null && JSON.stringify(currentTracks) === JSON.stringify(validTracks)) {
    console.log('ℹ️ Playlist already up-to-date, skipping update');
    await updatePlaylistMetadata(accessToken, { name: playlistTitle, description: syncTimestamp });
    console.log(`✅ Synced ${validTracks.length} tracks to playlist`);
    Deno.exit(0);
  }

  console.log(`🔄 Replacing playlist contents with ${validTracks.length} tracks`);

  const updateSuccess = await updatePlaylist(accessToken, validTracks);
  if (!updateSuccess) {
    console.error('❌ Sync failed: could not update playlist');
    Deno.exit(1);
  }

  await updatePlaylistMetadata(accessToken, { name: playlistTitle, description: syncTimestamp });

  console.log(`✅ Synced ${validTracks.length} tracks to playlist`);
  Deno.exit(0);
}

// Only run main() when executed directly (not when imported for tests)
if (import.meta.main) {
  main().catch(() => {
    console.error('❌ Unexpected error during execution');
    Deno.exit(1);
  });
}
