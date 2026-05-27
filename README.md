# Payhip to Roblox Whitelist Automation

Automated webhook system that processes Payhip purchases and whitelists users to Roblox groups via Discord bot.

## Features

- ✅ Payhip webhook verification with HMAC-SHA256
- ✅ Supabase database integration for order tracking
- ✅ **Email-based whitelisting** - No need to remember purchase IDs
- ✅ **Multiple redemptions per email** - Buy multiple products with same email
- ✅ Discord bot with `/whitelist` slash command
- ✅ Automatic Roblox group join request acceptance via Open Cloud API
- ✅ Discord webhook logging for all events
- ✅ **Database-driven product configuration** - No local files, survives restarts
- ✅ **Auto-deploy commands** - Commands register automatically on startup
- ✅ One-time redemption per purchase
- ✅ Ephemeral Discord interactions for privacy
- ✅ **Safe order processing** - Orders only marked as used AFTER successful Roblox acceptance
- ✅ **Retry-friendly** - Failed redemptions don't consume the purchase

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `PAYHIP_API_KEY` - Your Payhip API key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Your Supabase service role key
- `DISCORD_BOT_TOKEN` - Your Discord bot token
- `DISCORD_CLIENT_ID` - Your Discord application client ID
- `DISCORD_WEBHOOK_URL` - Discord webhook URL for logging (optional)
- `ROBLOX_API_KEY` - Your Roblox Open Cloud API key (with Groups > Write permission)
- `ADMIN_USER_IDS` - Comma-separated Discord user IDs of admins

#### Creating a Roblox Open Cloud API Key

1. Go to [Roblox Creator Dashboard](https://create.roblox.com/credentials)
2. Click "Create API Key"
3. Give it a name (e.g., "Whitelist Bot")
4. Under **Access Permissions**, select:
   - **Groups** > **Write** (required to accept join requests)
5. Under **Security**, select the groups you want to manage (or "All Groups")
6. Click "Save & Generate Key"
7. Copy the API key and add it to your `.env` file as `ROBLOX_API_KEY`

**Important:** The API key can accept join requests for any group you have admin access to. Each product can have a different group ID.

### 3. Configure Admin Users

Add Discord user IDs of admins who can manage products in `.env`:

```
ADMIN_USER_IDS=123456789012345678,987654321098765432
```

To get your Discord user ID:
1. Enable Developer Mode in Discord (Settings > Advanced > Developer Mode)
2. Right-click your username and select "Copy User ID"

### 4. Configure Products

**Option A: Use Discord Commands (Recommended)**

Once the bot is running, admins can use:
- `/addproduct` - Add a new product
- `/removeproduct` - Remove a product
- `/listproducts` - View all products

**Option B: Edit products.json manually**

After first run, edit `products.json` to add products:

```json
{
  "x0Xvy": {
    "name": "TestProduct",
    "robloxGroupId": "12345678",
    "description": "Test Product Whitelist"
  }
}
```

### 5. Setup Supabase Database

**The app will try to create tables automatically on startup!**

If automatic creation fails, manually run this in Supabase SQL Editor:

```sql
-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  roblox_group_id TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  product_key TEXT NOT NULL,
  product_name TEXT NOT NULL,
  redeemed BOOLEAN DEFAULT FALSE,
  redeemed_at TIMESTAMP WITH TIME ZONE,
  discord_user_id TEXT,
  roblox_username TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_email_lower ON orders (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_orders_redeemed ON orders (redeemed);
CREATE INDEX IF NOT EXISTS idx_orders_email_redeemed ON orders (LOWER(email), redeemed, created_at);
```

Go to Settings > API and copy:
- Project URL → `SUPABASE_URL`
- service_role key → `SUPABASE_SERVICE_KEY`

### 6. Start the Server

```bash
npm start
```

**Commands are deployed automatically on startup!** No need to run a separate deploy script.

## Deployment to Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add all environment variables from `.env`
6. Deploy!

Your webhook URL will be: `https://your-app.onrender.com/webhook`

Configure this URL in your Payhip product settings.

**Note:** Render free tier spins down after inactivity. Consider using a cron job to ping the health endpoint (`/`) every 10 minutes, or upgrade to a paid plan for 24/7 uptime.

## Usage

### For Customers

1. Purchase a product on Payhip
2. Note the email address you used for the purchase
3. Send a join request to the Roblox group
4. Run `/whitelist` command in Discord:
   - `roblox_username`: Your Roblox username
   - `email`: The email you used to purchase
5. Click "Confirm" to complete whitelisting

**Note:** If you have multiple purchases with the same email, they will be redeemed in order (oldest first). You can redeem multiple times with the same email!

### For Admins

**Product Management:**
- `/addproduct` - Add a new product for whitelisting
  - `product_key`: Payhip product key (e.g., x0Xvy)
  - `product_name`: Friendly name (e.g., PremiumPass)
  - `group_id`: Roblox group ID
  - `description`: Optional description
- `/removeproduct` - Remove a product by key
- `/listproducts` - View all configured products

**Monitoring:**
- All purchases are logged to Discord webhook
- All whitelist redemptions are logged
- Check Supabase for order history and status
- Products are stored in `products.json` (auto-created)

## Architecture

```
Payhip Purchase
    ↓
Webhook (POST /webhook)
    ↓
Verify Signature
    ↓
Store in Supabase (redeemed=false)
    ↓
Log to Discord
    
User runs /whitelist
    ↓
Find oldest unredeemed order by email
    ↓
Verify Purchase (exists & not redeemed)
    ↓
Confirmation Prompt
    ↓
Accept Roblox Join Request (via Open Cloud API)
    ↓ (only if successful)
Mark as Redeemed in Supabase
    ↓
Verify Group Membership (optional check)
    ↓
Success Message
```

**Important:** 
- The order is only marked as redeemed AFTER the Roblox join request is successfully accepted
- Users provide their email instead of purchase ID
- Multiple purchases with the same email are redeemed in order (oldest first)

## Security

- HMAC-SHA256 signature verification on all webhooks
- One-time redemption per purchase enforced at database level
- Ephemeral Discord interactions (only visible to user)
- Service role key for Supabase (bypasses RLS)
- **Order marked as redeemed only AFTER successful Roblox acceptance**
- Optional group membership verification after acceptance

## Troubleshooting

**Webhook not receiving data:**
- Check Payhip webhook URL is correct
- Verify PAYHIP_API_KEY matches your Payhip account
- Check Render logs for errors

**Discord bot not responding:**
- Ensure bot has proper permissions in your server
- Run `npm run deploy-commands` to register commands
- Check DISCORD_BOT_TOKEN is valid

**Roblox join request not accepted:**
- Verify ROBLOX_API_KEY is valid
- Ensure the API key has **Groups > Write** permission
- Ensure you have admin access to the group specified in the product config
- User must have already sent a join request before running `/whitelist`
- Check that the group ID in the product config is correct

## License

MIT
