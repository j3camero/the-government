const db = require('./database');

async function CalculateChainOfCommand() {
    console.log('Chain of command');
    await LoadDiscordEdges();
}

async function LoadDiscordEdges() {
    const relationships = await db.GetTimeMatrix();
    return relationships;
}

async function LoadRustEdges() {
    
}

async function LoadDiscordVertices() {

}

async function LoadRustVertices() {

}

module.exports = {
    CalculateChainOfCommand,
};
