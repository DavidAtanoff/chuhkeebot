import express from 'express';
import crypto from 'crypto';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import dotenv from 'dotenv';
import { storeOrder, getOrder, redeemOrder } from './utils/supabase.js';
import { logPurchase, logWhitelist, logError } from './utils/discord-logger.js';
import { authenticateRoblox, acceptJoinRequest } from './utils/roblox.js';
import { getProduct, isValidProduct, addProduct, removeProduct, getAllProducts } from './config.js';

dotenv.config();

const app = express();
app.use(express.json());

const PAYHIP_API_KEY = process.env.PAYHIP_API_KEY;
const PORT = process.env.PORT || 3000;

// ============================================
// WEBHOOK ENDPOINT
// ============================================

app.post('/webhook', async (req, res) => {
  const payload = req.body;

  console.log('--- New webhook received ---');
  console.log(JSON.stringify(payload, null, 2));

  // Verify signature
  const signature = payload.signature;
  if (!signature) {
    console.log('❌ Missing signature');
    return res.sendStatus(401);
  }

  const expected = crypto
    .createHash('sha256')
    .update(PAYHIP_API_KEY)
    .digest('hex');

  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    console.log('❌ Invalid signature');
    return res.sendStatus(401);
  }

  // Extract data
  const orderId = payload.id;
  const email = payload.email;
  const productKey = payload.items?.[0]?.product_key;

  if (!orderId || !productKey) {
    console.log('❌ Missing order ID or product key');
    return res.sendStatus(400);
  }

  // Get product config
  const product = getProduct(productKey);
  if (!product) {
    console.log(`⚠️ Unknown product key: ${productKey}`);
    // Still store it but with raw product key
    const result = await storeOrder(orderId, email, productKey, `Unknown-${productKey}`);
    if (result.success) {
      console.log('✅ Order stored (unknown product)');
    }
    return res.sendStatus(200);
  }

  // Store in Supabase
  const result = await storeOrder(orderId, email, productKey, product.name);
  
  if (result.success) {
    console.log(`✅ Order stored: ${orderId} - ${product.name}`);
    
    // Log to Discord
    await logPurchase(orderId, email, product.name);
  } else {
    console.log(`❌ Failed to store order: ${result.error}`);
    await logError('Failed to store order', result.error);
  }

  res.sendStatus(200);
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Webhook server is running' });
});

// ============================================
// DISCORD BOT
// ============================================

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', () => {
  console.log(`✅ Discord bot logged in as ${client.user.tag}`);
});

// Admin user IDs - add Discord user IDs who can manage products
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS?.split(',').map(id => id.trim()) || [];

// Check if user is admin
function isAdmin(userId) {
  return ADMIN_USER_IDS.includes(userId);
}

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'whitelist') {
      await handleWhitelistCommand(interaction);
    } else if (interaction.commandName === 'addproduct') {
      await handleAddProductCommand(interaction);
    } else if (interaction.commandName === 'removeproduct') {
      await handleRemoveProductCommand(interaction);
    } else if (interaction.commandName === 'listproducts') {
      await handleListProductsCommand(interaction);
    }
  } else if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
  }
});

async function handleWhitelistCommand(interaction) {
  if (interaction.commandName !== 'whitelist') return;

  await interaction.deferReply({ ephemeral: true });

  const robloxUsername = interaction.options.getString('roblox_username');
  const purchaseId = interaction.options.getString('purchase_id');

  // Query Supabase for the purchase
  const orderResult = await getOrder(purchaseId);

  if (!orderResult.success || !orderResult.data) {
    return interaction.editReply({
      content: '❌ Purchase ID not found. Please check and try again.',
      ephemeral: true
    });
  }

  const order = orderResult.data;

  // Check if already redeemed
  if (order.redeemed) {
    return interaction.editReply({
      content: `❌ This purchase has already been redeemed by <@${order.discord_user_id}> for Roblox user **${order.roblox_username}**.`,
      ephemeral: true
    });
  }

  // Get product info
  const product = getProduct(order.product_key);
  if (!product) {
    return interaction.editReply({
      content: '❌ This product is not configured for whitelisting.',
      ephemeral: true
    });
  }

  // Create confirmation buttons
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm:${purchaseId}:${robloxUsername}`)
        .setLabel('Confirm')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

  await interaction.editReply({
    content: `Are you sure you want to whitelist **${robloxUsername}** for **${product.name}**?\n\n⚠️ This cannot be undone.`,
    components: [row],
    ephemeral: true
  });
}

async function handleAddProductCommand(interaction) {
  // Check if user is admin
  if (!isAdmin(interaction.user.id)) {
    return interaction.reply({
      content: '❌ You do not have permission to use this command.',
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const productKey = interaction.options.getString('product_key');
  const productName = interaction.options.getString('product_name');
  const groupId = interaction.options.getString('group_id');
  const description = interaction.options.getString('description') || `${productName} Whitelist`;

  // Check if product already exists
  if (isValidProduct(productKey)) {
    return interaction.editReply({
      content: `⚠️ Product key **${productKey}** already exists. Use \`/removeproduct\` first if you want to update it.`,
      ephemeral: true
    });
  }

  // Add the product
  const success = addProduct(productKey, productName, groupId, description);

  if (success) {
    await interaction.editReply({
      content: `✅ Product added successfully!\n\n**Product Key:** ${productKey}\n**Name:** ${productName}\n**Group ID:** ${groupId}\n**Description:** ${description}`,
      ephemeral: true
    });
  } else {
    await interaction.editReply({
      content: '❌ Failed to add product. Check server logs for details.',
      ephemeral: true
    });
  }
}

async function handleRemoveProductCommand(interaction) {
  // Check if user is admin
  if (!isAdmin(interaction.user.id)) {
    return interaction.reply({
      content: '❌ You do not have permission to use this command.',
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const productKey = interaction.options.getString('product_key');

  // Check if product exists
  const product = getProduct(productKey);
  if (!product) {
    return interaction.editReply({
      content: `❌ Product key **${productKey}** not found.`,
      ephemeral: true
    });
  }

  // Remove the product
  const success = removeProduct(productKey);

  if (success) {
    await interaction.editReply({
      content: `✅ Product **${product.name}** (Key: ${productKey}) has been removed.`,
      ephemeral: true
    });
  } else {
    await interaction.editReply({
      content: '❌ Failed to remove product. Check server logs for details.',
      ephemeral: true
    });
  }
}

async function handleListProductsCommand(interaction) {
  // Check if user is admin
  if (!isAdmin(interaction.user.id)) {
    return interaction.reply({
      content: '❌ You do not have permission to use this command.',
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const products = getAllProducts();
  const productList = Object.entries(products)
    .map(([key, product]) => {
      return `**${product.name}**\n├ Product Key: \`${key}\`\n├ Group ID: \`${product.robloxGroupId}\`\n└ Description: ${product.description}`;
    })
    .join('\n\n');

  if (productList) {
    await interaction.editReply({
      content: `📦 **Configured Products** (${Object.keys(products).length})\n\n${productList}`,
      ephemeral: true
    });
  } else {
    await interaction.editReply({
      content: '📦 No products configured yet. Use `/addproduct` to add one.',
      ephemeral: true
    });
  }
}

async function handleButtonInteraction(interaction) {
  if (interaction.customId === 'cancel') {
    return interaction.update({
      content: '❌ Whitelist cancelled.',
      components: [],
      ephemeral: true
    });
  }

  if (interaction.customId.startsWith('confirm:')) {
    await interaction.deferUpdate();

    const [, purchaseId, robloxUsername] = interaction.customId.split(':');

    // Get order again to ensure it hasn't been redeemed
    const orderResult = await getOrder(purchaseId);
    if (!orderResult.success || !orderResult.data) {
      return interaction.editReply({
        content: '❌ Purchase not found.',
        components: [],
        ephemeral: true
      });
    }

    const order = orderResult.data;
    if (order.redeemed) {
      return interaction.editReply({
        content: '❌ This purchase has already been redeemed.',
        components: [],
        ephemeral: true
      });
    }

    const product = getProduct(order.product_key);
    if (!product) {
      return interaction.editReply({
        content: '❌ This product is no longer configured for whitelisting.',
        components: [],
        ephemeral: true
      });
    }

    // First, try to accept Roblox join request BEFORE marking as redeemed
    const robloxResult = await acceptJoinRequest(product.robloxGroupId, robloxUsername);

    if (!robloxResult.success) {
      await logError(`Failed to accept ${robloxUsername} to group`, robloxResult.error);
      return interaction.editReply({
        content: `❌ Failed to accept Roblox join request: ${robloxResult.error}\n\nYour purchase has NOT been used. Please ensure:\n1. You sent a join request to the group\n2. Your Roblox username is correct\n3. Try again with \`/whitelist\``,
        components: [],
        ephemeral: true
      });
    }

    // Only mark as redeemed AFTER successful Roblox acceptance
    const redeemResult = await redeemOrder(
      purchaseId,
      interaction.user.id,
      robloxUsername
    );

    if (!redeemResult.success) {
      await logError('Failed to mark order as redeemed', redeemResult.error);
      // This is a critical error - user was accepted but DB didn't update
      return interaction.editReply({
        content: `⚠️ You were accepted into the group, but there was a database error.\n\nPlease contact an admin immediately with purchase ID: **${purchaseId}**\n\nError: ${redeemResult.error}`,
        components: [],
        ephemeral: true
      });
    }

    // Success!
    await logWhitelist(robloxUsername, product.name, purchaseId);

    await interaction.editReply({
      content: `✅ **${robloxUsername}** has been whitelisted and accepted into the **${product.name}** group!`,
      components: [],
      ephemeral: true
    });
  }
}

// ============================================
// STARTUP
// ============================================

async function deployCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('whitelist')
      .setDescription('Redeem your purchase and get whitelisted to the Roblox group')
      .addStringOption(option =>
        option
          .setName('roblox_username')
          .setDescription('Your Roblox username')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('purchase_id')
          .setDescription('Your purchase ID from the confirmation email')
          .setRequired(true)
      ),
    
    new SlashCommandBuilder()
      .setName('addproduct')
      .setDescription('[ADMIN] Add a new product for automatic whitelisting')
      .addStringOption(option =>
        option
          .setName('product_key')
          .setDescription('Payhip product key (e.g., x0Xvy)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('product_name')
          .setDescription('Friendly name for the product (e.g., PremiumPass)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('group_id')
          .setDescription('Roblox group ID to whitelist users to')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('description')
          .setDescription('Optional description for the product')
          .setRequired(false)
      ),
    
    new SlashCommandBuilder()
      .setName('removeproduct')
      .setDescription('[ADMIN] Remove a product from the whitelist system')
      .addStringOption(option =>
        option
          .setName('product_key')
          .setDescription('Payhip product key to remove')
          .setRequired(true)
      ),
    
    new SlashCommandBuilder()
      .setName('listproducts')
      .setDescription('[ADMIN] List all configured products')
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

  try {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const guildId = process.env.DISCORD_GUILD_ID;

    if (!clientId) {
      console.warn('⚠️ DISCORD_CLIENT_ID not set, skipping automatic slash command deployment');
      return;
    }

    if (guildId) {
      console.log(`Started refreshing application (/) commands for guild ${guildId}...`);
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log(`✅ Successfully registered application commands instantly for Guild: ${guildId}`);
    } else {
      console.log('Started refreshing application (/) commands globally...');
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log('✅ Successfully registered application commands globally.');
    }
  } catch (error) {
    console.error('❌ Error deploying commands automatically:', error);
  }
}

async function start() {
  // Deploy slash commands automatically on startup
  if (process.env.DISCORD_BOT_TOKEN) {
    await deployCommands();
  }

  // Authenticate with Roblox
  await authenticateRoblox();

  // Start Express server
  app.listen(PORT, () => {
    console.log(`✅ Webhook server running on port ${PORT}`);
  });

  // Login Discord bot
  if (process.env.DISCORD_BOT_TOKEN) {
    await client.login(process.env.DISCORD_BOT_TOKEN);
  } else {
    console.log('⚠️ DISCORD_BOT_TOKEN not set, Discord bot will not start');
  }
}

start().catch(console.error);
