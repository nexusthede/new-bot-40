const {
EmbedBuilder,
ActionRowBuilder,
ButtonBuilder,
ButtonStyle,
PermissionsBitField,
Events,
ChannelType
} = require("discord.js")

const joinChannel = "1482460435180552414"
const category = "1480977750218248222"

const owners = new Map()

module.exports = (client) => {

client.on("messageCreate", async message => {

if(message.author.bot) return
if(!message.content.startsWith(",")) return

const args = message.content.slice(1).trim().split(/ +/)
const cmd = args.shift().toLowerCase()

// INTERFACE COMMAND
if(cmd === "interface"){

if(!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return

const embed = new EmbedBuilder()
.setTitle("VoiceMaster Interface")
.setAuthor({name: message.guild.name, iconURL: message.guild.iconURL({dynamic:true})})
.setDescription(`Control the voice channels created from **join to create**

**usage**

<:vc_lock:1477309124537483439> - **lock** the voice channel
<:vc_unlock:1477309329433559203> - **unlock** the voice channel
<:vc_hide:1477311897262096497> - **hide** the voice channel
<:vc_unhide:1477311594638606336> - **reveal** the voice channel
<:vc_rename:1477312271926431987> - **rename** the voice channel
<:vc_decrease:1477690349366280263> - **decrease** the member limit
<:vc_increase:147769032683028080> - **increase** the member limit
<:vc_info:1477312480463294628> - **info** about the voice channel
<:vc_kick:1477311772137619478> - **kick** someone from the voice channel
<:vc_claim:1477559856394403942> - **claim** the voice channel`)

const row1 = new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId("lock").setEmoji("1477309124537483439").setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId("unlock").setEmoji("1477309329433559203").setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId("hide").setEmoji("1477311897262096497").setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId("reveal").setEmoji("1477311594638606336").setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId("rename").setEmoji("1477312271926431987").setStyle(ButtonStyle.Secondary)
)

const row2 = new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId("decrease").setEmoji("1477690349366280263").setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId("increase").setEmoji("147769032683028080").setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId("info").setEmoji("1477312480463294628").setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId("kick").setEmoji("1477311772137619478").setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId("claim").setEmoji("1477559856394403942").setStyle(ButtonStyle.Secondary)
)

message.channel.send({embeds:[embed],components:[row1,row2]})
return
}

// UNKNOWN COMMAND
const unknown = new EmbedBuilder()
.setTitle("Unknown Command")
.setDescription("That command does not exist.")

message.channel.send({embeds:[unknown]}).then(m=>setTimeout(()=>m.delete().catch(()=>{}),5000))

})

// BUTTON HANDLER
client.on(Events.InteractionCreate, async interaction => {

if(!interaction.isButton()) return

const member = interaction.member
const vc = member.voice.channel

// NOT IN VC
if(!vc){

const fail = new EmbedBuilder()
.setTitle("Failed")
.setDescription("You must be in **voice channel** to use this.")

return interaction.reply({embeds:[fail],ephemeral:true})

}

const owner = owners.get(vc.id)

// NOT OWNER
if(owner !== member.id && !member.permissions.has(PermissionsBitField.Flags.Administrator)){

const fail = new EmbedBuilder()
.setTitle("Failed")
.setDescription("You do not own this **voice channel**.")

return interaction.reply({embeds:[fail],ephemeral:true})

}

// BUTTON ACTIONS
switch(interaction.customId){

case "lock":

await vc.permissionOverwrites.edit(interaction.guild.roles.everyone,{Connect:false})
interaction.reply({content:"Your **voice channel** has been **locked**",ephemeral:true})
break

case "unlock":

await vc.permissionOverwrites.edit(interaction.guild.roles.everyone,{Connect:true})
interaction.reply({content:"Your **voice channel** has been **unlocked**",ephemeral:true})
break

case "hide":

await vc.permissionOverwrites.edit(interaction.guild.roles.everyone,{ViewChannel:false})
interaction.reply({content:"Your **voice channel** has been **hidden**",ephemeral:true})
break

case "reveal":

await vc.permissionOverwrites.edit(interaction.guild.roles.everyone,{ViewChannel:true})
interaction.reply({content:"Your **voice channel** has been **revealed**",ephemeral:true})
break

case "rename":

await vc.setName(`${member.user.username}'s channel`)
interaction.reply({content:"Your **voice channel** has been **renamed**",ephemeral:true})
break

case "decrease":

await vc.setUserLimit(Math.max(vc.userLimit-1,0))
interaction.reply({content:"Member limit **decreased**",ephemeral:true})
break

case "increase":

await vc.setUserLimit(vc.userLimit+1)
interaction.reply({content:"Member limit **increased**",ephemeral:true})
break

case "info":

interaction.reply({content:`Channel: ${vc.name}\nMembers: ${vc.members.size}\nLimit: ${vc.userLimit}`,ephemeral:true})
break

case "kick":

const user = vc.members.filter(m=>m.id!==member.id).first()
if(user) user.voice.disconnect()
interaction.reply({content:"User **kicked** from voice channel",ephemeral:true})
break

case "claim":

owners.set(vc.id,member.id)
interaction.reply({content:"You **claimed** the voice channel",ephemeral:true})
break

}

})

// JOIN TO CREATE + AUTO DELETE
client.on("voiceStateUpdate", async (oldState,newState)=>{

// JOIN
if(newState.channelId === joinChannel){

const vc = await newState.guild.channels.create({
name:`${newState.member.user.username}'s channel`,
type:ChannelType.GuildVoice,
parent:category
})

owners.set(vc.id,newState.member.id)

await newState.member.voice.setChannel(vc)

}

// DELETE EMPTY
if(oldState.channel){

const channel = oldState.channel

if(channel.parentId !== category) return
if(channel.id === joinChannel) return

if(channel.members.size === 0){

owners.delete(channel.id)
channel.delete().catch(()=>{})

}

}

})

}
