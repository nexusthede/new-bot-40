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
const { Client, GatewayIntentBits, EmbedBuilder, ChannelType } = require("discord.js");
const fs = require("fs");

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
// PERSISTENCE
// --------------------
const DATA_FILE = "./data.json";
function loadData(){
    if(!fs.existsSync(DATA_FILE)) return {
        chatMsgs:{}, vcTime:{}, vcTiers:[], leaderboards:{
            chatLBChannelId:null, vcLBChannelId:null, chatLBMessageId:null, vcLBMessageId:null
        }
    };
    return JSON.parse(fs.readFileSync(DATA_FILE));
}
function saveData(){
    const data = {
        chatMsgs: Object.fromEntries(chatMsgs),
        vcTime: Object.fromEntries(vcTime),
        vcTiers,
        leaderboards
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data,null,2));
}

// --------------------
// TRACKING
// --------------------
const chatMsgs = new Map();
const vcTime = new Map();
const vcJoinTimestamps = new Map();
const tempVCs = new Map();
const vcOwners = new Map();

// Leaderboard and VC Tier info
let publicVCId = null;
let privateVCId = null;
let vcTiers = [];
let leaderboards = {
    chatLBChannelId: null,
    vcLBChannelId: null,
    chatLBMessageId: null,
    vcLBMessageId: null
};

// --------------------
// EMBED HELPER
// --------------------
const embedMsg = desc => new EmbedBuilder().setColor(darkBlue).setDescription(desc);

// --------------------
// LOAD DATA
// --------------------
const data = loadData();
chatMsgs.clear(); for(const [k,v] of Object.entries(data.chatMsgs)) chatMsgs.set(k,v);
vcTime.clear(); for(const [k,v] of Object.entries(data.vcTime)) vcTime.set(k,v);
vcTiers = data.vcTiers || [];
leaderboards = data.leaderboards || leaderboards;

// --------------------
// LEADERBOARDS
// --------------------
function buildChatLB(guild){
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

function buildVCLB(guild){
    const arr = [...vcTime.entries()]
        .filter(([id]) => guild.members.cache.has(id) && !guild.members.cache.get(id).user.bot)
        .sort((a,b)=>b[1]-a[1])
        .slice(0,10);
    const medals = ["🥇","🥈","🥉"];
    const desc = arr.map(([id,min],i)=>`${i<3?medals[i]+" ":""}${i+1} — <@${id}> • ${min} minutes`).join("\n") || "No VC activity yet";
    return new EmbedBuilder()
        .setColor(darkBlue)
        .setAuthor({ name:guild.name, iconURL:guild.iconURL({ dynamic:true }) })
        .setTitle("Voice Leaderboard")
        .setDescription(desc)
        .setFooter({ text: "Updates every 5 minutes" });
}

// --------------------
// UPDATE LEADERBOARD
// --------------------
async function updateLB(guild,type){
    const channelId = type==="chat"?leaderboards.chatLBChannelId:leaderboards.vcLBChannelId;
    if(!channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if(!channel) return;

    const embed = type==="chat"?buildChatLB(guild):buildVCLB(guild);
    const msgId = type==="chat"?leaderboards.chatLBMessageId:leaderboards.vcLBMessageId;

    if(msgId){
        const msg = await channel.messages.fetch(msgId).catch(()=>null);
        if(msg) return msg.edit({ embeds:[embed] }).catch(()=>null);
    }

    const newMsg = await channel.send({ embeds:[embed] }).catch(()=>null);
    if(!newMsg) return;
    if(type==="chat") leaderboards.chatLBMessageId = newMsg.id;
    else leaderboards.vcLBMessageId = newMsg.id;
    saveData();
}

// --------------------
// VC TIER SYSTEM
// --------------------
function canGetTier(member,tier){
    const userTime = vcTime.get(member.id)||0;
    if(userTime < tier.minTime) return false;
    if(tier.maxTier > 0){
        const count = vcTiers.filter(t=>member.roles.cache.has(t.roleId)).length;
        if(count >= tier.maxTier) return false;
    }
    return true;
}

async function updateUserTiers(member){
    for(const tier of vcTiers){
        if(canGetTier(member,tier) && !member.roles.cache.has(tier.roleId)){
            await member.roles.add(tier.roleId).catch(()=>null);
        }
    }
}

// --------------------
// BOT READY
// --------------------
client.on("ready",()=>{
    console.log(`${client.user.tag} is online`);
    setInterval(()=>{
        const guild = client.guilds.cache.get(YOUR_GUILD_ID);
        if(!guild) return;
        updateLB(guild,"chat");
        updateLB(guild,"voice");
    },300000);
});

// --------------------
// CHAT TRACKING
// --------------------
client.on("messageCreate", msg=>{
    if(msg.guild?.id!==YOUR_GUILD_ID || msg.author.bot) return;
    chatMsgs.set(msg.author.id,(chatMsgs.get(msg.author.id)||0)+1);
    saveData();
});

// --------------------
// VOICE TRACKING
// --------------------
client.on("voiceStateUpdate",async(oldState,newState)=>{
    if(newState.guild.id!==YOUR_GUILD_ID) return;
    const userId = newState.id;
    const guild = newState.guild;

    // JOIN VC
    if(!oldState.channelId && newState.channelId){
        vcJoinTimestamps.set(userId,Date.now());
        const newChannel = newState.channel;

        if(newChannel.name.toLowerCase().includes("join to create") && publicVCId){
            const vc = await guild.channels.create({ name:`${newState.member.user.username}'s VC`, type:ChannelType.GuildVoice, parent:publicVCId });
            tempVCs.set(userId,vc.id);
            vcOwners.set(vc.id,userId);
            await newState.member.voice.setChannel(vc);
        }

        if(newChannel.name.toLowerCase().includes("join random") && publicVCId){
            const available = guild.channels.cache.filter(c=>c.parentId===publicVCId && c.type===ChannelType.GuildVoice && c.members.size<(c.userLimit||99));
            if(available.size>0){
                await newState.member.voice.setChannel(available.random());
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
            saveData();
            const member = guild.members.cache.get(userId);
            if(member) updateUserTiers(member);
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

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    const channel = message.member.voice.channel;
    const successEmbed = desc=>({ embeds:[embedMsg(desc)] });

    // HELP
    if(cmd==="help"){
        const helpDesc = `
**VC Commands:**
• \`,vc lock\` — Lock your VC
• \`,vc unlock\` — Unlock your VC
• \`,vc hide\` — Hide your VC
• \`,vc unhide\` — Unhide your VC
• \`,vc kick @user\` — Kick a user
• \`,vc ban @user\` — Ban a user
• \`,vc permit @user\` — Permit a user
• \`,vc limit <number>\` — Set user limit
• \`,vc info\` — VC info
• \`,vc rename <name>\` — Rename your VC
• \`,vc transfer @user\` — Transfer ownership
• \`,vc unmute\` — Unmute yourself
        `;
        return message.reply(successEmbed(helpDesc));
    }

    // Voice Master Setup / Reset
    if(cmd==="vmsetup"){
        try{
            const hub = await message.guild.channels.create({ name:"Voice Master Hub", type:ChannelType.GuildCategory });
            const pub = await message.guild.channels.create({ name:"Public VCs", type:ChannelType.GuildCategory });
            const priv = await message.guild.channels.create({ name:"Private VCs", type:ChannelType.GuildCategory });
            publicVCId = pub.id; privateVCId = priv.id;

            await message.guild.channels.create({ name:"Join to Create", type:ChannelType.GuildVoice, parent:hub.id });
            await message.guild.channels.create({ name:"Join Random", type:ChannelType.GuildVoice, parent:hub.id });

            return message.reply(successEmbed("Voice Master system setup successfully."));
        }catch(e){ return message.reply(successEmbed("Failed to setup Voice Master.")); }
    }

    if(cmd==="vmreset"){
        try{
            const cats = message.guild.channels.cache.filter(c=>["Voice Master Hub","Public VCs","Private VCs"].includes(c.name));
            for(const [,cat] of cats){
                for(const [,ch] of cat.children.cache) await ch.delete().catch(()=>{});
                await cat.delete().catch(()=>{});
            }
            publicVCId=null; privateVCId=null;
            tempVCs.clear(); vcOwners.clear(); vcJoinTimestamps.clear();
            return message.reply(successEmbed("Voice Master system reset successfully."));
        }catch(e){ return message.reply(successEmbed("Failed to reset Voice Master.")); }
    }

    // Leaderboard Channels
    if(cmd==="set"){
        const ch = message.mentions.channels.first();
        if(!ch) return;
        if(args[0]==="chatlb"){ leaderboards.chatLBChannelId=ch.id; return message.reply(successEmbed(`Chat LB channel set to ${ch}`)); }
        if(args[0]==="vclb"){ leaderboards.vcLBChannelId=ch.id; return message.reply(successEmbed(`Voice LB channel set to ${ch}`)); }
        saveData();
    }

    if((cmd==="upload"||cmd==="refresh") && args[0]==="lb"){
        const guild = message.guild;
        if(leaderboards.chatLBChannelId) updateLB(guild,"chat");
        if(leaderboards.vcLBChannelId) updateLB(guild,"voice");
        return message.reply(successEmbed(`${cmd==="upload"?"Leaderboards uploaded":"Leaderboards refreshed"} successfully.`));
    }

    // VC commands
    if(cmd==="vc"){
        if(!channel) return message.reply(successEmbed("You must be in a voice channel."));
        const sub = args[0]?.toLowerCase();
        const target = message.mentions.members.first();
        const numArg = parseInt(args[1]);

        switch(sub){
            case "lock": { const everyone = channel.guild.roles.everyone; const owner = vcOwners.get(channel.id)||message.member.id; if(privateVCId && channel.parentId!==privateVCId) await channel.setParent(privateVCId).catch(()=>null); await new Promise(r=>setTimeout(r,250)); await channel.permissionOverwrites.edit(everyone,{Connect:false}); await channel.permissionOverwrites.edit(owner,{Connect:true}); return message.reply({embeds:[embedMsg("Your VC has been locked")]}); }
            case "unlock": { const everyone = channel.guild.roles.everyone; await channel.permissionOverwrites.edit(everyone,{Connect:true}); return message.reply({embeds:[embedMsg("Your VC has been unlocked")]}); }
            case "hide": { const everyone = channel.guild.roles.everyone; const owner = vcOwners.get(channel.id)||message.member.id; if(privateVCId && channel.parentId!==privateVCId) await channel.setParent(privateVCId).catch(()=>null); await new Promise(r=>setTimeout(r,250)); await channel.permissionOverwrites.edit(everyone,{ViewChannel:false}); await channel.permissionOverwrites.edit(owner,{ViewChannel:true}); return message.reply({embeds:[embedMsg("Your VC has been hidden")]}); }
            case "unhide": { const everyone = channel.guild.roles.everyone; await channel.permissionOverwrites.edit(everyone,{ViewChannel:true}); return message.reply({embeds:[embedMsg("Your VC has been unhidden")]}); }
            case "kick": if(!target || !channel.members.has(target.id)) return message.reply(successEmbed("User not in your VC")); await target.voice.disconnect().catch(()=>null); return message.reply(successEmbed(`Kicked ${target.user.tag}`)); 
            case "ban": if(!target) return message.reply(successEmbed("Mention a user to ban")); await channel.permissionOverwrites.edit(target.id,{Connect:false}); if(channel.members.has(target.id)) await target.voice.disconnect().catch(()=>null); return message.reply(successEmbed(`Banned ${target.user.tag}`)); 
            case "permit": if(!target) return message.reply(successEmbed("Mention a user to permit")); await channel.permissionOverwrites.edit(target.id,{Connect:true}); return message.reply(successEmbed(`Permitted ${target.user.tag}`));
            case "limit": if(isNaN(numArg)) return message.reply(successEmbed("Specify a valid number")); await channel.setUserLimit(numArg); return message.reply(successEmbed(`User limit set to ${numArg}`));
            case "info": return message.reply(successEmbed(`VC Name: ${channel.name}\nCategory: ${channel.parent?.name||"None"}\nMembers: ${channel.members.size}\nLimit: ${channel.userLimit||"None"}`));
            case "rename": if(!args[1]) return message.reply(successEmbed("Provide a new name")); await channel.setName(args.slice(1).join(" ")); return message.reply(successEmbed(`VC renamed to ${args.slice(1).join(" ")}`));
            case "transfer": if(!target) return message.reply(successEmbed("Mention a user to transfer ownership")); vcOwners.set(channel.id,target.id); return message.reply(successEmbed(`Transferred VC ownership to ${target.user.tag}`));
            case "unmute": await message.member.voice.setMute(false).catch(()=>null); return message.reply(successEmbed("You have been unmuted"));
        }
    }
});

client.login(process.env.BOT_TOKEN);
