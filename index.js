const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, EmbedBuilder, GatewayIntentBits } = require("discord.js")
var { token } = require('./config.json');
const fetch = require('node-fetch');

// test call ocr.py script 
// TODO - put in own module
let { PythonShell } = require('python-shell')

let pyshell = new PythonShell('ocr.py');

pyshell.on('message', function (message) {
    // received a message sent from the Python script (a simple "print" statement)
    console.log(message);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
})

// register commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}



// listeners
client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}`)
})

client.on("messageCreate", (message) => {
    if (message.content == "!upload") {

        // fetch and save image so ocr.py can later read and process
        message.attachments.forEach(async a => {
            console.log(a.url)
            var response = await fetch(a.url);
            var fileBuffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(`images/${a.name}`, fileBuffer);
        })


        const exampleEmbed = new EmbedBuilder()
            .setColor(0x026623)
            .setTitle('Culvert Data for SingularityX')
            .setURL('https://mapleranks.com/u/singularityx')
            .setDescription('View recent culvert scores')
            .setThumbnail('https://i.mapleranks.com/u/NICJOEBPMCGMJOCCOGJCILFCDEKLCMDNLNLPOBPIIDLGPGLPIDIGOPHMECOBHMCFBLCCDLLHBCLJHDBLANOCLLIHFOBAANGFOAOBMDCCEINOGMBHDPADBLIINOMDJNBAICFMLMPADHEKGIHAPEAMFABDPJPBJCKEIMFIKBHOHIGMINCNBIAHHMNINFLKEMCNHGLENEMHIHPPGPOADGHKLEGCIDGGFJFNJILHDNEBGIBCIPHKFMFAAELEKDPCNNHE.png')
            .addFields(
                { name: 'Overall Ranking', value: '#1'},
            )
            .addFields(
                { name: 'Highest Score', value: '20,000', inline: true },
                { name: 'Week of', value: '07-22-2023', inline: true },
                { name: 'Avg Score', value: '18,000', inline: true },
            )
            // .addFields(
            //     { name: '\u200B', value: '\u200B' }, //adding empty row for spacing
            // )
            .addFields(
                { name: 'Last 5 Scores', value: `\`\`\`20,000 on 06-22-2023\n18,000 on 05-22-2023\n18,000 on 04-22-2023\n17,000 on 03-22-2023\n20,000 on 01-22-2023 \`\`\``},
            )
            //.setImage('https://i.imgur.com/AfFp7pu.png') // url of generated chart.
            .setFooter({ text: 'Made by Generosity', iconURL: 'https://media.istockphoto.com/id/817509202/vector/four-leaf-clover-vector-icon-clover-silhouette-simple-icon-illustration.jpg?s=612x612&w=0&k=20&c=w5o6sZPHaUuNHt_J8Lll1vDlDNaLeqBSkEFwrDZ5r1I='})

        message.channel.send({ embeds: [exampleEmbed] });
    }
})


//command handling
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    }
});

client.login(token)