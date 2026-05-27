# Quick Setup Guide

## 1. Install Dependencies

```bash
npm install
```

## 2. Create Roblox Open Cloud API Key

1. Go to https://create.roblox.com/credentials
2. Click "Create API Key"
3. Name: "Whitelist Bot"
4. Access Permissions:
   - **Groups** > **Write** ✓
5. Security: Select groups you want to manage (or "All Groups")
6. Click "Save & Generate Key"
7. Copy the API key

## 3. Setup Discord Bot

1. Go to https://discord.com/developers/applications
2. Create New Application
3. Go to "Bot" tab
4. Click "Reset Token" and copy the token
5. Enable these Privileged Gateway Intents:
   - Server Members Intent (optional)
   - Message Content Intent (optional)
6. Go to "OAuth2" > "General"
7. Copy the Client ID
8. Go to "OAuth2" > "URL Generator"
9. Select scopes: `bot`, `applications.commands`
10. Select bot permissions: `Send Messages`, `Use Slash Commands`
11. Copy the generated URL and invite bot to your server

## 4. Setup Discord Webhook (Optional - for logging)

1. In your Discord server, go to Server Settings > Integrations
2. Click "Create Webhook"
3. Choose a channel for logs
4. Copy the webhook URL

## 5. Setup Supabase

1. Go to https://supabase.com
2. Create a new project
3. Go to SQL Editor and run:

```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  product_key TEXT NOT NULL,
  product_name TEXT NOT NULL,
  redeemed BOOLEAN DEFAULT FALSE,
  redeemed_at TIMESTAMP,
  discord_user_id TEXT,
  roblox_username TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

4. Go to Settings > API
5. Copy the "Project URL" and "service_role" key

## 6. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in all the values you collected above.

## 7. Get Your Discord User ID (for admin access)

1. Enable Developer Mode in Discord (Settings > Advanced > Developer Mode)
2. Right-click your username and select "Copy User ID"
3. Add it to `ADMIN_USER_IDS` in `.env`

## 8. Deploy Discord Commands

```bash
npm run deploy-commands
```

## 9. Start the Server

```bash
npm start
```

## 10. Add Your First Product

In Discord, run:

```
/addproduct product_key:x0Xvy product_name:TestProduct group_id:12345678
```

Replace:
- `x0Xvy` with your Payhip product key
- `TestProduct` with a friendly name
- `12345678` with your Roblox group ID

## 11. Configure Payhip Webhook

1. Go to your Payhip product settings
2. Add webhook URL: `http://localhost:3000/webhook` (or your deployed URL)
3. Test with a free purchase

## Done!

Your whitelist system is now ready. When someone purchases:
1. They receive a purchase ID via email
2. They send a join request to your Roblox group
3. They run `/whitelist` in Discord with their Roblox username and purchase ID
4. They get automatically accepted into the group!
