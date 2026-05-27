# ChuhkeeBot — Whitelist Automation Spec

## Overview
A system that automatically whitelists Roblox users upon verified purchase. When someone buys the product on Payhip, their order is stored in Supabase. They then run a Discord slash command to claim their whitelist, which accepts them into the Roblox group.

---

## Stack
- **Hosting** — Render.com (free tier, Node.js web service)
- **Database** — Supabase (free tier, Postgres)
- **Bot** — Discord.js slash commands
- **Roblox** — noblox.js (acts on behalf of a group admin account)
- **Payments** — Payhip webhooks

---

## Architecture

```
Payhip Sale
    │
    ▼
Render.com (Express server)
    ├── POST /webhook  ──► Supabase (store order)
    └── Discord Bot
            │
            ▼
        /whitelist <roblox_username> <purchase_id>
            │
            ├── check Supabase: does purchase exist?
            ├── check Supabase: has it been redeemed?
            ├── confirm prompt (ephemeral)
            │
            ▼
        Mark redeemed in Supabase
            │
            ▼
        noblox.js → accept Roblox group join request
```

---

## Supabase Schema

### `orders` table
| column | type | notes |
|---|---|---|
| id | text (PK) | Payhip order ID e.g. `7zqpAeArWg` |
| email | text | buyer email from webhook |
| product_key | text | e.g. `P8aJ9` — used to verify correct product |
| redeemed | boolean | default false |
| redeemed_at | timestamp | null until claimed |
| discord_user_id | text | null until claimed |
| roblox_username | text | null until claimed |
| created_at | timestamp | from webhook date field |

---

## Webhook Flow (`POST /webhook`)

1. Payhip sends a `paid` event to `https://yourapp.render.com/webhook`
2. Server verifies the HMAC-SHA256 signature using the Payhip API key
3. Extracts `id`, `email`, `items[0].product_key`, `date` from payload
4. Inserts a new row into `orders` with `redeemed = false`
5. Returns `200 OK`

If signature is invalid → return `401` and ignore.

---

## Discord Bot Flow (`/whitelist`)

### Command definition
```
/whitelist roblox_username:<string> purchase_id:<string>
```

### Interaction is ephemeral (only visible to the user who ran it)

### Steps
1. User runs `/whitelist roblox_username:CoolPlayer purchase_id:7zqpAeArWg`
2. Bot queries Supabase for that `purchase_id`
   - Not found → reply "❌ Purchase ID not found."
   - Already redeemed → reply "❌ This purchase has already been used."
   - Wrong product → reply "❌ That purchase is not for this product."
3. Bot replies with an ephemeral confirmation prompt:
   > "Are you sure you want to whitelist **CoolPlayer**? This cannot be undone."
   > [Confirm] [Cancel]
4. User clicks Confirm
5. Bot updates Supabase: `redeemed = true`, `redeemed_at = now`, `discord_user_id`, `roblox_username`
6. Bot calls noblox.js to accept the pending join request for that Roblox username
7. Bot replies: "✅ **CoolPlayer** has been whitelisted and accepted into the group."

---

## Roblox Integration (Open Cloud API)

- Uses Roblox Open Cloud API with API key authentication (no cookies needed)
- API key requires **Groups > Write** permission
- On successful whitelist, calls `PATCH /cloud/v2/groups/{groupId}/join-requests/{userId}:accept`
- User must have already sent a join request to the group before running `/whitelist`
- Each product can have a different Roblox group ID (configured dynamically)

---

## Environment Variables (Render)
```
PAYHIP_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_WEBHOOK_URL=
ROBLOX_API_KEY=
ADMIN_USER_IDS=
```

**Note:** `ROBLOX_GROUP_ID` is no longer needed as each product has its own group ID configured dynamically.

---

## Anti-Abuse
- One purchase ID = one whitelist, enforced at DB level (`redeemed` flag)
- Signature verification on every webhook so nobody can fake a purchase
- Ephemeral Discord interactions so others can't see purchase IDs in chat
- Optional: log all whitelist attempts (success + fail) to a private Discord channel

---

## Deployment Notes
- Single Render web service runs both the Express webhook server and the Discord bot in the same process
- Render free tier spins down after inactivity — use a cron ping or upgrade to avoid cold starts on the webhook endpoint
- Register slash commands globally via `node deploy-commands.js` once on setup