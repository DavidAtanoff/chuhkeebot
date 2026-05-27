# Changes Summary

## What Changed

### ✅ Switched from Cookies to Open Cloud API

**Before:**
- Used `noblox.js` library with `.ROBLOSECURITY` cookie
- Required a dedicated Roblox account
- Cookie could expire and break the system

**After:**
- Uses Roblox Open Cloud API with API key
- No cookies needed - more secure and reliable
- API key has fine-grained permissions (Groups > Write)
- API endpoint: `PATCH /cloud/v2/groups/{groupId}/join-requests/{userId}:accept`

### ✅ Dynamic Group IDs

**Before:**
- Single `ROBLOX_GROUP_ID` environment variable
- All products used the same group

**After:**
- Each product has its own `robloxGroupId` in config
- Support multiple groups for different products
- No default group ID needed

### ✅ Product Management

**Before:**
- Products hardcoded in `config.js`
- Required code changes to add products

**After:**
- Products stored in `products.json` (auto-created)
- Admin Discord commands to manage products:
  - `/addproduct` - Add new product
  - `/removeproduct` - Remove product
  - `/listproducts` - View all products
- No code changes or restarts needed

### ✅ Uses Product Key Instead of Product ID

**Before:**
- System used `product_id` (numeric)

**After:**
- System uses `product_key` (alphanumeric like `x0Xvy`)
- Matches Payhip webhook payload structure

### ✅ Starts with Empty Product List

**Before:**
- Had a default test product in config

**After:**
- Starts with empty product list
- Admins add products via Discord commands
- More flexible for new deployments

## Environment Variables

### Removed:
- `ROBLOX_COOKIE` - No longer needed
- `ROBLOX_GROUP_ID` - Now per-product

### Added:
- `ROBLOX_API_KEY` - Open Cloud API key
- `ADMIN_USER_IDS` - Discord user IDs who can manage products

### Unchanged:
- `PAYHIP_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_WEBHOOK_URL`
- `PORT`

## Database Schema

### Updated:
- `product_id` → `product_key` (TEXT)

## New Files

- `SETUP.md` - Quick setup guide
- `CHANGES.md` - This file
- `products.json` - Auto-generated product storage

## Dependencies

### Removed:
- `noblox.js` - No longer needed

### Kept:
- `express`
- `discord.js`
- `@supabase/supabase-js`
- `dotenv`

## Migration Guide

If you're upgrading from the old system:

1. Create a Roblox Open Cloud API key (see SETUP.md)
2. Update `.env`:
   - Remove `ROBLOX_COOKIE`
   - Remove `ROBLOX_GROUP_ID`
   - Add `ROBLOX_API_KEY`
   - Add `ADMIN_USER_IDS`
3. Update Supabase schema:
   ```sql
   ALTER TABLE orders RENAME COLUMN product_id TO product_key;
   ```
4. Run `npm install` to update dependencies
5. Run `npm run deploy-commands` to register new Discord commands
6. Use `/addproduct` to configure your products
7. Restart the server

## Benefits

✅ More secure (API keys vs cookies)
✅ More reliable (no cookie expiration)
✅ More flexible (multiple groups per deployment)
✅ Easier management (Discord commands)
✅ Better permissions (fine-grained API access)
✅ No dedicated Roblox account needed
