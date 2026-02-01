// src/sync.test.ts - Tests for sync.ts functions (Deno)

import { assertEquals, assertMatch } from "@std/assert";
import { stub, type Stub, restore } from "@std/testing/mock";
import { FakeTime } from "@std/testing/time";
import {
  getRecentLikes,
  getAccessToken,
  updatePlaylist,
  updatePlaylistMetadata,
  getPlaylistTracks,
  main,
} from "./sync.ts";

// Helper to create a mock Response
function mockResponse(ok: boolean, data: unknown, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  } as Response;
}

// Helper to save and restore env vars
function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => Promise<void> | void
): () => Promise<void> {
  return async () => {
    const saved: Record<string, string | undefined> = {};
    for (const key of Object.keys(vars)) {
      saved[key] = Deno.env.get(key);
      const value = vars[key];
      if (value === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, value);
      }
    }
    try {
      await fn();
    } finally {
      for (const key of Object.keys(saved)) {
        const value = saved[key];
        if (value === undefined) {
          Deno.env.delete(key);
        } else {
          Deno.env.set(key, value);
        }
      }
    }
  };
}

// Suppress console output during tests
let consoleLogStub: Stub;
let consoleErrorStub: Stub;
let consoleWarnStub: Stub;

function setupConsoleMocks() {
  consoleLogStub = stub(console, "log");
  consoleErrorStub = stub(console, "error");
  consoleWarnStub = stub(console, "warn");
}

function restoreConsoleMocks() {
  consoleLogStub.restore();
  consoleErrorStub.restore();
  consoleWarnStub.restore();
}

// ============================================================================
// getRecentLikes tests
// ============================================================================

Deno.test("getRecentLikes", async (t) => {
  await t.step(
    "should fetch tracks from /me/tracks endpoint with default limit of 50",
    withEnv({ TRACK_COUNT: undefined }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(
            mockResponse(true, {
              items: [
                { track: { uri: "spotify:track:abc123" } },
                { track: { uri: "spotify:track:def456" } },
              ],
            })
          )
      );

      try {
        const result = await getRecentLikes("valid-token");

        assertEquals(fetchStub.calls.length, 1);
        const [url, options] = fetchStub.calls[0]!.args;
        assertEquals(url, "https://api.spotify.com/v1/me/tracks?limit=50");
        assertEquals((options as RequestInit).method, "GET");
        const headers = (options as RequestInit).headers as Record<string, string>;
        assertEquals(headers["Authorization"], "Bearer valid-token");
        assertEquals(result, ["spotify:track:abc123", "spotify:track:def456"]);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return track URIs in spotify:track:xxx format",
    withEnv({ TRACK_COUNT: undefined }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(
            mockResponse(true, {
              items: [
                { track: { uri: "spotify:track:track1" } },
                { track: { uri: "spotify:track:track2" } },
                { track: { uri: "spotify:track:track3" } },
              ],
            })
          )
      );

      try {
        const result = await getRecentLikes("valid-token");

        assertEquals(result?.length, 3);
        result!.forEach((uri) => {
          assertMatch(uri, /^spotify:track:/);
        });
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should use TRACK_COUNT environment variable when set",
    withEnv({ TRACK_COUNT: "50" }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(mockResponse(true, { items: [] }))
      );

      try {
        await getRecentLikes("valid-token");

        const [url] = fetchStub.calls[0]!.args;
        assertEquals(url, "https://api.spotify.com/v1/me/tracks?limit=50");
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should cap TRACK_COUNT at 50 when exceeds Spotify API limit",
    withEnv({ TRACK_COUNT: "100" }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(mockResponse(true, { items: [] }))
      );

      try {
        await getRecentLikes("valid-token");

        const [url] = fetchStub.calls[0]!.args;
        assertEquals(url, "https://api.spotify.com/v1/me/tracks?limit=50");
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null on API error",
    withEnv({ TRACK_COUNT: undefined }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(
            mockResponse(
              false,
              { error: { message: "The access token expired" } },
              401
            )
          )
      );

      try {
        const result = await getRecentLikes("invalid-token");
        assertEquals(result, null);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null on network error",
    withEnv({ TRACK_COUNT: undefined }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.reject(new Error("Network error"))
      );

      try {
        const result = await getRecentLikes("valid-token");
        assertEquals(result, null);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null on timeout",
    withEnv({ TRACK_COUNT: undefined }, async () => {
      setupConsoleMocks();
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.reject(abortError)
      );

      try {
        const result = await getRecentLikes("valid-token");
        assertEquals(result, null);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should default to 50 when TRACK_COUNT is invalid",
    withEnv({ TRACK_COUNT: "invalid" }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(mockResponse(true, { items: [] }))
      );

      try {
        await getRecentLikes("valid-token");

        const [url] = fetchStub.calls[0]!.args;
        assertEquals(url, "https://api.spotify.com/v1/me/tracks?limit=50");
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null on invalid response structure",
    withEnv({ TRACK_COUNT: undefined }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(mockResponse(true, { wrongStructure: true }))
      );

      try {
        const result = await getRecentLikes("valid-token");
        assertEquals(result, null);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should filter out items with invalid track URIs",
    withEnv({ TRACK_COUNT: undefined }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(
            mockResponse(true, {
              items: [
                { track: { uri: "spotify:track:valid1" } },
                { track: { uri: "spotify:episode:podcast1" } }, // Not a track
                { track: { uri: "spotify:track:valid2" } },
                { track: {} }, // Missing uri
                { wrongField: {} }, // Missing track
              ],
            })
          )
      );

      try {
        const result = await getRecentLikes("valid-token");
        assertEquals(result, ["spotify:track:valid1", "spotify:track:valid2"]);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should default to 50 when TRACK_COUNT is less than 1",
    withEnv({ TRACK_COUNT: "0" }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(mockResponse(true, { items: [] }))
      );

      try {
        await getRecentLikes("valid-token");

        const [url] = fetchStub.calls[0]!.args;
        assertEquals(url, "https://api.spotify.com/v1/me/tracks?limit=50");
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should preserve chronological order from API response (most recent first)",
    withEnv({ TRACK_COUNT: undefined }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(
            mockResponse(true, {
              items: [
                { track: { uri: "spotify:track:newest" } },
                { track: { uri: "spotify:track:middle" } },
                { track: { uri: "spotify:track:oldest" } },
              ],
            })
          )
      );

      try {
        const result = await getRecentLikes("valid-token");
        assertEquals(result, [
          "spotify:track:newest",
          "spotify:track:middle",
          "spotify:track:oldest",
        ]);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should default to 50 when TRACK_COUNT is negative",
    withEnv({ TRACK_COUNT: "-5" }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(mockResponse(true, { items: [] }))
      );

      try {
        await getRecentLikes("valid-token");

        const [url] = fetchStub.calls[0]!.args;
        assertEquals(url, "https://api.spotify.com/v1/me/tracks?limit=50");
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );
});

// ============================================================================
// getAccessToken tests
// ============================================================================

Deno.test("getAccessToken", async (t) => {
  const defaultEnv = {
    SPOTIFY_CLIENT_ID: "test-client-id",
    SPOTIFY_CLIENT_SECRET: "test-client-secret",
    SPOTIFY_REFRESH_TOKEN: "test-refresh-token",
  };

  await t.step(
    "should return access token on successful refresh",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(mockResponse(true, { access_token: "new-access-token" }))
      );

      try {
        const result = await getAccessToken();

        assertEquals(result, "new-access-token");
        assertEquals(fetchStub.calls.length, 1);
        const [url, options] = fetchStub.calls[0]!.args;
        assertEquals(url, "https://accounts.spotify.com/api/token");
        assertEquals((options as RequestInit).method, "POST");
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null when SPOTIFY_CLIENT_ID is missing",
    withEnv({ ...defaultEnv, SPOTIFY_CLIENT_ID: "" }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(mockResponse(true, {})));

      try {
        const result = await getAccessToken();
        assertEquals(result, null);
        assertEquals(fetchStub.calls.length, 0);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null when SPOTIFY_CLIENT_SECRET is missing",
    withEnv({ ...defaultEnv, SPOTIFY_CLIENT_SECRET: "" }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(mockResponse(true, {})));

      try {
        const result = await getAccessToken();
        assertEquals(result, null);
        assertEquals(fetchStub.calls.length, 0);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null when SPOTIFY_REFRESH_TOKEN is missing",
    withEnv({ ...defaultEnv, SPOTIFY_REFRESH_TOKEN: "" }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(mockResponse(true, {})));

      try {
        const result = await getAccessToken();
        assertEquals(result, null);
        assertEquals(fetchStub.calls.length, 0);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null on API error response",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(mockResponse(false, { error: "invalid_grant" }, 400))
      );

      try {
        const result = await getAccessToken();
        assertEquals(result, null);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null on network error",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.reject(new Error("Network error"))
      );

      try {
        const result = await getAccessToken();
        assertEquals(result, null);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null on timeout",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      const fetchStub = stub(globalThis, "fetch", () => Promise.reject(abortError));

      try {
        const result = await getAccessToken();
        assertEquals(result, null);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null when response has no access_token",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(mockResponse(true, { token_type: "Bearer" }))
      );

      try {
        const result = await getAccessToken();
        assertEquals(result, null);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null when access_token is empty string",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(mockResponse(true, { access_token: "   " }))
      );

      try {
        const result = await getAccessToken();
        assertEquals(result, null);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null on invalid JSON response",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(globalThis, "fetch", () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new Error("Invalid JSON")),
        } as Response)
      );

      try {
        const result = await getAccessToken();
        assertEquals(result, null);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );
});

// ============================================================================
// updatePlaylist tests
// ============================================================================

Deno.test("updatePlaylist", async (t) => {
  const defaultEnv = { PLAYLIST_ID: "test-playlist-id" };

  await t.step(
    "should make PUT request to Spotify playlists endpoint with track URIs",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(mockResponse(true, { snapshot_id: "snapshot123" }, 201))
      );

      try {
        const trackUris = ["spotify:track:abc123", "spotify:track:def456"];
        const result = await updatePlaylist("valid-token", trackUris);

        assertEquals(result, true);
        const [url, options] = fetchStub.calls[0]!.args;
        assertEquals(
          url,
          "https://api.spotify.com/v1/playlists/test-playlist-id/tracks"
        );
        assertEquals((options as RequestInit).method, "PUT");
        assertEquals(
          JSON.parse((options as RequestInit).body as string),
          { uris: trackUris }
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return true on successful playlist update (201 response)",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(mockResponse(true, { snapshot_id: "snapshot123" }, 201))
      );

      try {
        const result = await updatePlaylist("valid-token", ["spotify:track:abc123"]);
        assertEquals(result, true);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should succeed with empty trackUris array (clears playlist)",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(mockResponse(true, { snapshot_id: "snapshot123" }, 201))
      );

      try {
        const result = await updatePlaylist("valid-token", []);

        assertEquals(result, true);
        const [, options] = fetchStub.calls[0]!.args;
        assertEquals(
          JSON.parse((options as RequestInit).body as string),
          { uris: [] }
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return false when PLAYLIST_ID is missing",
    withEnv({ PLAYLIST_ID: "" }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(mockResponse(true, {})));

      try {
        const result = await updatePlaylist("valid-token", ["spotify:track:abc123"]);

        assertEquals(result, false);
        assertEquals(fetchStub.calls.length, 0);
        assertEquals(
          consoleErrorStub.calls.some((c) =>
            String(c.args[0]).includes("PLAYLIST_ID not configured")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return false when PLAYLIST_ID is whitespace only",
    withEnv({ PLAYLIST_ID: "   " }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(mockResponse(true, {})));

      try {
        const result = await updatePlaylist("valid-token", ["spotify:track:abc123"]);
        assertEquals(result, false);
        assertEquals(fetchStub.calls.length, 0);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    'should return false with "Playlist not found" message on 404',
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(
            mockResponse(false, { error: { status: 404, message: "Non existing id" } }, 404)
          )
      );

      try {
        const result = await updatePlaylist("valid-token", ["spotify:track:abc123"]);

        assertEquals(result, false);
        assertEquals(
          consoleErrorStub.calls.some((c) =>
            String(c.args[0]).includes("Playlist not found")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    'should return false with "Permission denied" message on 403',
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(
            mockResponse(
              false,
              { error: { status: 403, message: "You cannot add tracks" } },
              403
            )
          )
      );

      try {
        const result = await updatePlaylist("valid-token", ["spotify:track:abc123"]);

        assertEquals(result, false);
        assertEquals(
          consoleErrorStub.calls.some((c) =>
            String(c.args[0]).includes("Permission denied")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    'should return false with "Authentication failed" message on 401',
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(
            mockResponse(
              false,
              { error: { status: 401, message: "The access token expired" } },
              401
            )
          )
      );

      try {
        const result = await updatePlaylist("valid-token", ["spotify:track:abc123"]);

        assertEquals(result, false);
        assertEquals(
          consoleErrorStub.calls.some((c) =>
            String(c.args[0]).includes("Authentication failed")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return false on network timeout",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      const fetchStub = stub(globalThis, "fetch", () => Promise.reject(abortError));

      try {
        const result = await updatePlaylist("valid-token", ["spotify:track:abc123"]);

        assertEquals(result, false);
        assertEquals(
          consoleErrorStub.calls.some((c) =>
            String(c.args[0]).includes("request timeout")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return false on network error",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.reject(new Error("Network error"))
      );

      try {
        const result = await updatePlaylist("valid-token", ["spotify:track:abc123"]);

        assertEquals(result, false);
        assertEquals(
          consoleErrorStub.calls.some((c) =>
            String(c.args[0]).includes("network error")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return false on generic API error",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(
            mockResponse(false, { error: { message: "Internal server error" } }, 500)
          )
      );

      try {
        const result = await updatePlaylist("valid-token", ["spotify:track:abc123"]);
        assertEquals(result, false);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );
});

// ============================================================================
// updatePlaylistMetadata tests
// ============================================================================

Deno.test("updatePlaylistMetadata", async (t) => {
  const defaultEnv = { PLAYLIST_ID: "test-playlist-id" };

  await t.step(
    "should send both name and description in single request",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(mockResponse(true, {}, 200))
      );

      try {
        await updatePlaylistMetadata("valid-token", {
          name: "LAST30LIKED",
          description: "Last sync: 2026-01-11 14:32:45 UTC",
        });

        assertEquals(fetchStub.calls.length, 1);
        const [url, options] = fetchStub.calls[0]!.args;
        assertEquals(url, "https://api.spotify.com/v1/playlists/test-playlist-id");
        assertEquals((options as RequestInit).method, "PUT");
        assertEquals(JSON.parse((options as RequestInit).body as string), {
          name: "LAST30LIKED",
          description: "Last sync: 2026-01-11 14:32:45 UTC",
        });
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step("should format timestamp correctly as YYYY-MM-DD HH:mm:ss UTC", () => {
    const date = new Date("2026-01-11T14:32:45.123Z");
    const timestamp = `Last sync: ${date.toISOString().replace("T", " ").substring(0, 19)} UTC`;
    assertEquals(timestamp, "Last sync: 2026-01-11 14:32:45 UTC");
  });

  await t.step(
    "should return true on successful metadata update (200 OK)",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(mockResponse(true, {}, 200))
      );

      try {
        const result = await updatePlaylistMetadata("valid-token", { name: "LAST30LIKED" });

        assertEquals(result, true);
        const [url, options] = fetchStub.calls[0]!.args;
        assertEquals(url, "https://api.spotify.com/v1/playlists/test-playlist-id");
        assertEquals((options as RequestInit).method, "PUT");
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return false and log warning on API error",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(mockResponse(false, {}, 500))
      );

      try {
        const result = await updatePlaylistMetadata("valid-token", { name: "LAST30LIKED" });

        assertEquals(result, false);
        assertEquals(
          consoleWarnStub.calls.some((c) =>
            String(c.args[0]).includes("Could not update playlist title")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return false and log warning on network timeout",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      const fetchStub = stub(globalThis, "fetch", () => Promise.reject(abortError));

      try {
        const result = await updatePlaylistMetadata("valid-token", { name: "LAST30LIKED" });

        assertEquals(result, false);
        assertEquals(
          consoleWarnStub.calls.some((c) =>
            String(c.args[0]).includes("Playlist title update timed out")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return false and log warning on network error",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.reject(new Error("Network error"))
      );

      try {
        const result = await updatePlaylistMetadata("valid-token", { name: "LAST30LIKED" });

        assertEquals(result, false);
        assertEquals(
          consoleWarnStub.calls.some((c) =>
            String(c.args[0]).includes("Playlist title update network error")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return false when PLAYLIST_ID is missing",
    withEnv({ PLAYLIST_ID: "" }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(mockResponse(true, {})));

      try {
        const result = await updatePlaylistMetadata("valid-token", { name: "LAST30LIKED" });
        assertEquals(result, false);
        assertEquals(fetchStub.calls.length, 0);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return false when PLAYLIST_ID is whitespace only",
    withEnv({ PLAYLIST_ID: "   " }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(mockResponse(true, {})));

      try {
        const result = await updatePlaylistMetadata("valid-token", { name: "LAST30LIKED" });
        assertEquals(result, false);
        assertEquals(fetchStub.calls.length, 0);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should log updating message when name is provided",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(mockResponse(true, {}, 200))
      );

      try {
        await updatePlaylistMetadata("valid-token", { name: "LAST30LIKED" });

        assertEquals(
          consoleLogStub.calls.some((c) =>
            String(c.args[0]).includes("Updating playlist title to LAST30LIKED")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should log success message when metadata update succeeds",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(mockResponse(true, {}, 200))
      );

      try {
        await updatePlaylistMetadata("valid-token", { name: "LAST30LIKED" });

        assertEquals(
          consoleLogStub.calls.some((c) =>
            String(c.args[0]).includes("Playlist title updated")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );
});

// ============================================================================
// getPlaylistTracks tests
// ============================================================================

Deno.test("getPlaylistTracks", async (t) => {
  const defaultEnv = { PLAYLIST_ID: "test-playlist-id" };

  await t.step(
    "should fetch tracks from playlist endpoint with field filtering",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(
            mockResponse(true, {
              items: [
                { track: { uri: "spotify:track:abc123" } },
                { track: { uri: "spotify:track:def456" } },
              ],
            })
          )
      );

      try {
        const result = await getPlaylistTracks("valid-token");

        const [url, options] = fetchStub.calls[0]!.args;
        assertEquals(
          url,
          "https://api.spotify.com/v1/playlists/test-playlist-id/tracks?fields=items(track(uri))&limit=50"
        );
        assertEquals((options as RequestInit).method, "GET");
        assertEquals(result, ["spotify:track:abc123", "spotify:track:def456"]);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return track URIs in spotify:track:xxx format",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(
            mockResponse(true, {
              items: [
                { track: { uri: "spotify:track:track1" } },
                { track: { uri: "spotify:track:track2" } },
              ],
            })
          )
      );

      try {
        const result = await getPlaylistTracks("valid-token");

        assertEquals(result?.length, 2);
        result!.forEach((uri) => {
          assertMatch(uri, /^spotify:track:/);
        });
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null on timeout",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      const fetchStub = stub(globalThis, "fetch", () => Promise.reject(abortError));

      try {
        const result = await getPlaylistTracks("valid-token");

        assertEquals(result, null);
        assertEquals(
          consoleWarnStub.calls.some((c) =>
            String(c.args[0]).includes("Fetch playlist tracks timed out")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null on network error",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.reject(new Error("Network error"))
      );

      try {
        const result = await getPlaylistTracks("valid-token");

        assertEquals(result, null);
        assertEquals(
          consoleWarnStub.calls.some((c) =>
            String(c.args[0]).includes("Fetch playlist tracks network error")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null on API error",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(mockResponse(false, {}, 401))
      );

      try {
        const result = await getPlaylistTracks("valid-token");

        assertEquals(result, null);
        assertEquals(
          consoleWarnStub.calls.some((c) =>
            String(c.args[0]).includes("Fetch playlist tracks failed")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null on invalid JSON response",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(globalThis, "fetch", () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new Error("Invalid JSON")),
        } as Response)
      );

      try {
        const result = await getPlaylistTracks("valid-token");

        assertEquals(result, null);
        assertEquals(
          consoleWarnStub.calls.some((c) =>
            String(c.args[0]).includes("Fetch playlist tracks invalid format")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null on unexpected response structure",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () => Promise.resolve(mockResponse(true, { wrongStructure: true }))
      );

      try {
        const result = await getPlaylistTracks("valid-token");

        assertEquals(result, null);
        assertEquals(
          consoleWarnStub.calls.some((c) =>
            String(c.args[0]).includes("Fetch playlist tracks unexpected structure")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null when PLAYLIST_ID is missing",
    withEnv({ PLAYLIST_ID: "" }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(mockResponse(true, {})));

      try {
        const result = await getPlaylistTracks("valid-token");
        assertEquals(result, null);
        assertEquals(fetchStub.calls.length, 0);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should return null when PLAYLIST_ID is whitespace only",
    withEnv({ PLAYLIST_ID: "   " }, async () => {
      setupConsoleMocks();
      const fetchStub = stub(globalThis, "fetch", () => Promise.resolve(mockResponse(true, {})));

      try {
        const result = await getPlaylistTracks("valid-token");
        assertEquals(result, null);
        assertEquals(fetchStub.calls.length, 0);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should filter out items with invalid track URIs",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(
            mockResponse(true, {
              items: [
                { track: { uri: "spotify:track:valid1" } },
                { track: { uri: "spotify:episode:podcast1" } }, // Not a track
                { track: { uri: "spotify:track:valid2" } },
                { track: {} }, // Missing uri
                { wrongField: {} }, // Missing track
              ],
            })
          )
      );

      try {
        const result = await getPlaylistTracks("valid-token");
        assertEquals(result, ["spotify:track:valid1", "spotify:track:valid2"]);
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should log success with track count",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(
            mockResponse(true, {
              items: [
                { track: { uri: "spotify:track:abc123" } },
                { track: { uri: "spotify:track:def456" } },
              ],
            })
          )
      );

      try {
        await getPlaylistTracks("valid-token");

        assertEquals(
          consoleLogStub.calls.some((c) =>
            String(c.args[0]).includes("Fetched 2 current playlist tracks")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should log fetching message before request",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const fetchStub = stub(
        globalThis,
        "fetch",
        () =>
          Promise.resolve(
            mockResponse(true, { items: [{ track: { uri: "spotify:track:abc123" } }] })
          )
      );

      try {
        await getPlaylistTracks("valid-token");

        assertEquals(
          consoleLogStub.calls.some((c) =>
            String(c.args[0]).includes("Fetching current playlist tracks")
          ),
          true
        );
      } finally {
        fetchStub.restore();
        restoreConsoleMocks();
      }
    })
  );
});

// ============================================================================
// main() function tests
// ============================================================================

Deno.test("main", async (t) => {
  const defaultEnv = {
    SPOTIFY_CLIENT_ID: "test-client-id",
    SPOTIFY_CLIENT_SECRET: "test-client-secret",
    SPOTIFY_REFRESH_TOKEN: "test-refresh-token",
    PLAYLIST_ID: "test-playlist-id",
    TRACK_COUNT: "30",
  };

  // Helper to run main() and catch the Deno.exit call
  async function runMainExpectingExit(
    expectedCode: number,
    fetchResponses: Array<() => Promise<Response>>
  ): Promise<{ exitCode: number; fetchCalls: number }> {
    let exitCode = -1;
    let callIndex = 0;

    const exitStub = stub(Deno, "exit", (code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`Deno.exit(${code})`);
    });

    const fetchStub = stub(globalThis, "fetch", () => {
      const response = fetchResponses[callIndex];
      callIndex++;
      return response ? response() : Promise.resolve(mockResponse(true, {}));
    });

    try {
      await main();
    } catch (e) {
      if (!(e instanceof Error && e.message.startsWith("Deno.exit"))) {
        throw e;
      }
    } finally {
      exitStub.restore();
      fetchStub.restore();
    }

    assertEquals(exitCode, expectedCode);
    return { exitCode, fetchCalls: callIndex };
  }

  await t.step(
    "should exit with code 1 when updatePlaylist returns false",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      try {
        await runMainExpectingExit(1, [
          // Token success
          () => Promise.resolve(mockResponse(true, { access_token: "valid-token" })),
          // getRecentLikes success
          () =>
            Promise.resolve(
              mockResponse(true, { items: [{ track: { uri: "spotify:track:abc123" } }] })
            ),
          // getPlaylistTracks returns different tracks (trigger update)
          () => Promise.resolve(mockResponse(true, { items: [] })),
          // updatePlaylist fails
          () =>
            Promise.resolve(mockResponse(false, { error: { message: "Not found" } }, 404)),
        ]);
      } finally {
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should exit with code 0 on successful sync",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      try {
        const { fetchCalls } = await runMainExpectingExit(0, [
          // Token success
          () => Promise.resolve(mockResponse(true, { access_token: "valid-token" })),
          // getRecentLikes success
          () =>
            Promise.resolve(
              mockResponse(true, {
                items: [
                  { track: { uri: "spotify:track:abc123" } },
                  { track: { uri: "spotify:track:def456" } },
                ],
              })
            ),
          // getPlaylistTracks returns different tracks
          () => Promise.resolve(mockResponse(true, { items: [] })),
          // updatePlaylist success
          () =>
            Promise.resolve(mockResponse(true, { snapshot_id: "snapshot123" }, 201)),
          // updatePlaylistMetadata success
          () => Promise.resolve(mockResponse(true, {}, 200)),
        ]);

        assertEquals(fetchCalls, 5);
      } finally {
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    'should log "Synced {count} tracks to playlist" on successful sync',
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      try {
        await runMainExpectingExit(0, [
          () => Promise.resolve(mockResponse(true, { access_token: "valid-token" })),
          () =>
            Promise.resolve(
              mockResponse(true, {
                items: [
                  { track: { uri: "spotify:track:abc123" } },
                  { track: { uri: "spotify:track:def456" } },
                ],
              })
            ),
          () => Promise.resolve(mockResponse(true, { items: [] })),
          () =>
            Promise.resolve(mockResponse(true, { snapshot_id: "snapshot123" }, 201)),
          () => Promise.resolve(mockResponse(true, {}, 200)),
        ]);

        assertEquals(
          consoleLogStub.calls.some((c) =>
            String(c.args[0]).includes("Synced 2 tracks to playlist")
          ),
          true
        );
      } finally {
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should exit with code 0 even when metadata update fails",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      try {
        await runMainExpectingExit(0, [
          () => Promise.resolve(mockResponse(true, { access_token: "valid-token" })),
          () =>
            Promise.resolve(
              mockResponse(true, { items: [{ track: { uri: "spotify:track:abc123" } }] })
            ),
          () => Promise.resolve(mockResponse(true, { items: [] })),
          () =>
            Promise.resolve(mockResponse(true, { snapshot_id: "snapshot123" }, 201)),
          // Metadata update fails
          () => Promise.resolve(mockResponse(false, {}, 500)),
        ]);

        assertEquals(
          consoleWarnStub.calls.some((c) =>
            String(c.args[0]).includes("Could not update playlist title")
          ),
          true
        );
      } finally {
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    'should log "Sync failed" when token refresh fails',
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      try {
        await runMainExpectingExit(1, [
          // Token refresh fails
          () =>
            Promise.resolve(mockResponse(false, { error: "invalid_grant" }, 400)),
        ]);

        assertEquals(
          consoleErrorStub.calls.some((c) =>
            String(c.args[0]).includes("Sync failed: could not obtain access token")
          ),
          true
        );
      } finally {
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    'should log "Sync failed" when credentials are missing',
    withEnv({ ...defaultEnv, SPOTIFY_CLIENT_ID: "" }, async () => {
      setupConsoleMocks();
      try {
        await runMainExpectingExit(1, []);

        assertEquals(
          consoleErrorStub.calls.some((c) =>
            String(c.args[0]).includes("Sync failed: could not obtain access token")
          ),
          true
        );
      } finally {
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    'should log "Sync failed" when updatePlaylist fails',
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      try {
        await runMainExpectingExit(1, [
          () => Promise.resolve(mockResponse(true, { access_token: "valid-token" })),
          () =>
            Promise.resolve(
              mockResponse(true, { items: [{ track: { uri: "spotify:track:abc123" } }] })
            ),
          () => Promise.resolve(mockResponse(true, { items: [] })),
          () =>
            Promise.resolve(mockResponse(false, { error: { message: "Not found" } }, 404)),
        ]);

        assertEquals(
          consoleErrorStub.calls.some((c) =>
            String(c.args[0]).includes("Sync failed: could not update playlist")
          ),
          true
        );
      } finally {
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should fail sync when getRecentLikes fails (protect playlist from clearing)",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      try {
        await runMainExpectingExit(1, [
          () => Promise.resolve(mockResponse(true, { access_token: "valid-token" })),
          // getRecentLikes fails
          () =>
            Promise.resolve(
              mockResponse(false, { error: { message: "Token expired" } }, 401)
            ),
        ]);

        assertEquals(
          consoleErrorStub.calls.some((c) =>
            String(c.args[0]).includes("Sync failed: could not fetch likes")
          ),
          true
        );
      } finally {
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should log the action before updating playlist",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      try {
        await runMainExpectingExit(0, [
          () => Promise.resolve(mockResponse(true, { access_token: "valid-token" })),
          () =>
            Promise.resolve(
              mockResponse(true, {
                items: [
                  { track: { uri: "spotify:track:abc123" } },
                  { track: { uri: "spotify:track:def456" } },
                ],
              })
            ),
          () => Promise.resolve(mockResponse(true, { items: [] })),
          () =>
            Promise.resolve(mockResponse(true, { snapshot_id: "snapshot123" }, 201)),
          () => Promise.resolve(mockResponse(true, {}, 200)),
        ]);

        assertEquals(
          consoleLogStub.calls.some((c) =>
            String(c.args[0]).includes("Replacing playlist contents with 2 tracks")
          ),
          true
        );
      } finally {
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should include sync timestamp description in metadata update",
    withEnv(defaultEnv, async () => {
      const time = new FakeTime(new Date("2026-01-11T14:32:45.000Z"));
      setupConsoleMocks();

      let capturedBody: string | undefined;
      const exitStub = stub(Deno, "exit", (code?: number) => {
        throw new Error(`Deno.exit(${code})`);
      });

      let callIndex = 0;
      const fetchStub = stub(globalThis, "fetch", (url, options) => {
        callIndex++;
        if (callIndex === 1) {
          return Promise.resolve(mockResponse(true, { access_token: "valid-token" }));
        }
        if (callIndex === 2) {
          return Promise.resolve(
            mockResponse(true, {
              items: [
                { track: { uri: "spotify:track:abc123" } },
                { track: { uri: "spotify:track:def456" } },
              ],
            })
          );
        }
        if (callIndex === 3) {
          return Promise.resolve(mockResponse(true, { items: [] }));
        }
        if (callIndex === 4) {
          return Promise.resolve(mockResponse(true, { snapshot_id: "snapshot123" }, 201));
        }
        if (callIndex === 5) {
          capturedBody = (options as RequestInit).body as string;
          return Promise.resolve(mockResponse(true, {}, 200));
        }
        return Promise.resolve(mockResponse(true, {}));
      });

      try {
        await main();
      } catch {
        // Expected Deno.exit
      } finally {
        exitStub.restore();
        fetchStub.restore();
        restoreConsoleMocks();
        time.restore();
      }

      const body = JSON.parse(capturedBody!);
      assertEquals(body.name, "LAST2LIKED");
      assertEquals(body.description, "Last sync: 2026-01-11 14:32:45 UTC");
    })
  );

  await t.step(
    "should NOT update playlist when no tracks found (safety: never clear)",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      try {
        const { fetchCalls } = await runMainExpectingExit(0, [
          () => Promise.resolve(mockResponse(true, { access_token: "valid-token" })),
          // Empty likes
          () => Promise.resolve(mockResponse(true, { items: [] })),
        ]);

        // Should only call token + likes (2 calls), no update
        assertEquals(fetchCalls, 2);
        assertEquals(
          consoleLogStub.calls.some((c) =>
            String(c.args[0]).includes("No liked tracks found - playlist unchanged")
          ),
          true
        );
        assertEquals(
          consoleLogStub.calls.some((c) =>
            String(c.args[0]).includes("Sync completed - no changes made")
          ),
          true
        );
      } finally {
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should skip update when playlist already up-to-date (idempotency)",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const tracks = [
        { track: { uri: "spotify:track:abc123" } },
        { track: { uri: "spotify:track:def456" } },
      ];

      try {
        const { fetchCalls } = await runMainExpectingExit(0, [
          () => Promise.resolve(mockResponse(true, { access_token: "valid-token" })),
          () => Promise.resolve(mockResponse(true, { items: tracks })),
          // Same tracks in playlist
          () => Promise.resolve(mockResponse(true, { items: tracks })),
          // Metadata update
          () => Promise.resolve(mockResponse(true, {}, 200)),
        ]);

        // Should make 4 calls: token, likes, playlistTracks, metadata (no updatePlaylist)
        assertEquals(fetchCalls, 4);
        assertEquals(
          consoleLogStub.calls.some((c) =>
            String(c.args[0]).includes("Playlist already up-to-date")
          ),
          true
        );
      } finally {
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should proceed with update when tracks are different",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      try {
        const { fetchCalls } = await runMainExpectingExit(0, [
          () => Promise.resolve(mockResponse(true, { access_token: "valid-token" })),
          () =>
            Promise.resolve(
              mockResponse(true, {
                items: [
                  { track: { uri: "spotify:track:new1" } },
                  { track: { uri: "spotify:track:new2" } },
                ],
              })
            ),
          // Different tracks in playlist
          () =>
            Promise.resolve(
              mockResponse(true, {
                items: [
                  { track: { uri: "spotify:track:old1" } },
                  { track: { uri: "spotify:track:old2" } },
                ],
              })
            ),
          () =>
            Promise.resolve(mockResponse(true, { snapshot_id: "snapshot123" }, 201)),
          () => Promise.resolve(mockResponse(true, {}, 200)),
        ]);

        // Should make 5 calls including updatePlaylist
        assertEquals(fetchCalls, 5);
        assertEquals(
          consoleLogStub.calls.some((c) =>
            String(c.args[0]).includes("Replacing playlist contents with 2 tracks")
          ),
          true
        );
      } finally {
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should proceed with update when track order is different",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      try {
        const { fetchCalls } = await runMainExpectingExit(0, [
          () => Promise.resolve(mockResponse(true, { access_token: "valid-token" })),
          () =>
            Promise.resolve(
              mockResponse(true, {
                items: [
                  { track: { uri: "spotify:track:abc123" } },
                  { track: { uri: "spotify:track:def456" } },
                ],
              })
            ),
          // Same tracks but different order
          () =>
            Promise.resolve(
              mockResponse(true, {
                items: [
                  { track: { uri: "spotify:track:def456" } },
                  { track: { uri: "spotify:track:abc123" } },
                ],
              })
            ),
          () =>
            Promise.resolve(mockResponse(true, { snapshot_id: "snapshot123" }, 201)),
          () => Promise.resolve(mockResponse(true, {}, 200)),
        ]);

        // Order matters - should proceed with update
        assertEquals(fetchCalls, 5);
        assertEquals(
          consoleLogStub.calls.some((c) =>
            String(c.args[0]).includes("Replacing playlist contents with 2 tracks")
          ),
          true
        );
      } finally {
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should proceed with update when getPlaylistTracks fails (fail-safe)",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      try {
        const { fetchCalls } = await runMainExpectingExit(0, [
          () => Promise.resolve(mockResponse(true, { access_token: "valid-token" })),
          () =>
            Promise.resolve(
              mockResponse(true, {
                items: [
                  { track: { uri: "spotify:track:abc123" } },
                  { track: { uri: "spotify:track:def456" } },
                ],
              })
            ),
          // getPlaylistTracks fails
          () => Promise.resolve(mockResponse(false, {}, 500)),
          () =>
            Promise.resolve(mockResponse(true, { snapshot_id: "snapshot123" }, 201)),
          () => Promise.resolve(mockResponse(true, {}, 200)),
        ]);

        // Should proceed with update despite getPlaylistTracks failure
        assertEquals(fetchCalls, 5);
        assertEquals(
          consoleWarnStub.calls.some((c) =>
            String(c.args[0]).includes("Fetch playlist tracks failed")
          ),
          true
        );
      } finally {
        restoreConsoleMocks();
      }
    })
  );

  await t.step(
    "should still update metadata when skipping playlist update",
    withEnv(defaultEnv, async () => {
      const time = new FakeTime(new Date("2026-01-11T15:00:00.000Z"));
      setupConsoleMocks();

      const tracks = [{ track: { uri: "spotify:track:abc123" } }];
      let capturedBody: string | undefined;

      const exitStub = stub(Deno, "exit", (code?: number) => {
        throw new Error(`Deno.exit(${code})`);
      });

      let callIndex = 0;
      const fetchStub = stub(globalThis, "fetch", (url, options) => {
        callIndex++;
        if (callIndex === 1) {
          return Promise.resolve(mockResponse(true, { access_token: "valid-token" }));
        }
        if (callIndex === 2) {
          return Promise.resolve(mockResponse(true, { items: tracks }));
        }
        if (callIndex === 3) {
          // Same tracks - triggers idempotent path
          return Promise.resolve(mockResponse(true, { items: tracks }));
        }
        if (callIndex === 4) {
          capturedBody = (options as RequestInit).body as string;
          return Promise.resolve(mockResponse(true, {}, 200));
        }
        return Promise.resolve(mockResponse(true, {}));
      });

      try {
        await main();
      } catch {
        // Expected Deno.exit
      } finally {
        exitStub.restore();
        fetchStub.restore();
        restoreConsoleMocks();
        time.restore();
      }

      // Verify metadata call was made with correct timestamp
      const body = JSON.parse(capturedBody!);
      assertEquals(body.name, "LAST1LIKED");
      assertEquals(body.description, "Last sync: 2026-01-11 15:00:00 UTC");
    })
  );

  await t.step(
    "should exit with code 0 when playlist up-to-date even if metadata update fails",
    withEnv(defaultEnv, async () => {
      setupConsoleMocks();
      const tracks = [{ track: { uri: "spotify:track:abc123" } }];

      try {
        await runMainExpectingExit(0, [
          () => Promise.resolve(mockResponse(true, { access_token: "valid-token" })),
          () => Promise.resolve(mockResponse(true, { items: tracks })),
          // Same tracks - triggers idempotent path
          () => Promise.resolve(mockResponse(true, { items: tracks })),
          // Metadata update fails
          () => Promise.resolve(mockResponse(false, {}, 500)),
        ]);

        assertEquals(
          consoleLogStub.calls.some((c) =>
            String(c.args[0]).includes("Playlist already up-to-date")
          ),
          true
        );
        assertEquals(
          consoleWarnStub.calls.some((c) =>
            String(c.args[0]).includes("Could not update playlist title")
          ),
          true
        );
        assertEquals(
          consoleLogStub.calls.some((c) =>
            String(c.args[0]).includes("Synced 1 tracks to playlist")
          ),
          true
        );
      } finally {
        restoreConsoleMocks();
      }
    })
  );
});

// ============================================================================
// PlaylistDetails type guard tests
// ============================================================================

Deno.test("PlaylistDetails type guard", async (t) => {
  interface PlaylistDetails {
    name: string;
    description: string | null;
    tracks: { total: number };
  }

  function isPlaylistDetails(data: unknown): data is PlaylistDetails {
    if (!data || typeof data !== "object") return false;
    const obj = data as Record<string, unknown>;
    if (typeof obj.name !== "string") return false;
    if (
      obj.description !== null &&
      obj.description !== undefined &&
      typeof obj.description !== "string"
    )
      return false;
    if (!obj.tracks || typeof obj.tracks !== "object") return false;
    const tracks = obj.tracks as Record<string, unknown>;
    if (typeof tracks.total !== "number") return false;
    return true;
  }

  await t.step("should return true for valid PlaylistDetails with string description", () => {
    const data = {
      name: "LAST30LIKED",
      description: "Last sync: 2026-01-11 14:32:45 UTC",
      tracks: { total: 30 },
    };
    assertEquals(isPlaylistDetails(data), true);
  });

  await t.step("should return true for valid PlaylistDetails with null description", () => {
    const data = { name: "LAST30LIKED", description: null, tracks: { total: 30 } };
    assertEquals(isPlaylistDetails(data), true);
  });

  await t.step("should return true when description field is missing entirely", () => {
    const data = { name: "LAST30LIKED", tracks: { total: 30 } };
    assertEquals(isPlaylistDetails(data), true);
  });

  await t.step("should return false for null", () => {
    assertEquals(isPlaylistDetails(null), false);
  });

  await t.step("should return false for undefined", () => {
    assertEquals(isPlaylistDetails(undefined), false);
  });

  await t.step("should return false when name is not a string", () => {
    const data = { name: 123, description: null, tracks: { total: 30 } };
    assertEquals(isPlaylistDetails(data), false);
  });

  await t.step("should return false when description is a number", () => {
    const data = { name: "LAST30LIKED", description: 123, tracks: { total: 30 } };
    assertEquals(isPlaylistDetails(data), false);
  });

  await t.step("should return false when tracks is missing", () => {
    const data = { name: "LAST30LIKED", description: null };
    assertEquals(isPlaylistDetails(data), false);
  });

  await t.step("should return false when tracks.total is not a number", () => {
    const data = { name: "LAST30LIKED", description: null, tracks: { total: "30" } };
    assertEquals(isPlaylistDetails(data), false);
  });

  await t.step("should return false for empty object", () => {
    assertEquals(isPlaylistDetails({}), false);
  });
});

// ============================================================================
// Description verification logic tests
// ============================================================================

Deno.test("Description verification logic", async (t) => {
  await t.step("should recognize valid sync timestamp format", () => {
    const description = "Last sync: 2026-01-11 14:32:45 UTC";
    assertEquals(description.startsWith("Last sync:"), true);
  });

  await t.step("should recognize description starting with Last sync:", () => {
    const validDescriptions = [
      "Last sync: 2026-01-11 14:32:45 UTC",
      "Last sync: 2025-12-31 23:59:59 UTC",
      "Last sync: 2020-01-01 00:00:00 UTC",
    ];
    validDescriptions.forEach((desc) => {
      assertEquals(desc.startsWith("Last sync:"), true);
    });
  });

  await t.step("should reject descriptions not starting with Last sync:", () => {
    const invalidDescriptions = [
      "Sync: 2026-01-11 14:32:45 UTC",
      "Updated: 2026-01-11",
      "",
      "Random description",
    ];
    invalidDescriptions.forEach((desc) => {
      assertEquals(desc.startsWith("Last sync:"), false);
    });
  });

  await t.step("should handle null description", () => {
    const checkDescription = (desc: string | null): boolean => {
      return desc !== null && desc.startsWith("Last sync:");
    };
    assertEquals(checkDescription(null), false);
    assertEquals(checkDescription("Last sync: 2026-01-11 14:32:45 UTC"), true);
    assertEquals(checkDescription("Other description"), false);
  });

  await t.step("should validate timestamp format YYYY-MM-DD HH:mm:ss UTC", () => {
    const timestampPattern = /^Last sync: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/;
    assertEquals(timestampPattern.test("Last sync: 2026-01-11 14:32:45 UTC"), true);
    assertEquals(timestampPattern.test("Last sync: 2026-01-11 14:32 UTC"), false);
    assertEquals(timestampPattern.test("Last sync: 2026-01-11T14:32:45 UTC"), false);
  });
});
