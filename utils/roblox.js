import dotenv from 'dotenv';

dotenv.config();

const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const ROBLOX_API_BASE = 'https://apis.roblox.com/cloud/v2';

/**
 * Authenticate with Roblox (verify API key is set)
 */
export async function authenticateRoblox() {
  if (!ROBLOX_API_KEY) {
    console.error('❌ ROBLOX_API_KEY not set in environment variables');
    return false;
  }

  console.log('✅ Roblox Open Cloud API key configured');
  return true;
}

/**
 * Get Roblox user ID from username using public API
 */
export async function getRobloxUserId(username) {
  try {
    const response = await fetch(`https://users.roblox.com/v1/usernames/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        usernames: [username],
        excludeBannedUsers: false
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      return { success: false, error: `User ${username} not found` };
    }

    const userId = data.data[0].id;
    return { success: true, userId };
  } catch (error) {
    console.error(`Failed to get user ID for ${username}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Accept a user's join request to a Roblox group using Open Cloud API
 */
export async function acceptJoinRequest(groupId, username) {
  try {
    // Get user ID from username
    const userResult = await getRobloxUserId(username);
    if (!userResult.success) {
      return { success: false, error: `User ${username} not found` };
    }

    const userId = userResult.userId;

    // Accept the join request using Open Cloud API (v2 uses POST for this endpoint)
    // POST https://apis.roblox.com/cloud/v2/groups/{groupId}/join-requests/{userId}:accept
    const url = `${ROBLOX_API_BASE}/groups/${groupId}/join-requests/${userId}:accept`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': ROBLOX_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    console.log(`✅ Accepted ${username} (${userId}) into group ${groupId}`);
    
    // Verify the user is now in the group
    const verifyResult = await verifyGroupMembership(groupId, userId);
    if (!verifyResult.success) {
      console.warn(`⚠️ Could not verify membership for ${username}, but accept request succeeded`);
      // Don't fail the operation, just log the warning
    } else if (verifyResult.isMember) {
      console.log(`✅ Verified ${username} is now a member of group ${groupId}`);
    }
    
    return { success: true, userId };
  } catch (error) {
    console.error(`Failed to accept join request for ${username}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Verify if a user is a member of a group
 */
export async function verifyGroupMembership(groupId, userId) {
  try {
    // GET https://apis.roblox.com/cloud/v2/groups/{groupId}/memberships?filter=user=="users/{userId}"
    const filterQuery = `user == "users/${userId}"`;
    const url = `${ROBLOX_API_BASE}/groups/${groupId}/memberships?filter=${encodeURIComponent(filterQuery)}&maxPageSize=1`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': ROBLOX_API_KEY
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Could not verify membership: ${errorText}`);
      return { success: false, error: errorText };
    }

    const data = await response.json();
    const isMember = data.groupMemberships && data.groupMemberships.length > 0;
    
    return { success: true, isMember };
  } catch (error) {
    console.error(`Failed to verify group membership:`, error);
    return { success: false, error: error.message };
  }
}
