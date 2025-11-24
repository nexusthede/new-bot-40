require("./keep_alive");

const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

const PREFIX = ",";
const YOUR_GUILD_ID = "1441338778785419407";

// Tracking
const vcTime = new Map();
const chatMsgs = new Map();
const vcJoinTimestamps = new Map();
const vcOwners = new Map();
const tempVCs = new Map();

// LB message IDs
let chatLBMessageId = null;
let vcLBMessageId = null;

// LB channel IDs
let chatLBChannelId = null;
let vcLBChannelId = null;

// VC category IDs
let publicVCId = null;
let privateVCId = null;

// Embed creator
const createEmbed = (desc) => new EmbedBuilder().setColor("#00008B").setDescription(desc);

// ---------------------
// LEADERBOARDS
// ---------------------
function formatChatLB() {
  const arr = [...chatMsgs.entries()].filter(([id]) => {
    const user = client.users.cache.get(id);
    return user && !user.bot;
  }).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const medals = ["🥇", "🥈", "🥉"];
  const description = arr.map(([id, count], i) => `${i < 3 ? medals[i]+" " : ""}${i+1} — <@${id}> • ${count} messages`).join("\n") || "No messages yet";

  return new EmbedBuilder()
    .setColor("#00008B")
    .setAuthor({ name: "Chat Leaderboard", iconURL: client.user.displayAvatarURL() })
    .setDescription(description)
    .setFooter({ text: "Updates every 5 minutes" });
}

function formatVoiceLB() {
  const arr = [...vcTime.entries()].filter(([id]) => {
    const user = client.users.cache.get(id);
    return user && !user.bot;
  }).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const medals = ["🥇", "🥈", "🥉"];
  const description = arr.map(([id, mins], i) => `${i < 3 ? medals[i]+" " : ""}${i+1} — <@${id}> • ${mins} minutes`).join("\n") || "No VC activity yet";

  return new EmbedBuilder()
    .setColor("#00008B")
    .setAuthor({ name: "Voice Leaderboard", iconURL: client.user.displayAvatarURL() })
    .setDescription(description)
    .setFooter({ text: "Updates every 5 minutes" });
}

// Update leaderboards
async function updateLeaderboard(channelId, type) {
  if (!channelId) return;
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;

  try {
    let msgId = type === "chat" ? chatLBMessageId : vcLBMessageId;
    const embed = type === "chat" ? formatChatLB() : formatVoiceLB();

    if (msgId) {
      const msg = await channel.messages.fetch(msgId).catch(() => null);
      if (msg) return msg.edit({ embeds: [embed] });
    }

    const newMsg = await channel.send({ embeds: [embed] });
    if (type === "chat") chatLBMessageId = newMsg.id;
    else vcLBMessageId = newMsg.id;
  } catch (err) {
    console.log("LB update error:", err.message);
  }
}

// Auto-update every 5 min
setInterval(() => {
  updateLeaderboard(chatLBChannelId, "chat");
  updateLeaderboard(vcLBChannelId, "voice");
}, 300000);

// ---------------------
// VOICE STATE UPDATE
// ---------------------
client.on("voiceStateUpdate", async (oldState, newState) => {
  if (newState.guild.id !== YOUR_GUILD_ID) return;
  const userId = newState.id;

  // Join VC
  if (!oldState.channelId && newState.channelId) {
    vcJoinTimestamps.set(userId, Date.now());
    const newChannel = newState.channel;

    // Join-to-Create
    if (newChannel.name.toLowerCase().includes("join to create") && publicVCId) {
      const personalVC = await newState.guild.channels.create({
        name: `${newState.member.user.username}'s VC`,
        type: ChannelType.GuildVoice,
        parent: publicVCId,
        permissionOverwrites: [{ id: newState.guild.roles.everyone.id, allow: [PermissionsBitField.Flags.Connect] }],
      });
      tempVCs.set(userId, personalVC.id);
      vcOwners.set(personalVC.id, userId);
      await newState.member.voice.setChannel(personalVC);
    }

    // Join-Random VC
    if (newChannel.name.toLowerCase().includes("join random") && publicVCId) {
      const availableVCs = newState.guild.channels.cache
        .filter(c => c.parentId === publicVCId && c.type === ChannelType.GuildVoice && c.members.size < (c.userLimit || 99));
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

    // Delete temp VC immediately if empty
    if (tempVCs.has(userId)) {
      const vcId = tempVCs.get(userId);
      const vcChannel = oldState.guild.channels.cache.get(vcId);
      if (vcChannel && vcChannel.members.size === 0) {
        await vcChannel.delete().catch(() => null);
        tempVCs.delete(userId);
        vcOwners.delete(vcId);
      }
    }
  }
});

// ---------------------
// MESSAGE TRACKING
// ---------------------
client.on("messageCreate", (message) => {
  if (message.guild.id !== YOUR_GUILD_ID || message.author.bot) return;
  chatMsgs.set(message.author.id, (chatMsgs.get(message.author.id) || 0) + 1);
});

// ---------------------
// COMMAND HANDLER
// ---------------------
client.on("messageCreate", async (message) => {
  if (message.guild.id !== YOUR_GUILD_ID || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  const embedSuccess = (desc) => ({ embeds: [createEmbed(desc)] });

  // VM Setup
  if (cmd === "vmsetup") {
    try {
      const guild = message.guild;
      const hubCategory = await guild.channels.create({ name: "Voice Master Hub", type: ChannelType.GuildCategory });
      const publicCategory = await guild.channels.create({ name: "Public VCs", type: ChannelType.GuildCategory });
      const privateCategory = await guild.channels.create({ name: "Private VCs", type: ChannelType.GuildCategory });

      publicVCId = publicCategory.id;
      privateVCId = privateCategory.id;

      await guild.channels.create({ name: "Join to Create", type: ChannelType.GuildVoice, parent: hubCategory.id });
      await guild.channels.create({ name: "Join Random VC", type: ChannelType.GuildVoice, parent: hubCategory.id });

      return message.reply(embedSuccess("Voice Master system successfully setup!"));
    } catch (err) {
      return message.reply(embedSuccess(`Failed to setup Voice Master: ${err.message}`));
    }
  }

  // VM Reset
  if (cmd === "vmreset") {
    try {
      const guild = message.guild;
      const categories = guild.channels.cache.filter(c =>
        c.type === ChannelType.GuildCategory &&
        ["Voice Master Hub", "Public VCs", "Private VCs"].includes(c.name)
      );

      for (const [, cat] of categories) {
        for (const [, ch] of cat.children) await ch.delete().catch(() => null);
        await cat.delete().catch(() => null);
      }

      tempVCs.clear();
      vcOwners.clear();
      vcTime.clear();
      chatMsgs.clear();
      vcJoinTimestamps.clear();
      chatLBMessageId = null;
      vcLBMessageId = null;
      publicVCId = null;
      privateVCId = null;

      return message.reply(embedSuccess("Voice Master system has been reset!"));
    } catch (err) {
      return message.reply(embedSuccess(`Failed to reset VM: ${err.message}`));
    }
  }

  // Set LB channels
  if (cmd === "set") {
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply(embedSuccess("Mention a valid channel"));
    if (args[0] === "chatlb") { chatLBChannelId = channel.id; return message.reply(embedSuccess(`Chat LB channel set to ${channel}`)); }
    if (args[0] === "vclb") { vcLBChannelId = channel.id; return message.reply(embedSuccess(`Voice LB channel set to ${channel}`)); }
  }

  // Upload/Refresh LB
  if ((cmd === "upload" || cmd === "refresh") && args[0] === "lb") {
    if (!chatLBChannelId && !vcLBChannelId) return message.reply(embedSuccess("Set at least one LB channel first"));
    if (chatLBChannelId) updateLeaderboard(chatLBChannelId, "chat");
    if (vcLBChannelId) updateLeaderboard(vcLBChannelId, "voice");
    return message.reply(embedSuccess(`${cmd === "upload" ? "Leaderboards uploaded" : "Leaderboards refreshed"} successfully`));
  }

  // ---------------------
  // VC Commands
  // ---------------------
  if (cmd === "vc") {
    const sub = args[0]?.toLowerCase();
    const member = message.member;
    const channel = member.voice.channel;
    if (!channel) return message.reply(embedSuccess("You must be in a voice channel to use VC commands."));

    const target = message.mentions.members.first();
    const numArg = parseInt(args[1]);

    switch (sub) {
      case "lock":
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { Connect: false });
        if (privateVCId) await channel.setParent(privateVCId);
        return message.reply(embedSuccess("Your VC has been locked ✅"));

      case "unlock":
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { Connect: true });
        if (publicVCId) await channel.setParent(publicVCId);
        return message.reply(embedSuccess("Your VC has been unlocked ✅"));

      case "hide":
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { ViewChannel: false });
        if (privateVCId) await channel.setParent(privateVCId);
        return message.reply(embedSuccess("Your VC has been hidden ✅"));

      case "unhide":
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { ViewChannel: true });
        if (publicVCId) await channel.setParent(publicVCId);
        return message.reply(embedSuccess("Your VC has been unhidden ✅"));

      case "kick":
        if (!target || !channel.members.has(target.id)) return message.reply(embedSuccess("Target not in your VC"));
        await target.voice.disconnect().catch(() => null);
        return message.reply(embedSuccess(`Kicked ${target.user.tag} from your VC`));

      case "ban":
        if (!target) return message.reply(embedSuccess("Mention a user to ban"));
        await channel.permissionOverwrites.edit(target.id, { Connect: false });
        if (channel.members.has(target.id)) await target.voice.disconnect().catch(() => null);
        return message.reply(embedSuccess(`Banned ${target.user.tag} from your VC`));

      case "permit":
        if (!target) return message.reply(embedSuccess("Mention a user to permit"));
        await channel.permissionOverwrites.edit(target.id, { Connect: true });
        return message.reply(embedSuccess(`Permitted ${target.user.tag} to join your VC`));

      case "limit":
        if (isNaN(numArg)) return message.reply(embedSuccess("Specify a valid number for limit"));
        await channel.setUserLimit(numArg);
        return message.reply(embedSuccess(`Set user limit to ${numArg}`));

      case "info":
        const members = channel.members.map(m => m.user.tag).join(", ") || "No members";
        return message.reply(embedSuccess(`Channel: ${channel.name}\nMembers: ${members}`));

      case "rename":
        const name = args.slice(1).join(" ");
        if (!name) return message.reply(embedSuccess("Specify a new name"));
        await channel.setName(name);
        return message.reply(embedSuccess(`Channel renamed to ${name}`));

      case "transfer":
        if (!target) return message.reply(embedSuccess("Mention a user to transfer ownership"));
        vcOwners.set(channel.id, target.id);
        return message.reply(embedSuccess(`Transferred ownership to ${target.user.tag}`));

      case "unmute":
        await member.voice.setMute(false);
        return message.reply(embedSuccess("You are now unmuted"));

      default:
        return;
    }
  }
});

client.login(process.env.BOT_TOKEN);
