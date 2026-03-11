const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  SlashCommandBuilder,
  REST,
  Routes,
  Events,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ========== CONFIG ==========
const CONFIG = {
  WELCOME_CHANNEL_ID: process.env.WELCOME_CHANNEL_ID || '1450458984606863535',
  AUTO_ROLE_ID: process.env.AUTO_ROLE_ID || '1471461739026579588',
  TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID || '1481324268775149832',
  TICKET_SUPPORT_ROLE_ID: process.env.TICKET_SUPPORT_ROLE_ID || '1450568426916675710',
  REACTION_ROLE_MESSAGE_ID: process.env.REACTION_ROLE_MESSAGE_ID || '',
  AI_CHANNEL_ID: process.env.AI_CHANNEL_ID || '1481324102953209928',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
};

// Reaction roles map: emoji -> role ID
const REACTION_ROLES = {
  '🔴': process.env.ROLE_RED || 'RED_ROLE_ID',
  '🔵': process.env.ROLE_BLUE || 'BLUE_ROLE_ID',
  '🟢': process.env.ROLE_GREEN || 'GREEN_ROLE_ID',
};

const GUILD_ID = '1450458983402967134';

// ========== IN-MEMORY DATA ==========
const levels = {}; // { userId: { xp, level } }
const tickets = {}; // { userId: channelId }
const cooldowns = {}; // { userId: timestamp }
const aiCooldowns = {}; // { userId: timestamp }

// ========== HELPERS ==========
function getLevel(xp) {
  return Math.floor(0.1 * Math.sqrt(xp));
}

function getXpForLevel(level) {
  return Math.pow(level / 0.1, 2);
}

function addXp(userId, amount) {
  if (!levels[userId]) levels[userId] = { xp: 0, level: 0 };
  levels[userId].xp += amount;
  const newLevel = getLevel(levels[userId].xp);
  if (newLevel > levels[userId].level) {
    levels[userId].level = newLevel;
    return newLevel; // level up!
  }
  return null;
}

// ========== SLASH COMMANDS ==========
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Pong!'),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user')
    .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout a user')
    .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes').setRequired(true)),
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete messages')
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages (max 100)').setRequired(true)),
  new SlashCommandBuilder()
    .setName('level')
    .setDescription('Check your level')
    .addUserOption(o => o.setName('user').setDescription('User to check (optional)')),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show top 10 users by level'),
  new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Στέλνει το permanent ticket panel (Admin only)'),
  new SlashCommandBuilder()
    .setName('reactionroles')
    .setDescription('Send the reaction roles message (Admin only)'),
  new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Ask the AI a question')
    .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),
].map(c => c.toJSON());

// Register slash commands on startup
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
    console.log('✅ Slash commands registered globally');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
});

// ========== AUTO ROLE + WELCOME ==========
client.on(Events.GuildMemberAdd, async member => {
  // Auto role
  const role = member.guild.roles.cache.get(CONFIG.AUTO_ROLE_ID);
  if (role) await member.roles.add(role).catch(console.error);

  // Welcome message
  const channel = member.guild.channels.cache.get(CONFIG.WELCOME_CHANNEL_ID);
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('👋 Welcome!')
      .setDescription(`Welcome ${member} to **${member.guild.name}**!\nYou are member #${member.guild.memberCount}.`)
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();
    channel.send({ embeds: [embed] });
  }
});

// ========== XP SYSTEM ==========
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  // XP cooldown: 1 message per minute gives XP
  const now = Date.now();
  if (cooldowns[message.author.id] && now - cooldowns[message.author.id] < 60000) return;
  cooldowns[message.author.id] = now;

  const xpGain = Math.floor(Math.random() * 10) + 5; // 5–15 XP per message
  const leveledUp = addXp(message.author.id, xpGain);

  if (leveledUp !== null) {
    message.channel.send(`🎉 ${message.author} leveled up to **Level ${leveledUp}**!`);
  }

  // AI Channel — ignore slash commands (start with /)
  if (message.channel.id === CONFIG.AI_CHANNEL_ID && !message.author.bot) {
    if (message.content.startsWith('/')) return;

    const now = Date.now();
    const aiCooldown = 10000; // 10 seconds
    if (aiCooldowns[message.author.id] && now - aiCooldowns[message.author.id] < aiCooldown) {
      const remaining = Math.ceil((aiCooldown - (now - aiCooldowns[message.author.id])) / 1000);
      return message.reply(`⏳ Περίμενε **${remaining}** δευτερόλεπτα πριν ξαναρωτήσεις!`);
    }
    aiCooldowns[message.author.id] = now;
    await handleAI(message, message.content);
  }
});

// ========== REACTION ROLES ==========
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.message.partial) await reaction.message.fetch().catch(() => {});
  if (reaction.message.id !== CONFIG.REACTION_ROLE_MESSAGE_ID) return;

  const roleId = REACTION_ROLES[reaction.emoji.name];
  if (!roleId) return;

  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const role = guild.roles.cache.get(roleId);
  if (role) await member.roles.add(role).catch(console.error);
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.message.partial) await reaction.message.fetch().catch(() => {});
  if (reaction.message.id !== CONFIG.REACTION_ROLE_MESSAGE_ID) return;

  const roleId = REACTION_ROLES[reaction.emoji.name];
  if (!roleId) return;

  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const role = guild.roles.cache.get(roleId);
  if (role) await member.roles.remove(role).catch(console.error);
});

// ========== TICKET SYSTEM ==========
async function openTicket(interaction) {
  const guild = interaction.guild;
  const user = interaction.user;

  if (tickets[user.id]) {
    return interaction.reply({
      content: `❌ Έχεις ήδη ανοιχτό ticket: <#${tickets[user.id]}>`,
      ephemeral: true,
    });
  }

  const channel = await guild.channels.create({
    name: `ticket-${user.username}`,
    type: ChannelType.GuildText,
    parent: CONFIG.TICKET_CATEGORY_ID || null,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      ...(CONFIG.TICKET_SUPPORT_ROLE_ID && CONFIG.TICKET_SUPPORT_ROLE_ID !== 'SUPPORT_ROLE_ID'
        ? [{ id: CONFIG.TICKET_SUPPORT_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }]
        : []),
    ],
  });

  tickets[user.id] = channel.id;

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('🎫 Support Ticket')
    .setDescription(`Γεια ${user}! Το support θα έρθει σύντομα.\n\n> Περίγραψε το πρόβλημά σου και περίμενε.\n\nΠάτα **Κλείσιμο** για να κλείσεις το ticket.`)
    .setFooter({ text: `Ticket για: ${user.tag}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('🔒 Κλείσιμο Ticket')
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: `${user}`, embeds: [embed], components: [row] });
  await interaction.reply({ content: `✅ Ticket δημιουργήθηκε: ${channel}`, ephemeral: true });
}

client.on(Events.InteractionCreate, async interaction => {
  // Button: open ticket από panel
  if (interaction.isButton() && interaction.customId === 'open_ticket') {
    return openTicket(interaction);
  }

  // Button: close ticket
  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    const channel = interaction.channel;
    await interaction.reply({ content: '🔒 Το ticket κλείνει σε 5 δευτερόλεπτα...' });
    const userId = Object.keys(tickets).find(id => tickets[id] === channel.id);
    if (userId) delete tickets[userId];
    setTimeout(() => channel.delete().catch(console.error), 5000);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // ---- PING ----
  if (commandName === 'ping') {
    return interaction.reply(`🏓 Pong! Latency: **${client.ws.ping}ms**`);
  }

  // ---- BAN ----
  if (commandName === 'ban') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await target.ban({ reason }).catch(console.error);
    return interaction.reply(`🔨 **${target.user.tag}** has been banned. Reason: ${reason}`);
  }

  // ---- KICK ----
  if (commandName === 'kick') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await target.kick(reason).catch(console.error);
    return interaction.reply(`👢 **${target.user.tag}** has been kicked. Reason: ${reason}`);
  }

  // ---- MUTE ----
  if (commandName === 'mute') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    const target = interaction.options.getMember('user');
    const minutes = interaction.options.getInteger('minutes');
    await target.timeout(minutes * 60 * 1000).catch(console.error);
    return interaction.reply(`🔇 **${target.user.tag}** muted for ${minutes} minute(s).`);
  }

  // ---- WARN ----
  if (commandName === 'warn') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    try { await target.send(`⚠️ You have been warned in **${interaction.guild.name}**: ${reason}`); } catch {}
    return interaction.reply(`⚠️ **${target.tag}** warned. Reason: ${reason}`);
  }

  // ---- PURGE ----
  if (commandName === 'purge') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    const amount = Math.min(interaction.options.getInteger('amount'), 100);
    await interaction.channel.bulkDelete(amount, true).catch(console.error);
    return interaction.reply({ content: `🗑️ Deleted **${amount}** messages.`, ephemeral: true });
  }

  // ---- LEVEL ----
  if (commandName === 'level') {
    const target = interaction.options.getUser('user') || interaction.user;
    const data = levels[target.id] || { xp: 0, level: 0 };
    const nextLevelXp = getXpForLevel(data.level + 1);
    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle(`📊 Level — ${target.username}`)
      .addFields(
        { name: 'Level', value: `${data.level}`, inline: true },
        { name: 'XP', value: `${data.xp} / ${Math.floor(nextLevelXp)}`, inline: true }
      )
      .setThumbnail(target.displayAvatarURL());
    return interaction.reply({ embeds: [embed] });
  }

  // ---- LEADERBOARD ----
  if (commandName === 'leaderboard') {
    const sorted = Object.entries(levels)
      .sort((a, b) => b[1].xp - a[1].xp)
      .slice(0, 10);

    const desc = sorted.length
      ? sorted.map(([id, d], i) => `**${i + 1}.** <@${id}> — Level ${d.level} (${d.xp} XP)`).join('\n')
      : 'No data yet.';

    const embed = new EmbedBuilder()
      .setColor(0xeb459e)
      .setTitle('🏆 Leaderboard')
      .setDescription(desc);
    return interaction.reply({ embeds: [embed] });
  }

  // ---- TICKET PANEL ----
  if (commandName === 'ticketpanel') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎫 Support Tickets')
      .setDescription('Χρειάζεσαι βοήθεια;\nΠάτα το κουμπί παρακάτω για να ανοίξεις ένα **private ticket** με την ομάδα support.')
      .setFooter({ text: interaction.guild.name })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_ticket')
        .setLabel('📩 Άνοιγμα Ticket')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: '✅ Ticket panel στάλθηκε!', ephemeral: true });
  }

  // ---- REACTION ROLES MESSAGE ----
  if (commandName === 'reactionroles') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎭 Reaction Roles')
      .setDescription(
        Object.entries(REACTION_ROLES)
          .map(([emoji, id]) => `${emoji} → <@&${id}>`)
          .join('\n')
      );

    const msg = await interaction.channel.send({ embeds: [embed] });
    for (const emoji of Object.keys(REACTION_ROLES)) {
      await msg.react(emoji).catch(console.error);
    }
    CONFIG.REACTION_ROLE_MESSAGE_ID = msg.id;
    return interaction.reply({ content: '✅ Reaction roles message sent!', ephemeral: true });
  }

  // ---- AI ----
  if (commandName === 'ai') {
    const question = interaction.options.getString('question');
    await interaction.deferReply();
    const answer = await callClaude(question);
    return interaction.editReply(`🤖 **${question}**\n\n${answer}`);
  }
});

// ========== AI FUNCTION ==========
async function callClaude(prompt) {
  if (!CONFIG.ANTHROPIC_API_KEY) return '❌ No Anthropic API key set.';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || '❌ No response.';
  } catch (err) {
    return `❌ Error: ${err.message}`;
  }
}

async function handleAI(message, content) {
  const answer = await callClaude(content);
  message.reply(`🤖 ${answer}`);
}

// ========== LOGIN ==========
client.login(process.env.TOKEN);
