# Testing Guide

## Local Testing

### 1. Test Webhook Endpoint

You can test the webhook locally using curl or Postman:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "TEST123",
    "email": "test@example.com",
    "currency": "USD",
    "price": 0,
    "items": [{
      "product_key": "x0Xvy",
      "product_name": "Test Product",
      "quantity": "1"
    }],
    "payment_type": "free",
    "date": 1779905877,
    "type": "paid",
    "signature": "ef6846101a1938c9aeb5b15d3966fb76794242b43136267a3b250c2510c78fbf"
  }'
```

**Expected Response:** `200 OK`

Check your console logs and Supabase to verify the order was stored.

### 2. Test Discord Commands

#### Add a Product (Admin Only)

```
/addproduct product_key:x0Xvy product_name:TestProduct group_id:12345678 description:Test whitelist
```

**Expected:** Success message with product details

#### List Products (Admin Only)

```
/listproducts
```

**Expected:** List of all configured products

#### Test Whitelist (Any User)

```
/whitelist roblox_username:YourUsername purchase_id:TEST123
```

**Expected:** Confirmation prompt with Confirm/Cancel buttons

### 3. Test Roblox API Integration

Create a test script to verify the Roblox API key works:

```javascript
// test-roblox.js
import { authenticateRoblox, getRobloxUserId, acceptJoinRequest } from './utils/roblox.js';

async function test() {
  // Test authentication
  const authResult = await authenticateRoblox();
  console.log('Auth:', authResult);

  // Test getting user ID
  const userResult = await getRobloxUserId('Roblox');
  console.log('User ID:', userResult);

  // Test accepting join request (will fail if no pending request)
  // const acceptResult = await acceptJoinRequest('12345678', 'TestUser');
  // console.log('Accept:', acceptResult);
}

test();
```

Run with: `node test-roblox.js`

## Testing with Payhip

### 1. Create a Free Test Product

1. Go to Payhip dashboard
2. Create a new product with price $0 (free)
3. Note the product key (e.g., `x0Xvy`)
4. Add your webhook URL in product settings

### 2. Configure the Product

In Discord:
```
/addproduct product_key:x0Xvy product_name:TestProduct group_id:YOUR_GROUP_ID
```

### 3. Make a Test Purchase

1. Go to your Payhip product page
2. Complete a free checkout
3. Note the order ID from the confirmation email

### 4. Test the Whitelist Flow

1. Send a join request to your Roblox group
2. In Discord, run:
   ```
   /whitelist roblox_username:YourRobloxUsername purchase_id:ORDER_ID
   ```
3. Click "Confirm"
4. Check if you were accepted into the group

## Common Test Scenarios

### Scenario 1: Unknown Product Key

**Test:** Webhook receives a product key not in your config

**Expected:** Order stored with `Unknown-{key}` as product name, no error

### Scenario 2: Already Redeemed Purchase

**Test:** Try to redeem the same purchase ID twice

**Expected:** Error message "This purchase has already been redeemed"

### Scenario 3: Invalid Roblox Username

**Test:** Use a non-existent Roblox username

**Expected:** Error message "User {username} not found"

### Scenario 4: No Pending Join Request

**Test:** Whitelist without sending a join request first

**Expected:** 
- Error message "Failed to accept Roblox join request"
- Order NOT marked as redeemed
- User can fix (send join request) and try again with same purchase ID

### Scenario 5: Non-Admin User Tries Admin Command

**Test:** User not in `ADMIN_USER_IDS` runs `/addproduct`

**Expected:** "You do not have permission to use this command"

### Scenario 6: Roblox API Fails, Then User Retries

**Test:** 
1. Try to whitelist without sending join request (fails)
2. Send join request to group
3. Try to whitelist again with same purchase ID

**Expected:**
- First attempt: Error, order NOT marked as redeemed
- Second attempt: Success, order marked as redeemed
- Purchase ID can be reused after failed attempts

### Scenario 7: Database Fails After Roblox Success

**Test:** Simulate database failure after successful Roblox acceptance

**Expected:**
- User receives critical error message
- User IS in the Roblox group
- Order NOT marked as redeemed in database
- Admin must manually update database

## Debugging

### Check Logs

The server logs important events:
- `✅` Success messages
- `❌` Error messages
- `⚠️` Warning messages

### Check Supabase

Query the orders table:
```sql
SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;
```

### Check Discord Webhook

If configured, all events are logged to your Discord webhook channel.

### Common Issues

**Webhook returns 401:**
- Check `PAYHIP_API_KEY` is correct
- Verify signature calculation matches Payhip's method

**Discord bot not responding:**
- Check bot token is valid
- Verify bot has proper permissions in server
- Run `npm run deploy-commands` to register commands

**Roblox API errors:**
- Verify `ROBLOX_API_KEY` has Groups > Write permission
- Check you have admin access to the group
- Ensure user sent a join request before whitelisting

**Supabase errors:**
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
- Verify table schema matches expected structure
- Check service role key has proper permissions

## Load Testing

For production readiness, test with multiple concurrent requests:

```bash
# Install Apache Bench
# Ubuntu: sudo apt-get install apache2-utils
# Mac: brew install ab

# Test webhook endpoint
ab -n 100 -c 10 -p webhook-payload.json -T application/json http://localhost:3000/webhook
```

## Monitoring

### Health Check

The server has a health check endpoint:

```bash
curl http://localhost:3000/
```

**Expected Response:**
```json
{"status":"ok","message":"Webhook server is running"}
```

Use this for uptime monitoring services like UptimeRobot or Pingdom.

## Production Testing Checklist

Before going live:

- [ ] Webhook receives and stores orders correctly
- [ ] Discord commands work for admins
- [ ] Discord commands restricted for non-admins
- [ ] Whitelist flow works end-to-end
- [ ] Roblox join requests are accepted
- [ ] Discord logging works (if configured)
- [ ] Duplicate redemption is prevented
- [ ] Invalid usernames are handled gracefully
- [ ] Unknown products are handled gracefully
- [ ] Health check endpoint responds
- [ ] All environment variables are set
- [ ] Payhip webhook URL is configured
- [ ] SSL/HTTPS is working (for production)
