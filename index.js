// index.js
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType } = require("discord.js");
const express = require("express");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

// === CONFIG ===
const YOUR_GUILD_ID = "1441338778785419407";
const PREFIX = ",";
let vclbChannelId = null;
let chatlbChannelId = null;

// Leaderboards
const vcTime = new Map();
const chatMsgs = new Map();
const vcJoinTimestamps = new Map();

// VC Ownership
const vcOwners = new Map();

// Join-to-Create tracking
const tempVCs = new Map(); // userId => channelId

// === EXPRESS SERVER (KEEP-ALIVE) ===
const app = express();
app.get("/", (req, res) => res.send("Bot is alive!"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// === HELPER FUNCTIONS ===
function formatVoiceLB() {
  const arr = [...vcTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  let desc = "";
  const medals = ["🥇", "🥈", "🥉"];
  arr.forEach(([userId, mins], i) => {
    const medal = i < 3 ? medals[i] + " " : "";
    desc += `${medal}${i + 1} — ${client.users.cache.get(userId)?.username || "Unknown"} • ${mins} minutes\n`;
  });
  return new EmbedBuilder()
    .setTitle("Voice Leaderboard")
    .setDescription(desc || "No VC data yet")
    .setColor("#00008B")
    .setFooter({ text: "Updates every 5 minutes" });
}

function formatChatLB() {
  const arr = [...chatMsgs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  let desc = "";
  const medals = ["🥇", "🥈", "🥉"];
  arr.forEach(([userId, msgs], i) => {
    const medal = i < 3 ? medals[i] + " " : "";
    desc += `${medal}${i + 1} — ${client.users.cache.get(userId)?.username || "Unknown"} • ${msgs} messages\n`;
  });
  return new EmbedBuilder()
    .setTitle("Chat Leaderboard")
    .setDescription(desc || "No chat data yet")
    .setColor("#00008B")
    .setFooter({ text: "Updates every 5 minutes" });
}

async function updateVoiceLeaderboard() {
  if (!vclbChannelId) return;
  const channel = await client.channels.fetch(vclbChannelId).catch(() => null);
  if (!channel) return;
  channel.send({ embeds: [formatVoiceLB()] }).catch(() => null);
}

async function updateChatLeaderboard() {
  if (!chatlbChannelId) return;
  const channel = await client.channels.fetch(chatlbChannelId).catch(() => null);
  if (!channel) return;
  channel.send({ embeds: [formatChatLB()] }).catch(() => null);
}

// === AUTO VC TIME TRACKING & TEMP VC MANAGEMENT ===
client.on("voiceStateUpdate", async (oldState, newState) => {
  if (newState.guild.id !== YOUR_GUILD_ID) return;
  const userId = newState.id;

  // Join VC
  if (!oldState.channelId && newState.channelId) {
    vcJoinTimestamps.set(userId, Date.now());

    // JOIN TO CREATE
    const newChannel = newState.channel;
    if (newChannel.name.toLowerCase().includes("join to create")) {
      const personalVC = await newState.guild.channels.create({
        name: `${newState.member.user.username}'s VC`,
        type: ChannelType.GuildVoice,
        parent: newChannel.parentId,
        permissionOverwrites: [{ id: newState.guild.roles.everyone.id, allow: [PermissionsBitField.Flags.Connect] }],
      });
      tempVCs.set(userId, personalVC.id);
      await newState.member.voice.setChannel(personalVC);
      vcOwners.set(personalVC.id, userId);
    }

    // JOIN RANDOM
    if (newChannel.name.toLowerCase().includes("join random")) {
      const hub = newChannel.parent;
      if (!hub) return;
      const availableVCs = hub.children.filter((c) => c.type === ChannelType.GuildVoice && c.members.size < (c.userLimit || 99));
      if (availableVCs.size > 0) {
        const randomVC = availableVCs.random();
        await newState.member.voice.setChannel(randomVC);
      }
    }
  }

  // Leave VC
  if (oldState.channelId && !newState.channelId) {
    const joinTime = vcJoinTimestamps.get(userId);
    if (joinTime) {
      const diffMins = Math.floor((Date.now() - joinTime) / 60000);
      vcTime.set(userId, Math.min((vcTime.get(userId) || 0) + diffMins, 600));
      vcJoinTimestamps.delete(userId);
    }

    // Delete personal VC if temp and empty
    if (tempVCs.has(userId)) {
      const vcId = tempVCs.get(userId);
      const vcChannel = oldState.guild.channels.cache.get(vcId);
      if (vcChannel && vcChannel.members.size === 0) {
        // wait 5 seconds before deletion
        setTimeout(async () => {
          const ch = oldState.guild.channels.cache.get(vcId);
          if (ch && ch.members.size === 0) {
            await ch.delete().catch(() => null);
            tempVCs.delete(userId);
            vcOwners.delete(vcId);
          }
        }, 5000);
      }
    }
  }
});

// === VC CHAT TRACKING ===
client.on("messageCreate", (message) => {
  if (message.guild.id !== YOUR_GUILD_ID) return;
  if (!message.member.voice.channel) return;
  const userId = message.author.id;
  chatMsgs.set(userId, (chatMsgs.get(userId) || 0) + 1);
});

// === COMMAND HANDLER ===
client.on("messageCreate", async (message) => {
  if (message.guild.id !== YOUR_GUILD_ID) return;
  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();
  const userVC = message.member.voice.channel;

  // === VOICE MASTER COMMANDS ===
  if (cmd === "vc") {
    if (!userVC)
      return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription("Failed: You are not in a VC")] });

    const member = message.mentions.members.first();
    switch (args[0]) {
      case "lock":
        await userVC.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: false });
        return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription("Your VC is now locked")] });
      case "unlock":
        await userVC.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: true });
        return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription("Your VC is now unlocked")] });
      case "kick":
        if (!member || member.voice.channelId !== userVC.id)
          return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription("Failed: User not in your VC")] });
        member.voice.disconnect();
        return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription(`${member.user.username} was kicked from your VC`)] });
      case "ban":
        if (!member || member.voice.channelId !== userVC.id)
          return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription("Failed: User not in your VC")] });
        userVC.permissionOverwrites.edit(member.id, { Connect: false });
        return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription(`${member.user.username} was banned from your VC`)] });
      case "permit":
        if (!member) return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription("Failed: Mention a member")] });
        userVC.permissionOverwrites.edit(member.id, { Connect: true });
        return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription(`${member.user.username} can now join your VC`)] });
      case "limit":
        const limit = parseInt(args[1]);
        if (isNaN(limit) || limit < 1) return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription("Failed: Invalid number")] });
        userVC.setUserLimit(limit);
        return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription(`User limit set to ${limit}`)] });
      case "info":
        return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription(`Channel: ${userVC.name}\nMembers: ${userVC.members.size}\nLimit: ${userVC.userLimit || "None"}`)] });
      case "rename":
        const name = args.slice(1).join(" ");
        if (!name) return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription("Failed: Provide a new name")] });
        await userVC.setName(name);
        return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription(`VC renamed to ${name}`)] });
      case "transfer":
        if (!member) return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription("Failed: Mention a member")] });
        vcOwners.set(userVC.id, member.id);
        return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription(`${member.user.username} is now the owner of your VC`)] });
      case "unmute":
        await message.member.voice.setMute(false);
        return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription("You are now unmuted")] });
      case "hide":
        await userVC.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false });
        return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription("VC is now hidden")] });
      case "unhide":
        await userVC.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: true });
        return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription("VC is now visible")] });
    }
  }

  // === VM SETUP ===
  if (cmd === "vmsetup") {
    try {
      const guild = message.guild;
      const hubCategory = await guild.channels.create({ name: "Voice Master Hub", type: ChannelType.GuildCategory });
      const publicCategory = await guild.channels.create({ name: "Public VCs", type: ChannelType.GuildCategory });
      const privateCategory = await guild.channels.create({ name: "Private VCs", type: ChannelType.GuildCategory });

      await guild.channels.create({ name: "Join to Create", type: ChannelType.GuildVoice, parent: hubCategory.id });
      await guild.channels.create({ name: "Join Random VC", type: ChannelType.GuildVoice, parent: hubCategory.id });

      return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription("Voice Master system successfully setup!")] });
    } catch (err) {
      return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription(`Failed to setup Voice Master system: ${err.message}`)] });
    }
  }

  // === VM RESET ===
  if (cmd === "vmreset") {
    try {
      const guild = message.guild;
      const categories = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildCategory && ["Voice Master Hub", "Public VCs", "Private VCs"].includes(c.name)
      );
      for (const [, cat] of categories) await cat.delete().catch(() => null);

      vcTime.clear();
      chatMsgs.clear();
      vcOwners.clear();
      vcJoinTimestamps.clear();
      tempVCs.clear();

      return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription("Voice Master system has been reset!")] });
    } catch (err) {
      return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription(`Failed to reset Voice Master system: ${err.message}`)] });
    }
  }

  // === SET LB CHANNELS ===
  if (cmd === "set") {
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription("Failed: Mention a valid channel")] });
    if (args[0] === "vclb") {
      vclbChannelId = channel.id;
      return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription(`Voice LB channel set to ${channel}`)] });
    }
    if (args[0] === "chatlb") {
      chatlbChannelId = channel.id;
      return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription(`Chat LB channel set to ${channel}`)] });
    }
  }

  // === UPLOAD & REFRESH LBS ===
  if ((cmd === "upload" || cmd === "refresh") && args[0] === "lb") {
    if (!vclbChannelId && !chatlbChannelId)
      return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription("Failed: Set at least one leaderboard channel first")] });
    if (vclbChannelId) updateVoiceLeaderboard();
    if (chatlbChannelId) updateChatLeaderboard();
    return message.reply({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription(`${cmd === "upload" ? "Leaderboards uploaded" : "Leaderboards refreshed"} successfully`)] });
  }
});

// === AUTO UPDATE INTERVAL ===
setInterval(() => {
  if (vclbChannelId) updateVoiceLeaderboard();
  if (chatlbChannelId) updateChatLeaderboard();
}, 300000);

// === LOGIN ===
client.login(process.env.BOT_TOKEN);
