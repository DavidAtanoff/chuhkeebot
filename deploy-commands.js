import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

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

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands }
    );

    console.log('✅ Successfully registered application commands globally.');
  } catch (error) {
    console.error('❌ Error deploying commands:', error);
  }
})();
