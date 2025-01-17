const fs = require('node:fs');
const path = require('node:path');
const fetch = require('node-fetch');
const config = require('./config.json');
const CSV = require('csv-string');
const DateHelper = require("./Helpers/DateHelpers.js");
const NumberFormatHelper = require("./Helpers/NumberFormatHelper.js");
const { MongoClient, ServerApiVersion } = require("mongodb");
const { Client, Collection, Events, EmbedBuilder, GatewayIntentBits, AttachmentBuilder } = require("discord.js")
const { generateScoreChart } = require('./chartjs-discord.js');
const { generateScoreRaceChart } = require('./chartjs-race-discord.js');
const { request } = require('undici');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
})

// listeners
client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}`)
})

client.on("messageCreate", async (message) => {
    let quote = '“Even a small progression can be the start of something great.” – Angela Ruth';
    //un comment to update database running in debug mode
    if (message.content.includes("!update")) {
        try {
            //get date - can definitely use some improvement with validation checks!
            let dateParam = message.content.replace('!update ','').trim(); // ex, 2024-03-10T05:00:00.000+00:00
            const date = dateParam == "" ? DateHelper.getSundayDate().toLocaleDateString() : new Date(dateParam);
            const guildId = message.guildId;

            // get the csv file's URL
            const file = message.attachments.first()?.url;
            if (!file) return console.log('No attached file found');

            message.channel.send('Reading the file! Processing data...');

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
                    var dateKey = date;
                    console.log(`Parsing and processing ${ign}.`);

                    var data = {
                        guildId: message.guildId,
                        ign: ign,
                        class: char[1],
                        lvl: parseInt(char[2]),
                        date: dateKey,
                        updatedOn: new Date(),
                        score: parseInt(char[3].replace(/\D/g, '')),
                        flag: parseInt(char[4].replace(/\D/g, ''))
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
    if (message.content.includes("!gpq")) {

        let ign = message.content.replace('!gpq ','');

        if (ign.toLowerCase() === 'susah'){
            message.channel.send("https://tenor.com/view/nope-not-today-cat-kitty-gif-17101672"); //send meme instead of her score - as per request.
            return;
        }

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
            const findResult = await collection.find({ ign: new RegExp("^" + ign, "i") }).sort({date:-1}).limit(5);
            
            let data = [];
            for await (const doc of findResult){
                data.push(doc);
            }

            if (data.length == 0 ){
                message.channel.send("Unable to find data for user.");
                return;
            }

            //sort by latest date
            data = data.sort(function(a,b){
                return new Date(a.date) - new Date(b.date)
            });

            let exactIgn = data[0].ign;
            const latestDate = data[data.length-1].date;
            const latestRecords = await collection.find({date:latestDate}).sort({"score": -1});
            let rankingData = [];
            for await (const doc of latestRecords){
                rankingData.push(doc);
            }

            let userRank = rankingData.length == 0 ? "To be calculated" : (rankingData.sort( (a,b) => { return b-a}).findIndex(i => i.ign == exactIgn) + 1);
            
            //build out embedded message
            let highestScore = data.reduce((prev, current) => { return prev.score > current.score ? prev : current; });
            let avgScore = data.length == 1 ? data[0].score : (data.reduce((sum, current) => { 
                return {score: sum.score + current.score};
            })).score / data.length;

            let charclass = data[0].class;
            
            let latest5Scores = `\`\`\``;
            data.slice(0,5).forEach((obj) => {
                latest5Scores = latest5Scores.concat(`${NumberFormatHelper.toLocaleString(obj.score)} on ${obj.date.toLocaleDateString()} \n`);
            });
            latest5Scores = latest5Scores.concat(`\`\`\``);
            
            let attachment = await generateScoreChart(data);
            let charImageRequest = await request(`https://www.nexon.com/api/maplestory/no-auth/v1/ranking/na?type=overall&id=legendary&reboot_index=1&page_index=1&character_name=${ign}`)
            let charImageResponse = (await charImageRequest.body.json()).ranks[0];
            let level = data[data.length-1].lvl;

            const exampleEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(exactIgn)
                .setURL(`https://mapleranks.com/u/${exactIgn}`)
                .setDescription("Level "+ level + " " + charclass)
                .setThumbnail(charImageResponse.characterImgURL)
                .setImage("attachment://graph.png")
                .addFields(
                    { name: 'Weekly Ranking', value: '#'+userRank },
                )
                .addFields(
                    { name: 'Highest Score', value: NumberFormatHelper.toLocaleString(highestScore.score), inline: true },
                    { name: 'Date', value: highestScore.date.toLocaleDateString(), inline: true },
                    { name: 'Avg Score', value: NumberFormatHelper.toLocaleString(avgScore), inline: true },
                )
                // .addFields(
                //     { name: '\u200B', value: '\u200B' }, //adding empty row for spacing
                // )
                .addFields(
                    { name: 'Last 5 Scores', value: latest5Scores },
                )
                //.setImage('https://i.imgur.com/AfFp7pu.png') // url of generated chart.
                .setFooter({ text: quote, iconURL: 'https://media.istockphoto.com/id/817509202/vector/four-leaf-clover-vector-icon-clover-silhouette-simple-icon-illustration.jpg?s=612x612&w=0&k=20&c=w5o6sZPHaUuNHt_J8Lll1vDlDNaLeqBSkEFwrDZ5r1I=' })

            message.channel.send({ embeds: [exampleEmbed], files: [attachment] });

        } catch (error) {
            message.channel.send("Woops, an error occured! Unable to process your info.");
            console.log(error);
        }
    }

    if (message.content.includes("!race")) {

        let ign = message.content.replace('!race ','');

        if (ign.toLowerCase() === 'susah'){
            message.channel.send("https://tenor.com/view/nope-not-today-cat-kitty-gif-17101672"); //send meme instead of her score - as per request.
            return;
        }

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
            const findResult = await collection.find({ ign: new RegExp("^" + ign, "i") }).sort({date:-1}).limit(5);
            
            let data = [];
            for await (const doc of findResult){
                data.push(doc);
            }

            if (data.length == 0 ){
                message.channel.send("Unable to find data for user.");
                return;
            }

            //sort by latest date
            data = data.sort(function(a,b){
                return new Date(a.date) - new Date(b.date)
            });

            let exactIgn = data[0].ign;
            const latestDate = data[data.length-1].date;
            const latestRecords = await collection.find({date:latestDate}).sort({"flag": -1});
            let rankingData = [];
            for await (const doc of latestRecords){
                rankingData.push(doc);
            }

            //let userRank = rankingData.length == 0 ? "To be calculated" : (rankingData.sort( (a,b) => { return b-a}).findIndex(i => i.ign == exactIgn) + 1);
            
            //build out embedded message
            let highestScore = data.reduce((prev, current) => { return prev.flag > current.flag ? prev : current; });
            let avgScore = data.length == 1 ? data[0].flag : (data.reduce((sum, current) => { 
                return {flag: sum.flag + current.flag};
            })).flag / data.length;

            let charclass = data[0].class;
            
            let latest5Scores = `\`\`\``;
            data.slice(0,5).forEach((obj) => {
                latest5Scores = latest5Scores.concat(`${NumberFormatHelper.toLocaleString(obj.flag)} on ${obj.date.toLocaleDateString()} \n`);
            });
            latest5Scores = latest5Scores.concat(`\`\`\``);
            
            let attachment = await generateScoreRaceChart(data);
            let charImageRequest = await request(`https://www.nexon.com/api/maplestory/no-auth/v1/ranking/na?type=overall&id=legendary&reboot_index=1&page_index=1&character_name=${ign}`)
            let charImageResponse = (await charImageRequest.body.json()).ranks[0];
            let level = data[data.length-1].lvl;

            const exampleEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(exactIgn)
                .setURL(`https://mapleranks.com/u/${exactIgn}`)
                .setDescription("Level "+ level + " " + charclass)
                .setThumbnail(charImageResponse.characterImgURL)
                .setImage("attachment://graph.png")
                // .addFields(
                //     { name: 'Weekly Ranking', value: '#'+userRank },
                // )
                .addFields(
                    { name: 'Highest Score', value: NumberFormatHelper.toLocaleString(highestScore.flag), inline: true },
                    { name: 'Date', value: highestScore.date.toLocaleDateString(), inline: true },
                    { name: 'Avg Score', value: NumberFormatHelper.toLocaleString(avgScore), inline: true },
                )
                // .addFields(
                //     { name: '\u200B', value: '\u200B' }, //adding empty row for spacing
                // )
                .addFields(
                    { name: 'Last 5 Scores', value: latest5Scores },
                )
                //.setImage('https://i.imgur.com/AfFp7pu.png') // url of generated chart.
                .setFooter({ text: quote, iconURL: 'https://i.imgur.com/BC5eprN.png' })

            message.channel.send({ embeds: [exampleEmbed], files: [attachment] });

        } catch (error) {
            message.channel.send("Woops, an error occured! Unable to process your info.");
            console.log(error);
        }
    }
})


client.login(config.discord.token)