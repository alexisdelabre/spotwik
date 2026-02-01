# Spotwik

Spotify playlist automation toolkit.

## What it does

This tool keeps a Spotify playlist updated with your most recent liked songs. Every 30 minutes, GitHub Actions runs a sync that:

1. Fetches your latest liked songs from Spotify
2. Updates a target playlist with the most recent 50 tracks
3. Removes older tracks that have fallen out of the top 50

No server required - runs entirely on GitHub Actions.

## Prerequisites

- [Spotify Developer account](https://developer.spotify.com/dashboard) (free)
- GitHub account
- Deno 2.x+ (for local development only)

## Quick Start

### 1. Create a Spotify Developer App

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create app"
3. Fill in:
   - App name: anything you like (e.g., "My Liked Songs Sync")
   - App description: anything
   - Redirect URI: `http://localhost:3000/callback`
4. Check "Web API" under "Which API/SDKs are you planning to use?"
5. Accept the terms and click "Save"
6. Note your **Client ID** and **Client Secret** (click "View client secret")

### 2. Get Your Refresh Token

This is a one-time process to authorize the app to access your Spotify account.

1. Replace the placeholders and open this URL in your browser:
   ```
   https://accounts.spotify.com/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost:3000/callback&scope=user-library-read%20playlist-modify-public%20playlist-modify-private
   ```

2. Authorize the app when prompted

3. You'll be redirected to a URL like:
   ```
   http://localhost:3000/callback?code=AQBx...
   ```
   Copy the `code` value (everything after `code=`)

4. Exchange the code for tokens using curl (wrap values in quotes to handle special characters):
   ```bash
   curl -X POST https://accounts.spotify.com/api/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code" \
     -d "code=YOUR_AUTHORIZATION_CODE" \
     -d "redirect_uri=http://localhost:3000/callback" \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET"
   ```
   > **Note:** If your authorization code contains `+` or other special characters, they're already URL-encoded. Use the code exactly as it appears in the URL.

5. From the JSON response, copy the `refresh_token` value

### 3. Create Target Playlist

1. Open Spotify (desktop app or web player)
2. Create a new playlist (name it anything, e.g., "Recent Likes")
3. Right-click the playlist > "Share" > "Copy link to playlist"
4. The link looks like: `https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M`
5. The playlist ID is the last part: `37i9dQZF1DXcBWIGoYBM5M`

### 4. Configure GitHub Secrets

1. Go to your forked repository on GitHub
2. Navigate to Settings > Secrets and variables > Actions
3. Add these secrets (click "New repository secret" for each):

| Secret Name | Value |
|-------------|-------|
| `SPOTIFY_CLIENT_ID` | Your app's Client ID |
| `SPOTIFY_CLIENT_SECRET` | Your app's Client Secret |
| `SPOTIFY_REFRESH_TOKEN` | The refresh token from step 2 |
| `PLAYLIST_ID` | Your target playlist ID from step 3 |

### 5. Enable GitHub Actions

1. Go to the "Actions" tab in your repository
2. If prompted, click "I understand my workflows, go ahead and enable them"
3. The sync will run automatically every 30 minutes
4. To run immediately: click "Spotify Sync" > "Run workflow" > "Run workflow"

## Local Development

### Setup

```bash
# Clone the repository
git clone https://github.com/alexisdelabre/spotwik.git
cd spotwik

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your credentials
```

### Testing

```bash
# Run all unit tests
deno task test

# Type check
deno task check
```

### Running Sync Manually

```bash
# Run the sync script (with .env.local)
deno task sync:dev

# Or run directly with env vars
deno task sync
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SPOTIFY_CLIENT_ID` | Yes | Spotify app Client ID from Developer Dashboard |
| `SPOTIFY_CLIENT_SECRET` | Yes | Spotify app Client Secret |
| `SPOTIFY_REFRESH_TOKEN` | Yes | OAuth refresh token (generated once) |
| `PLAYLIST_ID` | Yes | Target playlist ID to update |
| `TRACK_COUNT` | No | Number of liked songs to sync (default: 50) |

## Troubleshooting

### "Invalid refresh token" or "invalid_grant" error

Spotify refresh tokens don't expire, but they can become invalid if:
- You revoked app access in your [Spotify account settings](https://www.spotify.com/account/apps/)
- Your Spotify app's Client Secret was regenerated
- The token was generated with a different Client ID

To fix: Repeat step 2 to generate a new refresh token.

### "Playlist not found" error

- Make sure the playlist ID is correct
- Ensure the playlist exists and is not deleted
- The playlist must be owned by your Spotify account

### Sync not running automatically

- Check that GitHub Actions is enabled for your repository
- Go to Actions tab and verify the workflow is not disabled
- Check the workflow runs for any errors

### "Rate limit exceeded" error

Spotify has API rate limits. The 30-minute schedule is designed to stay within limits. If you see this error, wait a few hours before retrying.

## How It Works

The sync process:

1. Uses your refresh token to get a new access token from Spotify
2. Fetches the specified number of tracks from your Liked Songs
3. Replaces the contents of the target playlist with these tracks
4. Logs the results and exits

The GitHub Actions workflow runs this script every 30 minutes using a cron schedule. You can also trigger it manually from the Actions tab.

## Project Structure

```
spotwik/
├── .github/workflows/
│   └── sync.yml              # GitHub Actions workflow (runs every 30 min)
├── src/
│   ├── sync.ts               # Main sync script
│   ├── sync.test.ts          # Unit tests
│   └── dev.ts                # Dev entry point (loads .env)
├── .env.example              # Environment template
└── deno.json                 # Deno configuration
```

## License

MIT
