// ---------------- ALL-IN-ONE DISCORD BOT ----------------
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
require('./keep_alive'); // keep alive server

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

// ---------------- CONFIG ----------------
const MY_GUILD_ID = '1441338778785419407';
const PREFIX = ',';
const emojis = { check: '✅', x: '❌' };

// ---------------- EMBEDS ----------------
function successEmbed(desc) { return new EmbedBuilder().setDescription(desc).setColor('Green'); }
function failedEmbed(desc) { return new EmbedBuilder().setDescription(desc).setColor('Red'); }
function optionalEmbed(desc) { return new EmbedBuilder().setDescription(desc).setColor('Blue'); }

// ---------------- DATA ----------------
let chatStats = {};
let voiceStats = {};
let voiceTiers = []; // { roleId, minutes, level }
let leaderboardMessages = { chat: null, vc: null };
let giveaways = [];
let activeVoiceTimers = {};
let modRoles = { mod: [], admin: [], owner: [] };
let vmChannels = { masterCategory: null, publicCategory: null, privateCategory: null };
let userVCMap = {}; // Tracks join-to-create VCs

// ---------------- READY ----------------
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.guilds.cache.forEach(g => { if(g.id !== MY_GUILD_ID) g.leave(); });
  await setupCategories();
  autoUpdateLeaderboards();
});

// ---------------- CATEGORY SETUP ----------------
async function setupCategories() {
  const guild = client.guilds.cache.get(MY_GUILD_ID);
  if(!guild) return;
  const categories = ['Voice Master VC', 'Public VC', 'Private VC'];
  for(let name of categories){
    let cat = guild.channels.cache.find(c=>c.name===name && c.type===4);
    if(!cat) {
      let created = await guild.channels.create({name,type:4});
      if(name==='Voice Master VC') vmChannels.masterCategory=created.id;
      if(name==='Public VC') vmChannels.publicCategory=created.id;
      if(name==='Private VC') vmChannels.privateCategory=created.id;
    } else {
      if(name==='Voice Master VC') vmChannels.masterCategory=cat.id;
      if(name==='Public VC') vmChannels.publicCategory=cat.id;
      if(name==='Private VC') vmChannels.privateCategory=cat.id;
    }
  }
}

// ---------------- MESSAGE HANDLER ----------------
client.on('messageCreate', async message=>{
  if(!message.guild||message.guild.id!==MY_GUILD_ID||message.author.bot) return;
  if(!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  let command = args.shift().toLowerCase();
  let subcommand = args[0]?args.shift().toLowerCase():null;
  const fullCommand = subcommand?`${command} ${subcommand}`:command;

  // Moderation commands
  const modCommands = [
    'ban','b','kick','k','mute','m','unmute','um','warn','w','clear','c','afk','nuke',
    'lock','unlock','lock all','unlock all','r','rr','nn','unnn','setmod','setadmin','setowner'
  ];
  if(modCommands.includes(fullCommand)||modCommands.includes(command)) return handleModeration(message, fullCommand, args);

  // VM setup/reset
  if(fullCommand==='vmsetup') return handleVMSetup(message);
  if(fullCommand==='vmreset') return handleVMReset(message);

  // Leaderboards
  if(fullCommand==='chatlb') return showChatLeaderboard(message);
  if(fullCommand==='vclb') return showVoiceLeaderboard(message);

  // Stats
  if(fullCommand==='stats') return showStats(message, args);

  // Giveaways
  if(fullCommand==='giveaway') return handleGiveaway(message, args);

  // Voice Master
  if(command==='vc') return handleVoiceCommand(message, fullCommand, args);

  // Voice Tier
  if(fullCommand==='add vc tier') return handleAddVCTier(message, args);
  if(fullCommand==='remove vc tier') return handleRemoveVCTier(message, args);
});

// ---------------- VOICE STATE TRACKER ----------------
client.on('voiceStateUpdate',(oldState,newState)=>{
  if(newState.guild.id!==MY_GUILD_ID) return;
  if(newState.channelId&&!oldState.channelId) startVoiceTimer(newState.member.id,newState.channelId);
  if(!newState.channelId&&oldState.channelId) stopVoiceTimer(newState.member.id,oldState.channelId);
  if(newState.channelId) autoMoveVC(newState.member,newState.channel);
});

// ---------------- MODERATION HANDLER ----------------
async function handleModeration(message, fullCommand, args){
  const member = message.mentions.members.first();
  const reason = args.join(' ')||'No reason provided';
  function hasPerm(member){
    return modRoles.mod.some(r=>member.roles.cache.has(r))||
           modRoles.admin.some(r=>member.roles.cache.has(r))||
           modRoles.owner.some(r=>member.roles.cache.has(r));
  }
  if(!hasPerm(message.member)&&!['setmod','setadmin','setowner'].includes(fullCommand)) 
    return message.channel.send({embeds:[failedEmbed('No permission')]});

  try{
    switch(fullCommand){
      case 'ban': case 'b':
        if(!member) return message.channel.send({embeds:[failedEmbed('Mention a user')]});
        await member.ban({reason});
        return message.channel.send({embeds:[optionalEmbed(`**${member.user.tag}** was banned | reason: ${reason}`)]});
      case 'kick': case 'k':
        if(!member) return message.channel.send({embeds:[failedEmbed('Mention a user')]});
        await member.kick(reason);
        return message.channel.send({embeds:[optionalEmbed(`**${member.user.tag}** was kicked | reason: ${reason}`)]});
      case 'mute': case 'm':
        if(!member) return message.channel.send({embeds:[failedEmbed('Mention a user')]});
        await member.voice.setMute(true).catch(()=>{});
        return message.channel.send({embeds:[successEmbed(`**${member.user.tag}** muted`)]});
      case 'unmute': case 'um':
        if(!member) return message.channel.send({embeds:[failedEmbed('Mention a user')]});
        await member.voice.setMute(false).catch(()=>{});
        return message.channel.send({embeds:[successEmbed(`**${member.user.tag}** unmuted`)]});
      case 'warn': case 'w':
        if(!member) return message.channel.send({embeds:[failedEmbed('Mention a user')]});
        return message.channel.send({embeds:[optionalEmbed(`**${member.user.tag}** was warned | reason: ${reason}`)]});
      case 'clear': case 'c':
        let amount=parseInt(args[0]);
        if(!amount) return message.channel.send({embeds:[failedEmbed('Provide a number')]});
        await message.channel.bulkDelete(amount,true);
        return message.channel.send({embeds:[successEmbed(`Cleared ${amount} messages`)]});
      case 'afk':
        return message.channel.send({embeds:[optionalEmbed(`${message.author.tag} is now AFK | reason: ${reason}`)]});
      case 'nuke':
        const channel=message.channel;
        await channel.clone().then(c=>channel.delete());
        return;
      case 'lock':
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone,{SendMessages:false});
        return message.channel.send({embeds:[successEmbed('Channel locked')]});
      case 'unlock':
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone,{SendMessages:true});
        return message.channel.send({embeds:[successEmbed('Channel unlocked')]});
      case 'lock all':
        message.channel.parent.children.forEach(c=>c.permissionOverwrites.edit(message.guild.roles.everyone,{SendMessages:false}));
        return message.channel.send({embeds:[successEmbed('Category locked')]});
      case 'unlock all':
        message.channel.parent.children.forEach(c=>c.permissionOverwrites.edit(message.guild.roles.everyone,{SendMessages:true}));
        return message.channel.send({embeds:[successEmbed('Category unlocked')]});
      case 'r':
        if(!member) return message.channel.send({embeds:[failedEmbed('Mention a user')]});
        const role=message.mentions.roles.first();
        if(!role) return message.channel.send({embeds:[failedEmbed('Mention a role')]});
        await member.roles.add(role);
        return message.channel.send({embeds:[successEmbed(`**${member.user.tag}** given role **${role.name}**`)]});
      case 'rr':
        if(!member) return message.channel.send({embeds:[failedEmbed('Mention a user')]});
        const rrole=message.mentions.roles.first();
        if(!rrole) return message.channel.send({embeds:[failedEmbed('Mention a role')]});
        await member.roles.remove(rrole);
        return message.channel.send({embeds:[successEmbed(`**${member.user.tag}** role **${rrole.name}** removed`)]});
      case 'nn':
        if(!member) return message.channel.send({embeds:[failedEmbed('Mention a user')]});
        const nickname=args.join(' ');
        if(!nickname) return message.channel.send({embeds:[failedEmbed('Provide a nickname')]});
        await member.setNickname(nickname);
        return message.channel.send({embeds:[successEmbed(`**${member.user.tag}** nickname set to **${nickname}**`)]});
      case 'unnn':
        if(!member) return message.channel.send({embeds:[failedEmbed('Mention a user')]});
        await member.setNickname(null);
        return message.channel.send({embeds:[successEmbed(`**${member.user.tag}** nickname reset`)]});
      case 'setmod':
        const modRole=message.mentions.roles.first();
        if(!modRole) return message.channel.send({embeds:[failedEmbed('Mention a role')]});
        modRoles.mod.push(modRole.id);
        return message.channel.send({embeds:[successEmbed(`Role **${modRole.name}** set as Mod`)]});
      case 'setadmin':
        const adminRole=message.mentions.roles.first();
        if(!adminRole) return message.channel.send({embeds:[failedEmbed('Mention a role')]});
        modRoles.admin.push(adminRole.id);
        return message.channel.send({embeds:[successEmbed(`Role **${adminRole.name}** set as Admin`)]});
      case 'setowner':
        const ownerRole=message.mentions.roles.first();
        if(!ownerRole) return message.channel.send({embeds:[failedEmbed('Mention a role')]});
        modRoles.owner.push(ownerRole.id);
        return message.channel.send({embeds:[successEmbed(`Role **${ownerRole.name}** set as Owner`)]});
    }
  }catch(e){console.log(e); message.channel.send({embeds:[failedEmbed('Failed command')]});}
}

// ---------------- LOGIN ----------------
client.login(process.env.TOKEN);

// ---------------- VOICE MASTER COMMANDS ----------------
async function handleVoiceCommand(message, fullCommand, args){
  const member = message.member;
  const channel = member.voice.channel;
  if(!channel) return message.channel.send({embeds:[failedEmbed('You are not in a voice channel')]});

  switch(fullCommand){
    case 'vc lock':
      await channel.permissionOverwrites.edit(message.guild.roles.everyone,{Connect:false});
      moveToPrivateIfNeeded(channel);
      return message.channel.send({embeds:[successEmbed('Your voice channel is now locked')]});
    case 'vc unlock':
      await channel.permissionOverwrites.edit(message.guild.roles.everyone,{Connect:true});
      return message.channel.send({embeds:[successEmbed('Your voice channel is now unlocked')]});
    case 'vc kick':
      let kickMember = message.mentions.members.first();
      if(!kickMember) return message.channel.send({embeds:[failedEmbed('Mention a user')]});
      if(!kickMember.voice.channel || kickMember.voice.channel.id!==channel.id) return message.channel.send({embeds:[failedEmbed('User not in your VC')]});
      kickMember.voice.disconnect();
      return message.channel.send({embeds:[successEmbed(`**${kickMember.user.tag}** was kicked from your VC`)]});
    case 'vc ban':
      let banMember = message.mentions.members.first();
      if(!banMember) return message.channel.send({embeds:[failedEmbed('Mention a user')]});
      if(!banMember.voice.channel || banMember.voice.channel.id!==channel.id) return message.channel.send({embeds:[failedEmbed('User not in your VC')]});
      await channel.permissionOverwrites.edit(banMember,{Connect:false});
      banMember.voice.disconnect();
      return message.channel.send({embeds:[successEmbed(`**${banMember.user.tag}** was banned from your VC`)]});
    case 'vc permit':
      let permitMember = message.mentions.members.first();
      if(!permitMember) return message.channel.send({embeds:[failedEmbed('Mention a user')]});
      await channel.permissionOverwrites.edit(permitMember,{Connect:true});
      return message.channel.send({embeds:[successEmbed(`**${permitMember.user.tag}** can now join your VC`)]});
    case 'vc limit':
      let limit = parseInt(args[0]);
      if(!limit || limit<1) return message.channel.send({embeds:[failedEmbed('Provide a valid number')]});
      await channel.setUserLimit(limit);
      return message.channel.send({embeds:[successEmbed(`User limit set to ${limit}`)]});
    case 'vc info':
      return message.channel.send({embeds:[successEmbed(`Channel: ${channel.name}\nUsers: ${channel.members.size}\nLimit: ${channel.userLimit||'Unlimited'}`)]});
    case 'vc rename':
      let name = args.join(' ');
      if(!name) return message.channel.send({embeds:[failedEmbed('Provide a new name')]});
      await channel.setName(name);
      return message.channel.send({embeds:[successEmbed(`Channel renamed to **${name}**`)]});
    case 'vc transfer':
      let transferMember = message.mentions.members.first();
      if(!transferMember) return message.channel.send({embeds:[failedEmbed('Mention a user')]});
      userVCMap[transferMember.id] = channel.id;
      return message.channel.send({embeds:[successEmbed(`Ownership transferred to **${transferMember.user.tag}**`)]});
    case 'vc unmute':
      await member.voice.setMute(false);
      return message.channel.send({embeds:[successEmbed('You are now unmuted')]});
    case 'vc hide':
      await channel.permissionOverwrites.edit(message.guild.roles.everyone,{Connect:false});
      moveToPrivateIfNeeded(channel);
      return message.channel.send({embeds:[successEmbed('Your VC is now hidden')]});
    case 'vc unhide':
      await channel.permissionOverwrites.edit(message.guild.roles.everyone,{Connect:true});
      return message.channel.send({embeds:[successEmbed('Your VC is now visible')]});
  }
}

function moveToPrivateIfNeeded(channel){
  if(vmChannels.privateCategory) channel.setParent(vmChannels.privateCategory).catch(()=>{});
}

// ---------------- VM SETUP/RESET ----------------
async function handleVMSetup(message){
  await setupCategories();
  return message.channel.send({embeds:[successEmbed('Voice Master system setup completed')]});
}

async function handleVMReset(message){
  const guild = client.guilds.cache.get(MY_GUILD_ID);
  if(!guild) return;
  const cats = [vmChannels.masterCategory, vmChannels.publicCategory, vmChannels.privateCategory];
  for(let catId of cats){
    let cat = guild.channels.cache.get(catId);
    if(cat) await cat.delete().catch(()=>{});
  }
  await setupCategories();
  return message.channel.send({embeds:[successEmbed('Voice Master system reset completed')]});
}

// ---------------- VOICE TIMER ----------------
function startVoiceTimer(userId, channelId){
  if(activeVoiceTimers[userId]) return;
  activeVoiceTimers[userId] = Date.now();
}

function stopVoiceTimer(userId, channelId){
  if(!activeVoiceTimers[userId]) return;
  let mins = Math.floor((Date.now()-activeVoiceTimers[userId])/60000);
  voiceStats[userId] = (voiceStats[userId]||0)+mins;
  activeVoiceTimers[userId]=null;
}

// ---------------- AUTO MOVE JOINED VCS ----------------
function autoMoveVC(member, channel){
  if(channel.parentId===vmChannels.publicCategory) return;
  if(channel.parentId===vmChannels.masterCategory) return;
  if(channel.parentId===vmChannels.privateCategory) return;
  if(vmChannels.publicCategory) channel.setParent(vmChannels.publicCategory).catch(()=>{});
}

// ---------------- VOICE TIERS ----------------
function handleAddVCTier(message,args){
  let role = message.mentions.roles.first();
  let minutes = parseInt(args[1]);
  if(!role || !minutes) return message.channel.send({embeds:[failedEmbed('Provide role and minutes')]});
  voiceTiers.push({roleId: role.id, minutes: minutes, level: `@Tier ${voiceTiers.length+1}`});
  message.channel.send({embeds:[successEmbed(`Voice tier **${role.name}** added for ${minutes} mins`) ]});
}

function handleRemoveVCTier(message,args){
  let role = message.mentions.roles.first();
  if(!role) return message.channel.send({embeds:[failedEmbed('Mention a role')]});
  voiceTiers = voiceTiers.filter(t=>t.roleId!==role.id);
  message.channel.send({embeds:[successEmbed(`Voice tier **${role.name}** removed`) ]});
}

// ---------------- STATS COMMAND ----------------
function showStats(message,args){
  let user = message.mentions.members.first() || message.member;
  let messagesCount = chatStats[user.id]||0;
  let voiceMinutes = voiceStats[user.id]||0;
  let tier = '@Tier 0';
  for(let t of voiceTiers){
    if(voiceMinutes>=t.minutes) tier=t.level;
  }
  const embed = new EmbedBuilder()
    .setTitle(`Stats for **${user.user.tag}**`)
    .addFields(
      {name:'Messages',value:`${messagesCount}`,inline:true},
      {name:'Voice Minutes',value:`${voiceMinutes}`,inline:true},
      {name:'Tier',value:`${tier}`,inline:true}
    );
  message.channel.send({embeds:[embed]});
}

// ---------------- LEADERBOARDS ----------------
async function autoUpdateLeaderboards(){
  setInterval(()=>{updateChatLB(); updateVoiceLB();},5*60*1000);
}

function updateChatLB(){
  const guild = client.guilds.cache.get(MY_GUILD_ID);
  if(!guild) return;
  const top = Object.entries(chatStats).sort((a,b)=>b[1]-a[1]).slice(0,10);
  let desc = '';
  for(let i=0;i<top.length;i++){
    let member = guild.members.cache.get(top[i][0]);
    if(!member) continue;
    desc += `${i+1} - **${member.user.tag}** • ${top[i][1]} messages\n`;
  }
  const embed = new EmbedBuilder().setTitle('Chat Leaderboard').setDescription(desc).setFooter({text:'Updates every 5 mins'});
  if(leaderboardMessages.chat) leaderboardMessages.chat.edit({embeds:[embed]}).catch(()=>{});
}

function updateVoiceLB(){
  const guild = client.guilds.cache.get(MY_GUILD_ID);
  if(!guild) return;
  const top = Object.entries(voiceStats).sort((a,b)=>b[1]-a[1]).slice(0,10);
  let desc = '';
  for(let i=0;i<top.length;i++){
    let member = guild.members.cache.get(top[i][0]);
    if(!member) continue;
    desc += `${i+1} - **${member.user.tag}** • ${top[i][1]} voice mins\n`;
  }
  const embed = new EmbedBuilder().setTitle('Voice Leaderboard').setDescription(desc).setFooter({text:'Updates every 5 mins'});
  if(leaderboardMessages.vc) leaderboardMessages.vc.edit({embeds:[embed]}).catch(()=>{});
}

function showChatLeaderboard(message){
  updateChatLB();
  message.channel.send({embeds:[successEmbed('Chat leaderboard updated')]});
}

function showVoiceLeaderboard(message){
  updateVoiceLB();
  message.channel.send({embeds:[successEmbed('Voice leaderboard updated')]});
}

// ---------------- GIVEAWAYS SYSTEM ----------------
function handleGiveaway(message,args){
  // Basic example
  let prize = args.join(' ');
  if(!prize) return message.channel.send({embeds:[failedEmbed('Provide a prize')]});
  const embed = new EmbedBuilder().setTitle('🎉 Giveaway!').setDescription(`Prize: **${prize}**`).setFooter({text:'React with 🎉 to enter!'});
  message.channel.send({embeds:[embed]}).then(msg=>msg.react('🎉'));
}
