const { SlashCommandBuilder } = require("@discordjs/builders");
const rp = require("request-promise");
const { MessageEmbed, MessageAttachment, AttachmentBuilder } = require("discord.js");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
let chartEmbed = {};

// This function will return MessageAttachment object from discord.js
// Pass as much parameter as you need
const generateScoreChart = async (scores) => {
    let labels = scores.map((s) => { return s["date"] });
    let data = scores.map((s) => { return s["amount"] });

    const renderer = new ChartJSNodeCanvas({ width: 800, height: 600 });
    const image = await renderer.renderToBuffer({
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    data: data,
                    backgroundColor: '#026623',
                    borderColor: '#026623',
                    borderWidth: 0,
                },
            ],
        },
        options: {
            layout: { padding: { bottom: 20, top: 25, left: 10, right: 10 } },
            scales: {
                x: {
                    ticks: { font: { size: 25 }, color: '#fff' },
                    grid: { display: false, drawBorder: false },
                },
                xLine: {
                    offset: false,
                    ticks: { display: false },
                    grid: { display: false, drawBorder: false },
                },
                y: {
                    grid: { display: false, drawBorder: false },
                    ticks: { font: { size: 25 }, color: '#fff' }
                }
            },
            plugins: {
                datalabels: {
                    anchor: 'center',
                    align: 'center',
                    color: '#0b3062',
                    font: {
                        weight: 'bold',
                    },
                },
                legend: { display: false }
            },
        },
    });
    return new AttachmentBuilder(image, { name: "graph.png" });
};

module.exports = { generateScoreChart }
