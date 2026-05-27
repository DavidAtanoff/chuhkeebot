import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Store a new order in Supabase
 */
export async function storeOrder(orderId, email, productKey, productName) {
  try {
    const { data, error } = await supabase
      .from('orders')
      .insert([
        {
          id: orderId,
          email: email,
          product_key: productKey,
          product_name: productName,
          redeemed: false,
          created_at: new Date().toISOString()
        }
      ]);

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error storing order:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get order by ID
 */
export async function getOrder(orderId) {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Mark order as redeemed
 */
export async function redeemOrder(orderId, discordUserId, robloxUsername) {
  try {
    const { data, error } = await supabase
      .from('orders')
      .update({
        redeemed: true,
        redeemed_at: new Date().toISOString(),
        discord_user_id: discordUserId,
        roblox_username: robloxUsername
      })
      .eq('id', orderId);

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error redeeming order:', error);
    return { success: false, error: error.message };
  }
}

export default supabase;
