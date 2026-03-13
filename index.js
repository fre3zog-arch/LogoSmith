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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
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
  VERIFY_CHANNEL_ID: process.env.VERIFY_CHANNEL_ID || '1481412482164850771',
  VERIFY_ROLE_ID: process.env.VERIFY_ROLE_ID || '1471461739026579588',
  CHALLENGE_CHANNEL_ID: process.env.CHALLENGE_CHANNEL_ID || '1481412176802615438',
  IDEAS_CHANNEL_ID: process.env.IDEAS_CHANNEL_ID || '1481294600349028382',
  TOP_IDEAS_CHANNEL_ID: process.env.TOP_IDEAS_CHANNEL_ID || '',
  IDEAS_VOTES_THRESHOLD: parseInt(process.env.IDEAS_VOTES_THRESHOLD || '5'), // net votes to promote to #top-ideas
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
const captchaCodes = {};   // { userId: { code, expires } }
const serviceRatings = {};
const ideasData = {}; // { messageId: { authorId, content, upvotes: Set, downvotes: Set, promoted: bool } } // { messageId: { providerId, ratings: { userId: stars }, total, count } }
let statsMessageId = null;

// Giveaway, Poll, Daily, Word filter, Voice XP
const giveaways = {};      // { channelId_messageId: { prize, endTime, entries, hostId } }
const polls = {};           // { messageId: { question, options, votes: {userId: optionIndex} } }
const dailyCooldowns = {};  // { userId: timestamp }
const voiceJoinTime = {};   // { userId: timestamp } for voice XP
let wordFilter = [];        // array of blocked words
let currentChallenge = null;
let challengePanelChannelId = null; // set by /challengepanel
let challengePanelMessageId = null;

// Built-in challenge pool
const CHALLENGE_POOL = [
  // Easy
  { title: 'FizzBuzz', description: 'Write a program that prints numbers 1–100. For multiples of 3 print "Fizz", for multiples of 5 print "Buzz", for both print "FizzBuzz".', difficulty: 'easy' },
  { title: 'Palindrome Check', description: 'Write a function that returns `true` if a given string is a palindrome (reads the same forwards and backwards), ignoring spaces and case.', difficulty: 'easy' },
  { title: 'Reverse a String', description: 'Write a function that reverses a string without using built-in reverse methods.', difficulty: 'easy' },
  { title: 'Sum of Array', description: 'Write a function that takes an array of numbers and returns their sum without using built-in sum/reduce methods.', difficulty: 'easy' },
  { title: 'Count Vowels', description: 'Write a function that counts the number of vowels (a, e, i, o, u) in a given string.', difficulty: 'easy' },
  { title: 'Find Max', description: 'Find the maximum value in an array without using built-in max functions.', difficulty: 'easy' },
  { title: 'Celsius to Fahrenheit', description: 'Write a function that converts a temperature from Celsius to Fahrenheit and back.', difficulty: 'easy' },
  // Medium
  { title: 'Two Sum', description: 'Given an array of integers and a target sum, return the indices of the two numbers that add up to the target. Each input has exactly one solution.', difficulty: 'medium' },
  { title: 'Valid Parentheses', description: 'Given a string with `(`, `)`, `{`, `}`, `[`, `]`, determine if the input string is valid (brackets close in the correct order).', difficulty: 'medium' },
  { title: 'Fibonacci Sequence', description: 'Write a function that returns the nth Fibonacci number. Implement both a recursive and an iterative solution and compare their performance.', difficulty: 'medium' },
  { title: 'Anagram Check', description: 'Write a function that checks if two strings are anagrams of each other (contain the same characters, different order).', difficulty: 'medium' },
  { title: 'Flatten Nested Array', description: 'Write a function that flattens a deeply nested array into a single array without using built-in flat() methods.', difficulty: 'medium' },
  { title: 'Caesar Cipher', description: 'Implement a Caesar cipher encoder/decoder. Shift each letter by a given number of positions in the alphabet.', difficulty: 'medium' },
  { title: 'Binary Search', description: 'Implement binary search on a sorted array. Return the index of the target element, or -1 if not found.', difficulty: 'medium' },
  { title: 'Remove Duplicates', description: 'Remove duplicate values from an array without using Set or filter+indexOf. Return a new array with unique values only.', difficulty: 'medium' },
  // Hard
  { title: 'LRU Cache', description: 'Design and implement an LRU (Least Recently Used) cache with `get(key)` and `put(key, value)` operations, both in O(1) time.', difficulty: 'hard' },
  { title: 'Merge Sort', description: 'Implement merge sort from scratch. Explain the time and space complexity of your solution.', difficulty: 'hard' },
  { title: 'Balanced Binary Tree', description: 'Write a function to determine if a binary tree is height-balanced (depth of subtrees never differs by more than 1).', difficulty: 'hard' },
  { title: 'Longest Substring Without Repeating', description: 'Given a string, find the length of the longest substring without repeating characters. Aim for O(n) time complexity.', difficulty: 'hard' },
  { title: 'Word Ladder', description: 'Given two words and a dictionary, find the shortest transformation sequence from the first word to the last, changing one letter at a time.', difficulty: 'hard' },
  // Expert
  { title: 'Implement a Promise', description: 'Implement your own version of JavaScript Promises from scratch, supporting `.then()`, `.catch()`, and `.finally()`.', difficulty: 'expert' },
  { title: 'Regex Engine', description: 'Build a simplified regex engine that supports `.` (any char) and `*` (zero or more of previous char).', difficulty: 'expert' },
  { title: 'Trie Data Structure', description: 'Implement a Trie data structure with insert, search, and startsWith methods. Then use it to implement autocomplete.', difficulty: 'expert' },
];

const GAME_XP = {
  trivia_correct: 25,
  coinflip_win: 10,
  rps_win: 10,
  roll_lucky: 15,
};

// ========== HELPERS ==========
function getLevel(xp) { return Math.floor(0.1 * Math.sqrt(xp)); }
function getXpForLevel(level) { return Math.pow(level / 0.1, 2); }

function addXp(userId, amount, guild) {
  if (!levels[userId]) levels[userId] = { xp: 0, level: 0 };
  levels[userId].xp += amount;
  const newLevel = getLevel(levels[userId].xp);
  // Always sync rank role on every XP gain (handles Noob Dev from level 0)
  if (guild) {
    guild.members.fetch(userId).then(member => updateRankRole(member)).catch(() => {});
  }
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
    .setTitle(`${action}`)
    .addFields(
      { name: 'User', value: `${target.tag || target}\n\`${target.id || target}\``, inline: true },
      { name: 'Moderator', value: moderator ? `${moderator.tag}` : 'AutoMod', inline: true },
      { name: 'Reason', value: reason || 'No reason provided', inline: false }
    )
    .setFooter({ text: 'Mod Log' })
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
  { q: 'What does HTML stand for?', a: 'hypertext markup language' },
  { q: 'Which language runs natively in the browser?', a: 'javascript' },
  { q: 'What does CSS stand for?', a: 'cascading style sheets' },
  { q: 'Which data structure uses LIFO order?', a: 'stack' },
  { q: 'What does API stand for?', a: 'application programming interface' },
  { q: 'What does HTTP stand for?', a: 'hypertext transfer protocol' },
  { q: 'What symbol is used for comments in Python?', a: '#' },
  { q: 'What does SQL stand for?', a: 'structured query language' },
  { q: 'What is the result of 2 ** 10 in Python?', a: '1024' },
  { q: 'Which keyword declares a constant in JavaScript?', a: 'const' },
  { q: 'What does OOP stand for?', a: 'object oriented programming' },
  { q: 'Which HTTP method is used to send data to a server?', a: 'post' },
  { q: 'What does JSON stand for?', a: 'javascript object notation' },
  { q: 'Which language is primarily used for iOS development?', a: 'swift' },
  { q: 'What does DOM stand for?', a: 'document object model' },
  { q: 'Which data structure uses FIFO order?', a: 'queue' },
  { q: 'What does CLI stand for?', a: 'command line interface' },
  { q: 'Which port does HTTPS use by default?', a: '443' },
  { q: 'What is the base of the binary number system?', a: '2' },
  { q: 'Which keyword is used to create a function in Python?', a: 'def' },
  { q: 'What does RAM stand for?', a: 'random access memory' },
  { q: 'Which company created the Java language?', a: 'sun microsystems' },
  { q: 'What does IDE stand for?', a: 'integrated development environment' },
  { q: 'What is the extension of a JavaScript file?', a: '.js' },
  { q: 'What does Git stand for?', a: 'git' },
  { q: 'Which HTTP status code means "Not Found"?', a: '404' },
  { q: 'What does URL stand for?', a: 'uniform resource locator' },
  { q: 'Which language was created by Brendan Eich in 10 days?', a: 'javascript' },
  { q: 'What does MVC stand for?', a: 'model view controller' },
  { q: 'Which symbol starts a comment in JavaScript?', a: '//' },
  { q: 'What is the main use of Docker?', a: 'containerization' },
  { q: 'What does SSH stand for?', a: 'secure shell' },
  { q: 'What is 0xFF in decimal?', a: '255' },
  { q: 'Which keyword exits a loop early in most languages?', a: 'break' },
  { q: 'What does NPM stand for?', a: 'node package manager' },
];

// ========== RANK ROLES (auto-assigned by level) ==========
const RANK_ROLES = [
  { minLevel: 0,  maxLevel: 4,  name: 'Noob Dev',   roleId: process.env.RANK_ROLE_NOOB   || '' },
  { minLevel: 5,  maxLevel: 19, name: 'Pro Dev',     roleId: process.env.RANK_ROLE_PRO    || '' },
  { minLevel: 20, maxLevel: Infinity, name: 'Hacker Dev', roleId: process.env.RANK_ROLE_HACKER || '' },
];

async function updateRankRole(member) {
  if (!member) return;
  const data = levels[member.id];
  if (!data) return;
  const currentLevel = data.level;
  const targetRank = RANK_ROLES.find(r => currentLevel >= r.minLevel && currentLevel <= r.maxLevel);
  if (!targetRank || !targetRank.roleId) return;
  const targetRole = member.guild.roles.cache.get(targetRank.roleId);
  if (!targetRole) return;
  // Remove all other rank roles, add correct one
  const rankRoleIds = RANK_ROLES.map(r => r.roleId).filter(Boolean);
  const toRemove = member.roles.cache.filter(r => rankRoleIds.includes(r.id) && r.id !== targetRank.roleId);
  for (const [, role] of toRemove) await member.roles.remove(role).catch(() => {});
  if (!member.roles.cache.has(targetRank.roleId)) {
    await member.roles.add(targetRole).catch(() => {});
  }
}

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


// ========== AUTO CHALLENGE HELPER ==========
async function postAutoChallenge(guild) {
  if (!challengePanelChannelId) return;
  const channel = guild.channels.cache.get(challengePanelChannelId);
  if (!channel) return;

  const difficultyMap = {
    easy:   { label: '🟢 Easy',   color: 0x57f287, xp: 50 },
    medium: { label: '🟡 Medium', color: 0xfee75c, xp: 100 },
    hard:   { label: '🔴 Hard',   color: 0xed4245, xp: 200 },
    expert: { label: '⚫ Expert', color: 0x2f3136, xp: 350 },
  };

  // Pick a random challenge from pool
  const pick = CHALLENGE_POOL[Math.floor(Math.random() * CHALLENGE_POOL.length)];
  const diff = difficultyMap[pick.difficulty];

  const embed = new EmbedBuilder()
    .setColor(diff.color)
    .setTitle(`💻 Weekly Code Challenge — ${pick.title}`)
    .setDescription(pick.description)
    .addFields(
      { name: '⚡ Difficulty', value: diff.label, inline: true },
      { name: '🏆 XP Reward', value: `+${diff.xp} XP for submitting`, inline: true },
      { name: '📤 How to submit', value: 'Use `/submit` with your solution!', inline: false }
    )
    .setFooter({ text: 'New challenge every week • Good luck!' })
    .setTimestamp();

  // Edit existing panel message if possible, else send new
  if (challengePanelMessageId) {
    const old = await channel.messages.fetch(challengePanelMessageId).catch(() => null);
    if (old) {
      await old.edit({ embeds: [embed] });
    } else {
      const msg = await channel.send({ embeds: [embed] });
      challengePanelMessageId = msg.id;
    }
  } else {
    const msg = await channel.send({ embeds: [embed] });
    challengePanelMessageId = msg.id;
  }

  currentChallenge = {
    title: pick.title,
    description: pick.description,
    difficulty: pick.difficulty,
    xp: diff.xp,
    postedAt: Date.now(),
    messageId: challengePanelMessageId,
    channelId: challengePanelChannelId,
    submissions: new Set(),
  };

  console.log(`✅ Auto challenge posted: ${pick.title}`);
}

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

  new SlashCommandBuilder().setName('challengepanel').setDescription('Set this channel as the auto challenge channel (Admin only)'),

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

  new SlashCommandBuilder().setName('idea').setDescription('Submit an idea to the ideas channel')
    .addStringOption(o => o.setName('idea').setDescription('Your idea').setRequired(true)),

  new SlashCommandBuilder().setName('ideasleaderboard').setDescription('Show the top ideas by upvotes'),

  new SlashCommandBuilder().setName('clearideas').setDescription('Clear the ideas leaderboard (Admin only)'),

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
  // Weekly challenge auto-post (every 7 days)
  setInterval(async () => {
    const g = client.guilds.cache.get(GUILD_ID);
    if (g) await postAutoChallenge(g);
  }, 7 * 24 * 60 * 60 * 1000);

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
        const leveledUp = addXp(userId, xpGain, channel.guild);
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
  // Give Noob Dev rank role on join
  await updateRankRole(member);
  if (CONFIG.WELCOME_CHANNEL_ID) {
    const channel = member.guild.channels.cache.get(CONFIG.WELCOME_CHANNEL_ID);
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Welcome to ' + member.guild.name + '! 👋')
        .setDescription(`Hey ${member}, great to have you here!\n\nYou are member **#${member.guild.memberCount}**. Make yourself at home and enjoy the community.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage('https://i.imgur.com/wSTFkRM.png')
        .setFooter({ text: member.guild.name + ' • Welcome', iconURL: member.guild.iconURL({ dynamic: true }) })
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
      const leveledUp = addXp(message.author.id, GAME_XP.trivia_correct, message.guild);
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
    const leveledUp = addXp(message.author.id, xpGain, message.guild);
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

  // IDEAS CHANNEL — only /idea allowed, delete everything else
  if (CONFIG.IDEAS_CHANNEL_ID && message.channel.id === CONFIG.IDEAS_CHANNEL_ID) {
    if (message.content.startsWith('/')) return; // allow slash commands
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(`🚫 ${message.author} Use \`/idea\` to submit your idea!`);
      setTimeout(() => warn.delete().catch(() => {}), 5000);
      return;
    }
  }

  // CHALLENGE CHANNEL — only /submit allowed, delete everything else
  const effectiveChallengeChannel = challengePanelChannelId || CONFIG.CHALLENGE_CHANNEL_ID;
  if (effectiveChallengeChannel && message.channel.id === effectiveChallengeChannel) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(`🚫 ${message.author} This channel is read-only — use \`/submit\` to submit your solution.`);
      setTimeout(() => warn.delete().catch(() => {}), 6000);
      return;
    }
  }

  // SERVICES CHANNEL — user sends a request, forwarded to review channel
  if (CONFIG.SERVICES_CHANNEL_ID && message.channel.id === CONFIG.SERVICES_CHANNEL_ID) {
    if (message.content.startsWith('/')) return;

    // Must have text or image
    const hasText = message.content.trim().length > 0;
    const hasImage = message.attachments.some(a => a.contentType?.startsWith('image/'));
    if (!hasText && !hasImage) {
      await message.delete().catch(() => {});
      return;
    }

    // Block if user already has a pending request
    if (pendingRequests[message.author.id]) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(`❌ ${message.author} You already have a pending request. Please wait for a response before submitting a new one.`);
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
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
      .setTitle('📋 New Service Request')
      .setDescription(message.content.trim() || '*[Image only — see below]*')
      .addFields(
        { name: '👤 User', value: `${message.author} (\`${message.author.tag}\`)`, inline: true },
        { name: '🆔 User ID', value: `\`${message.author.id}\``, inline: true },
        { name: '📅 Submitted', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setFooter({ text: 'Service Request • Pending Review' })
      .setTimestamp();

    // Grab image attachments if any
    const imageAttachments = [...message.attachments.values()].filter(a => a.contentType?.startsWith('image/'));
    const imageUrls = imageAttachments.map(a => a.url);

    // Set image on review embed using attachment (stays valid)
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`service_accept_${message.author.id}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`service_reject_${message.author.id}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger),
    );

    // Attach first image directly so it never expires in review
    const reviewFiles = imageAttachments.length > 0 ? [{ attachment: imageAttachments[0].url, name: 'image.png' }] : [];
    if (imageAttachments.length > 0) embed.setImage('attachment://image.png');
    if (imageUrls.length > 1) embed.addFields({ name: '📎 Additional images', value: imageUrls.slice(1).join('\n') });

    const reviewMsg = await reviewChannel.send({ embeds: [embed], files: reviewFiles, components: [row] });
    // Store proxy URLs (more stable than CDN URLs)
    const stableImages = imageAttachments.map(a => a.proxyURL || a.url);
    pendingRequests[message.author.id] = { msgId: reviewMsg.id, content: message.content, images: stableImages };

    const notify = await message.channel.send(`📬 ${message.author} Your request has been received and is under review. We'll get back to you soon.`);
    setTimeout(() => notify.delete().catch(() => {}), 8000);
  }

});

// ========== REACTION ROLES ==========
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});

  // IDEAS VOTING
  const ideaData = ideasData[reaction.message.id];
  if (ideaData && (reaction.emoji.name === '✅' || reaction.emoji.name === '❌')) {
    if (user.id === ideaData.authorId) {
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }
    // Remove opposite reaction
    if (reaction.emoji.name === '✅') ideaData.downvotes.delete(user.id);
    else ideaData.upvotes.delete(user.id);

    if (reaction.emoji.name === '✅') ideaData.upvotes.add(user.id);
    else ideaData.downvotes.add(user.id);

    await updateIdeaEmbed(reaction.message, ideaData);

    // Promote to #top-ideas if net votes threshold reached
    const net = ideaData.upvotes.size - ideaData.downvotes.size;
    if (!ideaData.promoted && net >= CONFIG.IDEAS_VOTES_THRESHOLD && CONFIG.TOP_IDEAS_CHANNEL_ID) {
      const topChannel = reaction.message.guild.channels.cache.get(CONFIG.TOP_IDEAS_CHANNEL_ID);
      if (topChannel) {
        const author = await reaction.message.guild.members.fetch(ideaData.authorId).catch(() => null);
        const topEmbed = new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle('💡 Top Idea')
          .setDescription(ideaData.content)
          .setAuthor({ name: author ? author.user.tag : 'Unknown', iconURL: author ? author.user.displayAvatarURL({ dynamic: true }) : undefined })
          .addFields({ name: '🔥 Net Votes', value: `+${net}`, inline: true })
          .setFooter({ text: 'Community approved!' })
          .setTimestamp();
        await topChannel.send({ embeds: [topEmbed] });
        ideaData.promoted = true;
        // Update original embed to show promoted
        await updateIdeaEmbed(reaction.message, ideaData);
      }
    }
    return;
  }

  if (reaction.message.id !== CONFIG.REACTION_ROLE_MESSAGE_ID) return;
  const roleId = REACTION_ROLES[reaction.emoji.name];
  if (!roleId) return;
  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  const role = reaction.message.guild.roles.cache.get(roleId);
  if (role) await member.roles.add(role).catch(console.error);
});

async function updateIdeaEmbed(message, data) {
  try {
    const oldEmbed = message.embeds[0];
    if (!oldEmbed) return;
    const net = data.upvotes.size - data.downvotes.size;
    const statusLine = data.promoted ? '\n\n✨ **Promoted to #top-ideas!**' : '';
    const newEmbed = EmbedBuilder.from(oldEmbed)
      .spliceFields(0, oldEmbed.fields.length,
        { name: '✅ Upvotes', value: `${data.upvotes.size}`, inline: true },
        { name: '❌ Downvotes', value: `${data.downvotes.size}`, inline: true },
        { name: '📊 Score', value: `${net > 0 ? '+' : ''}${net}${statusLine}`, inline: true }
      );
    await message.edit({ embeds: [newEmbed] }).catch(() => {});
  } catch {}
}

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});

  // IDEAS VOTING — remove vote
  const ideaData = ideasData[reaction.message.id];
  if (ideaData && (reaction.emoji.name === '✅' || reaction.emoji.name === '❌')) {
    if (reaction.emoji.name === '✅') ideaData.upvotes.delete(user.id);
    else ideaData.downvotes.delete(user.id);
    await updateIdeaEmbed(reaction.message, ideaData);
    return;
  }

  if (reaction.message.id !== CONFIG.REACTION_ROLE_MESSAGE_ID) return;
  const roleId = REACTION_ROLES[reaction.emoji.name];
  if (!roleId) return;
  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  const role = reaction.message.guild.roles.cache.get(roleId);
  if (role) await member.roles.remove(role).catch(console.error);
});

// ========== TICKET ==========
const TICKET_TYPES = {
  bug:      { label: '🐛 Bug Report',      color: 0xed4245, description: 'Report a bug or technical issue.' },
  scammer:  { label: '🚨 Report Scammer',  color: 0xff6b6b, description: 'Report a scammer or fraud.' },
  other:    { label: '❓ Other',            color: 0x5865f2, description: 'Any other issue or question.' },
};

async function openTicket(interaction, ticketType) {
  const guild = interaction.guild;
  const user = interaction.user;
  if (tickets[user.id]) return interaction.reply({ content: `❌ You already have an open ticket: <#${tickets[user.id]}>`, ephemeral: true });

  const type = TICKET_TYPES[ticketType] || TICKET_TYPES['other'];

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
    .setColor(type.color)
    .setTitle(type.label)
    .setDescription(`Hello ${user},\n\nThank you for reaching out. A staff member will be with you shortly.\n\n**Category:** ${type.label}\n\nPlease describe your issue in detail below.`)
    .setFooter({ text: `Ticket • ${user.tag}`, iconURL: user.displayAvatarURL() })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger)
  );
  await channel.send({ content: `${user}`, embeds: [embed], components: [row] });
  await interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
}

// ========== INTERACTIONS ==========
client.on(Events.InteractionCreate, async interaction => {

  // CAPTCHA MODAL SUBMIT
  if (interaction.isModalSubmit() && interaction.customId === 'verify_captcha') {
    const roleId = CONFIG.VERIFY_ROLE_ID;
    const stored = captchaCodes[interaction.user.id];

    if (!stored) return interaction.reply({ content: '❌ Captcha expired. Please press the Verify button again.', ephemeral: true });
    if (Date.now() > stored.expires) {
      delete captchaCodes[interaction.user.id];
      return interaction.reply({ content: '⏰ Captcha expired. Please press the Verify button again.', ephemeral: true });
    }

    const userAnswer = interaction.fields.getTextInputValue('captcha_answer').trim();

    if (userAnswer !== stored.answer) {
      delete captchaCodes[interaction.user.id];
      return interaction.reply({ content: `❌ Wrong answer! Please press the Verify button again to get a new captcha.`, ephemeral: true });
    }

    delete captchaCodes[interaction.user.id];

    if (!roleId) return interaction.reply({ content: '❌ Verify role not configured.', ephemeral: true });
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) return interaction.reply({ content: '❌ Verify role not found.', ephemeral: true });

    await interaction.member.roles.add(role).catch(console.error);
    return interaction.reply({ content: '✅ Correct! You have been **verified** and gained access to the server 🎉', ephemeral: true });
  }

  // SELECT MENUS
  if (interaction.isStringSelectMenu()) {
    // SERVICE RATING
    if (interaction.customId.startsWith('service_rate_') && !interaction.customId.includes('PLACEHOLDER')) {
      const parts = interaction.customId.split('_'); // service_rate_MSGID_USERID
      const msgId = parts[2];
      const providerId = parts[3];
      const stars = parseInt(interaction.values[0]);
      const ratingData = serviceRatings[msgId];

      if (!ratingData) return interaction.reply({ content: '❌ This rating has expired.', ephemeral: true });
      if (interaction.user.id === providerId)
        return interaction.reply({ content: '❌ You cannot rate your own service.', ephemeral: true });

      const alreadyRated = ratingData.ratings[interaction.user.id];
      if (alreadyRated) {
        // Update existing rating
        ratingData.total = ratingData.total - alreadyRated + stars;
        ratingData.ratings[interaction.user.id] = stars;
      } else {
        ratingData.total += stars;
        ratingData.count++;
        ratingData.ratings[interaction.user.id] = stars;
      }

      const avg = ratingData.total / ratingData.count;
      const fullStars = Math.round(avg);
      const starBar = '⭐'.repeat(fullStars) + '✦'.repeat(Math.max(0, 5 - fullStars));
      const ratingText = `${starBar}  **${avg.toFixed(1)} / 5.0** — ${ratingData.count} rating${ratingData.count !== 1 ? 's' : ''}`;

      // Edit the message embed to update rating field
      const msg = await interaction.message.fetch().catch(() => null);
      if (msg) {
        const oldEmbed = msg.embeds[0];
        const newEmbed = EmbedBuilder.from(oldEmbed);
        const fields = newEmbed.data.fields || [];
        const ratingIdx = fields.findIndex(f => f.name === '⭐ Rating');
        if (ratingIdx !== -1) fields[ratingIdx] = { name: '⭐ Rating', value: ratingText, inline: false };
        else newEmbed.addFields({ name: '⭐ Rating', value: ratingText, inline: false });
        await msg.edit({ embeds: [newEmbed] }).catch(() => {});
      }

      return interaction.reply({ content: `✅ You rated this service **${stars}/5** ${' ⭐'.repeat(stars).trim()}`, ephemeral: true });
    }

    if (interaction.customId === 'ticket_type_select') {
      const ticketType = interaction.values[0];
      return openTicket(interaction, ticketType);
    }


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
        return interaction.editReply('ℹ️ No languages selected — your roles remain unchanged.');

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
      if (!roleId) return interaction.reply({ content: '❌ Verify role not configured.', ephemeral: true });
      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) return interaction.reply({ content: '❌ Verify role not found.', ephemeral: true });
      if (interaction.member.roles.cache.has(roleId))
        return interaction.reply({ content: '✅ You are already verified!', ephemeral: true });

      // Generate a simple math captcha e.g. "12 + 7"
      const a = Math.floor(Math.random() * 20) + 1;
      const b = Math.floor(Math.random() * 20) + 1;
      const ops = [
        { symbol: '+', answer: a + b },
        { symbol: '-', answer: a - b },
        { symbol: 'x', answer: a * b },
      ];
      const op = ops[Math.floor(Math.random() * ops.length)];
      const question = `${a} ${op.symbol} ${b}`;

      // Store with 5 minute expiry
      captchaCodes[interaction.user.id] = {
        answer: op.answer.toString(),
        expires: Date.now() + 5 * 60 * 1000,
      };

      const modal = new ModalBuilder()
        .setCustomId('verify_captcha')
        .setTitle('🤖 Human Verification');

      const input = new TextInputBuilder()
        .setCustomId('captcha_answer')
        .setLabel(`Solve this: ${question} = ?`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter your answer...')
        .setMinLength(1)
        .setMaxLength(10)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'open_ticket') return openTicket(interaction, 'other');
    if (interaction.customId === 'close_ticket') {
      const channel = interaction.channel;
      await interaction.reply({ content: '🔒 Closing ticket in 5 seconds...' });
      const userId = Object.keys(tickets).find(id => tickets[id] === channel.id);
      if (userId) delete tickets[userId];
      setTimeout(() => channel.delete().catch(console.error), 5000);
      return;
    }
    // IDEA APPROVE/REJECT

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
          const savedImages = pendingRequests[targetUserId]?.images || [];
          const announceEmbed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setAuthor({ name: targetUser ? targetUser.tag : targetUserId, iconURL: targetUser ? targetUser.displayAvatarURL({ dynamic: true }) : undefined })
            .setDescription(requestContent !== '*(content unavailable)*' ? requestContent : null)
            .setFooter({ text: 'Service Request' })
            .setTimestamp();
          // Rating field placeholder
          announceEmbed.addFields({ name: '⭐ Rating', value: 'No ratings yet', inline: false });

          const ratingMenu = new StringSelectMenuBuilder()
            .setCustomId('service_rate_PLACEHOLDER')
            .setPlaceholder('⭐ Rate this service...')
            .addOptions(
              new StringSelectMenuOptionBuilder().setLabel('⭐ 1 Star').setValue('1').setDescription('Poor'),
              new StringSelectMenuOptionBuilder().setLabel('⭐⭐ 2 Stars').setValue('2').setDescription('Below average'),
              new StringSelectMenuOptionBuilder().setLabel('⭐⭐⭐ 3 Stars').setValue('3').setDescription('Average'),
              new StringSelectMenuOptionBuilder().setLabel('⭐⭐⭐⭐ 4 Stars').setValue('4').setDescription('Good'),
              new StringSelectMenuOptionBuilder().setLabel('⭐⭐⭐⭐⭐ 5 Stars').setValue('5').setDescription('Excellent!'),
            );
          const ratingRow = new ActionRowBuilder().addComponents(ratingMenu);

          const announceFiles = [];
          if (savedImages.length > 0) {
            announceFiles.push({ attachment: savedImages[0], name: 'image.png' });
            announceEmbed.setImage('attachment://image.png');
          }
          if (savedImages.length > 1) announceEmbed.addFields({ name: '📎 More images', value: savedImages.slice(1).join('\n') });

          const announceMsg = await servicesChannel.send({ embeds: [announceEmbed], files: announceFiles, components: [ratingRow] }).catch(console.error);

          // Now edit to set real customId with message ID
          if (announceMsg) {
            const realMenu = new StringSelectMenuBuilder()
              .setCustomId(`service_rate_${announceMsg.id}_${targetUserId}`)
              .setPlaceholder('⭐ Rate this service...')
              .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('⭐ 1 Star').setValue('1').setDescription('Poor'),
                new StringSelectMenuOptionBuilder().setLabel('⭐⭐ 2 Stars').setValue('2').setDescription('Below average'),
                new StringSelectMenuOptionBuilder().setLabel('⭐⭐⭐ 3 Stars').setValue('3').setDescription('Average'),
                new StringSelectMenuOptionBuilder().setLabel('⭐⭐⭐⭐ 4 Stars').setValue('4').setDescription('Good'),
                new StringSelectMenuOptionBuilder().setLabel('⭐⭐⭐⭐⭐ 5 Stars').setValue('5').setDescription('Excellent!'),
              );
            await announceMsg.edit({ components: [new ActionRowBuilder().addComponents(realMenu)] }).catch(() => {});
            serviceRatings[announceMsg.id] = { providerId: targetUserId, ratings: {}, total: 0, count: 0 };
          }
        }
      }

      // Clear pending request
      delete pendingRequests[targetUserId];

      // Notify the user via DM
      if (targetUser) {
        const dmEmbed = new EmbedBuilder()
          .setColor(isAccept ? 0x57f287 : 0xed4245)
          .setTitle(isAccept ? '✅ Request Accepted' : '❌ Request Rejected')
          .setDescription(isAccept
            ? `Your service request in **${interaction.guild.name}** has been **accepted**.\n\nA staff member will reach out to you shortly.`
            : `Your service request in **${interaction.guild.name}** has been **declined** this time.\n\nYou're welcome to submit a new request at any time.`)
          .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
          .setFooter({ text: interaction.guild.name })
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
        return interaction.editReply('ℹ️ No languages selected — your roles remain unchanged.');
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
    const xpProgress = data.xp - Math.floor(getXpForLevel(data.level));
    const xpNeeded = nextXp - Math.floor(getXpForLevel(data.level));
    const bars = 12;
    const filled = Math.round((xpProgress / xpNeeded) * bars);
    const progressBar = '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, bars - filled));
    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL({ dynamic: true }) })
      .setTitle('📊 Level Card')
      .addFields(
        { name: '⭐ Level', value: `**${data.level}**`, inline: true },
        { name: '✨ Total XP', value: `**${data.xp}**`, inline: true },
        { name: '📈 Progress', value: `\`${progressBar}\` ${xpProgress}/${xpNeeded} XP`, inline: false }
      )
      .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({ text: 'Next level: ' + (data.level + 1) });
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
  if (commandName === 'ticket') return openTicket(interaction, 'other');

  // TICKET PANEL
  if (commandName === 'ticketpanel') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
 const embed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setAuthor({ name: '🎫 Support Center', iconURL: getLogoUrl() })
      .setThumbnail(getLogoUrl())
      .setDescription('Need assistance? Select a category below to open a **private ticket**. Our team typically responds within a few hours.\n\n> 🐛 **Bug Report** — Technical issues\n> 🚨 **Report Scammer** — Fraud or scam reports\n> ❓ **Other** — Anything else')
      .setFooter({ text: interaction.guild.name + ' • Support', iconURL: interaction.guild.iconURL({ dynamic: true }) })
      .setTimestamp();

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_type_select')
      .setPlaceholder('📋 Select a Ticket Type')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('Bug Report').setValue('bug').setEmoji('🐛').setDescription('Report a bug or technical issue'),
        new StringSelectMenuOptionBuilder().setLabel('Report Scammer').setValue('scammer').setEmoji('🚨').setDescription('Report a scammer or fraud'),
        new StringSelectMenuOptionBuilder().setLabel('Other').setValue('other').setEmoji('❓').setDescription('Any other issue or question'),
      );

    const row = new ActionRowBuilder().addComponents(menu);
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
      const leveledUp = addXp(interaction.user.id, GAME_XP.coinflip_win, interaction.guild);
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
      const leveledUp = addXp(interaction.user.id, GAME_XP.roll_lucky, interaction.guild);
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
      const leveledUp = addXp(interaction.user.id, GAME_XP.rps_win, interaction.guild);
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
      .setTitle('📖 Command Reference')
      .setDescription('Here are all the commands available to you.')
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .setFooter({ text: interaction.guild.name + ' • Only showing commands available to you', iconURL: interaction.client.user.displayAvatarURL() })
      .setTimestamp();

    // General — everyone
    embed.addFields({
      name: '🌐 General',
      value: [
        '`/ping` — Check bot latency',
        '`/help` — Show this menu',
        '`/level` — Check your XP and level',
        '`/leaderboard` — Top 10 XP rankings',
        '`/daily` — Claim your daily +100 XP',
        '`/ticket` — Open a support ticket',
        '`/ai` — Ask the AI anything',
        '`/clear` — Delete your own messages',
      ].join('\n'),
      inline: false,
    });

    // Community — everyone
    embed.addFields({
      name: '💬 Community',
      value: [
        '`/idea` — Submit an idea to ' + (CONFIG.IDEAS_CHANNEL_ID ? `<#${CONFIG.IDEAS_CHANNEL_ID}>` : '#ideas'),
        '`/submit` — Submit your challenge solution',
        '`/currentchallenge` — View the active code challenge',
      ].join('\n'),
      inline: false,
    });

    // Mini Games
    embed.addFields({
      name: '🎮 Mini Games',
      value: [
        'Only usable in ' + (CONFIG.MINIGAMES_CHANNEL_ID ? `<#${CONFIG.MINIGAMES_CHANNEL_ID}>` : '#mini-games'),
        '`/trivia` `+25 XP` — Answer a dev trivia question',
        '`/coinflip` `+10 XP` — Flip a coin',
        '`/roll` `+15 XP` — Roll the dice',
        '`/rps` `+10 XP` — Rock Paper Scissors',
        '`/8ball` — Ask the magic 8-ball',
      ].join('\n'),
      inline: false,
    });

    // Moderation
    if (isMod || isAdmin) {
      embed.addFields({
        name: '🛡️ Moderation',
        value: [
          '`/warn` — Warn a user',
          "`/warnings` — View a user's warnings",
          "`/clearwarnings` — Clear a user's warnings",
          '`/mute` — Timeout a user',
          '`/kick` — Kick a user',
          '`/ban` — Ban a user',
          '`/purge` — Bulk delete messages',
        ].join('\n'),
        inline: false,
      });
    }

    // Admin
    if (isAdmin) {
      embed.addFields({
        name: '⚙️ Admin',
        value: [
          '`/lock` `/unlock` — Lock or unlock a channel',
          '`/say` — Send a message as the bot',
          '`/slowmode` — Set channel slowmode',
          '`/ticketpanel` — Post the support ticket panel',
          '`/verifypanel` — Post the verification panel',
          '`/langpanel` — Post the language roles panel',
          '`/autoroles` — Post the self-roles panel',
          '`/reactionroles` — Post reaction roles',
          '`/challengepanel` — Set up the weekly challenge channel',
          '`/challenge` — Post a manual code challenge',
          '`/wordfilter` — Manage the word filter',
          '`/antilink` — Toggle anti-link mode',
          '`/giveaway` `/reroll` — Start or reroll a giveaway',
          '`/poll` — Create a poll',
          '`/dmall` — DM all members',
          '`/serverstats` — Post live server stats embed',
          '`/setupstats` — Create voice channel counters',
        ].join('\n'),
        inline: false,
      });
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
    const leveledUp = addXp(interaction.user.id, xp, interaction.guild);
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
      .setDescription(desc + '\n\nReact with the corresponding number to cast your vote!')
      .setFooter({ text: 'Poll by ' + interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
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
      .setTitle('Human Verification')
      .setDescription(
        `Welcome to **${interaction.guild.name}**!\n\n` +
        `To gain full access, click **Verify** below and complete a quick math captcha.\n\n` +
        `> ✅ Takes less than 10 seconds\n` +
        `> 🔒 Keeps the server safe from bots\n` +
        `> 📋 By verifying you agree to our server rules`
      )
      .setThumbnail(interaction.guild.iconURL({ dynamic: true, size: 256 }))
      .setFooter({ text: interaction.guild.name + ' • Verification System', iconURL: interaction.guild.iconURL({ dynamic: true }) })
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

  // CHALLENGEPANEL
  if (commandName === 'challengepanel') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });

    challengePanelChannelId = interaction.channel.id;
    challengePanelMessageId = null; // reset so it posts fresh

    await postAutoChallenge(interaction.guild);

    return interaction.reply({ content: `✅ Challenge panel set in ${interaction.channel}! A new challenge will automatically be posted every week.`, ephemeral: true });
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
      .setTitle(`💻 Code Challenge — ${title}`)
      .setDescription(description)
      .addFields(
        { name: '⚡ Difficulty', value: diff.label, inline: true },
        { name: '🏆 XP Reward', value: `+${diff.xp} XP for submitting`, inline: true },
        { name: '📤 How to submit', value: 'Use `/submit` with your solution!', inline: false }
      )
      .setFooter({ text: `Posted by ${interaction.user.tag}` })
      .setTimestamp();

    const msg = await targetChannel.send({ embeds: [embed] });
    currentChallenge = { title, description, difficulty, xp: diff.xp, postedAt: Date.now(), messageId: msg.id, channelId: targetChannel.id, submissions: new Set() };

    return interaction.reply({ content: `✅ Challenge posted in ${targetChannel}!`, ephemeral: true });
  }

  // IDEAS LEADERBOARD
  if (commandName === 'ideasleaderboard') {
    const sorted = Object.entries(ideasData)
      .filter(([, d]) => d.upvotes.size > 0 || d.downvotes.size > 0)
      .sort(([, a], [, b]) => (b.upvotes.size - b.downvotes.size) - (a.upvotes.size - a.downvotes.size))
      .slice(0, 10);

    if (!sorted.length)
      return interaction.reply({ content: '📭 No ideas have been voted on yet.', ephemeral: true });

    const lines = await Promise.all(sorted.map(async ([msgId, d], i) => {
      const author = await client.users.fetch(d.authorId).catch(() => null);
      const net = d.upvotes.size - d.downvotes.size;
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
      const content = d.content.length > 60 ? d.content.slice(0, 57) + '...' : d.content;
      return `${medal} ${content}
　✅ ${d.upvotes.size}  ❌ ${d.downvotes.size}  **Score: ${net > 0 ? '+' : ''}${net}** — ${author ? author.tag : 'Unknown'}`;
    }));

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle('💡 Ideas Leaderboard')
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: `Top ${sorted.length} ideas by net votes` })
      .setFooter({ text: `Top ${sorted.length} ideas by net votes` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // CLEAR IDEAS LEADERBOARD
  if (commandName === 'clearideas') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return interaction.reply({ content: '❌ Admin only.', ephemeral: true });

    const count = Object.keys(ideasData).length;
    for (const key of Object.keys(ideasData)) delete ideasData[key];

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('🗑️ Ideas Leaderboard Cleared')
      .setDescription(`Cleared **${count}** idea${count !== 1 ? 's' : ''} from the leaderboard.`)
      .setFooter({ text: `Cleared by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // IDEA
  if (commandName === 'idea') {
    if (!CONFIG.IDEAS_CHANNEL_ID) return interaction.reply({ content: '❌ Ideas channel not configured.', ephemeral: true });
    const ideasChannel = interaction.guild.channels.cache.get(CONFIG.IDEAS_CHANNEL_ID);
    if (!ideasChannel) return interaction.reply({ content: '❌ Ideas channel not found.', ephemeral: true });

    const ideaText = interaction.options.getString('idea');

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('💡 New Idea')
      .setDescription(ideaText)
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .addFields(
        { name: '✅ Upvotes', value: '0', inline: true },
        { name: '❌ Downvotes', value: '0', inline: true },
        { name: '📊 Score', value: '0', inline: true }
      )
      .setFooter({ text: 'React with ✅ or ❌ to vote!' })
      .setTimestamp();

    const msg = await ideasChannel.send({ embeds: [embed] });

    ideasData[msg.id] = { authorId: interaction.user.id, content: ideaText, upvotes: new Set(), downvotes: new Set(), promoted: false };

    await msg.react('✅');
    await msg.react('❌');

    return interaction.reply({ content: '✅ Your idea has been submitted!', ephemeral: true });
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
      .setTitle(`💻 Current Challenge — ${currentChallenge.title}`)
      .setDescription(currentChallenge.description)
      .addFields(
        { name: '⚡ Difficulty', value: diff.label, inline: true },
        { name: '🏆 XP Reward', value: `+${currentChallenge.xp} XP`, inline: true },
        { name: '👥 Submissions', value: `${currentChallenge.submissions.size}`, inline: true },
        { name: '📅 Posted', value: `<t:${Math.floor(currentChallenge.postedAt / 1000)}:R>`, inline: true }
      )
      .setFooter({ text: 'Use /submit to send your solution!' });
    return interaction.reply({ embeds: [embed] });
  }

  // SUBMIT
  if (commandName === 'submit') {
    if (!currentChallenge) return interaction.reply({ content: '❌ There is no active challenge right now.', ephemeral: true });
    const solution = interaction.options.getString('solution');

    // Defer because AI evaluation takes a moment
    await interaction.deferReply({ ephemeral: true });

    // AI evaluation via Groq
    let isCorrect = false;
    let feedback = 'Could not evaluate — XP not awarded.';

    if (CONFIG.GROQ_API_KEY) {
      try {
        const evalRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}` },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 200,
            messages: [
              {
                role: 'system',
                content: 'You are a strict code reviewer. Evaluate if the submitted solution correctly solves the given challenge. Reply ONLY in this exact JSON format: {"correct": true/false, "feedback": "one sentence explanation"}. Be strict — if the solution is clearly wrong, incomplete, off-topic, or nonsense, mark it as incorrect.'
              },
              {
                role: 'user',
                content: `Challenge: ${currentChallenge.title}\nDescription: ${currentChallenge.description}\n\nSubmitted solution:\n${solution}`
              }
            ]
          })
        });
        const evalData = await evalRes.json();
        const raw = evalData.choices?.[0]?.message?.content?.trim() || '{}';
        const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        isCorrect = parsed.correct === true;
        feedback = parsed.feedback || feedback;
      } catch (e) {
        console.error('AI eval error:', e);
        feedback = 'Evaluation failed — please try again.';
      }
    }

    if (!isCorrect) {
      return interaction.editReply({ content: `❌ **Incorrect solution.**\n\n> ${feedback}\n\nTry again — no XP awarded.` });
    }

    // Correct — award XP
    const alreadySubmitted = currentChallenge.submissions.has(interaction.user.id);
    currentChallenge.submissions.add(interaction.user.id);
    const xpGain = alreadySubmitted ? Math.floor(currentChallenge.xp * 0.25) : currentChallenge.xp;
    const leveledUp = addXp(interaction.user.id, xpGain, interaction.guild);

    // Post to challenge channel
    const targetChannel = CONFIG.CHALLENGE_CHANNEL_ID
      ? interaction.guild.channels.cache.get(CONFIG.CHALLENGE_CHANNEL_ID)
      : interaction.channel;

    if (targetChannel) {
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .setTitle(`✅ Solution — ${currentChallenge.title}`)
        .setDescription(`\`\`\`\n${solution}\n\`\`\``)
        .addFields(
          { name: '🏆 XP Earned', value: `+${xpGain} XP${alreadySubmitted ? ' (resubmission)' : ''}`, inline: true },
          { name: '💬 Review', value: feedback, inline: false }
        )
        .setTimestamp();
      await targetChannel.send({ embeds: [embed] });
    }

    let reply = alreadySubmitted
      ? `📤 Updated solution accepted! **+${xpGain} XP** (resubmission bonus).\n\n> ${feedback}`
      : `✅ Correct solution! **+${xpGain} XP** awarded!\n\n> ${feedback}`;
    if (leveledUp !== null) reply += `\n\n🆙 **Level up! You are now Level ${leveledUp}!**`;
    return interaction.editReply({ content: reply });
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
