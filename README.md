<div align="center">

# 🎵 Spotwik

**Keep your favorite Spotify playlist synced with your latest liked songs**

[![Deno](https://img.shields.io/badge/Deno-2.x-black?logo=deno)](https://deno.land)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Actions](https://img.shields.io/badge/Runs%20on-GitHub%20Actions-2088FF?logo=github-actions&logoColor=white)](https://github.com/features/actions)

---

*Automatically syncs your last 50 liked songs to a playlist — every 30 minutes, no server required.*

</div>

## ✨ Features

- **🔄 Auto-sync** — Runs every 30 minutes via GitHub Actions
- **🎯 Always fresh** — Your playlist reflects your most recent likes
- **☁️ Serverless** — No hosting costs, runs free on GitHub
- **🔒 Secure** — Credentials stored as GitHub Secrets
- **⚡ Fast** — Powered by Deno, syncs in seconds

---

## 🚀 Quick Setup

### Step 1: Fork this repository

Click the **Fork** button at the top right of this page.

### Step 2: Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **Create app**
3. Fill in any name and description
4. Set Redirect URI to: `http://localhost:3000/callback`
5. Check **Web API** and save
6. Copy your **Client ID** and **Client Secret**

### Step 3: Get your Refresh Token

Open this URL in your browser (replace `YOUR_CLIENT_ID`):

```
https://accounts.spotify.com/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost:3000/callback&scope=user-library-read%20playlist-modify-public%20playlist-modify-private
```

After authorizing, you'll be redirected to a URL like:
```
http://localhost:3000/callback?code=AQBx...YOUR_CODE_HERE
```

Copy the code and run this command:

```bash
curl -X POST https://accounts.spotify.com/api/token \
  -d grant_type=authorization_code \
  -d code=YOUR_CODE \
  -d redirect_uri=http://localhost:3000/callback \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=YOUR_CLIENT_SECRET
```

Copy the `refresh_token` from the response.

### Step 4: Create your target playlist

1. Open Spotify and create a new playlist
2. Copy the playlist link → the ID is the last part of the URL
   ```
   https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
                                       └─────────────────────┘
                                              Playlist ID
   ```

### Step 5: Add GitHub Secrets

Go to your fork: **Settings** → **Secrets and variables** → **Actions**

Add these 4 secrets:

| Secret | Value |
|--------|-------|
| `SPOTIFY_CLIENT_ID` | Your Client ID |
| `SPOTIFY_CLIENT_SECRET` | Your Client Secret |
| `SPOTIFY_REFRESH_TOKEN` | Your refresh token |
| `PLAYLIST_ID` | Your playlist ID |

### Step 6: Enable Actions

Go to the **Actions** tab and enable workflows.

**🎉 Done!** Your playlist will sync automatically every 30 minutes.

> **Tip:** Click **Run workflow** to trigger an immediate sync.

---

## ⚙️ Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `TRACK_COUNT` | `50` | Number of liked songs to sync (max: 50) |

You can customize `TRACK_COUNT` when manually triggering the workflow.

---

## 🛠️ Local Development

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/spotwik.git
cd spotwik

# Create .env.local with your credentials
cp .env.example .env.local

# Run tests
deno task test

# Run sync locally
deno task sync:dev
```

---

## ❓ Troubleshooting

<details>
<summary><strong>Invalid refresh token</strong></summary>

Your token may have been revoked. Generate a new one by repeating Step 3.
</details>

<details>
<summary><strong>Playlist not found</strong></summary>

- Check that the playlist ID is correct
- Make sure the playlist is owned by your account
</details>

<details>
<summary><strong>Sync not running</strong></summary>

- Go to **Actions** tab and check for errors
- Make sure workflows are enabled
</details>

---

## 📄 License

MIT © [Alexis Delabre](https://github.com/alexisdelabre)
