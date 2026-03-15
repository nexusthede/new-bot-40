const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  PermissionsBitField 
} = require("discord.js");

module.exports = (client) => {

  // Command handler
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const prefix = ",";
    if (!message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Interface command
    if (command === "interface") {
      // Embed with your custom design
      const embed = new EmbedBuilder()
        .setTitle("VoiceMaster Interface")
        .setAuthor({ 
          name: message.guild.name, 
          iconURL: message.guild.iconURL({ dynamic: true }) 
        })
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
        );

      // Buttons row 1
      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("lock").setEmoji("1477309124537483439").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("unlock").setEmoji("1477309329433559203").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("hide").setEmoji("1477311897262096497").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("reveal").setEmoji("1477311594638606336").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("rename").setEmoji("1477312271926431987").setStyle(ButtonStyle.Secondary)
      );

      // Buttons row 2
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("decrease").setEmoji("1477690349366280263").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("increase").setEmoji("147769032683028080").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("info").setEmoji("1477312480463294628").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("kick").setEmoji("1477311772137619478").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("claim").setEmoji("1477559856394403942").setStyle(ButtonStyle.Success)
      );

      // Send embed in the channel so everyone can see and use
      message.channel.send({ embeds: [embed], components: [row1, row2] });
    }
  });

  // Interaction handler for buttons
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const member = interaction.member;
    const voiceChannel = member.voice.channel;

    // Restrict actions to VC owners or admins
    if (!voiceChannel || (voiceChannel.ownerId && voiceChannel.ownerId !== member.id && !member.permissions.has(PermissionsBitField.Flags.Administrator))) {
      return interaction.reply({ content: "You do not have permission to manage this voice channel.", ephemeral: true });
    }

    switch (interaction.customId) {
      case "lock":
        voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
        await interaction.reply({ content: "**Your voice channel has been locked.**", ephemeral: true });
        break;
      case "unlock":
        voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: true });
        await interaction.reply({ content: "**Your voice channel has been unlocked.**", ephemeral: true });
        break;
      case "hide":
        voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
        await interaction.reply({ content: "**Your voice channel has been hidden.**", ephemeral: true });
        break;
      case "reveal":
        voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: true });
        await interaction.reply({ content: "**Your voice channel is now visible.**", ephemeral: true });
        break;
      case "rename":
        await interaction.reply({ content: "Type the new name of your voice channel:", ephemeral: true });
        // Handle rename in message collector separately
        break;
      case "decrease":
        voiceChannel.setUserLimit(Math.max(0, voiceChannel.userLimit - 1));
        await interaction.reply({ content: "**Voice channel user limit decreased.**", ephemeral: true });
        break;
      case "increase":
        voiceChannel.setUserLimit(voiceChannel.userLimit + 1);
        await interaction.reply({ content: "**Voice channel user limit increased.**", ephemeral: true });
        break;
      case "info":
        await interaction.reply({ content: `**Voice Channel Info:** Name: ${voiceChannel.name}, Users: ${voiceChannel.members.size}, Limit: ${voiceChannel.userLimit}`, ephemeral: true });
        break;
      case "kick":
        // Kicking a member can be implemented here
        await interaction.reply({ content: "**Use Discord to manually remove members.**", ephemeral: true });
        break;
      case "claim":
        voiceChannel.ownerId = member.id;
        await interaction.reply({ content: "**You claimed ownership of this voice channel.**", ephemeral: true });
        break;
      default:
        await interaction.reply({ content: "Unknown action.", ephemeral: true });
        break;
    }
  });
};
