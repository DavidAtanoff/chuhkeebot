import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Initialize database tables and indexes
 */
export async function initializeDatabase() {
  try {
    console.log('🔄 Initializing database...');

    // Test connection by trying to query products
    const { error } = await supabase.from('products').select('id').limit(1);
    
    if (error) {
      console.log('⚠️ Database tables might not exist. Please run migration.sql manually in Supabase SQL Editor.');
      console.log('   Tables needed: products, orders');
    } else {
      console.log('✅ Database initialized successfully');
    }
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    console.log('⚠️ Please run migration.sql manually in Supabase SQL Editor');
  }
}

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
          email: email.toLowerCase(), // Store emails in lowercase for consistency
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
 * Get the oldest unredeemed order by email (case-insensitive)
 * Supports multiple purchases per email
 */
export async function getUnredeemedOrder(email) {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('email', email.toLowerCase()) // Exact match on lowercase email
      .eq('redeemed', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error) {
      // If no rows found, error.code will be 'PGRST116'
      if (error.code === 'PGRST116') {
        return { success: false, error: 'No unredeemed orders found for this email' };
      }
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Error getting unredeemed order:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get order by ID (for backward compatibility and verification)
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

// ============================================
// PRODUCT MANAGEMENT (Supabase-based)
// ============================================

/**
 * Get product by key from Supabase
 */
export async function getProduct(productKey) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productKey)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Product not found
      }
      throw error;
    }

    // Transform to match expected format
    return {
      name: data.name,
      robloxGroupId: data.roblox_group_id,
      description: data.description
    };
  } catch (error) {
    console.error('Error getting product:', error);
    return null;
  }
}

/**
 * Add a new product to Supabase
 */
export async function addProduct(productKey, name, robloxGroupId, description = '') {
  try {
    const { data, error } = await supabase
      .from('products')
      .insert([
        {
          id: productKey,
          name: name,
          roblox_group_id: robloxGroupId,
          description: description
        }
      ]);

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error adding product:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove a product from Supabase
 */
export async function removeProduct(productKey) {
  try {
    const { data, error } = await supabase
      .from('products')
      .delete()
      .eq('id', productKey);

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error removing product:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all products from Supabase
 */
export async function getAllProducts() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Transform to match expected format
    const products = {};
    data.forEach(product => {
      products[product.id] = {
        name: product.name,
        robloxGroupId: product.roblox_group_id,
        description: product.description
      };
    });

    return products;
  } catch (error) {
    console.error('Error getting all products:', error);
    return {};
  }
}

/**
 * Check if product exists
 */
export async function isValidProduct(productKey) {
  const product = await getProduct(productKey);
  return product !== null;
}

export default supabase;
