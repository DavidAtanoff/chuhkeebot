import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRODUCTS_FILE = path.join(__dirname, 'products.json');

// Load products from file or use defaults (starts empty)
let PRODUCTS = {};

// Load products from file if it exists
export function loadProducts() {
  try {
    if (fs.existsSync(PRODUCTS_FILE)) {
      const data = fs.readFileSync(PRODUCTS_FILE, 'utf8');
      PRODUCTS = JSON.parse(data);
      console.log(`✅ Loaded ${Object.keys(PRODUCTS).length} products from ${PRODUCTS_FILE}`);
    } else {
      // Create default products file
      saveProducts();
      console.log(`✅ Created default products file: ${PRODUCTS_FILE}`);
    }
  } catch (error) {
    console.error('❌ Error loading products:', error);
  }
}

// Save products to file
export function saveProducts() {
  try {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(PRODUCTS, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('❌ Error saving products:', error);
    return false;
  }
}

// Add a new product
export function addProduct(productKey, name, robloxGroupId, description = '') {
  PRODUCTS[productKey] = {
    name,
    robloxGroupId,
    description
  };
  return saveProducts();
}

// Remove a product
export function removeProduct(productKey) {
  if (productKey in PRODUCTS) {
    delete PRODUCTS[productKey];
    return saveProducts();
  }
  return false;
}

// Get all products
export function getAllProducts() {
  return PRODUCTS;
}

// Get product config by key
export function getProduct(productKey) {
  return PRODUCTS[productKey] || null;
}

// Check if product key is valid
export function isValidProduct(productKey) {
  return productKey in PRODUCTS;
}

// Initialize products on module load
loadProducts();
