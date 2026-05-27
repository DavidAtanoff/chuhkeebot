import express from 'express';
import crypto from 'crypto';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import dotenv from 'dotenv';
import { initializeDatabase, storeOrder, getOrder, getUnredeemedOrder, redeemOrder, getProduct, addProduct, removeProduct, getAllProducts, isValidProduct } from './utils/supabase.js';
import { logPurchase, logWhitelist, logError } from './utils/discord-logger.js';
import { authenticateRoblox, acceptJoinRequest } from './utils/roblox.js';

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
  const expected = crypto
    .createHmac('sha256', PAYHIP_API_KEY)
    .update(PAYHIP_API_KEY)
    .digest('hex');

  if (signature !== expected) {
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

  // Get product config from Supabase
  const product = await getProduct(productKey);
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

// Admin user IDs
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS?.split(',').map(id => id.trim()) || [];

function isAdmin(userId) {
  return ADMIN_USER_IDS.includes(userId);
}

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  try {
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
  } catch (error) {
    console.error('❌ Error handling interaction:', error);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `❌ An error occurred: ${error.message}`,
          components: [],
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: `❌ An error occurred: ${error.message}`,
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error('❌ Failed to send error response:', replyError);
    }
  }
});

async function handleWhitelistCommand(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const robloxUsername = interaction.options.getString('roblox_username');
    const email = interaction.options.getString('email');

    console.log(`Whitelist request: ${email} → ${robloxUsername}`);

    const orderResult = await getUnredeemedOrder(email);

    if (!orderResult.success || !orderResult.data) {
      return interaction.editReply({
        content: '❌ No unredeemed purchases found for this email address.',
        ephemeral: true
      });
    }

    const order = orderResult.data;
    console.log(`Found order: ${order.id} for product ${order.product_key}`);

    const product = await getProduct(order.product_key);
    if (!product) {
      return interaction.editReply({
        content: '❌ This product is not configured for whitelisting.',
        ephemeral: true
      });
    }

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm:${order.id}:${robloxUsername}`)
          .setLabel('Confirm')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.editReply({
      content: `Are you sure you want to whitelist **${robloxUsername}** for **${product.name}**?\n\n📧 Email: ${email}\n🎫 Order ID: \`${order.id}\`\n\n⚠️ This will use one of your purchases.`,
      components: [row],
      ephemeral: true
    });
  } catch (error) {
    console.error('Error in handleWhitelistCommand:', error);
    throw error;
  }
}

async function handleAddProductCommand(interaction) {
  try {
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

    const exists = await isValidProduct(productKey);
    if (exists) {
      return interaction.editReply({
        content: `⚠️ Product key **${productKey}** already exists.`,
        ephemeral: true
      });
    }

    const result = await addProduct(productKey, productName, groupId, description);

    if (result.success) {
      await interaction.editReply({
        content: `✅ Product added!\n\n**Key:** ${productKey}\n**Name:** ${productName}\n**Group ID:** ${groupId}`,
        ephemeral: true
      });
    } else {
      await interaction.editReply({
        content: `❌ Failed to add product: ${result.error}`,
        ephemeral: true
      });
    }
  } catch (error) {
    console.error('Error in handleAddProductCommand:', error);
    throw error;
  }
}

async function handleRemoveProductCommand(interaction) {
  try {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({
        content: '❌ You do not have permission to use this command.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const productKey = interaction.options.getString('product_key');

    const product = await getProduct(productKey);
    if (!product) {
      return interaction.editReply({
        content: `❌ Product key **${productKey}** not found.`,
        ephemeral: true
      });
    }

    const result = await removeProduct(productKey);

    if (result.success) {
      await interaction.editReply({
        content: `✅ Product **${product.name}** removed.`,
        ephemeral: true
      });
    } else {
      await interaction.editReply({
        content: `❌ Failed to remove product: ${result.error}`,
        ephemeral: true
      });
    }
  } catch (error) {
    console.error('Error in handleRemoveProductCommand:', error);
    throw error;
  }
}

async function handleListProductsCommand(interaction) {
  try {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({
        content: '❌ You do not have permission to use this command.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const products = await getAllProducts();
    const productList = Object.entries(products)
      .map(([key, product]) => {
        return `**${product.name}**\n├ Key: \`${key}\`\n├ Group: \`${product.robloxGroupId}\`\n└ ${product.description}`;
      })
      .join('\n\n');

    if (productList) {
      await interaction.editReply({
        content: `📦 **Products** (${Object.keys(products).length})\n\n${productList}`,
        ephemeral: true
      });
    } else {
      await interaction.editReply({
        content: '📦 No products configured yet.',
        ephemeral: true
      });
    }
  } catch (error) {
    console.error('Error in handleListProductsCommand:', error);
    throw error;
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
    try {
      await interaction.deferUpdate();

      const [, purchaseId, robloxUsername] = interaction.customId.split(':');

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

      const product = await getProduct(order.product_key);

      const robloxResult = await acceptJoinRequest(product.robloxGroupId, robloxUsername);

      if (!robloxResult.success) {
        await logError(`Failed to accept ${robloxUsername}`, robloxResult.error);
        return interaction.editReply({
          content: `❌ Failed to accept join request: ${robloxResult.error}\n\nYour purchase has NOT been used. Please ensure:\n1. You sent a join request to the group\n2. Your Roblox username is correct`,
          components: [],
          ephemeral: true
        });
      }

      const redeemResult = await redeemOrder(purchaseId, interaction.user.id, robloxUsername);

      if (!redeemResult.success) {
        await logError('Failed to mark order as redeemed', redeemResult.error);
        return interaction.editReply({
          content: `⚠️ You were accepted into the group, but database error occurred.\n\nContact admin with ID: **${purchaseId}**`,
          components: [],
          ephemeral: true
        });
      }

      await logWhitelist(robloxUsername, product.name, purchaseId);

      await interaction.editReply({
        content: `✅ **${robloxUsername}** has been whitelisted for **${product.name}**!`,
        components: [],
        ephemeral: true
      });
    } catch (error) {
      console.error('Error in handleButtonInteraction:', error);
      throw error;
    }
  }
}

// ============================================
// DEPLOY COMMANDS
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
          .setName('email')
          .setDescription('The email you used to purchase')
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
    console.log('🔄 Deploying slash commands...');

    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands }
    );

    console.log('✅ Successfully deployed slash commands');
  } catch (error) {
    console.error('❌ Error deploying commands:', error);
  }
}

// ============================================
// STARTUP
// ============================================

async function start() {
  // Initialize database tables
  await initializeDatabase();
  
  // Authenticate with Roblox
  await authenticateRoblox();

  // Start Express server
  app.listen(PORT, () => {
    console.log(`✅ Webhook server running on port ${PORT}`);
  });

  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CLIENT_ID) {
    // Deploy commands automatically on startup
    await deployCommands();
    
    await client.login(process.env.DISCORD_BOT_TOKEN);
  } else {
    console.log('⚠️ DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID not set');
  }
}

start().catch(console.error);
