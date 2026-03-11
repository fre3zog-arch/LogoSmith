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
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ========== CONFIG ==========
const GUILD_ID = '1450458983402967134';

const CONFIG = {
  WELCOME_CHANNEL_ID: process.env.WELCOME_CHANNEL_ID || '1450458984606863535',
  AUTO_ROLE_ID: process.env.AUTO_ROLE_ID || '1471461739026579588',
  TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID || '1481324268775149832',
  TICKET_SUPPORT_ROLE_ID: process.env.TICKET_SUPPORT_ROLE_ID || '1450568426916675710',
  REACTION_ROLE_MESSAGE_ID: process.env.REACTION_ROLE_MESSAGE_ID || '',
  AI_CHANNEL_ID: process.env.AI_CHANNEL_ID || '1481324102953209928',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
};

const REACTION_ROLES = {
  '🔴': process.env.ROLE_RED || '',
  '🔵': process.env.ROLE_BLUE || '',
  '🟢': process.env.ROLE_GREEN || '',
};

// ========== IN-MEMORY DATA ==========
const levels = {};
const tickets = {};
const cooldowns = {};
const aiCooldowns = {};

// ========== HELPERS ==========
function getLevel(xp) { return Math.floor(0.1 * Math.sqrt(xp)); }
function getXpForLevel(level) { return Math.pow(level / 0.1, 2); }

function addXp(userId, amount) {
  if (!levels[userId]) levels[userId] = { xp: 0, level: 0 };
  levels[userId].xp += amount;
  const newLevel = getLevel(levels[userId].xp);
  if (newLevel > levels[userId].level) {
    levels[userId].level = newLevel;
    return newLevel;
  }
  return null;
}

// ========== AI ==========
async function callClaude(prompt) {
  if (!CONFIG.ANTHROPIC_API_KEY) return '❌ No Anthropic API key set. Add `ANTHROPIC_API_KEY` to your Railway Variables.';
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
    if (data.error) return `❌ API Error: ${data.error.message}`;
    return data.content?.[0]?.text || '❌ No response received.';
  } catch (err) {
    return `❌ Error: ${err.message}`;
  }
}

// ========== SLASH COMMANDS ==========
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for ban')),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user')
    .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for kick')),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout a user')
    .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for warn').setRequired(true)),

  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete messages')
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to delete (max 100)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('level')
    .setDescription('Check your or another user\'s level')
    .addUserOption(o => o.setName('user').setDescription('User to check (optional)')),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show top 10 users by XP'),

  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Open a support ticket'),

  new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Send the ticket panel to this channel (Admin only)'),

  new SlashCommandBuilder()
    .setName('reactionroles')
    .setDescription('Send the reaction roles message (Admin only)'),

  new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Ask the AI a question')
    .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),

  new SlashCommandBuilder()
    .setName('dmall')
    .setDescription('Send a DM to all server members (Admin only)')
    .addStringOption(o => o.setName('message').setDescription('The message to send').setRequired(true)),

].map(c => c.toJSON());

// ========== READY ==========
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
    console.log('✅ Guild slash commands registered');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
});

// ========== WELCOME + AUTO ROLE ==========
client.on(Events.GuildMemberAdd, async member => {
  if (CONFIG.AUTO_ROLE_ID) {
    const role = member.guild.roles.cache.get(CONFIG.AUTO_ROLE_ID);
    if (role) await member.roles.add(role).catch(console.error);
  }
  if (CONFIG.WELCOME_CHANNEL_ID) {
    const channel = member.guild.channels.cache.get(CONFIG.WELCOME_CHANNEL_ID);
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('👋 Welcome!')
        .setDescription(`Welcome ${member} to **${member.guild.name}**!\nYou are member **#${member.guild.memberCount}**.`)
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
      channel.send({ embeds: [embed] });
    }
  }
});

// ========== XP + AI CHANNEL ==========
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  // XP — 1 gain per minute cooldown
  const now = Date.now();
  if (!cooldowns[message.author.id] || now - cooldowns[message.author.id] >= 60000) {
    cooldowns[message.author.id] = now;
    const xpGain = Math.floor(Math.random() * 10) + 5;
    const leveledUp = addXp(message.author.id, xpGain);
    if (leveledUp !== null) {
      message.channel.send(`🎉 ${message.author} leveled up to **Level ${leveledUp}**!`);
    }
  }

  // AI Channel — respond to normal messages only (ignore slash commands)
  if (CONFIG.AI_CHANNEL_ID && message.channel.id === CONFIG.AI_CHANNEL_ID) {
    if (message.content.startsWith('/')) return;
    const aiNow = Date.now();
    if (aiCooldowns[message.author.id] && aiNow - aiCooldowns[message.author.id] < 10000) {
      const remaining = Math.ceil((10000 - (aiNow - aiCooldowns[message.author.id])) / 1000);
      return message.reply(`⏳ Please wait **${remaining}** more second(s) before asking again.`);
    }
    aiCooldowns[message.author.id] = aiNow;
    await message.channel.sendTyping().catch(() => {});
    const answer = await callClaude(message.content);
    const chunks = answer.match(/[\s\S]{1,1900}/g) || [answer];
    await message.reply(`🤖 ${chunks[0]}`);
    for (let i = 1; i < chunks.length; i++) await message.channel.send(chunks[i]);
  }
});

// ========== REACTION ROLES ==========
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  if (reaction.message.id !== CONFIG.REACTION_ROLE_MESSAGE_ID) return;
  const roleId = REACTION_ROLES[reaction.emoji.name];
  if (!roleId) return;
  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  const role = reaction.message.guild.roles.cache.get(roleId);
  if (role) await member.roles.add(role).catch(console.error);
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  if (reaction.message.id !== CONFIG.REACTION_ROLE_MESSAGE_ID) return;
  const roleId = REACTION_ROLES[reaction.emoji.name];
  if (!roleId) return;
  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  const role = reaction.message.guild.roles.cache.get(roleId);
  if (role) await member.roles.remove(role).catch(console.error);
});

// ========== TICKET OPEN ==========
async function openTicket(interaction) {
  const guild = interaction.guild;
  const user = interaction.user;

  if (tickets[user.id]) {
    return interaction.reply({
      content: `❌ You already have an open ticket: <#${tickets[user.id]}>`,
      ephemeral: true,
    });
  }

  const permOverwrites = [
    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
  ];

  if (CONFIG.TICKET_SUPPORT_ROLE_ID) {
    permOverwrites.push({
      id: CONFIG.TICKET_SUPPORT_ROLE_ID,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  const channel = await guild.channels.create({
    name: `ticket-${user.username}`,
    type: ChannelType.GuildText,
    parent: CONFIG.TICKET_CATEGORY_ID || null,
    permissionOverwrites: permOverwrites,
  });

  tickets[user.id] = channel.id;

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('🎫 Support Ticket')
    .setDescription(`Hello ${user}! Support will be with you shortly.\n\nPlease describe your issue below.\n\nClick **Close** to close this ticket.`)
    .setFooter({ text: `Ticket opened by ${user.tag}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('🔒 Close Ticket')
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: `${user}`, embeds: [embed], components: [row] });
  await interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
}

// ========== INTERACTIONS ==========
client.on(Events.InteractionCreate, async interaction => {

  // Buttons
  if (interaction.isButton()) {
    if (interaction.customId === 'open_ticket') return openTicket(interaction);
    if (interaction.customId === 'close_ticket') {
      const channel = interaction.channel;
      await interaction.reply({ content: '🔒 Closing ticket in 5 seconds...' });
      const userId = Object.keys(tickets).find(id => tickets[id] === channel.id);
      if (userId) delete tickets[userId];
      setTimeout(() => channel.delete().catch(console.error), 5000);
      return;
    }
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  // PING
  if (commandName === 'ping') {
    return interaction.reply(`🏓 Pong! Latency: **${client.ws.ping}ms**`);
  }

  // BAN
  if (commandName === 'ban') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return interaction.reply({ content: '❌ You do not have permission to ban members.', ephemeral: true });
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await target.ban({ reason }).catch(console.error);
    return interaction.reply(`🔨 **${target.user.tag}** has been banned. Reason: ${reason}`);
  }

  // KICK
  if (commandName === 'kick') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return interaction.reply({ content: '❌ You do not have permission to kick members.', ephemeral: true });
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await target.kick(reason).catch(console.error);
    return interaction.reply(`👢 **${target.user.tag}** has been kicked. Reason: ${reason}`);
  }

  // MUTE
  if (commandName === 'mute') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return interaction.reply({ content: '❌ You do not have permission to timeout members.', ephemeral: true });
    const target = interaction.options.getMember('user');
    const minutes = interaction.options.getInteger('minutes');
    await target.timeout(minutes * 60 * 1000).catch(console.error);
    return interaction.reply(`🔇 **${target.user.tag}** has been muted for ${minutes} minute(s).`);
  }

  // WARN
  if (commandName === 'warn') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return interaction.reply({ content: '❌ You do not have permission to warn members.', ephemeral: true });
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    try { await target.send(`⚠️ You have been warned in **${interaction.guild.name}**: ${reason}`); } catch {}
    return interaction.reply(`⚠️ **${target.tag}** has been warned. Reason: ${reason}`);
  }

  // PURGE
  if (commandName === 'purge') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return interaction.reply({ content: '❌ You do not have permission to manage messages.', ephemeral: true });
    const amount = Math.min(interaction.options.getInteger('amount'), 100);
    await interaction.channel.bulkDelete(amount, true).catch(console.error);
    return interaction.reply({ content: `🗑️ Deleted **${amount}** messages.`, ephemeral: true });
  }

  // LEVEL
  if (commandName === 'level') {
    const target = interaction.options.getUser('user') || interaction.user;
    const data = levels[target.id] || { xp: 0, level: 0 };
    const nextXp = Math.floor(getXpForLevel(data.level + 1));
    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle(`📊 Level — ${target.username}`)
      .addFields(
        { name: 'Level', value: `${data.level}`, inline: true },
        { name: 'XP', value: `${data.xp} / ${nextXp}`, inline: true }
      )
      .setThumbnail(target.displayAvatarURL());
    return interaction.reply({ embeds: [embed] });
  }

  // LEADERBOARD
  if (commandName === 'leaderboard') {
    const sorted = Object.entries(levels).sort((a, b) => b[1].xp - a[1].xp).slice(0, 10);
    const desc = sorted.length
      ? sorted.map(([id, d], i) => `**${i + 1}.** <@${id}> — Level ${d.level} (${d.xp} XP)`).join('\n')
      : 'No data yet. Start chatting to earn XP!';
    const embed = new EmbedBuilder().setColor(0xeb459e).setTitle('🏆 Leaderboard').setDescription(desc);
    return interaction.reply({ embeds: [embed] });
  }

  // TICKET
  if (commandName === 'ticket') {
    return openTicket(interaction);
  }

  // TICKET PANEL
  if (commandName === 'ticketpanel') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ This command is for admins only.', ephemeral: true });
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎫 Support Tickets')
      .setDescription('Need help? Click the button below to open a **private support ticket**.')
      .setFooter({ text: interaction.guild.name })
      .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_ticket').setLabel('📩 Open Ticket').setStyle(ButtonStyle.Primary)
    );
    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: '✅ Ticket panel sent!', ephemeral: true });
  }

  // REACTION ROLES
  if (commandName === 'reactionroles') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ This command is for admins only.', ephemeral: true });
    const validRoles = Object.entries(REACTION_ROLES).filter(([, id]) => id);
    if (!validRoles.length)
      return interaction.reply({ content: '❌ No reaction roles configured. Set ROLE_RED, ROLE_BLUE, ROLE_GREEN in Railway Variables.', ephemeral: true });
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎭 Reaction Roles')
      .setDescription(validRoles.map(([e, id]) => `${e} → <@&${id}>`).join('\n'));
    const msg = await interaction.channel.send({ embeds: [embed] });
    for (const [emoji] of validRoles) await msg.react(emoji).catch(console.error);
    CONFIG.REACTION_ROLE_MESSAGE_ID = msg.id;
    return interaction.reply({ content: '✅ Reaction roles message sent!', ephemeral: true });
  }

  // AI
  if (commandName === 'ai') {
    const question = interaction.options.getString('question');
    await interaction.deferReply();
    const answer = await callClaude(question);
    const reply = `🤖 **${question}**\n\n${answer}`;
    return interaction.editReply(reply.slice(0, 2000));
  }

  // DM ALL
  if (commandName === 'dmall') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ This command is for admins only.', ephemeral: true });

    const msg = interaction.options.getString('message');
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    await guild.members.fetch();

    let success = 0;
    let failed = 0;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📨 Message from ${guild.name}`)
      .setDescription(msg)
      .setThumbnail(guild.iconURL())
      .setTimestamp();

    for (const [, member] of guild.members.cache) {
      if (member.user.bot) continue;
      try {
        await member.send({ embeds: [embed] });
        success++;
        await new Promise(r => setTimeout(r, 500)); // anti rate-limit delay
      } catch {
        failed++;
      }
    }

    return interaction.editReply(
      `✅ DM blast complete!\n📬 Delivered: **${success}**\n❌ Failed: **${failed}** (DMs closed)`
    );
  }
});

// ========== LOGIN ==========
client.login(process.env.TOKEN);
