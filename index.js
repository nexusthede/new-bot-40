// --------------------
// KEEP ALIVE
// --------------------
const express = require("express");
const fs = require("fs");
const app = express();
app.get("/", (req, res) => res.send("Bot is alive!"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Keep-alive running on port ${PORT}`));

// --------------------
// DISCORD SETUP
// --------------------
const { Client, GatewayIntentBits, EmbedBuilder, ChannelType } = require("discord.js");
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
// DATA HANDLING
// --------------------
let data = {
    chatMsgs: {},
    vcTime: {},
    vcTiers: [],
    leaderboards: {
        chatLBChannelId: null,
        vcLBChannelId: null,
        chatLBMessageId: null,
        vcLBMessageId: null
    }
};

// Load data.json if exists
if(fs.existsSync("./data.json")){
    const raw = fs.readFileSync("./data.json");
    data = JSON.parse(raw);
}

const chatMsgs = new Map(Object.entries(data.chatMsgs));
const vcTime = new Map(Object.entries(data.vcTime));
let vcTiers = data.vcTiers;
let chatLBChannelId = data.leaderboards.chatLBChannelId;
let vcLBChannelId = data.leaderboards.vcLBChannelId;
let chatLBMessageId = data.leaderboards.chatLBMessageId;
let vcLBMessageId = data.leaderboards.vcLBMessageId;

let vcJoinTimestamps = new Map();
let tempVCs = new Map();
let vcOwners = new Map();
let publicVCId = null;
let privateVCId = null;

// --------------------
// SAVE DATA FUNCTION
// --------------------
function saveData(){
    data.chatMsgs = Object.fromEntries(chatMsgs);
    data.vcTime = Object.fromEntries(vcTime);
    data.vcTiers = vcTiers;
    data.leaderboards.chatLBChannelId = chatLBChannelId;
    data.leaderboards.vcLBChannelId = vcLBChannelId;
    data.leaderboards.chatLBMessageId = chatLBMessageId;
    data.leaderboards.vcLBMessageId = vcLBMessageId;
    fs.writeFileSync("./data.json", JSON.stringify(data, null, 4));
}

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
    const desc = arr.map(([id,count],i) => `${i+1} — <@${id}> • ${count} messages`).join("\n") || "No messages yet";
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
    const desc = arr.map(([id,min],i) => `${i+1} — <@${id}> • ${min} minutes`).join("\n") || "No VC activity yet";
    return new EmbedBuilder()
        .setColor(darkBlue)
        .setAuthor({ name:guild.name, iconURL:guild.iconURL({ dynamic:true }) })
        .setTitle("Voice Leaderboard")
        .setDescription(desc)
        .setFooter({ text: "Updates every 5 minutes" });
}

// --------------------
// AUTO UPDATE
// --------------------
async function updateLB(guild, type){
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
        saveData();
    }catch(err){ console.log("LB update error:",err.message); }
}

setInterval(()=>{
    const guild = client.guilds.cache.get(YOUR_GUILD_ID);
    if(!guild) return;
    updateLB(guild,"chat");
    updateLB(guild,"voice");
},300000);

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
client.on("voiceStateUpdate", async(oldState,newState)=>{
    if(newState.guild.id!==YOUR_GUILD_ID) return;
    const userId = newState.id;
    const guild = newState.guild;
    const member = newState.guild.members.cache.get(userId);

    // JOIN VC
    if(!oldState.channelId && newState.channelId){
        vcJoinTimestamps.set(userId,Date.now());
        const newChannel = newState.channel;

        // Voice Master Join-To-Create
        if(newChannel.name.toLowerCase().includes("join to create") && publicVCId){
            const vc = await guild.channels.create({
                name:`${member.user.username}'s VC`,
                type:ChannelType.GuildVoice,
                parent:publicVCId
            });
            tempVCs.set(userId,vc.id);
            vcOwners.set(vc.id,userId);
            await member.voice.setChannel(vc);
        }

        // Voice Master Join Random
        if(newChannel.name.toLowerCase().includes("join random") && publicVCId){
            const available = guild.channels.cache.filter(c=>c.parentId===publicVCId && c.type===ChannelType.GuildVoice && c.members.size<(c.userLimit||99));
            if(available.size>0){
                const randomVC = available.random();
                await member.voice.setChannel(randomVC);
            }
        }
    }

    // LEAVE VC
    if(oldState.channelId && !newState.channelId){
        const joinTime = vcJoinTimestamps.get(userId);
        if(joinTime){
            const mins = Math.floor((Date.now()-joinTime)/60000);
            vcTime.set(userId,(vcTime.get(userId)||0)+mins);
            saveData();
            vcJoinTimestamps.delete(userId);
        }

        // Handle automatic VC tiers
        if(member){
            for(const tier of vcTiers){
                if(vcTime.get(userId) >= tier.minutes && !member.roles.cache.has(tier.roleId)){
                    await member.roles.add(tier.roleId).catch(()=>null);
                } else if(vcTime.get(userId) < tier.minutes && member.roles.cache.has(tier.roleId)){
                    await member.roles.remove(tier.roleId).catch(()=>null);
                }
            }
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

    // --------------------
    // HELP
    if(cmd==="help"){
        return message.reply({ embeds:[embedMsg(
            "**Voice Master Commands:**\n"+
            ",vmsetup\n"+
            ",vmreset\n"+
            ",vc lock/unlock/hide/unhide/kick/ban/permit/limit/info/rename/transfer/unmute\n"+
            ",set #channel chatlb / vclb\n"+
            ",upload lb / refresh lb"
        )]});
    }

    // --------------------
    // VOICE MASTER SETUP
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

    if(cmd==="set"){
        const ch = message.mentions.channels.first();
        if(!ch) return;
        if(args[0]==="chatlb"){ chatLBChannelId=ch.id; saveData(); return message.reply(successEmbed(`Chat LB channel set to ${ch}`)); }
        if(args[0]==="vclb"){ vcLBChannelId=ch.id; saveData(); return message.reply(successEmbed(`Voice LB channel set to ${ch}`)); }
    }

    if((cmd==="upload"||cmd==="refresh") && args[0]==="lb"){
        if(chatLBChannelId) updateLB(guild,"chat");
        if(vcLBChannelId) updateLB(guild,"voice");
        return message.reply(successEmbed(`${cmd==="upload"?"Leaderboards uploaded":"Leaderboards refreshed"} successfully.`));
    }

    // --------------------
    // VC COMMANDS
    if(cmd==="vc"){
        if(!channel) return message.reply(successEmbed("You must be in a voice channel."));
        const sub = args[0]?.toLowerCase();
        const target = message.mentions.members.first();
        const numArg = parseInt(args[1]);

        switch(sub){
            case "lock":
                {
                    const everyoneRole = channel.guild.roles.everyone;
                    const ownerId = vcOwners.get(channel.id) || message.member.id;

                    if(privateVCId && channel.parentId !== privateVCId) await channel.setParent(privateVCId).catch(()=>null);
                    await new Promise(res=>setTimeout(res,250));

                    await channel.permissionOverwrites.edit(everyoneRole, { Connect:false }).catch(()=>null);
                    await channel.permissionOverwrites.edit(ownerId, { Connect:true }).catch(()=>null);
                    return message.reply({ embeds:[embedMsg("Your VC has been locked")] });
                }
            case "unlock":
                {
                    const everyoneRole = channel.guild.roles.everyone;
                    await channel.permissionOverwrites.edit(everyoneRole, { Connect:true }).catch(()=>null);
                    return message.reply({ embeds:[embedMsg("Your VC has been unlocked")] });
                }
            case "hide":
                {
                    const everyoneRole = channel.guild.roles.everyone;
                    const ownerId = vcOwners.get(channel.id) || message.member.id;

                    if(privateVCId && channel.parentId !== privateVCId) await channel.setParent(privateVCId).catch(()=>null);
                    await new Promise(res=>setTimeout(res,250));

                    await channel.permissionOverwrites.edit(everyoneRole, { ViewChannel:false }).catch(()=>null);
                    await channel.permissionOverwrites.edit(ownerId, { ViewChannel:true }).catch(()=>null);
                    return message.reply({ embeds:[embedMsg("Your VC has been hidden")] });
                }
            case "unhide":
                {
                    const everyoneRole = channel.guild.roles.everyone;
                    await channel.permissionOverwrites.edit(everyoneRole, { ViewChannel:true }).catch(()=>null);
                    return message.reply({ embeds:[embedMsg("Your VC has been unhidden")] });
                }
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
                return message.reply(successEmbed(`VC Name: ${channel.name}\nCategory: ${channel.parent?.name||"None"}\nMembers: ${channel.members.size}\nLimit: ${channel.userLimit||"None"}`));
            case "rename":
                if(!args[1]) return message.reply(successEmbed("Provide a new name"));
                await channel.setName(args.slice(1).join(" "));
                return message.reply(successEmbed(`VC renamed to ${args.slice(1).join(" ")}`));
            case "transfer":
                if(!target) return message.reply(successEmbed("Mention a user to transfer ownership"));
                vcOwners.set(channel.id,target.id);
                return message.reply(successEmbed(`Transferred VC ownership to ${target.user.tag}`));
            case "unmute":
                await message.member.voice.setMute(false).catch(()=>null);
                return message.reply(successEmbed("You have been unmuted"));
        }
    }

    // --------------------
    // VC TIER COMMANDS (Admin only)
    if(cmd==="vc" && args[0]==="tier"){
        const sub = args[1]?.toLowerCase();
        const role = message.mentions.roles.first();
        const time = parseInt(args[2]);

        if(sub==="add"){
            if(!role || isNaN(time)) return message.reply(successEmbed("Provide a role and time in minutes"));
            vcTiers.push({ roleId: role.id, minutes: time });
            saveData();
            return message.reply(successEmbed(`Added VC tier: ${role.name} at ${time} minutes`));
        }
        if(sub==="remove"){
            if(!role) return message.reply(successEmbed("Mention a role to remove"));
            vcTiers = vcTiers.filter(t=>t.roleId!==role.id);
            saveData();
            return message.reply(successEmbed(`Removed VC tier: ${role.name}`));
        }
        if(sub==="view"){
            if(vcTiers.length===0) return message.reply(successEmbed("No VC tiers set"));
            const desc = vcTiers.map(t=>`<@&${t.roleId}> → ${t.minutes} minutes`).join("\n");
            return message.reply({ embeds:[embedMsg(desc)] });
        }
    }
});

client.login(process.env.BOT_TOKEN);
