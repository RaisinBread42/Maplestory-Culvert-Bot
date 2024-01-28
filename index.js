const fs = require('node:fs');
const path = require('node:path');
const fetch = require('node-fetch');
const config = require('./config.json');
const CSV = require('csv-string');
const DateHelper = require("./Helpers/DateHelpers.js");
const { MongoClient, ServerApiVersion } = require("mongodb");
const { Client, Collection, Events, EmbedBuilder, GatewayIntentBits, AttachmentBuilder } = require("discord.js")
const { generateScoreChart } = require('./chartjs-discord.js');

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

client.on("messageCreate", async (message) => {
    if (message.content.includes("!update")) {
        try {
            //get date - can definitely use some improvement with validation checks!
            const date = (DateHelper.isSunday()) ? new Date() : DateHelper.nextSundayDate(new Date().getDay());
            const guildId = message.guildId;

            // get the csv file's URL
            const file = message.attachments.first()?.url;
            if (!file) return console.log('No attached file found');

            message.channel.send('Reading the file! Fetching data...');

            // fetch the file from the external URL
            const response = await fetch(file);

            // if there was an error send a message with the status
            if (!response.ok)
                return message.channel.send(
                    'There was an error with fetching the file:',
                    response.statusText,
                );

            // take the response stream and read it to completion
            const text = await response.text();

            //convert into array
            const characters = CSV.parse(text).slice(1);
            //console.log(characters);

            //loop list, generate bulk update object list
            //update db
            const client = new MongoClient(config.MongoDBUri, {
                serverApi: {
                    version: ServerApiVersion.v1,
                    strict: true,
                    deprecationErrors: true,
                }
            }
            );

            let additions = [];
            let updates = [];
            try {
                await client.connect();
                const db = client.db('MaplestoryGPQ');
                const collection = db.collection("GPQ");

                for (let i = 0; i < characters.length; i++) {
                    //console.log(`${ign}: Level-${lvl}, Score-${score}, Flag:${flag}`);

                    let char = characters[i];
                    let ign = char[0];

                    let docCount = await collection.countDocuments({ ign: ign });

                    if (docCount < 1) {
                        //add new document
                        var data = {
                            guildId: message.guildId,
                            ign: ign,
                            scores: []
                        };

                        additions.push(data);

                    } else {
                        //update document
                        // var data = {
                        //     date: date.toLocaleDateString(),
                        //     lvl: parseInt(char[1]),
                        //     score: parseInt(char[2].replace(/\D/g, '')),
                        //     flag: parseInt(char[3])
                        // };

                        // // check if exists, create update statement, else add statement
                        // updates.push(
                        //     {
                        //         updateOne: {
                        //             filter: { ign: ign },
                        //             update: { $push: { scores:data } },
                        //             upsert:true
                        //         }
                        //     }
                        // );
                    }
                }
                
                await collection.insertMany(additions);
                //await collection.bulkWrite(updates);
                
                message.channel.send('Scores updated successfully!');

            } catch (error) {
                console.log(error);
                message.channel.send('1 or more errors encountered processing scores.');
            } finally {
                await client.close();
            }

        } catch (error) {
            console.log(error);
        }
    }

    if (message.content == "!gpq SingularityX") {

        // fetch data from database
        const endpoint = config.azureCosmosDb.endpoint;
        const key = config.azureCosmosDb.key;
        const databaseId = config.azureCosmosDb.databaseId;
        const containerId = config.azureCosmosDb.containerId;
        const documentId = "SingularityX";
        const partitionKey = "Hero"

        let data = {};

        // Function to fetch a document from Azure Cosmos DB
        const client = new CosmosClient({ endpoint, key });
        const container = client.database(databaseId).container(containerId);
        try {
            const { resource } = await container.item(documentId, partitionKey).read();
            data = resource;

            //build out embedded message
            let scores = data.scores;
            let highestScore = scores.reduce((prev, current) => { return prev.amount > current.amount ? prev : current; });
            let avgScore = (scores.reduce((sum, current) => sum + current.amount, 0)) / scores.length;
            let latest5Scores = `\`\`\``;
            scores.forEach((obj) => {
                latest5Scores = latest5Scores.concat(`${obj.amount.toLocaleString('en-US')} on ${obj.date} \n`);
            });
            latest5Scores = latest5Scores.concat(`\`\`\``);

            let attachment = await generateScoreChart(scores);

            const exampleEmbed = new EmbedBuilder()
                .setColor(0x026623)
                .setTitle('Culvert Data for SingularityX')
                .setURL('https://mapleranks.com/u/singularityx')
                .setDescription(data.class)
                .setThumbnail('https://i.mapleranks.com/u/NICJOEBPMCGMJOCCOGJCILFCDEKLCMDNLNLPOBPIIDLGPGLPIDIGOPHMECOBHMCFBLCCDLLHBCLJHDBLANOCLLIHFOBAANGFOAOBMDCCEINOGMBHDPADBLIINOMDJNBAICFMLMPADHEKGIHAPEAMFABDPJPBJCKEIMFIKBHOHIGMINCNBIAHHMNINFLKEMCNHGLENEMHIHPPGPOADGHKLEGCIDGGFJFNJILHDNEBGIBCIPHKFMFAAELEKDPCNNHE.png')
                .setImage("attachment://graph.png")
                .addFields(
                    { name: 'Overall Ranking', value: '#1' },
                )
                .addFields(
                    { name: 'Highest Score', value: highestScore.amount.toLocaleString('en-US'), inline: true },
                    { name: 'Week of', value: highestScore.date, inline: true },
                    { name: 'Avg Score', value: avgScore.toLocaleString('en-US'), inline: true },
                )
                // .addFields(
                //     { name: '\u200B', value: '\u200B' }, //adding empty row for spacing
                // )
                .addFields(
                    { name: 'Last 5 Scores', value: latest5Scores },
                )
                //.setImage('https://i.imgur.com/AfFp7pu.png') // url of generated chart.
                .setFooter({ text: 'Made by Generosity', iconURL: 'https://media.istockphoto.com/id/817509202/vector/four-leaf-clover-vector-icon-clover-silhouette-simple-icon-illustration.jpg?s=612x612&w=0&k=20&c=w5o6sZPHaUuNHt_J8Lll1vDlDNaLeqBSkEFwrDZ5r1I=' })

            message.channel.send({ embeds: [exampleEmbed], files: [attachment] });

        } catch (error) {
            console.error("Error fetching document:", error);
        }
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

client.login(config.discord.token)