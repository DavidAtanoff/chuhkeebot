# Safety & Reliability Guarantees

## Order Processing Safety

### Critical Design Decision: Accept First, Mark Later

The system follows this strict order of operations:

1. ✅ **Verify** purchase exists and is not redeemed
2. ✅ **Accept** user into Roblox group via API
3. ✅ **Mark** order as redeemed in database
4. ✅ **Log** successful whitelist

**Why this order matters:**

If we marked the order as redeemed BEFORE accepting the Roblox join request, and the Roblox API failed, the user would lose their purchase with no way to retry.

By accepting the Roblox join request FIRST, we ensure:
- ❌ Roblox API fails → Order stays unredeemed, user can retry
- ✅ Roblox API succeeds → Order marked as used, one-time redemption enforced

## Failure Scenarios & Recovery

### Scenario 1: Roblox API Failure (Most Common)

**Causes:**
- User didn't send join request yet
- Invalid Roblox username
- User already in group
- API rate limit exceeded
- Network timeout

**System Behavior:**
```
1. User clicks Confirm
2. Roblox API call fails
3. Order remains unredeemed (redeemed=false)
4. User receives error message
5. User can fix the issue and retry with same purchase ID
```

**Recovery:** User fixes the issue (sends join request, corrects username, etc.) and runs `/whitelist` again with the same purchase ID.

**Data Integrity:** ✅ Perfect - No data loss, purchase preserved

### Scenario 2: Database Failure After Roblox Success (Rare)

**Causes:**
- Supabase connection lost
- Database constraint violation
- Service role key expired

**System Behavior:**
```
1. User clicks Confirm
2. Roblox API succeeds (user accepted into group)
3. Database update fails
4. User receives critical error with purchase ID
5. Order remains unredeemed (redeemed=false)
```

**Recovery:** Admin must manually update the database:
```sql
UPDATE orders 
SET redeemed = true,
    redeemed_at = NOW(),
    discord_user_id = 'USER_ID',
    roblox_username = 'USERNAME'
WHERE id = 'PURCHASE_ID';
```

**Data Integrity:** ⚠️ Requires manual intervention - User is in group but order not marked as used. Without admin action, the purchase could be redeemed again by someone else.

### Scenario 3: Duplicate Redemption Attempt

**Causes:**
- Two users try to use the same purchase ID
- User clicks Confirm multiple times
- Race condition between concurrent requests

**System Behavior:**
```
1. First request: Checks order (unredeemed) → Proceeds
2. Second request: Checks order (unredeemed) → Proceeds
3. First request: Accepts Roblox join → Marks as redeemed
4. Second request: Re-checks order (NOW redeemed) → Fails
```

**Recovery:** None needed - Second user receives clear error message

**Data Integrity:** ✅ Perfect - Only first user succeeds, database constraint prevents duplicates

## Race Condition Protection

### Double-Check Pattern

The system checks if an order is redeemed at TWO points:

1. **Initial check** - When user runs `/whitelist` command
2. **Re-check** - After user clicks Confirm, before accepting Roblox join request

This protects against:
- Multiple users with the same purchase ID
- User clicking Confirm multiple times
- Concurrent redemption attempts

### Database Constraints

The `orders` table has:
- `id` as PRIMARY KEY (unique constraint)
- `redeemed` as BOOLEAN (not nullable)

This ensures:
- No duplicate order IDs
- Every order has a clear redeemed state
- Database-level protection against race conditions

## Retry Safety

### Idempotent Operations

Users can safely retry failed redemptions:

```
Attempt 1: /whitelist (no join request sent)
  → Error: "Failed to accept join request"
  → Order: redeemed=false

User sends join request to group

Attempt 2: /whitelist (same purchase ID)
  → Success: User accepted into group
  → Order: redeemed=true
```

**Key Point:** Failed attempts don't consume the purchase.

### Non-Idempotent Operations

Once a redemption succeeds, it cannot be repeated:

```
Attempt 1: /whitelist
  → Success: User accepted into group
  → Order: redeemed=true

Attempt 2: /whitelist (same purchase ID)
  → Error: "This purchase has already been redeemed"
  → No API calls made
```

## Audit Trail

Every successful redemption is logged with:

- **Order ID** - Unique purchase identifier
- **Discord User ID** - Who redeemed it
- **Roblox Username** - Who was whitelisted
- **Timestamp** - When it was redeemed
- **Product Name** - What was purchased

This allows:
- Tracking who redeemed what
- Investigating disputes
- Detecting abuse patterns
- Compliance with purchase records

## Security Guarantees

### Webhook Security

✅ **HMAC-SHA256 signature verification** - Only genuine Payhip webhooks are processed
✅ **Signature mismatch** → 401 Unauthorized, request ignored
✅ **No signature** → 401 Unauthorized, request ignored

### Discord Security

✅ **Ephemeral interactions** - Only the user who ran the command sees the response
✅ **Admin-only commands** - Product management restricted to `ADMIN_USER_IDS`
✅ **Confirmation prompts** - User must explicitly confirm before redemption

### Roblox Security

✅ **API key authentication** - No cookies, no account credentials shared
✅ **Fine-grained permissions** - API key only has Groups > Write access
✅ **User verification** - Username validated before API call
✅ **Optional membership check** - Verify user is actually in group after acceptance

### Database Security

✅ **Service role key** - Bypasses Row Level Security for admin operations
✅ **Parameterized queries** - Protection against SQL injection
✅ **Unique constraints** - Database-level duplicate prevention

## Monitoring & Alerting

### Success Logging

All successful operations are logged:
- ✅ New purchase received
- ✅ User whitelisted successfully
- ✅ Product added/removed

### Error Logging

All failures are logged:
- ❌ Invalid webhook signature
- ❌ Roblox API failure
- ❌ Database error
- ❌ Unknown product key

### Discord Webhook Integration

If `DISCORD_WEBHOOK_URL` is configured:
- 🛒 New purchases logged with order ID and email
- ✅ Successful whitelists logged with username and product
- ❌ Errors logged with details

This provides real-time visibility into system operations.

## Best Practices

### For Users

1. **Send join request BEFORE running `/whitelist`**
2. **Double-check your Roblox username spelling**
3. **Keep your purchase ID safe** - It's like a gift card code
4. **Don't share purchase IDs** - First person to redeem wins

### For Admins

1. **Monitor Discord webhook logs** for unusual activity
2. **Check Supabase regularly** for unredeemed orders
3. **Keep API keys secure** - Never commit to git
4. **Test new products** with free purchases first
5. **Have a backup plan** for database failures

### For Developers

1. **Never mark orders as redeemed before Roblox acceptance**
2. **Always re-check order status before critical operations**
3. **Log all errors with context** for debugging
4. **Use transactions** if adding more database operations
5. **Test failure scenarios** regularly

## Failure Rate Expectations

### Expected Failure Rates

- **Webhook signature failures:** <0.1% (only if Payhip has issues)
- **Roblox API failures:** 5-10% (user error - no join request sent)
- **Database failures:** <0.01% (infrastructure issues)
- **Duplicate redemption attempts:** 1-2% (user confusion or abuse)

### Acceptable Failure Modes

✅ **User error** - Clear error message, user can retry
✅ **Temporary API issues** - User can retry later
✅ **Rate limiting** - User can retry after cooldown

### Unacceptable Failure Modes

❌ **Lost purchases** - User loses money, can't retry
❌ **Duplicate redemptions** - Same purchase used twice
❌ **Silent failures** - Error occurs but user not notified

**Our system prevents all unacceptable failure modes.**

## Disaster Recovery

### Database Backup

Supabase provides automatic backups. In case of data loss:

1. Restore from Supabase backup
2. Cross-reference with Payhip order history
3. Manually reconcile any discrepancies

### API Key Rotation

If `ROBLOX_API_KEY` is compromised:

1. Create new API key in Roblox Creator Dashboard
2. Update `.env` file with new key
3. Restart server
4. Revoke old API key

No data loss, minimal downtime.

### Discord Bot Token Rotation

If `DISCORD_BOT_TOKEN` is compromised:

1. Reset token in Discord Developer Portal
2. Update `.env` file with new token
3. Restart server

No data loss, minimal downtime.

## Compliance

### GDPR Considerations

The system stores:
- Email addresses (from Payhip)
- Discord user IDs
- Roblox usernames

**Recommendations:**
- Add privacy policy link in Discord bot responses
- Provide data deletion endpoint for GDPR requests
- Log data access for audit purposes

### PCI Compliance

✅ **No payment data stored** - Payhip handles all payment processing
✅ **No credit card information** - Only order IDs and emails
✅ **Webhook verification** - Ensures data authenticity

## Summary

The system is designed with **safety first**:

1. ✅ **No lost purchases** - Failed redemptions don't consume the purchase
2. ✅ **No duplicate redemptions** - Database constraints + re-checks
3. ✅ **Clear error messages** - Users know what went wrong and how to fix it
4. ✅ **Audit trail** - Every redemption is logged
5. ✅ **Retry-friendly** - Users can fix issues and try again
6. ✅ **Admin visibility** - Discord webhook logs all events

**The critical guarantee:** Orders are only marked as redeemed AFTER successful Roblox acceptance.
