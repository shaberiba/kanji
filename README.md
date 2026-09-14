# kanji

Discord bot (幹事 - "the person who organizes the group's events") that
creates Facebook Page events. Phase 1: owner/admin only.
Phase 2: any user holding a Discord role added via `/event-role`.

## Feasibility note

Meta has a history of restricting third-party event-creation access (Groups
API access was cut off entirely in 2024; Page event creation has been
restricted since 2018). This only works if your Facebook App has been
specifically approved for the relevant permission. **Before relying on this
bot, run `npm run test-facebook-connection -- --test-event-creation` to
confirm event creation actually works for your app** — if it doesn't, the
bot automatically falls back to posting the event details to the Page's
feed, or to giving you a manual-creation link.

## Setup

```bash
npm install
cp .env.example .env
# fill in .env: Discord bot token/client id, owner Discord user id,
# Facebook app id/secret and page id
```

### Facebook token (one-time, or whenever it needs to be redone)

1. Go to https://developers.facebook.com/tools/explorer
2. Select your app → "Get User Access Token" → grant the page permissions
   your app was approved for.
3. Copy the short-lived token, then run:
   ```bash
   npm run setup-facebook-token
   ```
   This exchanges it for a long-lived Page Access Token and stores it in
   SQLite (`./data/bot.sqlite3`). Run this on the host directly — never
   paste a token into a Discord command.
4. Verify: `npm run test-facebook-connection -- --test-event-creation`

### Discord commands

```bash
npm run register-commands   # registers slash commands (set DISCORD_GUILD_ID for fast dev iteration)
npm start                   # or `npm run dev` to auto-restart on changes
```

- `/create-event name start_time end_time? description? location?`
- `/facebook-status` — admin-only diagnostics
- `/event-role add|remove|list @role` — Phase 2 role allowlist management

## Deployment

Designed to run as a container. See `Dockerfile`. On the "Nexus" homelab
Proxmox host, this follows the same LXC + Podman + systemd pattern as the
existing `back-bot` container — see `deploy-shaberiba-bot.sh` in the
homelab repo's `nexus/containers/` directory (deploys from
`github.com/shaberiba/kanji`).

The SQLite file at `./data/bot.sqlite3` must persist across
restarts/redeploys — it holds the Facebook token and the role allowlist.
