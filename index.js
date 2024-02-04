const fs = require('node:fs');
const path = require('node:path');
const fetch = require('node-fetch');
const config = require('./config.json');
const CSV = require('csv-string');
const DateHelper = require("./Helpers/DateHelpers.js");
const { MongoClient, ServerApiVersion } = require("mongodb");
const { Client, Collection, Events, EmbedBuilder, GatewayIntentBits, AttachmentBuilder } = require("discord.js")
const { generateScoreChart } = require('./chartjs-discord.js');
const { request } = require('undici');

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
            const date = (DateHelper.isSunday()) ? new Date() : DateHelper.nextSundayDate(0);
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
            let bulkUpdates = [];
            try {
                await client.connect();
                const db = client.db('MaplestoryGPQ');
                const collection = db.collection("GPQ");

                for (let i = 0; i < characters.length; i++) {

                    let char = characters[i];
                    let ign = char[0];
                    var dateKey = date.toLocaleDateString();

                    var data = {
                        guildId: message.guildId,
                        ign: ign,
                        lvl: parseInt(char[1]),
                        date: dateKey,
                        dateStamp: date,
                        score: parseInt(char[2].replace(/\D/g, '')),
                        flag: parseInt(char[3])
                    };

                    let existingDocCount = await collection.countDocuments({ ign: ign, date: dateKey });

                    if (existingDocCount < 1) {
                        additions.push(data);
                    } else {
                        //queue for bulk write
                        bulkUpdates.push(
                            {
                                updateOne: {
                                    filter: { ign: ign, date: dateKey },
                                    update: { $set: {
                                        lvl: data.lvl,
                                        score: data.score,
                                        flag: data.flag
                                    }
                                }
                            }
                    });
                    }
                }

                 if (additions.length > 0) {
                    await collection.insertMany(additions);
                }

                if (bulkUpdates.length > 0) {
                    await collection.bulkWrite(bulkUpdates);
                }

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

    //check for gpq score command with ign
    if (message.content == "!gpq SingularityX") {

        let ign = "SingularityX";

        // fetch data from database
        const client = new MongoClient(config.MongoDBUri, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            }
        }
        );

        // Function to fetch a document from Azure Cosmos DB
        try {
            await client.connect();
            const db = client.db('MaplestoryGPQ');
            const collection = db.collection("GPQ");
            const findResult = await collection.find({ ign: ign });
            let data = [];
            for await (const doc of findResult){
                data.push(doc);
            }

            //build out embedded message
            let highestScore = data.reduce((prev, current) => { return prev.score > current.score ? prev : current; });
            let avgScore = (data.reduce((sum, current) => { return sum.score + current.score})) / data.length;
            let latest5Scores = `\`\`\``;
            data.forEach((obj) => {
                latest5Scores = latest5Scores.concat(`${obj.score.toLocaleString('en-US')} on ${obj.date} \n`);
            });
            latest5Scores = latest5Scores.concat(`\`\`\``);

            let attachment = await generateScoreChart(data);
            let charImageRequest = await request(`https://maplestory.nexon.net/api/ranking?id=overall&id2=legendary&rebootIndex=1&character_name=${ign}&page_index=1`)
            let charImageResponse = (await charImageRequest.body.json())[0];

            const exampleEmbed = new EmbedBuilder()
                .setColor(0x026623)
                .setTitle(ign)
                .setURL('https://mapleranks.com/u/singularityx')
                .setDescription("<class goes here>")
                .setThumbnail(charImageResponse.CharacterImgUrl)
                .setImage("attachment://graph.png")
                .addFields(
                    { name: 'Overall Ranking', value: '#1' },
                )
                .addFields(
                    { name: 'Highest Score', value: highestScore.score.toLocaleString('en-US'), inline: true },
                    { name: 'Date', value: highestScore.date, inline: true },
                    { name: 'Avg Score', value: avgScore.toLocaleString('en-US'), inline: true },
                )
                // .addFields(
                //     { name: '\u200B', value: '\u200B' }, //adding empty row for spacing
                // )
                .addFields(
                    { name: 'Last 5 Scores', value: latest5Scores },
                )
                //.setImage('https://i.imgur.com/AfFp7pu.png') // url of generated chart.
                .setFooter({ text: 'Made by Generosity v0.9.0', iconURL: 'https://media.istockphoto.com/id/817509202/vector/four-leaf-clover-vector-icon-clover-silhouette-simple-icon-illustration.jpg?s=612x612&w=0&k=20&c=w5o6sZPHaUuNHt_J8Lll1vDlDNaLeqBSkEFwrDZ5r1I=' })

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