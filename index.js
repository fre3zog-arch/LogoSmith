const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
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
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ========== CONFIG ==========
const GUILD_ID = '1450458983402967134';

const CONFIG = {
  WELCOME_CHANNEL_ID: process.env.WELCOME_CHANNEL_ID || '1450458984606863535',
  AUTO_ROLE_ID: process.env.AUTO_ROLE_ID || '',
  TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID || '1481324268775149832',
  TICKET_SUPPORT_ROLE_ID: process.env.TICKET_SUPPORT_ROLE_ID || '1450568426916675710',
  REACTION_ROLE_MESSAGE_ID: process.env.REACTION_ROLE_MESSAGE_ID || '',
  AI_CHANNEL_ID: process.env.AI_CHANNEL_ID || '1481324102953209928',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  MOD_LOG_CHANNEL_ID: process.env.MOD_LOG_CHANNEL_ID || '1481343733399289868',
  STATS_CHANNEL_ID: process.env.STATS_CHANNEL_ID || '1481344079437631679',
  MEMBERS_VC_ID: process.env.MEMBERS_VC_ID || '1481399945629139126',
  BOOSTS_VC_ID: process.env.BOOSTS_VC_ID || '1481399867145326623',
  MINIGAMES_CHANNEL_ID: process.env.MINIGAMES_CHANNEL_ID || '1481339938887700660',
  SERVICES_CHANNEL_ID: process.env.SERVICES_CHANNEL_ID || '1481292497886904451',
  SERVICES_REVIEW_CHANNEL_ID: process.env.SERVICES_REVIEW_CHANNEL_ID || '1481399502949843024',
  MIN_ACCOUNT_AGE_DAYS: parseInt(process.env.MIN_ACCOUNT_AGE_DAYS || '7'),
  ANTI_LINK: process.env.ANTI_LINK === 'true',
  ANTI_SPAM: process.env.ANTI_SPAM !== 'true',
  VERIFY_CHANNEL_ID: process.env.VERIFY_CHANNEL_ID || '1481412482164850771',        // channel with verify button
  VERIFY_ROLE_ID: process.env.VERIFY_ROLE_ID || '1471461739026579588',              // role given after verify
  CHALLENGE_CHANNEL_ID: process.env.CHALLENGE_CHANNEL_ID || '1481412176802615438',  // channel for weekly challenges
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
const spamTracker = {};
const warns = {};
const games = {};
const pendingRequests = {}; // { userId: messageId } — tracks pending service requests
let statsMessageId = null;

// Giveaway, Poll, Daily, Word filter, Voice XP
const giveaways = {};      // { channelId_messageId: { prize, endTime, entries, hostId } }
const polls = {};           // { messageId: { question, options, votes: {userId: optionIndex} } }
const dailyCooldowns = {};  // { userId: timestamp }
const voiceJoinTime = {};   // { userId: timestamp } for voice XP
let wordFilter = [];        // array of blocked words
let currentChallenge = null; // { title, description, difficulty, postedAt, messageId }

const GAME_XP = {
  trivia_correct: 25,
  coinflip_win: 10,
  rps_win: 10,
  roll_lucky: 15,
};

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

async function modLog(action, target, moderator, reason, extra = '') {
  if (!CONFIG.MOD_LOG_CHANNEL_ID) return;
  const channel = client.channels.cache.get(CONFIG.MOD_LOG_CHANNEL_ID);
  if (!channel) return;
  const colors = { BAN: 0xed4245, KICK: 0xfee75c, MUTE: 0xeb459e, WARN: 0xff9500, LOCK: 0xff6b6b, UNLOCK: 0x57f287, 'ANTI-SPAM': 0xff6b6b, 'ANTI-LINK': 0xff6b6b, 'ANTI-ALT': 0xff6b6b };
  const embed = new EmbedBuilder()
    .setColor(colors[action] || 0x5865f2)
    .setTitle(`🔨 ${action}`)
    .addFields(
      { name: 'Target', value: `${target.tag || target} (${target.id || target})`, inline: true },
      { name: 'Moderator', value: moderator ? `${moderator.tag}` : 'AutoMod', inline: true },
      { name: 'Reason', value: reason || 'No reason provided' }
    )
    .setTimestamp();
  if (extra) embed.addFields({ name: 'Details', value: extra });
  channel.send({ embeds: [embed] }).catch(() => {});
}

// ========== VOICE CHANNEL STATS ==========
// Updates the two voice channels: "👥 Members: 42" and "🚀 Boosts: 14"
async function updateVoiceStats(guild) {
  if (!guild) return;

  const memberCount = guild.memberCount;
  const boostCount = guild.premiumSubscriptionCount || 0;

  if (CONFIG.MEMBERS_VC_ID) {
    const vc = guild.channels.cache.get(CONFIG.MEMBERS_VC_ID);
    if (vc) await vc.setName(`👥 Members: ${memberCount}`).catch(() => {});
  }

  if (CONFIG.BOOSTS_VC_ID) {
    const vc = guild.channels.cache.get(CONFIG.BOOSTS_VC_ID);
    if (vc) await vc.setName(`🚀 Boosts: ${boostCount}`).catch(() => {});
  }
}

// ========== EMBED STATS ==========
async function buildStatsEmbed(guild) {
  await guild.members.fetch();
  const totalMembers = guild.memberCount;
  const bots = guild.members.cache.filter(m => m.user.bot).size;
  const humans = totalMembers - bots;
  const online = guild.members.cache.filter(m => m.presence?.status === 'online' && !m.user.bot).size;
  const idle = guild.members.cache.filter(m => m.presence?.status === 'idle' && !m.user.bot).size;
  const dnd = guild.members.cache.filter(m => m.presence?.status === 'dnd' && !m.user.bot).size;
  const offline = humans - online - idle - dnd;
  const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
  const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
  const roles = guild.roles.cache.size - 1;
  const boostCount = guild.premiumSubscriptionCount || 0;
  const boostTier = guild.premiumTier;

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📊 ${guild.name} — Live Server Stats`)
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .addFields(
      { name: '👥 Total Members', value: `${totalMembers}`, inline: true },
      { name: '👤 Humans', value: `${humans}`, inline: true },
      { name: '🤖 Bots', value: `${bots}`, inline: true },
      { name: '🟢 Online', value: `${online}`, inline: true },
      { name: '🌙 Idle', value: `${idle}`, inline: true },
      { name: '⛔ DND', value: `${dnd}`, inline: true },
      { name: '⚫ Offline', value: `${offline}`, inline: true },
      { name: '💬 Text Channels', value: `${textChannels}`, inline: true },
      { name: '🔊 Voice Channels', value: `${voiceChannels}`, inline: true },
      { name: '🏷️ Roles', value: `${roles}`, inline: true },
      { name: '🚀 Boosts', value: `${boostCount} (Tier ${boostTier})`, inline: true },
      { name: '📅 Server Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: 'Last updated' })
    .setTimestamp();
}

async function updateStatsMessage() {
  if (!CONFIG.STATS_CHANNEL_ID) return;
  const channel = client.channels.cache.get(CONFIG.STATS_CHANNEL_ID);
  if (!channel) return;
  const guild = channel.guild;
  const embed = await buildStatsEmbed(guild);
  try {
    if (statsMessageId) {
      const msg = await channel.messages.fetch(statsMessageId).catch(() => null);
      if (msg) { await msg.edit({ embeds: [embed] }); return; }
    }
    const messages = await channel.messages.fetch({ limit: 5 });
    const botMsg = messages.find(m => m.author.id === client.user.id);
    if (botMsg) { statsMessageId = botMsg.id; await botMsg.edit({ embeds: [embed] }); }
    else { const sent = await channel.send({ embeds: [embed] }); statsMessageId = sent.id; }
  } catch (err) {
    console.error('❌ Stats update error:', err.message);
  }
}

// ========== AI ==========
async function callGroq(prompt) {
  if (!CONFIG.GROQ_API_KEY) return '❌ No Groq API key set. Add `GROQ_API_KEY` to Railway Variables.\nGet a free key at https://console.groq.com';
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: 'You are a helpful Discord bot assistant. Be concise and friendly. Keep responses under 1800 characters.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    const data = await res.json();
    if (data.error) return `❌ Groq Error: ${data.error.message}`;
    return data.choices?.[0]?.message?.content || '❌ No response received.';
  } catch (err) {
    return `❌ Error: ${err.message}`;
  }
}

// ========== TRIVIA ==========
const triviaQuestions = [
  { q: 'What is the capital of France?', a: 'paris' },
  { q: 'What is 7 × 8?', a: '56' },
  { q: 'What planet is known as the Red Planet?', a: 'mars' },
  { q: 'How many sides does a hexagon have?', a: '6' },
  { q: 'What is the chemical symbol for water?', a: 'h2o' },
  { q: 'What is the largest ocean on Earth?', a: 'pacific' },
  { q: 'Who wrote Romeo and Juliet?', a: 'shakespeare' },
  { q: 'What is the smallest prime number?', a: '2' },
  { q: 'What year did World War II end?', a: '1945' },
  { q: 'What is the powerhouse of the cell?', a: 'mitochondria' },
  { q: 'How many continents are there on Earth?', a: '7' },
  { q: 'What is the largest planet in our solar system?', a: 'jupiter' },
  { q: 'What language has the most native speakers?', a: 'mandarin' },
  { q: 'How many bones are in the human body?', a: '206' },
  { q: 'What is the fastest land animal?', a: 'cheetah' },
];

// ========== AUTO ROLES PANEL ==========
async function buildAutoRolesPanel(guild) {
  const roles = guild.roles.cache
    .filter(r => r.id !== guild.id && !r.managed && r.name !== '@everyone')
    .sort((a, b) => b.position - a.position)
    .first(20);
  if (!roles.length) return null;
  const rows = [];
  for (let i = 0; i < roles.length; i += 4) {
    const row = new ActionRowBuilder();
    for (const role of roles.slice(i, i + 4)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`autorole_${role.id}`)
          .setLabel(role.name.slice(0, 80))
          .setStyle(ButtonStyle.Secondary)
      );
    }
    rows.push(row);
  }
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎭 Self Roles')
    .setDescription('Click any button to **add** or **remove** a role from yourself.')
    .setFooter({ text: `${roles.length} roles available` })
    .setTimestamp();
  return { embeds: [embed], components: rows };
}


// ========== PROGRAMMING LANGUAGE ROLES ==========
// Replace the empty roleId strings with your actual Discord role IDs
const LANGUAGE_ROLES = [
  // Web Frontend
  { id: 'html',        label: 'HTML',           emoji: '🌐', roleId: '', description: 'HyperText Markup Language — the structure of the web', category: 'Web' },
  { id: 'css',         label: 'CSS',             emoji: '🎨', roleId: '', description: 'Cascading Style Sheets — styling & layout of web pages', category: 'Web' },
  { id: 'javascript',  label: 'JavaScript',      emoji: '🟨', roleId: '', description: 'The language of the web — frontend & backend (Node.js)', category: 'Web' },
  { id: 'typescript',  label: 'TypeScript',      emoji: '🔷', roleId: '', description: 'Typed superset of JavaScript for large-scale apps', category: 'Web' },
  { id: 'react',       label: 'React',           emoji: '⚛️',  roleId: '', description: 'JavaScript library for building user interfaces', category: 'Web' },
  { id: 'vue',         label: 'Vue.js',          emoji: '💚', roleId: '', description: 'Progressive JavaScript framework for web UIs', category: 'Web' },
  { id: 'svelte',      label: 'Svelte',          emoji: '🔥', roleId: '', description: 'Compiler-based JavaScript framework with no virtual DOM', category: 'Web' },
  // Backend / General
  { id: 'python',      label: 'Python',          emoji: '🐍', roleId: '', description: 'High-level language great for AI, data science & scripting', category: 'Backend' },
  { id: 'nodejs',      label: 'Node.js',         emoji: '🟩', roleId: '', description: 'JavaScript runtime for server-side applications', category: 'Backend' },
  { id: 'java',        label: 'Java',            emoji: '☕', roleId: '', description: 'Object-oriented language used in enterprise & Android apps', category: 'Backend' },
  { id: 'kotlin',      label: 'Kotlin',          emoji: '🟣', roleId: '', description: 'Modern JVM language — official language for Android dev', category: 'Backend' },
  { id: 'csharp',      label: 'C#',              emoji: '🔵', roleId: '', description: 'Microsoft language used for .NET, games (Unity) & apps', category: 'Backend' },
  { id: 'cpp',         label: 'C++',             emoji: '⚙️',  roleId: '', description: 'Powerful low-level language for system & game development', category: 'Backend' },
  { id: 'c',           label: 'C',               emoji: '🔩', roleId: '', description: 'Foundational language for operating systems & embedded', category: 'Backend' },
  { id: 'go',          label: 'Go',              emoji: '🐹', roleId: '', description: 'Google language built for fast, concurrent backend services', category: 'Backend' },
  { id: 'rust',        label: 'Rust',            emoji: '🦀', roleId: '', description: 'Memory-safe systems language focused on speed & safety', category: 'Backend' },
  { id: 'ruby',        label: 'Ruby',            emoji: '💎', roleId: '', description: 'Elegant scripting language — famous for Ruby on Rails', category: 'Backend' },
  { id: 'php',         label: 'PHP',             emoji: '🐘', roleId: '', description: 'Server-side scripting language powering much of the web', category: 'Backend' },
  { id: 'swift',       label: 'Swift',           emoji: '🍎', roleId: '', description: "Apple's language for iOS, macOS & watchOS development", category: 'Mobile' },
  { id: 'dart',        label: 'Dart / Flutter',  emoji: '🎯', roleId: '', description: "Google's language for cross-platform mobile apps (Flutter)", category: 'Mobile' },
  // Data / AI
  { id: 'sql',         label: 'SQL',             emoji: '🗄️',  roleId: '', description: 'Structured Query Language for databases', category: 'Data' },
  { id: 'r',           label: 'R',               emoji: '📊', roleId: '', description: 'Language for statistical computing and data analysis', category: 'Data' },
  { id: 'matlab',      label: 'MATLAB',          emoji: '📐', roleId: '', description: 'Language for numerical computing and engineering', category: 'Data' },
  // Scripting / Other
  { id: 'bash',        label: 'Bash / Shell',    emoji: '💻', roleId: '', description: 'Shell scripting for automation and system administration', category: 'Scripting' },
  { id: 'powershell',  label: 'PowerShell',      emoji: '🪟', roleId: '', description: 'Windows scripting and automation language by Microsoft', category: 'Scripting' },
  { id: 'lua',         label: 'Lua',             emoji: '🌙', roleId: '', description: 'Lightweight scripting language used in games and embedded', category: 'Scripting' },
  { id: 'haskell',     label: 'Haskell',         emoji: '🔮', roleId: '', description: 'Pure functional programming language', category: 'Other' },
  { id: 'elixir',      label: 'Elixir',          emoji: '💧', roleId: '', description: 'Functional language on the Erlang VM for scalable apps', category: 'Other' },
  { id: 'scala',       label: 'Scala',           emoji: '⭐', roleId: '', description: 'JVM language combining OOP and functional programming', category: 'Other' },
  { id: 'assembly',    label: 'Assembly',        emoji: '🔬', roleId: '', description: 'Low-level language that maps closely to machine code', category: 'Other' },
];

// ========== SLASH COMMANDS ==========
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),

  new SlashCommandBuilder().setName('ban').setDescription('Ban a user')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder().setName('kick').setDescription('Kick a user')
    .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder().setName('mute').setDescription('Timeout a user')
    .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes').setRequired(true)),

  new SlashCommandBuilder().setName('warn').setDescription('Warn a user')
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),

  new SlashCommandBuilder().setName('warnings').setDescription('Check warnings for a user')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true)),

  new SlashCommandBuilder().setName('clearwarnings').setDescription('Clear all warnings for a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),

  new SlashCommandBuilder().setName('purge').setDescription('Bulk delete messages')
    .addIntegerOption(o => o.setName('amount').setDescription('Amount (max 100)').setRequired(true)),

  new SlashCommandBuilder().setName('clear').setDescription('Delete your own messages in this channel')
    .addIntegerOption(o => o.setName('amount').setDescription('Number of your messages to delete (max 50)').setRequired(true)),

  new SlashCommandBuilder().setName('lock').setDescription('Lock the current channel (Admin only)')
    .addStringOption(o => o.setName('reason').setDescription('Reason (optional)')),

  new SlashCommandBuilder().setName('unlock').setDescription('Unlock the current channel (Admin only)')
    .addStringOption(o => o.setName('reason').setDescription('Reason (optional)')),

  new SlashCommandBuilder().setName('say').setDescription('Make the bot say something (Admin only)')
    .addStringOption(o => o.setName('message').setDescription('Message to send').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Channel (default: current)')),

  new SlashCommandBuilder().setName('level').setDescription('Check level')
    .addUserOption(o => o.setName('user').setDescription('User (optional)')),

  new SlashCommandBuilder().setName('leaderboard').setDescription('Top 10 users by XP'),

  new SlashCommandBuilder().setName('ticket').setDescription('Open a support ticket'),
  new SlashCommandBuilder().setName('ticketpanel').setDescription('Send ticket panel (Admin only)'),
  new SlashCommandBuilder().setName('reactionroles').setDescription('Send reaction roles message (Admin only)'),
  new SlashCommandBuilder().setName('autoroles').setDescription('Send auto role panel with all server roles (Admin only)'),
  new SlashCommandBuilder().setName('serverstats').setDescription('Post/refresh live server stats (Admin only)'),

  new SlashCommandBuilder().setName('setupstats').setDescription('Setup voice channel stats counters (Admin only)'),

  new SlashCommandBuilder().setName('ai').setDescription('Ask the AI a question')
    .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),

  new SlashCommandBuilder().setName('dmall').setDescription('DM all members (Admin only)')
    .addStringOption(o => o.setName('message').setDescription('Message to send').setRequired(true)),

  new SlashCommandBuilder().setName('trivia').setDescription('Start a trivia question (+25 XP for correct answer)'),

  new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin (+10 XP on win)')
    .addStringOption(o => o.setName('guess').setDescription('heads or tails').setRequired(true)
      .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })),

  new SlashCommandBuilder().setName('roll').setDescription('Roll a dice (+15 XP for rolling max)')
    .addIntegerOption(o => o.setName('sides').setDescription('Number of sides (default: 6)')),

  new SlashCommandBuilder().setName('rps').setDescription('Rock Paper Scissors (+10 XP on win)')
    .addStringOption(o => o.setName('choice').setDescription('Your choice').setRequired(true)
      .addChoices({ name: '🪨 Rock', value: 'rock' }, { name: '📄 Paper', value: 'paper' }, { name: '✂️ Scissors', value: 'scissors' })),

  new SlashCommandBuilder().setName('8ball').setDescription('Ask the magic 8-ball')
    .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),


  new SlashCommandBuilder().setName('help').setDescription('Show all commands available to you'),

  new SlashCommandBuilder().setName('daily').setDescription('Claim your daily XP reward'),

  new SlashCommandBuilder().setName('giveaway').setDescription('Start a giveaway (Admin only)')
    .addStringOption(o => o.setName('prize').setDescription('What are you giving away?').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes').setRequired(true))
    .addIntegerOption(o => o.setName('winners').setDescription('Number of winners (default: 1)')),

  new SlashCommandBuilder().setName('reroll').setDescription('Reroll a giveaway (Admin only)')
    .addStringOption(o => o.setName('message_id').setDescription('Message ID of the giveaway').setRequired(true)),

  new SlashCommandBuilder().setName('poll').setDescription('Create a poll (Admin only)')
    .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true))
    .addStringOption(o => o.setName('options').setDescription('Options separated by | e.g. Yes|No|Maybe').setRequired(true)),

  new SlashCommandBuilder().setName('wordfilter').setDescription('Manage word filter (Admin only)')
    .addStringOption(o => o.setName('action').setDescription('add / remove / list / clear').setRequired(true)
      .addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' }, { name: 'clear', value: 'clear' }))
    .addStringOption(o => o.setName('word').setDescription('Word to add or remove')),

  new SlashCommandBuilder().setName('verifypanel').setDescription('Send the verification panel (Admin only)'),

  new SlashCommandBuilder().setName('challenge').setDescription('Post a new code challenge (Admin only)')
    .addStringOption(o => o.setName('title').setDescription('Challenge title').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Challenge description / task').setRequired(true))
    .addStringOption(o => o.setName('difficulty').setDescription('Difficulty level').setRequired(true)
      .addChoices(
        { name: '🟢 Easy', value: 'easy' },
        { name: '🟡 Medium', value: 'medium' },
        { name: '🔴 Hard', value: 'hard' },
        { name: '⚫ Expert', value: 'expert' }
      )),

  new SlashCommandBuilder().setName('currentchallenge').setDescription('Show the current active challenge'),

  new SlashCommandBuilder().setName('submit').setDescription('Submit your solution to the current challenge')
    .addStringOption(o => o.setName('solution').setDescription('Your solution / explanation').setRequired(true)),

  new SlashCommandBuilder().setName('langpanel').setDescription('Send programming language role panel (Admin only)'),

  new SlashCommandBuilder().setName('antilink').setDescription('Toggle anti-link protection (Admin only)')
    .addStringOption(o => o.setName('status').setDescription('on or off').setRequired(true)
      .addChoices({ name: 'On', value: 'true' }, { name: 'Off', value: 'false' })),

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
  // Initial stats update
  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    await updateStatsMessage();
    await updateVoiceStats(guild);
  }
  // Auto-refresh every 5 minutes
  setInterval(async () => {
    const g = client.guilds.cache.get(GUILD_ID);
    await updateStatsMessage();
    if (g) await updateVoiceStats(g);
  }, 5 * 60 * 1000);
});

// Refresh on member join/leave
client.on(Events.GuildMemberAdd, async member => {
  await updateVoiceStats(member.guild);
  await updateStatsMessage();
});
client.on(Events.GuildMemberRemove, async member => {
  await updateVoiceStats(member.guild);
  await updateStatsMessage();
});
// Refresh on boost change
client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
  if (oldGuild.premiumSubscriptionCount !== newGuild.premiumSubscriptionCount) {
    await updateVoiceStats(newGuild);
    await updateStatsMessage();
  }
});


// ========== VOICE XP ==========
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const userId = newState.member?.user?.id || oldState.member?.user?.id;
  if (!userId) return;
  const member = newState.member || oldState.member;
  if (member?.user?.bot) return;

  // User joined a voice channel
  if (!oldState.channelId && newState.channelId) {
    voiceJoinTime[userId] = Date.now();
  }

  // User left a voice channel
  if (oldState.channelId && !newState.channelId) {
    if (voiceJoinTime[userId]) {
      const minutes = Math.floor((Date.now() - voiceJoinTime[userId]) / 60000);
      delete voiceJoinTime[userId];
      if (minutes >= 1) {
        const xpGain = Math.min(minutes * 3, 60); // 3 XP per minute, max 60 per session
        const leveledUp = addXp(userId, xpGain);
        if (leveledUp !== null) {
          const guild = oldState.guild;
          const welcomeChannel = guild.channels.cache.get(CONFIG.WELCOME_CHANNEL_ID);
          if (welcomeChannel) welcomeChannel.send(`🎙️ <@${userId}> earned **+${xpGain} XP** from voice and leveled up to **Level ${leveledUp}**!`).catch(() => {});
        }
      }
    }
  }
});

// ========== WELCOME + AUTO ROLE + ANTI-ALT ==========
client.on(Events.GuildMemberAdd, async member => {
  const accountAge = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
  if (accountAge < CONFIG.MIN_ACCOUNT_AGE_DAYS) {
    try { await member.send(`❌ Your account is too new to join **${member.guild.name}**. Accounts must be at least **${CONFIG.MIN_ACCOUNT_AGE_DAYS} days** old.`); } catch {}
    await member.kick(`Anti-Alt: Account age ${Math.floor(accountAge)} days`).catch(console.error);
    await modLog('ANTI-ALT', member.user, null, `Account age: ${Math.floor(accountAge)} days (min: ${CONFIG.MIN_ACCOUNT_AGE_DAYS})`);
    return;
  }
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

// ========== MESSAGE HANDLER ==========
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;

  // ANTI-LINK
  if (CONFIG.ANTI_LINK) {
    const linkRegex = /(https?:\/\/|discord\.gg\/|www\.)/i;
    if (linkRegex.test(message.content) && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(`🔗 ${message.author} Links are not allowed here!`);
      setTimeout(() => warn.delete().catch(() => {}), 5000);
      await modLog('ANTI-LINK', message.author, null, 'Sent a link', message.content.slice(0, 100));
      return;
    }
  }

  // ANTI-SPAM
  if (CONFIG.ANTI_SPAM) {
    const now = Date.now();
    if (!spamTracker[message.author.id]) spamTracker[message.author.id] = { count: 0, lastReset: now };
    const tracker = spamTracker[message.author.id];
    if (now - tracker.lastReset > 5000) { tracker.count = 0; tracker.lastReset = now; }
    tracker.count++;
    if (tracker.count >= 5 && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      tracker.count = 0;
      await message.member.timeout(60000).catch(console.error);
      await message.channel.send(`🤖 ${message.author} has been muted for **1 minute** for spamming.`);
      await modLog('ANTI-SPAM', message.author, null, 'Spamming', '5+ messages in 5 seconds');
    }
  }

  // WORD FILTER
  if (wordFilter.length > 0 && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    const lower = message.content.toLowerCase();
    const matched = wordFilter.find(w => lower.includes(w.toLowerCase()));
    if (matched) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(`🚫 ${message.author} Your message was removed for containing a blocked word.`);
      setTimeout(() => warn.delete().catch(() => {}), 5000);
      await modLog('WORD-FILTER', message.author, null, `Blocked word: "${matched}"`, message.content.slice(0, 100));
      return;
    }
  }

  // TRIVIA ANSWER
  if (games[message.channel.id]) {
    const game = games[message.channel.id];
    if (message.content.toLowerCase().trim() === game.answer) {
      clearTimeout(game.timeout);
      delete games[message.channel.id];
      const leveledUp = addXp(message.author.id, GAME_XP.trivia_correct);
      let reply = `🎉 Correct! You earned **+${GAME_XP.trivia_correct} XP**!`;
      if (leveledUp !== null) reply += ` 🆙 Level up! You are now **Level ${leveledUp}**!`;
      return message.reply(reply);
    }
  }

  // XP from chatting
  const now = Date.now();
  if (!cooldowns[message.author.id] || now - cooldowns[message.author.id] >= 60000) {
    cooldowns[message.author.id] = now;
    const xpGain = Math.floor(Math.random() * 10) + 5;
    const leveledUp = addXp(message.author.id, xpGain);
    if (leveledUp !== null) message.channel.send(`🎉 ${message.author} leveled up to **Level ${leveledUp}**!`);
  }

  // AI CHANNEL
  if (CONFIG.AI_CHANNEL_ID && message.channel.id === CONFIG.AI_CHANNEL_ID) {
    if (message.content.startsWith('/')) return;
    const aiNow = Date.now();
    if (aiCooldowns[message.author.id] && aiNow - aiCooldowns[message.author.id] < 10000) {
      const remaining = Math.ceil((10000 - (aiNow - aiCooldowns[message.author.id])) / 1000);
      return message.reply(`⏳ Please wait **${remaining}** more second(s).`);
    }
    aiCooldowns[message.author.id] = aiNow;
    await message.channel.sendTyping().catch(() => {});
    const answer = await callGroq(message.content);
    const chunks = answer.match(/[\s\S]{1,1900}/g) || [answer];
    await message.reply(`🤖 ${chunks[0]}`);
    for (let i = 1; i < chunks.length; i++) await message.channel.send(chunks[i]);
  }

  // SERVICES CHANNEL — user sends a request, forwarded to review channel
  if (CONFIG.SERVICES_CHANNEL_ID && message.channel.id === CONFIG.SERVICES_CHANNEL_ID) {
    if (message.content.startsWith('/')) return;

    // Block if user already has a pending request
    if (pendingRequests[message.author.id]) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(`❌ ${message.author} You already have a **pending request**. Wait for an admin to review it before submitting a new one.`);
      setTimeout(() => warn.delete().catch(() => {}), 7000);
      return;
    }

    await message.delete().catch(() => {});

    const reviewChannel = CONFIG.SERVICES_REVIEW_CHANNEL_ID
      ? message.guild.channels.cache.get(CONFIG.SERVICES_REVIEW_CHANNEL_ID)
      : message.channel;

    if (!reviewChannel) return;

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle('📋 New Service Request')
      .setDescription(message.content)
      .addFields(
        { name: '👤 From', value: `${message.author} (${message.author.tag})`, inline: true },
        { name: '📅 Submitted', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
      )
      .setThumbnail(message.author.displayAvatarURL())
      .setFooter({ text: `User ID: ${message.author.id}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`service_accept_${message.author.id}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`service_reject_${message.author.id}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger),
    );

    const reviewMsg = await reviewChannel.send({ embeds: [embed], components: [row] });
    pendingRequests[message.author.id] = { msgId: reviewMsg.id, content: message.content };

    const notify = await message.channel.send(`📬 ${message.author} Your request has been submitted! An admin will review it shortly.`);
    setTimeout(() => notify.delete().catch(() => {}), 8000);
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

// ========== TICKET ==========
async function openTicket(interaction) {
  const guild = interaction.guild;
  const user = interaction.user;
  if (tickets[user.id]) return interaction.reply({ content: `❌ You already have an open ticket: <#${tickets[user.id]}>`, ephemeral: true });
  const permOverwrites = [
    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
  ];
  if (CONFIG.TICKET_SUPPORT_ROLE_ID) {
    permOverwrites.push({ id: CONFIG.TICKET_SUPPORT_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] });
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
    .setDescription(`Hello ${user}! Support will be with you shortly.\n\nPlease describe your issue below.\n\nClick **Close Ticket** to close this ticket.`)
    .setFooter({ text: `Ticket opened by ${user.tag}` })
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger)
  );
  await channel.send({ content: `${user}`, embeds: [embed], components: [row] });
  await interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
}

// ========== INTERACTIONS ==========
client.on(Events.InteractionCreate, async interaction => {

  // SELECT MENUS
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('lang_select_')) {
      await interaction.deferReply({ ephemeral: true });
      const selectedIds = interaction.values;
      const category = interaction.customId.replace('lang_select_', '');

      const added = [];
      const removed = [];
      const noRole = [];

      for (const langId of selectedIds) {
        const lang = LANGUAGE_ROLES.find(l => l.id === langId);
        if (!lang) continue;
        if (!lang.roleId) { noRole.push(lang.label); continue; }
        const role = interaction.guild.roles.cache.get(lang.roleId);
        if (!role) { noRole.push(lang.label); continue; }
        if (interaction.member.roles.cache.has(lang.roleId)) {
          await interaction.member.roles.remove(role).catch(() => {});
          removed.push(`${lang.emoji} ${lang.label}`);
        } else {
          await interaction.member.roles.add(role).catch(() => {});
          added.push(`${lang.emoji} ${lang.label}`);
        }
      }

      if (selectedIds.length === 0)
        return interaction.editReply('ℹ️ No languages selected. Your roles were not changed.');

      const lines = [];
      if (added.length) lines.push(`✅ **Added:** ${added.join(', ')}`);
      if (removed.length) lines.push(`🗑️ **Removed:** ${removed.join(', ')}`);
      if (noRole.length) lines.push(`⚠️ **Not configured yet:** ${noRole.join(', ')}`);
      return interaction.editReply(lines.join('\n') || 'No changes made.');
    }
  }

  // BUTTONS
  if (interaction.isButton()) {
    if (interaction.customId === 'verify_member') {
      const roleId = CONFIG.VERIFY_ROLE_ID;
      if (!roleId) return interaction.reply({ content: '❌ Verify role not configured. Ask an admin to set `VERIFY_ROLE_ID`.', ephemeral: true });
      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) return interaction.reply({ content: '❌ Verify role not found.', ephemeral: true });
      if (interaction.member.roles.cache.has(roleId))
        return interaction.reply({ content: '✅ You are already verified!', ephemeral: true });
      await interaction.member.roles.add(role).catch(console.error);
      return interaction.reply({ content: '✅ You have been **verified**! Welcome to the server 🎉', ephemeral: true });
    }

    if (interaction.customId === 'open_ticket') return openTicket(interaction);
    if (interaction.customId === 'close_ticket') {
      const channel = interaction.channel;
      await interaction.reply({ content: '🔒 Closing ticket in 5 seconds...' });
      const userId = Object.keys(tickets).find(id => tickets[id] === channel.id);
      if (userId) delete tickets[userId];
      setTimeout(() => channel.delete().catch(console.error), 5000);
      return;
    }
    if (interaction.customId.startsWith('service_accept_') || interaction.customId.startsWith('service_reject_')) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
        return interaction.reply({ content: '❌ Only admins can accept or reject requests.', ephemeral: true });

      const isAccept = interaction.customId.startsWith('service_accept_');
      const targetUserId = interaction.customId.replace('service_accept_', '').replace('service_reject_', '');
      const targetUser = await client.users.fetch(targetUserId).catch(() => null);

      // Remove buttons from the review message
      await interaction.message.edit({ components: [] }).catch(() => {});

      // Update embed color
      const oldEmbed = interaction.message.embeds[0];
      const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .setColor(isAccept ? 0x57f287 : 0xed4245)
        .addFields({ name: isAccept ? '✅ Accepted by' : '❌ Rejected by', value: `${interaction.user.tag}`, inline: true });
      await interaction.message.edit({ embeds: [updatedEmbed] }).catch(() => {});

      // If accepted, send the request content to the services channel
      if (isAccept && CONFIG.SERVICES_CHANNEL_ID) {
        const servicesChannel = interaction.guild.channels.cache.get(CONFIG.SERVICES_CHANNEL_ID);
        if (servicesChannel) {
          const requestContent = pendingRequests[targetUserId]?.content || '*(content unavailable)*';
          const announceEmbed = new EmbedBuilder()
            .setColor(0xffffff)
            .setAuthor({ name: targetUser ? targetUser.tag : targetUserId, iconURL: targetUser ? targetUser.displayAvatarURL() : undefined })
            .setDescription(requestContent)
            .setTimestamp();
          await servicesChannel.send({ embeds: [announceEmbed] }).catch(() => {});
        }
      }

      // Clear pending request
      delete pendingRequests[targetUserId];

      // Notify the user via DM
      if (targetUser) {
        const dmEmbed = new EmbedBuilder()
          .setColor(isAccept ? 0x57f287 : 0xed4245)
          .setTitle(isAccept ? '✅ Service Request Accepted' : '❌ Service Request Rejected')
          .setDescription(isAccept
            ? `Your service request in **${interaction.guild.name}** has been **accepted**! An admin will reach out to you shortly.`
            : `Your service request in **${interaction.guild.name}** has been **rejected**. Feel free to submit a new one.`)
          .setTimestamp();
        await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
      }

      return interaction.reply({ content: `${isAccept ? '✅ Accepted' : '❌ Rejected'} the request from <@${targetUserId}>.`, ephemeral: true });
    }
    if (interaction.customId.startsWith('lang_select_')) {
      await interaction.deferReply({ ephemeral: true });
      const selectedIds = interaction.values; // array of selected lang ids
      const category = interaction.customId.replace('lang_select_', '');
      const allCategoryLangs = LANGUAGE_ROLES.filter(l => l.category === category);

      const added = [];
      const removed = [];
      const noRole = [];

      for (const langId of selectedIds) {
        const lang = LANGUAGE_ROLES.find(l => l.id === langId);
        if (!lang) continue;
        if (!lang.roleId) { noRole.push(lang.label); continue; }
        const role = interaction.guild.roles.cache.get(lang.roleId);
        if (!role) { noRole.push(lang.label); continue; }
        if (interaction.member.roles.cache.has(lang.roleId)) {
          await interaction.member.roles.remove(role).catch(() => {});
          removed.push(`${lang.emoji} ${lang.label}`);
        } else {
          await interaction.member.roles.add(role).catch(() => {});
          added.push(`${lang.emoji} ${lang.label}`);
        }
      }

      // If nothing selected (user cleared the menu), do nothing
      if (selectedIds.length === 0) {
        return interaction.editReply('ℹ️ No languages selected. Your roles were not changed.');
      }

      const lines = [];
      if (added.length) lines.push(`✅ **Added:** ${added.join(', ')}`);
      if (removed.length) lines.push(`🗑️ **Removed:** ${removed.join(', ')}`);
      if (noRole.length) lines.push(`⚠️ **Not configured yet:** ${noRole.join(', ')}`);

      return interaction.editReply(lines.join('\n') || 'No changes made.');
    }

    if (interaction.customId.startsWith('autorole_')) {
      const roleId = interaction.customId.replace('autorole_', '');
      const member = interaction.member;
      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) return interaction.reply({ content: '❌ Role not found.', ephemeral: true });
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(role).catch(console.error);
        return interaction.reply({ content: `✅ Removed **${role.name}**.`, ephemeral: true });
      } else {
        await member.roles.add(role).catch(console.error);
        return interaction.reply({ content: `✅ Added **${role.name}**.`, ephemeral: true });
      }
    }
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  // PING
  if (commandName === 'ping') return interaction.reply(`🏓 Pong! Latency: **${client.ws.ping}ms**`);

  // BAN
  if (commandName === 'ban') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
    if (target.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ You cannot ban an admin.', ephemeral: true });
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await target.ban({ reason }).catch(console.error);
    await modLog('BAN', target.user, interaction.user, reason);
    return interaction.reply(`🔨 **${target.user.tag}** has been banned. Reason: ${reason}`);
  }

  // KICK
  if (commandName === 'kick') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
    if (target.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ You cannot kick an admin.', ephemeral: true });
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await target.kick(reason).catch(console.error);
    await modLog('KICK', target.user, interaction.user, reason);
    return interaction.reply(`👢 **${target.user.tag}** has been kicked. Reason: ${reason}`);
  }

  // MUTE
  if (commandName === 'mute') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    const target = interaction.options.getMember('user');
    if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
    if (target.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ You cannot mute an admin.', ephemeral: true });
    const minutes = interaction.options.getInteger('minutes');
    await target.timeout(minutes * 60 * 1000).catch(console.error);
    await modLog('MUTE', target.user, interaction.user, `${minutes} minutes`);
    return interaction.reply(`🔇 **${target.user.tag}** muted for ${minutes} minute(s).`);
  }

  // WARN
  if (commandName === 'warn') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    if (!warns[target.id]) warns[target.id] = [];
    warns[target.id].push({ reason, time: new Date().toISOString() });
    try { await target.send(`⚠️ You have been warned in **${interaction.guild.name}**: ${reason}`); } catch {}
    await modLog('WARN', target, interaction.user, reason, `Total warnings: ${warns[target.id].length}`);
    return interaction.reply(`⚠️ **${target.tag}** warned. (Total: ${warns[target.id].length}) Reason: ${reason}`);
  }

  // WARNINGS
  if (commandName === 'warnings') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    const target = interaction.options.getUser('user');
    const userWarns = warns[target.id] || [];
    const embed = new EmbedBuilder().setColor(0xff9500).setTitle(`⚠️ Warnings — ${target.tag}`)
      .setDescription(userWarns.length
        ? userWarns.map((w, i) => `**${i + 1}.** ${w.reason} — <t:${Math.floor(new Date(w.time).getTime() / 1000)}:R>`).join('\n')
        : 'No warnings.');
    return interaction.reply({ embeds: [embed] });
  }

  // CLEARWARNINGS
  if (commandName === 'clearwarnings') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    const target = interaction.options.getUser('user');
    warns[target.id] = [];
    return interaction.reply(`✅ Cleared all warnings for **${target.tag}**.`);
  }

  // PURGE (mods - any messages)
  if (commandName === 'purge') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return interaction.reply({ content: '❌ No permission.', ephemeral: true });
    const amount = Math.min(interaction.options.getInteger('amount'), 100);
    await interaction.channel.bulkDelete(amount, true).catch(console.error);
    return interaction.reply({ content: `🗑️ Deleted **${amount}** messages.`, ephemeral: true });
  }

  // CLEAR (users - own messages only, not admins)
  if (commandName === 'clear') {
    if (interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admins cannot use `/clear`. Use `/purge` instead.', ephemeral: true });
    const amount = Math.min(interaction.options.getInteger('amount'), 50);
    await interaction.deferReply({ ephemeral: true });

    // Fetch recent messages and filter by author
    const messages = await interaction.channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) return interaction.editReply('❌ Could not fetch messages.');

    const userMessages = messages
      .filter(m => m.author.id === interaction.user.id)
      .first(amount);

    let deleted = 0;
    for (const msg of userMessages) {
      await msg.delete().catch(() => {});
      deleted++;
      await new Promise(r => setTimeout(r, 300)); // small delay to avoid rate limit
    }

    return interaction.editReply(`✅ Deleted **${deleted}** of your messages.`);
  }

  // LOCK
  if (commandName === 'lock') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false }).catch(console.error);
    const embed = new EmbedBuilder().setColor(0xed4245).setTitle('🔒 Channel Locked')
      .setDescription(`This channel has been locked by ${interaction.user}.\n**Reason:** ${reason}`).setTimestamp();
    await interaction.channel.send({ embeds: [embed] });
    await modLog('LOCK', { tag: `#${interaction.channel.name}`, id: interaction.channel.id }, interaction.user, reason);
    return interaction.reply({ content: '✅ Channel locked.', ephemeral: true });
  }

  // UNLOCK
  if (commandName === 'unlock') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: null }).catch(console.error);
    const embed = new EmbedBuilder().setColor(0x57f287).setTitle('🔓 Channel Unlocked')
      .setDescription(`This channel has been unlocked by ${interaction.user}.\n**Reason:** ${reason}`).setTimestamp();
    await interaction.channel.send({ embeds: [embed] });
    await modLog('UNLOCK', { tag: `#${interaction.channel.name}`, id: interaction.channel.id }, interaction.user, reason);
    return interaction.reply({ content: '✅ Channel unlocked.', ephemeral: true });
  }

  // SAY
  if (commandName === 'say') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    const message = interaction.options.getString('message');
    const target = interaction.options.getChannel('channel') || interaction.channel;
    await target.send(message).catch(console.error);
    return interaction.reply({ content: `✅ Message sent in ${target}.`, ephemeral: true });
  }

  // LEVEL
  if (commandName === 'level') {
    const target = interaction.options.getUser('user') || interaction.user;
    const data = levels[target.id] || { xp: 0, level: 0 };
    const nextXp = Math.floor(getXpForLevel(data.level + 1));
    const embed = new EmbedBuilder().setColor(0xfee75c).setTitle(`📊 Level — ${target.username}`)
      .addFields(
        { name: 'Level', value: `${data.level}`, inline: true },
        { name: 'XP', value: `${data.xp} / ${nextXp}`, inline: true }
      ).setThumbnail(target.displayAvatarURL());
    return interaction.reply({ embeds: [embed] });
  }

  // LEADERBOARD
  if (commandName === 'leaderboard') {
    const sorted = Object.entries(levels).sort((a, b) => b[1].xp - a[1].xp).slice(0, 10);
    const desc = sorted.length
      ? sorted.map(([id, d], i) => `**${i + 1}.** <@${id}> — Level ${d.level} (${d.xp} XP)`).join('\n')
      : 'No data yet. Start chatting to earn XP!';
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xeb459e).setTitle('🏆 Leaderboard').setDescription(desc)] });
  }

  // TICKET
  if (commandName === 'ticket') return openTicket(interaction);

  // TICKET PANEL
  if (commandName === 'ticketpanel') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🎫 Support Tickets')
      .setDescription('Need help? Click the button below to open a **private support ticket**.')
      .setFooter({ text: interaction.guild.name }).setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_ticket').setLabel('📩 Open Ticket').setStyle(ButtonStyle.Primary)
    );
    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: '✅ Ticket panel sent!', ephemeral: true });
  }

  // REACTION ROLES
  if (commandName === 'reactionroles') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    const validRoles = Object.entries(REACTION_ROLES).filter(([, id]) => id);
    if (!validRoles.length)
      return interaction.reply({ content: '❌ No reaction roles configured. Set ROLE_RED, ROLE_BLUE, ROLE_GREEN in Railway Variables.', ephemeral: true });
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🎭 Reaction Roles')
      .setDescription(validRoles.map(([e, id]) => `${e} → <@&${id}>`).join('\n'));
    const msg = await interaction.channel.send({ embeds: [embed] });
    for (const [emoji] of validRoles) await msg.react(emoji).catch(console.error);
    CONFIG.REACTION_ROLE_MESSAGE_ID = msg.id;
    return interaction.reply({ content: '✅ Reaction roles sent!', ephemeral: true });
  }

  // AUTO ROLES
  if (commandName === 'autoroles') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    await interaction.guild.roles.fetch();
    const panel = await buildAutoRolesPanel(interaction.guild);
    if (!panel) return interaction.reply({ content: '❌ No assignable roles found.', ephemeral: true });
    await interaction.channel.send(panel);
    const count = interaction.guild.roles.cache.filter(r => r.id !== interaction.guild.id && !r.managed).size;
    return interaction.reply({ content: `✅ Auto roles panel sent with **${count}** roles!`, ephemeral: true });
  }

  // SERVER STATS (embed)
  if (commandName === 'serverstats') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    if (!CONFIG.STATS_CHANNEL_ID)
      return interaction.reply({ content: '❌ Set `STATS_CHANNEL_ID` in Railway Variables first.', ephemeral: true });
    await updateStatsMessage();
    return interaction.reply({ content: `✅ Stats posted/updated in <#${CONFIG.STATS_CHANNEL_ID}>! Auto-refreshes every 5 minutes.`, ephemeral: true });
  }

  // SETUP STATS VOICE CHANNELS
  if (commandName === 'setupstats') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    const boostCount = guild.premiumSubscriptionCount || 0;

    // Create a category for the stats channels
    const category = await guild.channels.create({
      name: '📊 Server Stats',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.Connect] }, // no one can join
      ],
    });

    const membersVC = await guild.channels.create({
      name: `👥 Members: ${guild.memberCount}`,
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.Connect] },
      ],
    });

    const boostsVC = await guild.channels.create({
      name: `🚀 Boosts: ${boostCount}`,
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.Connect] },
      ],
    });

    // Save IDs in config
    CONFIG.MEMBERS_VC_ID = membersVC.id;
    CONFIG.BOOSTS_VC_ID = boostsVC.id;

    return interaction.editReply(
      `✅ Stats voice channels created!\n\n` +
      `👥 **Members:** ${membersVC}\n` +
      `🚀 **Boosts:** ${boostsVC}\n\n` +
      `⚠️ To make them **permanent** across restarts, add these to Railway Variables:\n` +
      `\`MEMBERS_VC_ID = ${membersVC.id}\`\n` +
      `\`BOOSTS_VC_ID = ${boostsVC.id}\``
    );
  }

  // AI
  if (commandName === 'ai') {
    const question = interaction.options.getString('question');
    await interaction.deferReply();
    const answer = await callGroq(question);
    return interaction.editReply(`🤖 **${question}**\n\n${answer}`.slice(0, 2000));
  }

  // DM ALL
  if (commandName === 'dmall') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    const msg = interaction.options.getString('message');
    await interaction.deferReply({ ephemeral: true });
    await interaction.guild.members.fetch();
    let success = 0, failed = 0;
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(`📨 Message from ${interaction.guild.name}`)
      .setDescription(msg).setThumbnail(interaction.guild.iconURL()).setTimestamp();
    for (const [, member] of interaction.guild.members.cache) {
      if (member.user.bot) continue;
      try { await member.send({ embeds: [embed] }); success++; await new Promise(r => setTimeout(r, 500)); }
      catch { failed++; }
    }
    return interaction.editReply(`✅ DM blast complete!\n📬 Delivered: **${success}**\n❌ Failed: **${failed}** (DMs closed)`);
  }

  // TRIVIA
  // Helper: check if minigames are restricted to a specific channel
  const minigameCommands = ['trivia', 'coinflip', 'roll', 'rps', '8ball'];
  if (minigameCommands.includes(commandName) && CONFIG.MINIGAMES_CHANNEL_ID && interaction.channel.id !== CONFIG.MINIGAMES_CHANNEL_ID) {
    return interaction.reply({ content: `🎮 Mini games can only be played in <#${CONFIG.MINIGAMES_CHANNEL_ID}>!`, ephemeral: true });
  }

  // TRIVIA
  if (commandName === 'trivia') {
    if (games[interaction.channel.id]) return interaction.reply({ content: '❌ A trivia game is already running!', ephemeral: true });
    const q = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🎮 Trivia!')
      .setDescription(`**${q.q}**\n\nType your answer in chat! You have **30 seconds**.\n\n🏆 Reward: **+${GAME_XP.trivia_correct} XP**`);
    await interaction.reply({ embeds: [embed] });
    const timeout = setTimeout(() => {
      if (games[interaction.channel.id]) {
        delete games[interaction.channel.id];
        interaction.channel.send(`⏰ Time's up! The answer was **${q.a}**.`);
      }
    }, 30000);
    games[interaction.channel.id] = { answer: q.a.toLowerCase(), timeout };
  }

  // COINFLIP
  if (commandName === 'coinflip') {
    const guess = interaction.options.getString('guess');
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = guess === result;
    let reply = `🪙 The coin landed on **${result}**! You ${won ? `**won** 🎉 +**${GAME_XP.coinflip_win} XP**` : '**lost** 😔'}!`;
    if (won) {
      const leveledUp = addXp(interaction.user.id, GAME_XP.coinflip_win);
      if (leveledUp !== null) reply += ` 🆙 Level up! **Level ${leveledUp}**!`;
    }
    return interaction.reply(reply);
  }

  // ROLL
  if (commandName === 'roll') {
    const sides = interaction.options.getInteger('sides') || 6;
    if (sides < 2) return interaction.reply({ content: '❌ Must have at least 2 sides.', ephemeral: true });
    const result = Math.floor(Math.random() * sides) + 1;
    const isMax = result === sides;
    let reply = `🎲 You rolled a **${result}** (d${sides})!`;
    if (isMax) {
      const leveledUp = addXp(interaction.user.id, GAME_XP.roll_lucky);
      reply += ` 🎯 Lucky roll! **+${GAME_XP.roll_lucky} XP**!`;
      if (leveledUp !== null) reply += ` 🆙 Level up! **Level ${leveledUp}**!`;
    }
    return interaction.reply(reply);
  }

  // RPS
  if (commandName === 'rps') {
    const choices = ['rock', 'paper', 'scissors'];
    const emojis = { rock: '🪨', paper: '📄', scissors: '✂️' };
    const player = interaction.options.getString('choice');
    const bot = choices[Math.floor(Math.random() * 3)];
    let outcome;
    if (player === bot) outcome = 'tie';
    else if ((player === 'rock' && bot === 'scissors') || (player === 'paper' && bot === 'rock') || (player === 'scissors' && bot === 'paper')) outcome = 'win';
    else outcome = 'lose';
    let reply = `${emojis[player]} vs ${emojis[bot]} — `;
    if (outcome === 'win') {
      const leveledUp = addXp(interaction.user.id, GAME_XP.rps_win);
      reply += `You **win**! 🎉 **+${GAME_XP.rps_win} XP**!`;
      if (leveledUp !== null) reply += ` 🆙 Level up! **Level ${leveledUp}**!`;
    } else if (outcome === 'lose') {
      reply += 'You **lose**! 😔';
    } else {
      reply += "It's a **tie**! 🤝";
    }
    return interaction.reply(reply);
  }

  // 8BALL
  if (commandName === '8ball') {
    const responses = ['It is certain.', 'Without a doubt.', 'Yes, definitely.', 'You may rely on it.', 'As I see it, yes.', 'Most likely.', 'Outlook good.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.', "Don't count on it.", 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.'];
    const embed = new EmbedBuilder().setColor(0x2f3136).setTitle('🎱 Magic 8-Ball')
      .addFields({ name: 'Question', value: interaction.options.getString('question') }, { name: 'Answer', value: responses[Math.floor(Math.random() * responses.length)] });
    return interaction.reply({ embeds: [embed] });
  }


  // HELP
  if (commandName === 'help') {
    const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const isMod = interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📖 Available Commands')
      .setFooter({ text: 'Showing commands available to you' })
      .setTimestamp();

    embed.addFields({ name: '🟢 General', value: '`/ping` `/level` `/leaderboard` `/ticket` `/ai` `/clear` `/daily` `/help`' });
    embed.addFields({ name: `🎮 Mini Games (only in <#${CONFIG.MINIGAMES_CHANNEL_ID || 'minigames'}>)`, value: '`/trivia` `/coinflip` `/roll` `/rps` `/8ball`' });

    if (isMod || isAdmin) {
      embed.addFields({ name: '🟡 Moderation', value: '`/warn` `/warnings` `/clearwarnings` `/mute` `/kick` `/ban` `/purge`' });
    }
    if (isAdmin) {
      embed.addFields({ name: '🔴 Admin', value: '`/lock` `/unlock` `/say` `/ticketpanel` `/reactionroles` `/autoroles` `/serverstats` `/setupstats` `/dmall` `/antilink` `/wordfilter` `/giveaway` `/reroll` `/poll`' });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // DAILY
  if (commandName === 'daily') {
    const now = Date.now();
    const last = dailyCooldowns[interaction.user.id] || 0;
    const cooldown = 24 * 60 * 60 * 1000;
    if (now - last < cooldown) {
      const remaining = cooldown - (now - last);
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      return interaction.reply({ content: `⏳ You already claimed your daily reward! Come back in **${hours}h ${minutes}m**.`, ephemeral: true });
    }
    dailyCooldowns[interaction.user.id] = now;
    const xp = 100;
    const leveledUp = addXp(interaction.user.id, xp);
    let reply = `🎁 Daily reward claimed! **+${xp} XP**!`;
    if (leveledUp !== null) reply += ` 🆙 You leveled up to **Level ${leveledUp}**!`;
    return interaction.reply(reply);
  }

  // GIVEAWAY
  if (commandName === 'giveaway') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    const prize = interaction.options.getString('prize');
    const minutes = interaction.options.getInteger('minutes');
    const winnerCount = interaction.options.getInteger('winners') || 1;
    const endTime = Date.now() + minutes * 60000;

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle('🎉 GIVEAWAY!')
      .setDescription(`**Prize:** ${prize}

React with 🎉 to enter!

**Winners:** ${winnerCount}
**Ends:** <t:${Math.floor(endTime / 1000)}:R>`)
      .setFooter({ text: `Hosted by ${interaction.user.tag}` })
      .setTimestamp(endTime);

    const msg = await interaction.channel.send({ embeds: [embed] });
    await msg.react('🎉');

    giveaways[msg.id] = { prize, endTime, winnerCount, hostId: interaction.user.id, channelId: interaction.channel.id, entries: new Set() };

    setTimeout(async () => {
      const gw = giveaways[msg.id];
      if (!gw) return;
      const entries = [...gw.entries];
      const endEmbed = new EmbedBuilder().setColor(0xed4245).setTitle('🎉 GIVEAWAY ENDED').setTimestamp();
      if (entries.length === 0) {
        endEmbed.setDescription(`**Prize:** ${gw.prize}

😔 No one entered the giveaway!`);
        await msg.edit({ embeds: [endEmbed] }).catch(() => {});
        delete giveaways[msg.id];
        return;
      }
      const shuffled = entries.sort(() => Math.random() - 0.5);
      const winners = shuffled.slice(0, Math.min(gw.winnerCount, entries.length));
      endEmbed.setDescription(`**Prize:** ${gw.prize}

🏆 **Winner(s):** ${winners.map(id => `<@${id}>`).join(', ')}`);
      await msg.edit({ embeds: [endEmbed] }).catch(() => {});
      await interaction.channel.send(`🎉 Congratulations ${winners.map(id => `<@${id}>`).join(', ')}! You won **${gw.prize}**!`);
      delete giveaways[msg.id];
    }, minutes * 60000);

    return interaction.reply({ content: `✅ Giveaway started for **${minutes}** minute(s)!`, ephemeral: true });
  }

  // REROLL
  if (commandName === 'reroll') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    const msgId = interaction.options.getString('message_id');
    const msg = await interaction.channel.messages.fetch(msgId).catch(() => null);
    if (!msg) return interaction.reply({ content: '❌ Message not found.', ephemeral: true });
    const reaction = msg.reactions.cache.get('🎉');
    if (!reaction) return interaction.reply({ content: '❌ No 🎉 reactions found.', ephemeral: true });
    const users = await reaction.users.fetch();
    const entries = users.filter(u => !u.bot).map(u => u.id);
    if (!entries.length) return interaction.reply({ content: '❌ No valid entries.', ephemeral: true });
    const winner = entries[Math.floor(Math.random() * entries.length)];
    return interaction.reply(`🎉 New winner: <@${winner}>! Congratulations!`);
  }

  // POLL
  if (commandName === 'poll') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    const question = interaction.options.getString('question');
    const rawOptions = interaction.options.getString('options').split('|').map(o => o.trim()).filter(Boolean).slice(0, 10);
    if (rawOptions.length < 2) return interaction.reply({ content: '❌ Need at least 2 options separated by `|`.', ephemeral: true });
    const numberEmojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
    const desc = rawOptions.map((o, i) => `${numberEmojis[i]} ${o}`).join('\n');
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📊 ${question}`)
      .setDescription(desc)
      .setFooter({ text: `Poll by ${interaction.user.tag}` })
      .setTimestamp();
    const pollMsg = await interaction.channel.send({ embeds: [embed] });
    for (let i = 0; i < rawOptions.length; i++) await pollMsg.react(numberEmojis[i]).catch(() => {});
    polls[pollMsg.id] = { question, options: rawOptions };
    return interaction.reply({ content: '✅ Poll created!', ephemeral: true });
  }

  // WORD FILTER
  if (commandName === 'wordfilter') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    const action = interaction.options.getString('action');
    const word = interaction.options.getString('word')?.toLowerCase();
    if (action === 'add') {
      if (!word) return interaction.reply({ content: '❌ Provide a word to add.', ephemeral: true });
      if (wordFilter.includes(word)) return interaction.reply({ content: `⚠️ \`${word}\` is already in the filter.`, ephemeral: true });
      wordFilter.push(word);
      return interaction.reply({ content: `✅ Added \`${word}\` to the word filter. (Total: ${wordFilter.length})`, ephemeral: true });
    }
    if (action === 'remove') {
      if (!word) return interaction.reply({ content: '❌ Provide a word to remove.', ephemeral: true });
      wordFilter = wordFilter.filter(w => w !== word);
      return interaction.reply({ content: `✅ Removed \`${word}\` from the word filter.`, ephemeral: true });
    }
    if (action === 'list') {
      return interaction.reply({ content: wordFilter.length ? `🚫 **Blocked words:** ${wordFilter.map(w => `\`${w}\``).join(', ')}` : '✅ Word filter is empty.', ephemeral: true });
    }
    if (action === 'clear') {
      wordFilter = [];
      return interaction.reply({ content: '✅ Word filter cleared.', ephemeral: true });
    }
  }



  // VERIFYPANEL
  if (commandName === 'verifypanel') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('✅ Server Verification')
      .setDescription(
        `Welcome to **${interaction.guild.name}**!\n\n` +
        `To gain access to the server, please click the **Verify** button below.\n\n` +
        `By verifying, you confirm that you have read and agree to our server rules.`
      )
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .setFooter({ text: interaction.guild.name })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verify_member')
        .setLabel('✅ Verify')
        .setStyle(ButtonStyle.Success)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: '✅ Verification panel sent!', ephemeral: true });
  }

  // CHALLENGE (Admin posts a new challenge)
  if (commandName === 'challenge') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });

    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const difficulty = interaction.options.getString('difficulty');

    const difficultyMap = {
      easy:   { label: '🟢 Easy',   color: 0x57f287, xp: 50 },
      medium: { label: '🟡 Medium', color: 0xfee75c, xp: 100 },
      hard:   { label: '🔴 Hard',   color: 0xed4245, xp: 200 },
      expert: { label: '⚫ Expert', color: 0x2f3136, xp: 350 },
    };
    const diff = difficultyMap[difficulty];

    const targetChannel = CONFIG.CHALLENGE_CHANNEL_ID
      ? interaction.guild.channels.cache.get(CONFIG.CHALLENGE_CHANNEL_ID)
      : interaction.channel;

    if (!targetChannel) return interaction.reply({ content: '❌ Challenge channel not found.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor(diff.color)
      .setTitle(`💻 Code Challenge — \${title}`)
      .setDescription(description)
      .addFields(
        { name: '⚡ Difficulty', value: diff.label, inline: true },
        { name: '🏆 XP Reward', value: `+\${diff.xp} XP for submitting`, inline: true },
        { name: '📤 How to submit', value: 'Use `/submit` with your solution!', inline: false }
      )
      .setFooter({ text: `Posted by \${interaction.user.tag}` })
      .setTimestamp();

    const msg = await targetChannel.send({ embeds: [embed] });
    currentChallenge = { title, description, difficulty, xp: diff.xp, postedAt: Date.now(), messageId: msg.id, channelId: targetChannel.id, submissions: new Set() };

    return interaction.reply({ content: `✅ Challenge posted in \${targetChannel}!`, ephemeral: true });
  }

  // CURRENTCHALLENGE
  if (commandName === 'currentchallenge') {
    if (!currentChallenge) return interaction.reply({ content: '❌ No active challenge right now. Check back later!', ephemeral: true });
    const difficultyMap = {
      easy:   { label: '🟢 Easy',   color: 0x57f287 },
      medium: { label: '🟡 Medium', color: 0xfee75c },
      hard:   { label: '🔴 Hard',   color: 0xed4245 },
      expert: { label: '⚫ Expert', color: 0x2f3136 },
    };
    const diff = difficultyMap[currentChallenge.difficulty];
    const embed = new EmbedBuilder()
      .setColor(diff.color)
      .setTitle(`💻 Current Challenge — \${currentChallenge.title}`)
      .setDescription(currentChallenge.description)
      .addFields(
        { name: '⚡ Difficulty', value: diff.label, inline: true },
        { name: '🏆 XP Reward', value: `+\${currentChallenge.xp} XP`, inline: true },
        { name: '👥 Submissions', value: `\${currentChallenge.submissions.size}`, inline: true },
        { name: '📅 Posted', value: `<t:\${Math.floor(currentChallenge.postedAt / 1000)}:R>`, inline: true }
      )
      .setFooter({ text: 'Use /submit to send your solution!' });
    return interaction.reply({ embeds: [embed] });
  }

  // SUBMIT
  if (commandName === 'submit') {
    if (!currentChallenge) return interaction.reply({ content: '❌ There is no active challenge right now.', ephemeral: true });
    const solution = interaction.options.getString('solution');
    const alreadySubmitted = currentChallenge.submissions.has(interaction.user.id);

    currentChallenge.submissions.add(interaction.user.id);
    const xpGain = alreadySubmitted ? Math.floor(currentChallenge.xp * 0.25) : currentChallenge.xp;
    const leveledUp = addXp(interaction.user.id, xpGain);

    // Post submission to challenge channel
    const targetChannel = CONFIG.CHALLENGE_CHANNEL_ID
      ? interaction.guild.channels.cache.get(CONFIG.CHALLENGE_CHANNEL_ID)
      : interaction.channel;

    if (targetChannel) {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .setTitle(`📤 Solution — \${currentChallenge.title}`)
        .setDescription(`\`\`\`\n\${solution}\n\`\`\``)
        .addFields({ name: '🏆 XP Earned', value: `+\${xpGain} XP\${alreadySubmitted ? ' (resubmission)' : ''}`, inline: true })
        .setTimestamp();
      await targetChannel.send({ embeds: [embed] });
    }

    let reply = alreadySubmitted
      ? `📤 Updated your submission! **+\${xpGain} XP** (resubmission bonus).`
      : `✅ Solution submitted! **+\${xpGain} XP**!`;
    if (leveledUp !== null) reply += ` 🆙 Level up! **Level \${leveledUp}**!`;
    return interaction.reply({ content: reply, ephemeral: true });
  }

  // LANGPANEL
  if (commandName === 'langpanel') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const categories = [...new Set(LANGUAGE_ROLES.map(l => l.category))];
    const categoryColors = {
      'Web':       0x5865f2,
      'Backend':   0x57f287,
      'Mobile':    0xfee75c,
      'Data':      0xeb459e,
      'Scripting': 0xff9500,
      'Other':     0xed4245,
    };

    for (const category of categories) {
      const langs = LANGUAGE_ROLES.filter(l => l.category === category);

      const embed = new EmbedBuilder()
        .setColor(categoryColors[category] || 0x5865f2)
        .setTitle(`💻 ${category} Languages`)
        .setDescription(
          langs.map(l => `${l.emoji} **${l.label}** — ${l.description}`).join('\n') +
          '\n\n> Use the dropdown below to **get or remove** a role.'
        )
        .setFooter({ text: `${langs.length} languages in this category` });

      // Discord allows max 25 options per select menu
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`lang_select_${category}`)
        .setPlaceholder(`🔍 Pick a ${category} language...`)
        .setMinValues(0)
        .setMaxValues(Math.min(langs.length, 25))
        .addOptions(
          langs.slice(0, 25).map(l =>
            new StringSelectMenuOptionBuilder()
              .setLabel(l.label)
              .setValue(l.id)
              .setDescription(l.description.slice(0, 100))
              .setEmoji(l.emoji)
          )
        );

      const row = new ActionRowBuilder().addComponents(menu);
      await interaction.channel.send({ embeds: [embed], components: [row] });
    }

    return interaction.editReply('✅ Language role panels sent!');
  }

  // ANTILINK TOGGLE
  if (commandName === 'antilink') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
    CONFIG.ANTI_LINK = interaction.options.getString('status') === 'true';
    return interaction.reply(`🔗 Anti-link is now **${CONFIG.ANTI_LINK ? 'enabled ✅' : 'disabled ❌'}**.`);
  }
});

// ========== LOGIN ==========
client.login(process.env.TOKEN);
