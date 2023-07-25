const { SlashCommandBuilder } = require("@discordjs/builders");
const rp = require("request-promise");
const { MessageEmbed, MessageAttachment, AttachmentBuilder } = require("discord.js");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
let chartEmbed = {};

// This function will return MessageAttachment object from discord.js
// Pass as much parameter as you need
const generateScoreChart = async (scores) => {
    let labels = scores.map((s) => { return [s["date"].slice(0,-5), '2023'] });
    let data = scores.map((s) => { return s["amount"] });

    const renderer = new ChartJSNodeCanvas({ width: 800, height: 600, plugins: {
        modern: ['chartjs-plugin-datalabels']
    }});
    const image = await renderer.renderToBuffer({
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    data: data,
                    backgroundColor: 'rgba(2, 102, 35, 0.2)',
                    borderColor: '#026623',
                    borderWidth: 3,
                    label: "Score",
                    datalabels: {
                        align: 'end',
                        anchor: 'end',
                        color: 'black',
                        font: {
                            size: 22
                        }
                      }
                },
            ],
        },
        options: {
            layout: { padding: { bottom: 20, top: 50, left: 10, right: 10 } },
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
                    backgroundColor: '#cbcbcb',
                      borderRadius: 10,
                      font: {
                        weight: 'normal'
                      },
                      formatter: function(value, context) {
                        return value.toLocaleString('en-US');
                      }
                      ,
                      padding: 7
                    },
                    legend: { display: false }
            },

            // Core options
            aspectRatio: 5 / 3,
            layout: {
                padding: {
                    top: 50,
                    right: 16,
                    bottom: 0,
                    left: 8
                }
            },
        },
    });
    return new AttachmentBuilder(image, { name: "graph.png" });
};

module.exports = { generateScoreChart }
