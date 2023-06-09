'use strict';
import { ClusterClient, getInfo } from 'discord-hybrid-sharding';
import { ActivityType, Client, Collection, GatewayIntentBits } from 'discord.js';
import { readdirSync } from 'node:fs';
import path, { basename, join } from 'node:path';
import { logError } from './functions/consoleLogging.js';
import { database } from './functions/databaseFunctions.js';
import { updateServers } from './functions/updateServers.js';

const client = new Client({
	shards: getInfo().SHARD_LIST,
	shardCount: getInfo().TOTAL_SHARDS,
	intents: [GatewayIntentBits.Guilds],
	presence: { activities: [{ name: '/help', type: ActivityType.Watching }] },
	rest: { rejectOnRateLimit: ['/channels'] }
});
client.cluster = new ClusterClient(client);

let clientReady = false;
let clusterReady = false;

client.cluster.once('ready', async () => {
	clusterReady = true;
	if (clientReady) init();
});

client.once('ready', async () => {
	clientReady = true;
	if (clusterReady) init();
});

client.login(process.env.TOKEN);

async function init() {
	// Database Handler
	database.on('error', (error) => logError('Keyv connection error:', error));

	// Command Handler
	client.commands = new Collection();
	const commandsPath = path.resolve(process.cwd(), './commands');
	const commandFiles = readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = join(commandsPath, file);
		const command = await import(filePath);
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			logError(`Error registering /${basename(file, '.js')} command: missing a required "data" or "execute" property.`);
		}
	}

	// Event Handler
	const eventsPath = path.resolve(process.cwd(), './events');
	const eventFiles = readdirSync(eventsPath).filter((file) => file.endsWith('.js'));
	for (const file of eventFiles) {
		const filePath = join(eventsPath, file);
		const event = await import(filePath);
		if (event.once) {
			client.once(event.name, (...args) => event.execute(...args));
		} else {
			client.on(event.name, (...args) => event.execute(...args));
		}
	}

	// Update Servers
	await updateServers(client);
	setInterval(updateServers, 6 * 60 * 1000, client);
}
