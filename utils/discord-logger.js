import dotenv from 'dotenv';

dotenv.config();

/**
 * Send a log message to Discord webhook
 */
export async function logToDiscord(message, data = {}) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.log('Discord webhook not configured, skipping log');
    return;
  }

  try {
    const embed = {
      title: message,
      color: data.success ? 0x00ff00 : 0xff0000,
      fields: [],
      timestamp: new Date().toISOString()
    };

    // Add fields from data
    if (data.username) {
      embed.fields.push({ name: 'Username', value: data.username, inline: true });
    }
    if (data.productName) {
      embed.fields.push({ name: 'Product', value: data.productName, inline: true });
    }
    if (data.orderId) {
      embed.fields.push({ name: 'Order ID', value: data.orderId, inline: true });
    }
    if (data.email) {
      embed.fields.push({ name: 'Email', value: data.email, inline: true });
    }
    if (data.error) {
      embed.fields.push({ name: 'Error', value: data.error, inline: false });
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch (error) {
    console.error('Failed to send Discord log:', error);
  }
}

/**
 * Log a new purchase
 */
export async function logPurchase(orderId, email, productName) {
  await logToDiscord('🛒 New Purchase', {
    success: true,
    orderId,
    email,
    productName
  });
}

/**
 * Log a whitelist redemption
 */
export async function logWhitelist(username, productName, orderId) {
  await logToDiscord('✅ Whitelist Redeemed', {
    success: true,
    username,
    productName,
    orderId
  });
}

/**
 * Log an error
 */
export async function logError(message, error) {
  await logToDiscord('❌ Error', {
    success: false,
    error: `${message}: ${error}`
  });
}
