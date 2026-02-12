/**
 * Register the /wordle-reset slash command with Discord (CHAT_INPUT type per
 * https://discord.com/developers/interactions/application-commands#slash-command-interaction).
 * Run from discord-activity-starter: node scripts/register-slash-command.js
 * Requires .env with BOT_TOKEN and VITE_APPLICATION_ID (or VITE_CLIENT_ID).
 */
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
	console.error('Missing .env in discord-activity-starter. Copy example.env to .env and set BOT_TOKEN and VITE_APPLICATION_ID.');
	process.exit(1);
}
function parseEnvValue(raw) {
	// Strip surrounding quotes and inline comments (e.g. "value # comment")
	let v = raw.trim();
	const hash = v.indexOf('#');
	if (hash !== -1) v = v.slice(0, hash).trim();
	v = v.replace(/^["']|["']$/g, '');
	return v;
}
const env = Object.fromEntries(
	fs.readFileSync(envPath, 'utf8')
		.split('\n')
		.filter((l) => l.trim() && !l.startsWith('#'))
		.map((l) => {
			const eq = l.indexOf('=');
			const key = l.slice(0, eq).trim();
			const value = parseEnvValue(l.slice(eq + 1));
			return [key, value];
		})
);
// Trim and remove any newlines/carriage returns (e.g. from .env copy-paste)
const rawToken = (env.BOT_TOKEN || process.env.BOT_TOKEN || '').trim().replace(/\s+/g, ' ').trim();
const BOT_TOKEN = rawToken.replace(/\r?\n/g, '');
const APPLICATION_ID = (env.VITE_APPLICATION_ID || env.VITE_CLIENT_ID || process.env.VITE_APPLICATION_ID || process.env.VITE_CLIENT_ID || '').trim();
if (!BOT_TOKEN || !APPLICATION_ID) {
	console.error('Set BOT_TOKEN and VITE_APPLICATION_ID (or VITE_CLIENT_ID) in .env');
	process.exit(1);
}

// 401 usually means wrong token: use Bot token from Developer Portal → Your App → Bot → Token (not Client Secret)
const url = `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`;
const body = {
	name: 'wordle-reset',
	type: 1, // CHAT_INPUT = slash command
	description: 'Reset your 7 Circles of Wordle progress for today.',
};

fetch(url, {
	method: 'POST',
	headers: {
		'Content-Type': 'application/json',
		Authorization: `Bot ${BOT_TOKEN}`,
	},
	body: JSON.stringify(body),
})
	.then((r) => r.json())
	.then((data) => {
		if (data.id) {
			console.log('Slash command registered:', data.name, '(id:', data.id + ')');
		} else {
			console.error('Discord API error:', data);
			if (data.message && String(data.message).includes('401')) {
				console.error('\n401 Unauthorized: Use the BOT token from Developer Portal → Your App → Bot → Token (copy or reset). Do not use the Client Secret.');
			}
			process.exit(1);
		}
	})
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
