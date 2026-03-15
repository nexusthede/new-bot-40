const { Client, GatewayIntentBits } = require("discord.js");
const welcome = require("./welcome");
const VoiceMaster = require("./VoiceMaster");
const config = require("./config.json");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

// Lock bot to only your server
const allowedServer = "1449708401050259457";

// Load systems
welcome(client);
VoiceMaster(client);

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Leave all servers except your server
  client.guilds.cache.forEach(guild => {
    if (guild.id !== allowedServer) {
      console.log(`❌ Leaving unauthorized server: ${guild.name}`);
      guild.leave().catch(console.error);
    }
  });
});

// Leave any new server automatically if not yours
client.on("guildCreate", guild => {
  if (guild.id !== allowedServer) {
    console.log(`❌ Joined unauthorized server: ${guild.name}`);
    guild.leave().catch(console.error);
  }
});

// Minimal web server to satisfy Render’s Web Service port requirement
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Bot is running ✅"));
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// Login with Render TOKEN
client.login(process.env.TOKEN);
