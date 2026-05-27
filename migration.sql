-- Migration: Email-based whitelisting with Supabase products table
-- Run this in your Supabase SQL Editor

-- 1. Create the products table
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, -- payhip product key, e.g., 'x0Xvy'
  name TEXT NOT NULL,
  roblox_group_id TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Verify orders table exists (should already be created)
-- If not, create it:
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

-- 3. Create index on email for faster lookups (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_orders_email_lower ON orders (LOWER(email));

-- 4. Create index on redeemed status for faster queries
CREATE INDEX IF NOT EXISTS idx_orders_redeemed ON orders (redeemed);

-- 5. Create composite index for email + redeemed queries
CREATE INDEX IF NOT EXISTS idx_orders_email_redeemed ON orders (LOWER(email), redeemed, created_at);

-- Done! Your database is ready for email-based whitelisting.
