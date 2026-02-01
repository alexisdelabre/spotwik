// src/sync-logger.ts - Centralized logging for Spotify sync

/**
 * Centralized logger for sync operations.
 * Extracts all console output from sync.ts to reduce visual complexity.
 */
export const log = {
  // === Token Operations ===
  tokenRefreshing: () => console.log('🔄 Refreshing access token...'),
  tokenSuccess: () => console.log('✅ Access token obtained'),
  tokenMissingCredentials: () => console.error('❌ Missing Spotify credentials in environment'),
  tokenTimeout: () => console.error('❌ Token refresh failed: request timeout'),
  tokenNetworkError: () => console.error('❌ Token refresh failed: network error'),
  tokenApiError: (errorType: string, status: number) =>
    console.error(`❌ Token refresh failed: ${errorType} (${status})`),
  tokenStatusError: (status: number) => console.error(`❌ Token refresh failed: ${status}`),
  tokenInvalidFormat: () => console.error('❌ Token refresh failed: invalid response format'),
  tokenMissingInResponse: () =>
    console.error('❌ Token refresh failed: missing or empty access_token in response'),

  // === Fetch Likes Operations ===
  fetchingLikes: (count: number) => console.log(`🔄 Fetching ${count} most recent likes...`),
  trackCountExceedsLimit: (requested: string) =>
    console.log(`ℹ️ TRACK_COUNT ${requested} exceeds API limit, using 50`),
  fetchLikesTimeout: () => console.error('❌ Fetch likes failed: request timeout'),
  fetchLikesNetworkError: () => console.error('❌ Fetch likes failed: network error'),
  fetchLikesApiError: (message: string, status: number) =>
    console.error(`❌ Fetch likes failed: ${message} (${status})`),
  fetchLikesStatusError: (status: number) => console.error(`❌ Fetch likes failed: ${status}`),
  fetchLikesInvalidFormat: () => console.error('❌ Fetch likes failed: invalid response format'),
  fetchLikesUnexpectedStructure: () =>
    console.error('❌ Fetch likes failed: unexpected response structure'),

  // === Fetch Playlist Tracks Operations ===
  fetchingPlaylistTracks: () => console.log('🔄 Fetching current playlist tracks...'),
  fetchPlaylistTracks: (count: number) => console.log(`✅ Fetched ${count} current playlist tracks`),
  fetchPlaylistTracksTimeout: () => console.warn('⚠️ Fetch playlist tracks timed out - proceeding with update'),
  fetchPlaylistTracksNetworkError: () => console.warn('⚠️ Fetch playlist tracks network error - proceeding with update'),
  fetchPlaylistTracksError: () => console.warn('⚠️ Fetch playlist tracks failed - proceeding with update'),
  fetchPlaylistTracksInvalidFormat: () => console.warn('⚠️ Fetch playlist tracks invalid format - proceeding with update'),
  fetchPlaylistTracksUnexpectedStructure: () => console.warn('⚠️ Fetch playlist tracks unexpected structure - proceeding with update'),
  playlistAlreadyUpToDate: () => console.log('ℹ️ Playlist already up-to-date, skipping update'),

  // === Playlist Update Operations ===
  updatingPlaylist: (count: number) => console.log(`🔄 Updating playlist with ${count} tracks...`),

  // === Playlist Metadata Operations ===
  updatingPlaylistTitle: (title: string) => console.log(`🔄 Updating playlist title to ${title}...`),
  playlistTitleUpdated: () => console.log('✅ Playlist title updated'),
  playlistTitleUpdateFailed: () => console.warn('⚠️ Warning: Could not update playlist title'),
  playlistTitleTimeout: () => console.warn('⚠️ Warning: Playlist title update timed out'),
  playlistTitleNetworkError: () => console.warn('⚠️ Warning: Playlist title update network error'),
  playlistNotConfigured: () =>
    console.error(
      '❌ PLAYLIST_ID not configured. Create a playlist in Spotify and add its ID to your environment.'
    ),
  updatePlaylistTimeout: () => console.error('❌ Update playlist failed: request timeout'),
  updatePlaylistNetworkError: () => console.error('❌ Update playlist failed: network error'),
  updatePlaylistNotFound: () =>
    console.error('❌ Update playlist failed: Playlist not found - did you create it in Spotify?'),
  updatePlaylistForbidden: () =>
    console.error('❌ Update playlist failed: Permission denied - ensure you own this playlist'),
  updatePlaylistUnauthorized: () =>
    console.error('❌ Update playlist failed: Authentication failed - token may be expired'),
  updatePlaylistApiError: (message: string, status: number) =>
    console.error(`❌ Update playlist failed: ${message} (${status})`),
  updatePlaylistStatusError: (status: number) =>
    console.error(`❌ Update playlist failed: ${status}`),

  // === Main Sync Flow ===
  syncInitialized: () => console.log('🔄 Spotify sync script initialized'),
  syncFailedNoToken: () => console.error('❌ Sync failed: could not obtain access token'),
  syncFailedNoLikes: () => console.error('❌ Sync failed: could not fetch likes'),
  syncFailedInvalidUris: (count: number) =>
    console.error(`❌ Sync failed: ${count} invalid track URIs detected`),
  syncNoTracksFound: () =>
    console.log('ℹ️ No liked tracks found - playlist unchanged (safety: never clear)'),
  syncCompletedNoChanges: () => console.log('✅ Sync completed - no changes made'),
  syncFetchedTracks: (fetched: number, expected: number) => {
    if (fetched < expected) {
      console.log(`✅ Fetched ${fetched} tracks (user has fewer than ${expected} likes)`);
    } else {
      console.log(`✅ Fetched ${fetched} tracks`);
    }
  },
  syncReplacingPlaylist: (count: number) =>
    console.log(`🔄 Action: replacing playlist contents with ${count} tracks`),
  syncFailedUpdatePlaylist: () => console.error('❌ Sync failed: could not update playlist'),
  syncSuccess: (count: number) => console.log(`✅ Synced ${count} tracks to playlist`),
  syncUnexpectedError: () => console.error('❌ Unexpected error during execution'),
};
