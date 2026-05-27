# System Flow Documentation

## Purchase to Whitelist Flow

### 1. Purchase Flow (Payhip → Server)

```
Customer purchases on Payhip
    ↓
Payhip sends webhook to /webhook endpoint
    ↓
Server receives POST request with:
    - id (order ID)
    - email
    - items[0].product_key
    - signature
    ↓
Server verifies HMAC-SHA256 signature
    ├─ Invalid → Return 401, ignore request
    └─ Valid → Continue
    ↓
Server looks up product by product_key
    ├─ Unknown → Store with "Unknown-{key}" name
    └─ Known → Store with configured product name
    ↓
Insert into Supabase orders table:
    - id: order ID
    - email: customer email
    - product_key: product key
    - product_name: friendly name
    - redeemed: FALSE
    - created_at: timestamp
    ↓
Log to Discord webhook (if configured)
    ↓
Return 200 OK to Payhip
```

### 2. Whitelist Flow (Discord → Roblox)

```
User runs /whitelist command
    - roblox_username: their Roblox username
    - purchase_id: order ID from email
    ↓
Bot queries Supabase for purchase_id
    ├─ Not found → Error: "Purchase ID not found"
    ├─ Already redeemed → Error: "Already redeemed by @user"
    └─ Valid & unredeemed → Continue
    ↓
Bot checks if product is configured
    ├─ Not configured → Error: "Product not configured"
    └─ Configured → Continue
    ↓
Bot shows confirmation prompt (ephemeral)
    "Are you sure you want to whitelist {username}?"
    [Confirm] [Cancel]
    ↓
User clicks [Confirm]
    ↓
Bot re-checks order hasn't been redeemed (race condition check)
    ├─ Already redeemed → Error: "Already redeemed"
    └─ Still available → Continue
    ↓
┌─────────────────────────────────────────────────┐
│ CRITICAL: Accept Roblox join request FIRST     │
│ (Order NOT marked as redeemed yet)             │
└─────────────────────────────────────────────────┘
    ↓
Get Roblox user ID from username
    ├─ User not found → Error: "User not found"
    └─ User found → Continue
    ↓
Call Roblox Open Cloud API:
PATCH /cloud/v2/groups/{groupId}/join-requests/{userId}:accept
    ├─ API Error → Error: "Failed to accept join request"
    │             Purchase NOT marked as used
    │             User can try again
    └─ Success → Continue
    ↓
Verify group membership (optional check)
    - GET /cloud/v2/groups/{groupId}/memberships
    - Filter by user ID
    - Log warning if verification fails
    ↓
┌─────────────────────────────────────────────────┐
│ NOW mark order as redeemed in Supabase         │
│ (Only after successful Roblox acceptance)      │
└─────────────────────────────────────────────────┘
    ↓
Update Supabase orders table:
    - redeemed: TRUE
    - redeemed_at: timestamp
    - discord_user_id: user who redeemed
    - roblox_username: username that was whitelisted
    ├─ DB Error → Critical error message
    │             User IS in group but DB not updated
    │             Admin intervention needed
    └─ Success → Continue
    ↓
Log to Discord webhook:
    "✅ {username} whitelisted for {product_name}"
    ↓
Reply to user:
    "✅ {username} has been whitelisted and accepted into the group!"
```

## Error Handling

### Scenario 1: Roblox API Fails

```
User clicks Confirm
    ↓
Roblox API returns error (no pending join request)
    ↓
Order is NOT marked as redeemed
    ↓
User receives error message with instructions
    ↓
User can fix the issue and try again with same purchase ID
```

**Result:** Purchase is preserved, user can retry

### Scenario 2: Database Fails After Roblox Success

```
User clicks Confirm
    ↓
Roblox API succeeds (user accepted into group)
    ↓
Database update fails
    ↓
User receives critical error message with purchase ID
    ↓
Admin must manually mark order as redeemed
```

**Result:** User is in group, but order not marked as used. Admin intervention required.

### Scenario 3: Already Redeemed

```
User clicks Confirm
    ↓
Re-check order status (race condition protection)
    ↓
Order is already redeemed
    ↓
User receives error: "Already redeemed by @user"
    ↓
No API calls made, no changes to database
```

**Result:** Duplicate redemption prevented

## Admin Product Management Flow

### Add Product

```
Admin runs /addproduct
    - product_key: Payhip product key
    - product_name: Friendly name
    - group_id: Roblox group ID
    - description: Optional description
    ↓
Bot checks if user is admin
    ├─ Not admin → Error: "No permission"
    └─ Is admin → Continue
    ↓
Bot checks if product_key already exists
    ├─ Exists → Error: "Already exists"
    └─ New → Continue
    ↓
Add to products.json:
    {
      "product_key": {
        "name": "product_name",
        "robloxGroupId": "group_id",
        "description": "description"
      }
    }
    ↓
Save products.json to disk
    ↓
Reply: "✅ Product added successfully"
```

### Remove Product

```
Admin runs /removeproduct
    - product_key: Product key to remove
    ↓
Bot checks if user is admin
    ├─ Not admin → Error: "No permission"
    └─ Is admin → Continue
    ↓
Bot checks if product exists
    ├─ Not found → Error: "Product not found"
    └─ Found → Continue
    ↓
Remove from products.json
    ↓
Save products.json to disk
    ↓
Reply: "✅ Product removed"
```

**Note:** Removing a product does NOT affect existing orders in the database. Users can still redeem old purchases if the product is re-added with the same key.

## Race Condition Protection

### Multiple Users Trying to Redeem Same Purchase

```
User A runs /whitelist with purchase_id
User B runs /whitelist with same purchase_id
    ↓
Both get confirmation prompts
    ↓
User A clicks Confirm first
    ↓
User A's flow:
    - Check order (unredeemed) ✓
    - Accept Roblox join request ✓
    - Mark as redeemed ✓
    - Success message ✓
    ↓
User B clicks Confirm second
    ↓
User B's flow:
    - Re-check order (NOW redeemed) ✗
    - Error: "Already redeemed by @UserA"
    - No Roblox API call made
    - No database changes
```

**Result:** Only first user succeeds, second user gets clear error

## Data Flow Summary

### Database States

**Order States:**
1. **Created** - Order stored from webhook, `redeemed=false`
2. **Redeemed** - User whitelisted successfully, `redeemed=true`

**No intermediate states** - Order is either redeemed or not. No "pending" or "processing" state.

### Critical Guarantees

✅ **No lost purchases** - If Roblox API fails, order stays unredeemed
✅ **No duplicate redemptions** - Database constraint + re-check before marking
✅ **Audit trail** - All redemptions logged with Discord user ID and timestamp
✅ **Idempotent** - User can retry failed redemptions with same purchase ID

### Edge Cases Handled

- Unknown product keys → Stored but not whitelisted
- Invalid Roblox usernames → Error before marking as redeemed
- No pending join request → Error before marking as redeemed
- Concurrent redemption attempts → Only first succeeds
- Database failures → User notified, admin intervention required
- API rate limits → Error returned, user can retry later
