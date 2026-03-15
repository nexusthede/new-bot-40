const { Client, GatewayIntentBits } = require("discord.js");
const welcome = require("./welcome");
const config = require("./config.json");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Lock bot to only your server
const allowedServer = "1449708401050259457";

// Load welcome system
welcome(client);

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Leave all servers except your server
  client.guilds.cache.forEach(guild => {
    if (guild.id !== allowedServer) {
      console.log(`❌ Leaving unauthorized server: ${guild.name}`);
      guild.leave();
    }
  });
});

// Leave any new server automatically if not yours
client.on("guildCreate", guild => {
  if (guild.id !== allowedServer) {
    console.log(`❌ Joined unauthorized server: ${guild.name}`);
    guild.leave();
  }
});

// Login with Render TOKEN
client.login(process.env.TOKEN);
