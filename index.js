// --------------------
// KEEP ALIVE
// --------------------
const express = require("express");
const app = express();
app.get("/", (req, res) => res.send("Bot is alive!"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Keep-alive running on port ${PORT}`));

// --------------------
// DISCORD SETUP
// --------------------
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType } = require("discord.js");
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

const PREFIX = ",";
const YOUR_GUILD_ID = "1441338778785419407";
const darkBlue = "#00008B";

// --------------------
// TRACKING
// --------------------
const chatMsgs = new Map();
const vcTime = new Map();
const vcJoinTimestamps = new Map();
const tempVCs = new Map();
const vcOwners = new Map();

let chatLBChannelId = null;
let vcLBChannelId = null;
let chatLBMessageId = null;
let vcLBMessageId = null;
let publicVCId = null;
let privateVCId = null;

// --------------------
// EMBED HELPERS
// --------------------
const embedMsg = (desc) => new EmbedBuilder().setColor(darkBlue).setDescription(desc);

// --------------------
// LEADERBOARDS
// --------------------
function buildChatLB(guild) {
    const arr = [...chatMsgs.entries()]
        .filter(([id]) => guild.members.cache.has(id) && !guild.members.cache.get(id).user.bot)
        .sort((a,b) => b[1]-a[1])
        .slice(0,10);
    const medals = ["🥇","🥈","🥉"];
    const desc = arr.map(([id,count],i) => `${i<3?medals[i]+" ":""}${i+1} — <@${id}> • ${count} messages`).join("\n") || "No messages yet";
    return new EmbedBuilder()
        .setColor(darkBlue)
        .setAuthor({ name:guild.name, iconURL:guild.iconURL({ dynamic:true }) })
        .setTitle("Chat Leaderboard")
        .setDescription(desc)
        .setFooter({ text: "Updates every 5 minutes" });
}

function buildVCLB(guild) {
    const arr = [...vcTime.entries()]
        .filter(([id]) => guild.members.cache.has(id) && !guild.members.cache.get(id).user.bot)
        .sort((a,b)=>b[1]-a[1])
        .slice(0,10);
    const medals = ["🥇","🥈","🥉"];
    const desc = arr.map(([id,min],i) => `${i<3?medals[i]+" ":""}${i+1} — <@${id}> • ${min} minutes`).join("\n") || "No VC activity yet";
    return new EmbedBuilder()
        .setColor(darkBlue)
        .setAuthor({ name:guild.name, iconURL:guild.iconURL({ dynamic:true }) })
        .setTitle("Voice Leaderboard")
        .setDescription(desc)
        .setFooter({ text: "Updates every 5 minutes" });
}

// AUTO UPDATE
setInterval(()=>{
    const guild = client.guilds.cache.get(YOUR_GUILD_ID);
    if(!guild) return;
    updateLB(guild,"chat");
    updateLB(guild,"voice");
},300000);

async function updateLB(guild,type){
    const channelId = type==="chat"?chatLBChannelId:vcLBChannelId;
    if(!channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if(!channel) return;
    const embed = type==="chat"?buildChatLB(guild):buildVCLB(guild);
    try{
        let msgId = type==="chat"?chatLBMessageId:vcLBMessageId;
        if(msgId){
            const msg = await channel.messages.fetch(msgId).catch(()=>null);
            if(msg) return msg.edit({ embeds:[embed] });
        }
        const newMsg = await channel.send({ embeds:[embed] });
        if(type==="chat") chatLBMessageId=newMsg.id;
        else vcLBMessageId=newMsg.id;
    }catch(err){ console.log("LB update error:",err.message); }
}

// --------------------
// CHAT TRACKING
// --------------------
client.on("messageCreate", msg=>{
    if(msg.guild?.id!==YOUR_GUILD_ID || msg.author.bot) return;
    chatMsgs.set(msg.author.id,(chatMsgs.get(msg.author.id)||0)+1);
});

// --------------------
// VOICE TRACKING
// --------------------
client.on("voiceStateUpdate", async(oldState,newState)=>{
    if(newState.guild.id!==YOUR_GUILD_ID) return;
    const userId = newState.id;
    const guild = newState.guild;

    // JOIN VC
    if(!oldState.channelId && newState.channelId){
        vcJoinTimestamps.set(userId,Date.now());
        const newChannel = newState.channel;

        // join-to-create
        if(newChannel.name.toLowerCase().includes("join to create") && publicVCId){
            const vc = await guild.channels.create({
                name:`${newState.member.user.username}'s VC`,
                type:ChannelType.GuildVoice,
                parent:publicVCId
            });
            tempVCs.set(userId,vc.id);
            vcOwners.set(vc.id,userId);
            await newState.member.voice.setChannel(vc);
        }

        // join random
        if(newChannel.name.toLowerCase().includes("join random") && publicVCId){
            const available = guild.channels.cache.filter(c=>c.parentId===publicVCId && c.type===ChannelType.GuildVoice && c.members.size<(c.userLimit||99));
            if(available.size>0){
                const randomVC = available.random();
                await newState.member.voice.setChannel(randomVC);
            }
        }
    }

    // LEAVE VC
    if(oldState.channelId && !newState.channelId){
        const joinTime = vcJoinTimestamps.get(userId);
        if(joinTime){
            const mins = Math.floor((Date.now()-joinTime)/60000);
            vcTime.set(userId,(vcTime.get(userId)||0)+mins);
            vcJoinTimestamps.delete(userId);
        }

        if(tempVCs.has(userId)){
            const vcId = tempVCs.get(userId);
            const vc = guild.channels.cache.get(vcId);
            if(vc && vc.members.size===0){
                await vc.delete().catch(()=>null);
                tempVCs.delete(userId);
                vcOwners.delete(vcId);
            }
        }
    }
});

// --------------------
// COMMANDS
// --------------------
client.on("messageCreate", async message=>{
    if(!message.guild || message.guild.id!==YOUR_GUILD_ID) return;
    if(!message.content.startsWith(PREFIX)) return;

    const guild = message.guild;
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    const channel = message.member.voice.channel;
    const successEmbed = desc=>({ embeds:[embedMsg(desc)] });

    // VM SETUP
    if(cmd==="vmsetup"){
        try{
            const hub = await guild.channels.create({ name:"Voice Master Hub", type:ChannelType.GuildCategory });
            const pub = await guild.channels.create({ name:"Public VCs", type:ChannelType.GuildCategory });
            const priv = await guild.channels.create({ name:"Private VCs", type:ChannelType.GuildCategory });
            publicVCId = pub.id; privateVCId = priv.id;

            await guild.channels.create({ name:"Join to Create", type:ChannelType.GuildVoice, parent:hub.id });
            await guild.channels.create({ name:"Join Random", type:ChannelType.GuildVoice, parent:hub.id });

            return message.reply(successEmbed("Voice Master system successfully setup."));
        }catch(e){
            return message.reply(successEmbed("Failed to setup Voice Master."));
        }
    }

    // VM RESET
    if(cmd==="vmreset"){
        try{
            const cats = guild.channels.cache.filter(c=>["Voice Master Hub","Public VCs","Private VCs"].includes(c.name));
            for(const [,cat] of cats){
                for(const [,ch] of cat.children.cache) await ch.delete().catch(()=>{});
                await cat.delete().catch(()=>{});
            }
            publicVCId=null; privateVCId=null;
            tempVCs.clear(); vcOwners.clear(); vcJoinTimestamps.clear();
            return message.reply(successEmbed("Voice Master system has been reset successfully."));
        }catch(e){
            return message.reply(successEmbed("Failed to reset Voice Master."));
        }
    }

    // SET LB
    if(cmd==="set"){
        const ch = message.mentions.channels.first();
        if(!ch) return;
        if(args[0]==="chatlb"){ chatLBChannelId=ch.id; return message.reply(successEmbed(`Chat LB channel set to ${ch}`)); }
        if(args[0]==="vclb"){ vcLBChannelId=ch.id; return message.reply(successEmbed(`Voice LB channel set to ${ch}`)); }
    }

    // UPLOAD / REFRESH LB
    if((cmd==="upload"||cmd==="refresh") && args[0]==="lb"){
        if(chatLBChannelId) updateLB(guild,"chat");
        if(vcLBChannelId) updateLB(guild,"voice");
        return message.reply(successEmbed(`${cmd==="upload"?"Leaderboards uploaded":"Leaderboards refreshed"} successfully.`));
    }

    // VC COMMANDS
    if(cmd==="vc"){
        if(!channel) return message.reply(successEmbed("You must be in a voice channel."));
        const sub = args[0]?.toLowerCase();
        const target = message.mentions.members.first();
        const numArg = parseInt(args[1]);

        switch(sub){
            case "lock":
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone,{ Connect:false });
                if(privateVCId && channel.parentId!==privateVCId) await channel.setParent(privateVCId);
                return message.reply(successEmbed("Your VC has been locked"));
            case "unlock":
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone,{ Connect:true });
                return message.reply(successEmbed("Your VC has been unlocked"));
            case "hide":
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone,{ ViewChannel:false });
                if(privateVCId && channel.parentId!==privateVCId) await channel.setParent(privateVCId);
                return message.reply(successEmbed("Your VC has been hidden"));
            case "unhide":
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone,{ ViewChannel:true });
                return message.reply(successEmbed("Your VC has been unhidden"));
            case "kick":
                if(!target || !channel.members.has(target.id)) return message.reply(successEmbed("User not in your VC"));
                await target.voice.disconnect().catch(()=>null);
                return message.reply(successEmbed(`Kicked ${target.user.tag}`));
            case "ban":
                if(!target) return message.reply(successEmbed("Mention a user to ban"));
                await channel.permissionOverwrites.edit(target.id,{ Connect:false });
                if(channel.members.has(target.id)) await target.voice.disconnect().catch(()=>null);
                return message.reply(successEmbed(`Banned ${target.user.tag}`));
            case "permit":
                if(!target) return message.reply(successEmbed("Mention a user to permit"));
                await channel.permissionOverwrites.edit(target.id,{ Connect:true });
                return message.reply(successEmbed(`Permitted ${target.user.tag}`));
            case "limit":
                if(isNaN(numArg)) return message.reply(successEmbed("Specify a valid number"));
                await channel.setUserLimit(numArg);
                return message.reply(successEmbed(`User limit set to ${numArg}`));
            case "info":
                const members = channel.members.map(m=>m.user.tag).join(", ")||"No members";
                return message.reply(successEmbed(`Channel: ${channel.name}\nMembers: ${members}`));
            case "rename":
                const name = args.slice(1).join(" ");
                if(!name) return message.reply(successEmbed("Specify a new name"));
                await channel.setName(name);
                return message.reply(successEmbed(`Channel renamed to ${name}`));
            case "transfer":
                if(!target) return message.reply(successEmbed("Mention a user"));
                vcOwners.set(channel.id,target.id);
                return message.reply(successEmbed(`Ownership transferred to ${target.user.tag}`));
            case "unmute":
                await message.member.voice.setMute(false);
                return message.reply(successEmbed("You are now unmuted"));
        }
    }
});

client.login(process.env.BOT_TOKEN);
