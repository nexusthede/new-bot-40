const { EmbedBuilder } = require("discord.js");
const config = require("./config.json");

module.exports = (client) => {
  const joinChannelId = "1482457937472651497";       // Embed welcome
  const generalChannelId = "1478295508593283123";    // Quick text welcome

  client.on("guildMemberAdd", async (member) => {
    const joinChannel = member.guild.channels.cache.get(joinChannelId);
    const generalChannel = member.guild.channels.cache.get(generalChannelId);
    const randomColor = Math.floor(Math.random() * 16777215);

    // Compact welcome embed (no emojis)
    if (joinChannel) {
      const embed = new EmbedBuilder()
        .setAuthor({
          name: member.guild.name,
          iconURL: member.guild.iconURL({ dynamic: true })
        })
        .setDescription(`Welcome ${member}
to **${member.guild.name}**

You are member **#${member.guild.memberCount}**`)
        .setColor(randomColor);

      joinChannel.send({ embeds: [embed] });
    }

    // Quick text welcome (no embed, no emojis)
    if (generalChannel) {
      generalChannel.send(`welc ${member}, enjoy your stay`);
    }
  });

  // Test command
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);

    if (args[0] === "test" && args[1] === "welcome") {
      const member = message.member;
      const joinChannel = message.guild.channels.cache.get(joinChannelId);
      const generalChannel = message.guild.channels.cache.get(generalChannelId);
      const randomColor = Math.floor(Math.random() * 16777215);

      if (joinChannel) {
        const embed = new EmbedBuilder()
          .setAuthor({
            name: message.guild.name,
            iconURL: message.guild.iconURL({ dynamic: true })
          })
          .setDescription(`Welcome ${member}
to **${message.guild.name}**

You are member **#${message.guild.memberCount}**`)
          .setColor(randomColor);

        joinChannel.send({ embeds: [embed] });
      }

      if (generalChannel) {
        generalChannel.send(`welc ${member}, enjoy your stay`);
      }
    }
  });
};
