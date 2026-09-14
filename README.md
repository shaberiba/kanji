# kanji

Discord bot (幹事 - "the person who organizes the group's events") that
connects a Discord server to a Facebook Page: it announces the Page's events
in a Discord channel, and lets authorized users publish posts to the Page.
Phase 1: owner/admin only. Phase 2: any user holding a Discord role added
via `/event-role`.

## Feasibility note

Meta has a history of restricting third-party access to Page/Group events
(Groups API access was cut off entirely in 2024; Page event *creation* has
been restricted since 2018). **Confirmed for this app**: creating events via
`POST /{page-id}/events` fails with a "does not support this operation"
error (code 100 / subcode 33) - Meta doesn't expose that edge to this app.
Reading events and creating plain Page posts (`pages_manage_posts`) are not
affected by that restriction and are expected to keep working.

Because of this, the bot's real capabilities are:
- **Reading** events already on the Page (created manually via Facebook's
  web UI) and announcing new ones in a Discord channel (`/sync-events`, or
  automatically on a timer).
- **Creating plain Page posts** from Discord (`/create-post`).
- `/create-event` still exists and will attempt real event creation first,
  but expect it to always fall back to posting the details to the Page's
  feed instead - it's kept for whenever Meta's restrictions change, not as
  a load-bearing feature right now.

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
   (checks token validity, read access to events, and optionally attempts
   a real test event so you can see which fallback path it takes).

### Discord commands

```bash
npm run register-commands   # registers slash commands (set DISCORD_GUILD_ID for fast dev iteration)
npm start                   # or `npm run dev` to auto-restart on changes
```

- `/create-post message link?` — publish a plain post to the Facebook Page
- `/create-event name start_time end_time? description? location?` — tries real event creation, falls back to a Page post or manual instructions
- `/events-channel set #channel` / `show` — configure where new Facebook events get announced (admin only)
- `/sync-events` — manually check the Page for new events right now (admin only); also runs automatically every `EVENTS_POLL_INTERVAL_MINUTES` (default 15)
- `/facebook-status` — admin-only diagnostics
- `/event-role add|remove|list @role` — Phase 2 role allowlist management (gates both `/create-post` and `/create-event`)

## Deployment

Designed to run as a container. See `Dockerfile`. On the "Nexus" homelab
Proxmox host, this follows the same LXC + Podman + systemd pattern as the
existing `back-bot` container — see `deploy-shaberiba-bot.sh` in the
homelab repo's `nexus/containers/` directory (deploys from
`github.com/shaberiba/kanji`).

The SQLite file at `./data/bot.sqlite3` must persist across
restarts/redeploys — it holds the Facebook token, the role allowlist, the
events-channel config, and which Facebook events have already been
announced to Discord.
