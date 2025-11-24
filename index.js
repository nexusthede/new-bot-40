require("./keep_alive"); // Keep-alive server

const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

// CONFIG
const PREFIX = ",";
const YOUR_GUILD_ID = "1441338778785419407";

// TRACKING
const vcTime = new Map();
const chatMsgs = new Map();
const vcJoinTimestamps = new Map();
const vcOwners = new Map();
const tempVCs = new Map();

let lbMessageId = null;
let vclbChannelId = null;
let chatlbChannelId = null;

let publicVCId = null;
let privateVCId = null;

// UTILITY FUNCTIONS
function formatLeaderboards() {
  const chatArr = [...chatMsgs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const vcArr = [...vcTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const medals = ["🥇", "🥈", "🥉"];
  let chatDesc = chatArr.map(([id, msgs], i) => `${i < 3 ? medals[i] + " " : ""}${i+1} — <@${id}> • ${msgs} messages`).join("\n") || "No messages yet";
  let vcDesc = vcArr.map(([id, mins], i) => `${i < 3 ? medals[i] + " " : ""}${i+1} — <@${id}> • ${mins} minutes`).join("\n") || "No VC activity yet";

  return new EmbedBuilder()
    .setColor("#00008B")
    .setAuthor({ name: "Server Leaderboards", iconURL: client.user.displayAvatarURL() })
    .setDescription(`**Chat Leaderboard**\n${chatDesc}\n\n**Voice Leaderboard**\n${vcDesc}`)
    .setFooter({ text: "Updates every 5 minutes" });
}

async function updateLeaderboards(channel) {
  if (!channel) return;
  try {
    if (lbMessageId) {
      const msg = await channel.messages.fetch(lbMessageId).catch(() => null);
      if (msg) return msg.edit({ embeds: [formatLeaderboards()] });
    }
    const newMsg = await channel.send({ embeds: [formatLeaderboards()] });
    lbMessageId = newMsg.id;
  } catch (err) { console.log("Failed to update LB:", err.message); }
}

// AUTO UPDATE EVERY 5 MINUTES
setInterval(() => {
  if (chatlbChannelId) updateLeaderboards(client.channels.cache.get(chatlbChannelId));
  if (vclbChannelId) updateLeaderboards(client.channels.cache.get(vclbChannelId));
}, 300000);

// VOICE STATE UPDATE
client.on("voiceStateUpdate", async (oldState, newState) => {
  if (newState.guild.id !== YOUR_GUILD_ID) return;
  const userId = newState.id;

  // JOIN VC
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

    // Join-Random
    if (newChannel.name.toLowerCase().includes("join random") && publicVCId) {
      const availableVCs = newState.guild.channels.cache
        .filter(c => c.parentId === publicVCId && c.type === ChannelType.GuildVoice && c.members.size < (c.userLimit || 99));
      if (availableVCs.size > 0) {
        const randomVC = availableVCs.random();
        await newState.member.voice.setChannel(randomVC);
      }
    }
  }

  // LEAVE VC
  if (oldState.channelId && !newState.channelId) {
    const joinTime = vcJoinTimestamps.get(userId);
    if (joinTime) {
      const diffMins = Math.floor((Date.now() - joinTime) / 60000);
      vcTime.set(userId, Math.min((vcTime.get(userId) || 0) + diffMins, 600));
      vcJoinTimestamps.delete(userId);
    }

    // DELETE TEMP VC IF EMPTY
    if (tempVCs.has(userId)) {
      const vcId = tempVCs.get(userId);
      const vcChannel = oldState.guild.channels.cache.get(vcId);
      if (vcChannel && vcChannel.members.size === 0) {
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

// MESSAGE TRACKING
client.on("messageCreate", (message) => {
  if (message.guild.id !== YOUR_GUILD_ID) return;
  const userId = message.author.id;
  chatMsgs.set(userId, (chatMsgs.get(userId) || 0) + 1);
});

// COMMAND HANDLER
client.on("messageCreate", async (message) => {
  if (message.guild.id !== YOUR_GUILD_ID) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  const embedSuccess = (desc) => ({ embeds: [new EmbedBuilder().setColor("#00008B").setDescription(desc)] });

  // VM SETUP
  if (cmd === "vmsetup") {
    const guild = message.guild;
    try {
      const hubCategory = await guild.channels.create({ name: "Voice Master Hub", type: ChannelType.GuildCategory });
      const publicCategory = await guild.channels.create({ name: "Public VCs", type: ChannelType.GuildCategory });
      const privateCategory = await guild.channels.create({ name: "Private VCs", type: ChannelType.GuildCategory });

      publicVCId = publicCategory.id;
      privateVCId = privateCategory.id;

      await guild.channels.create({ name: "Join to Create", type: ChannelType.GuildVoice, parent: hubCategory.id });
      await guild.channels.create({ name: "Join Random VC", type: ChannelType.GuildVoice, parent: hubCategory.id });

      return message.reply(embedSuccess("Voice Master system successfully setup!"));
    } catch (err) { return message.reply(embedSuccess(`Failed to setup Voice Master: ${err.message}`)); }
  }

  // VM RESET
  if (cmd === "vmreset") {
    const guild = message.guild;
    try {
      const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory && ["Voice Master Hub", "Public VCs", "Private VCs"].includes(c.name));
      for (const [, cat] of categories) {
        const children = cat.children;
        for (const [, ch] of children) await ch.delete().catch(() => null);
        await cat.delete().catch(() => null);
      }
      vcTime.clear(); chatMsgs.clear(); vcOwners.clear(); vcJoinTimestamps.clear(); tempVCs.clear();
      lbMessageId = null; publicVCId = null; privateVCId = null;
      return message.reply(embedSuccess("Voice Master system has been reset!"));
    } catch (err) { return message.reply(embedSuccess(`Failed to reset VM: ${err.message}`)); }
  }

  // SET LB CHANNELS
  if (cmd === "set") {
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply(embedSuccess("Failed: Mention a valid channel"));
    if (args[0] === "vclb") { vclbChannelId = channel.id; return message.reply(embedSuccess(`Voice LB channel set to ${channel}`)); }
    if (args[0] === "chatlb") { chatlbChannelId = channel.id; return message.reply(embedSuccess(`Chat LB channel set to ${channel}`)); }
  }

  // UPLOAD / REFRESH LBs
  if ((cmd === "upload" || cmd === "refresh") && args[0] === "lb") {
    if (!chatlbChannelId && !vclbChannelId) return message.reply(embedSuccess("Failed: Set at least one LB channel first"));
    if (chatlbChannelId) updateLeaderboards(client.channels.cache.get(chatlbChannelId));
    if (vclbChannelId) updateLeaderboards(client.channels.cache.get(vclbChannelId));
    return message.reply(embedSuccess(`${cmd === "upload" ? "Leaderboards uploaded" : "Leaderboards refreshed"} successfully`));
  }

  // VC COMMANDS HANDLER
  if (cmd === "vc") {
    const sub = args[0]?.toLowerCase();
    const member = message.member;
    const channel = member.voice.channel;
    if (!channel) return message.reply(embedSuccess("You must be in a voice channel to use VC commands."));

    // LOCK
    if (sub === "lock") {
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { Connect: false });
      if (privateVCId) await channel.setParent(privateVCId);
      return message.reply(embedSuccess("Channel locked and moved to Private VC category."));
    }

    // UNLOCK
    if (sub === "unlock") {
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { Connect: true });
      if (publicVCId) await channel.setParent(publicVCId);
      return message.reply(embedSuccess("Channel unlocked and moved to Public VC category."));
    }

    // KICK
    if (sub === "kick") {
      const target = message.mentions.members.first();
      if (!target || !channel.members.has(target.id)) return message.reply(embedSuccess("Target not found in your VC."));
      await target.voice.disconnect().catch(() => null);
      return message.reply(embedSuccess(`Kicked ${target.user.tag} from your VC.`));
    }

    // BAN (deny connect)
    if (sub === "ban") {
      const target = message.mentions.members.first();
      if (!target) return message.reply(embedSuccess("Mention a user to ban."));
      await channel.permissionOverwrites.edit(target.id, { Connect: false });
      if (channel.members.has(target.id)) await target.voice.disconnect().catch(() => null);
      return message.reply(embedSuccess(`Banned ${target.user.tag} from your VC.`));
    }

    // PERMIT
    if (sub === "permit") {
      const target = message.mentions.members.first();
      if (!target) return message.reply(embedSuccess("Mention a user to permit."));
      await channel.permissionOverwrites.edit(target.id, { Connect: true });
      return message.reply(embedSuccess(`Permitted ${target.user.tag} to join your VC.`));
    }

    // LIMIT
    if (sub === "limit") {
      const limit = parseInt(args[1]);
      if (isNaN(limit)) return message.reply(embedSuccess("Specify a valid number for user limit."));
      await channel.setUserLimit(limit);
      return message.reply(embedSuccess(`Channel user limit set to ${limit}.`));
    }

    // INFO
    if (sub === "info") {
      const members = channel.members.map(m => m.user.tag).join(", ") || "No members";
      return message.reply(embedSuccess(`Channel: ${channel.name}\nMembers: ${members}`));
    }

    // RENAME
    if (sub === "rename") {
      const name = args.slice(1).join(" ");
      if (!name) return message.reply(embedSuccess("Specify a new name."));
      await channel.setName(name);
      return message.reply(embedSuccess(`Channel renamed to ${name}.`));
    }

    // TRANSFER
    if (sub === "transfer") {
      const target = message.mentions.members.first();
      if (!target) return message.reply(embedSuccess("Mention a member to transfer ownership."));
      vcOwners.set(channel.id, target.id);
      return message.reply(embedSuccess(`Transferred VC ownership to ${target.user.tag}.`));
    }

    // UNMUTE
    if (sub === "unmute") {
      await member.voice.setMute(false);
      return message.reply(embedSuccess("You are now unmuted."));
    }

    // HIDE
    if (sub === "hide") {
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { ViewChannel: false });
      if (privateVCId) await channel.setParent(privateVCId);
      return message.reply(embedSuccess("Channel hidden and moved to Private VC category."));
    }

    // UNHIDE
    if (sub === "unhide") {
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { ViewChannel: true });
      if (publicVCId) await channel.setParent(publicVCId);
      return message.reply(embedSuccess("Channel unhidden and moved to Public VC category."));
    }
  }
});

client.login(process.env.BOT_TOKEN);
