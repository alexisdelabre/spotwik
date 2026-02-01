// src/verify-playlist-logger.ts - Centralized logging for playlist verification

/**
 * Centralized logger for verify-playlist operations.
 * Follows project pattern: extracted logging module.
 */
export const log = {
  // === Verification Flow ===
  verifying: () => console.log('🔍 Verifying playlist title...\n'),
  playlistName: (name: string) => console.log(`📋 Playlist name: ${name}`),
  trackCount: (count: number) => console.log(`🎵 Track count: ${count}`),
  separator: () => console.log(''),

  // === Description ===
  descriptionVerified: (description: string) => console.log(`✅ Description verified: ${description}`),
  descriptionMissing: () => console.warn('⚠️ Description missing or does not start with "Last sync:"'),

  // === Success ===
  pass: (titleCount: number, actualCount: number) =>
    console.log(`✅ PASS: Title matches track count (${titleCount} = ${actualCount})`),

  // === Warnings ===
  countMismatch: (titleCount: number, actualCount: number) => {
    console.warn(`⚠️ WARN: Title count (${titleCount}) differs from actual tracks (${actualCount})`);
    console.log('   This may be expected if tracks were added/removed after last sync');
  },

  // === Errors - Token ===
  missingCredentials: () => console.error('❌ Missing Spotify credentials'),
  tokenRequestFailed: () => console.error('❌ Token request failed'),
  tokenRefreshFailed: () => console.error('❌ Token refresh failed'),
  invalidTokenResponse: () => console.error('❌ Invalid token response'),
  noAccessToken: () => console.error('❌ No access token in response'),

  // === Errors - Playlist ===
  playlistNotConfigured: () => console.error('❌ PLAYLIST_ID not configured'),
  playlistRequestFailed: () => console.error('❌ Playlist request failed'),
  playlistApiError: (status: number) => console.error(`❌ API error: ${status}`),
  invalidPlaylistResponse: () => console.error('❌ Invalid response format'),
  invalidPlaylistStructure: () => console.error('❌ Invalid playlist structure in response'),

  // === Errors - Verification ===
  titleFormatInvalid: (name: string) =>
    console.error(`❌ FAIL: Title "${name}" does not match LAST{N}LIKED format`),
  unexpectedError: (err: unknown) => console.error('❌ Unexpected error:', err),
};
