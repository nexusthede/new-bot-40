const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require("discord.js");

module.exports = (client) => {

  const triggerChannelId = "1482460435180552414"; // Join-to-create VC
  const categoryId = "1480977750218248222";       // VoiceMaster category

  const vcOwners = new Map();
  const renamePending = new Map();

  client.on("voiceStateUpdate", async (oldState, newState) => {
    if (newState.channelId === triggerChannelId) {
      const guild = newState.guild;
      const member = newState.member;

      const channel = await guild.channels.create({
        name: `${member.user.username}'s channel`,
        type: 2,
        parent: categoryId,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak,
              PermissionsBitField.Flags.ManageChannels
            ]
          },
          {
            id: guild.roles.everyone.id,
            allow: [PermissionsBitField.Flags.Connect]
          }
        ]
      });

      member.voice.setChannel(channel);
      vcOwners.set(channel.id, member.id);

      // Auto-delete empty VCs
      const interval = setInterval(() => {
        if (!channel || channel.members.size === 0) {
          channel.delete().catch(() => {});
          vcOwners.delete(channel.id);
          clearInterval(interval);
        }
      }, 5000);
    }

    if (oldState.channelId) {
      const oldChannel = oldState.guild.channels.cache.get(oldState.channelId);
      if (oldChannel && oldChannel.parentId === categoryId && oldChannel.members.size === 0) {
        oldChannel.delete().catch(() => {});
        vcOwners.delete(oldChannel.id);
      }
    }
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(",")) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args[0].toLowerCase();

    if (command === "interface") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.channel.send({ embeds: [new EmbedBuilder().setDescription("You do not have permission to run this command.")] });
      }

      const embed = new EmbedBuilder()
        .setTitle("VoiceMaster Interface")
        .setDescription(
`Use the buttons below to manage your voice channel.

**Buttons**
<:vc_lock:1477309124537483439> - [Locks](https://discord.gg/3ytNyU2qtj) the voice channel
<:vc_unlock:1477309329433559203> - [Unlocks](https://discord.gg/3ytNyU2qtj) the voice channel
<:vc_hide:1477311897262096497> - [Hides](https://discord.gg/3ytNyU2qtj) the voice channel
<:vc_unhide:1477311594638606336> - [Reveals](https://discord.gg/3ytNyU2qtj) the voice channel
<:vc_rename:1477312271926431987> - [Renames](https://discord.gg/3ytNyU2qtj) the voice channel
<:vc_decrease:1477690349366280263> - [Decreases](https://discord.gg/3ytNyU2qtj) user limit
<:vc_increase:147769032683028080> - [Increases](https://discord.gg/3ytNyU2qtj) user limit
<:vc_info:1477312480463294628> - [Shows](https://discord.gg/3ytNyU2qtj) voice channel info
<:vc_kick:1477311772137619478> - [Kicks](https://discord.gg/3ytNyU2qtj) a user from the voice channel
<:vc_claim:1477559856394403942> - [Claims](https://discord.gg/3ytNyU2qtj) ownership of the voice channel`
        )
        .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL({ dynamic: true }) });

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("lock").setEmoji("1477309124537483439").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("unlock").setEmoji("1477309329433559203").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("hide").setEmoji("1477311897262096497").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("reveal").setEmoji("1477311594638606336").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("rename").setEmoji("1477312271926431987").setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("decrease").setEmoji("1477690349366280263").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("increase").setEmoji("147769032683028080").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("info").setEmoji("1477312480463294628").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("kick").setEmoji("1477311772137619478").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("claim").setEmoji("1477559856394403942").setStyle(ButtonStyle.Success)
      );

      return message.channel.send({ embeds: [embed], components: [row1, row2] });
    }

    if (renamePending.has(message.author.id)) {
      const vc = renamePending.get(message.author.id);
      if (!vc || !vc.editable) {
        renamePending.delete(message.author.id);
        return;
      }
      const newName = message.content.slice(0, 100);
      await vc.setName(newName).catch(() => {});
      renamePending.delete(message.author.id);
      return message.channel.send({ embeds: [new EmbedBuilder().setDescription(`Your **voice channel** has been **renamed to \`${newName}\`**.`)] });
    }

    const unknownEmbed = new EmbedBuilder().setDescription(`The command \`${command}\` is not recognized.`);
    message.channel.send({ embeds: [unknownEmbed] }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const member = interaction.member;
    const channel = member.voice.channel;
    if (!channel || channel.parentId !== categoryId) {
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription("You must be in a voice channel to use this.")], ephemeral: true });
    }

    const ownerId = vcOwners.get(channel.id);
    const isOwner = member.id === ownerId || member.permissions.has(PermissionsBitField.Flags.Administrator);
    const replyEmbed = (text) => new EmbedBuilder().setDescription(text);

    switch (interaction.customId) {
      case "lock":
        if (!isOwner) return interaction.reply({ embeds: [replyEmbed("You do not have permission to lock this voice channel.")], ephemeral: true });
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { Connect: false });
        return interaction.reply({ embeds: [replyEmbed("Your **voice channel** has been **locked**.")], ephemeral: true });

      case "unlock":
        if (!isOwner) return interaction.reply({ embeds: [replyEmbed("You do not have permission to unlock this voice channel.")], ephemeral: true });
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { Connect: true });
        return interaction.reply({ embeds: [replyEmbed("Your **voice channel** has been **unlocked**.")], ephemeral: true });

      case "hide":
        if (!isOwner) return interaction.reply({ embeds: [replyEmbed("You do not have permission to hide this voice channel.")], ephemeral: true });
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { ViewChannel: false });
        return interaction.reply({ embeds: [replyEmbed("Your **voice channel** has been **hidden**.")], ephemeral: true });

      case "reveal":
        if (!isOwner) return interaction.reply({ embeds: [replyEmbed("You do not have permission to reveal this voice channel.")], ephemeral: true });
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { ViewChannel: true });
        return interaction.reply({ embeds: [replyEmbed("Your **voice channel** has been **revealed**.")], ephemeral: true });

      case "rename":
        if (!isOwner) return interaction.reply({ embeds: [replyEmbed("You do not have permission to rename this voice channel.")], ephemeral: true });
        renamePending.set(member.id, channel);
        return interaction.reply({ embeds: [replyEmbed("Please type the new name in chat.")], ephemeral: true });

      case "increase":
        await channel.setUserLimit(channel.userLimit === 0 ? 1 : channel.userLimit + 1);
        return interaction.reply({ embeds: [replyEmbed(`User limit increased to **${channel.userLimit}**.`)], ephemeral: true });

      case "decrease":
        await channel.setUserLimit(channel.userLimit > 0 ? channel.userLimit - 1 : 0);
        return interaction.reply({ embeds: [replyEmbed(`User limit decreased to **${channel.userLimit}**.`)], ephemeral: true });

      case "info":
        return interaction.reply({ embeds: [replyEmbed(`Owner: <@${ownerId}>\nMembers: ${channel.members.size}\nLimit: ${channel.userLimit || "Unlimited"}`)], ephemeral: true });

      case "kick":
        return interaction.reply({ embeds: [replyEmbed("Kick functionality coming soon.")], ephemeral: true });

      case "claim":
        if (ownerId) return interaction.reply({ embeds: [replyEmbed("This voice channel already has an owner.")], ephemeral: true });
        vcOwners.set(channel.id, member.id);
        return interaction.reply({ embeds: [replyEmbed("You have claimed ownership of the voice channel.")], ephemeral: true });

      default:
        return interaction.reply({ embeds: [replyEmbed("Unknown action.")], ephemeral: true });
    }
  });

};
