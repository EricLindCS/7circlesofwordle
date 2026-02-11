import path from 'node:path';
import dotenv from 'dotenv';
import express, {
	type Application,
	type Request,
	type Response,
} from 'express';
import { fetchAndRetry } from './utils';
import {
	loadWordList,
	hangmanGuessLetter,
	hangmanGuessWord,
	validateGuessStage2,
	validateGuessStage3,
	validateGuessStage4,
} from './game';
import { getProgress, setProgress, resetProgress } from './progress';

// .env must live in discord-activity-starter/ (project root). From dist/ we go up 3 levels.
const envPath = path.join(__dirname, '..', '..', '..', '.env');
const loaded = dotenv.config({ path: envPath });
if (loaded.error) {
	console.warn('[server] .env not found at', envPath, '- using process env. Put .env in discord-activity-starter/');
}
const hasClientId = !!(process.env.VITE_DISCORD_CLIENT_ID ?? process.env.VITE_CLIENT_ID);
const hasSecret = !!(process.env.DISCORD_CLIENT_SECRET ?? process.env.CLIENT_SECRET);
if (!hasClientId || !hasSecret) {
	console.warn('[server] Missing OAuth2 credentials in .env: need VITE_DISCORD_CLIENT_ID (or VITE_CLIENT_ID) and DISCORD_CLIENT_SECRET (or CLIENT_SECRET). Copy example.env to .env.');
}

loadWordList();

const app: Application = express();
const port: number = Number(process.env.PORT) || 3001;

/** Get Discord user id from Bearer token. Returns null if invalid. */
async function userIdFromToken(req: Request): Promise<string | null> {
	const auth = req.headers.authorization;
	if (!auth?.startsWith('Bearer ')) return null;
	const token = auth.slice(7);
	const res = await fetch('https://discord.com/api/users/@me', {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!res.ok) return null;
	const data = (await res.json()) as { id?: string };
	return data.id ?? null;
}

// Discord interactions (slash command) — must use raw body for signature verification; register before express.json()
app.post(
	'/api/discord/interactions',
	express.raw({ type: 'application/json' }),
	async (req: Request, res: Response): Promise<void> => {
		const nacl = await import('tweetnacl');
		const sig = req.headers['x-signature-ed25519'] as string | undefined;
		const timestamp = req.headers['x-signature-timestamp'] as string | undefined;
		const publicKeyHex = process.env.PUBLIC_KEY;
		if (!sig || !timestamp || !publicKeyHex || !(req.body instanceof Buffer)) {
			res.status(401).send('Bad request');
			return;
		}
		const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), req.body]);
		const signature = Buffer.from(sig, 'hex');
		const publicKey = Buffer.from(publicKeyHex, 'hex');
		if (signature.length !== 64 || publicKey.length !== 32) {
			res.status(401).send('Bad request');
			return;
		}
		if (!nacl.sign.detached.verify(message, new Uint8Array(signature), new Uint8Array(publicKey))) {
			res.status(401).send('Invalid signature');
			return;
		}
		const body = JSON.parse(req.body.toString('utf8')) as {
			type?: number;
			data?: { name?: string };
			member?: { user?: { id?: string } };
			user?: { id?: string };
		};
		// Ping (type 1) — Discord requires ACK
		if (body.type === 1) {
			res.json({ type: 1 });
			return;
		}
		// Application command (type 2) — e.g. /wordle-reset
		if (body.type === 2 && body.data?.name === 'wordle-reset') {
			const userId = body.member?.user?.id ?? body.user?.id;
			if (userId) resetProgress(userId);
			res.json({
				type: 4,
				data: {
					content: 'Your progress for today has been reset. You can start from Stage 1 again.',
					flags: 0,
				},
			});
			return;
		}
		res.json({ type: 4, data: { content: 'Unknown command.', flags: 0 } });
	}
);

app.use(express.json());

// Progress: get (restore), update, reset (for testing)
app.get('/api/progress', async (req: Request, res: Response) => {
	const userId = await userIdFromToken(req);
	if (!userId) {
		res.status(401).json({ error: 'Unauthorized' });
		return;
	}
	res.json(getProgress(userId));
});

app.post('/api/progress', async (req: Request, res: Response) => {
	const userId = await userIdFromToken(req);
	if (!userId) {
		res.status(401).json({ error: 'Unauthorized' });
		return;
	}
	const { stage, gameOver, victory } = req.body ?? {};
	setProgress(userId, {
		stage: typeof stage === 'number' ? stage : 1,
		gameOver: Boolean(gameOver),
		victory: Boolean(victory),
	});
	res.json({ ok: true });
});

app.post('/api/reset', async (req: Request, res: Response) => {
	const userId = await userIdFromToken(req);
	if (!userId) {
		res.status(401).json({ error: 'Unauthorized' });
		return;
	}
	resetProgress(userId);
	res.json({ ok: true, message: 'Progress reset for today.' });
});

if (process.env.NODE_ENV === 'production') {
	const clientBuildPath = path.join(__dirname, '../../client/dist');
	app.use(express.static(clientBuildPath));
}

// Hangman (Stage 1): guess a letter or the full word
app.post('/api/hangman/guess', (req: Request, res: Response) => {
	const { letter, word } = req.body ?? {};
	if (word != null && word !== '') {
		const result = hangmanGuessWord(String(word));
		if ('error' in result) {
			res.status(400).json({ error: result.error });
			return;
		}
		res.json(result);
		return;
	}
	const result = hangmanGuessLetter(letter ?? '');
	if ('error' in result) {
		res.status(400).json({ error: result.error });
		return;
	}
	res.json(result);
});

// Wordle stages 2, 3, 4
app.post('/api/wordle/guess', (req: Request, res: Response) => {
	const { guess, stage, history } = req.body ?? {};
	const g = guess ?? '';
	if (stage === 2) {
		const result = validateGuessStage2(g);
		if ('error' in result) {
			res.status(400).json({ error: result.error });
			return;
		}
		res.json(result);
		return;
	}
	if (stage === 3) {
		const result = validateGuessStage3(g, Array.isArray(history) ? history : []);
		if ('error' in result) {
			res.status(400).json({ error: result.error });
			return;
		}
		res.json(result);
		return;
	}
	if (stage === 4) {
		const result = validateGuessStage4(g);
		if ('error' in result) {
			res.status(400).json({ error: result.error });
			return;
		}
		res.json(result);
		return;
	}
	res.status(400).json({ error: 'Missing or invalid stage (2, 3, or 4)' });
});

// Fetch token from developer portal and return to the embedded app
app.post('/api/token', async (req: Request, res: Response) => {
	try {
		const response = await fetchAndRetry('https://discord.com/api/oauth2/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				client_id: process.env.VITE_DISCORD_CLIENT_ID ?? process.env.VITE_CLIENT_ID ?? '',
				client_secret: process.env.DISCORD_CLIENT_SECRET ?? process.env.CLIENT_SECRET ?? '',
				grant_type: 'authorization_code',
				code: req.body.code ?? '',
			}),
		});

		const data = (await response.json()) as { access_token?: string; error?: string };
		if (!response.ok) {
			res.status(response.status).json({ error: data.error ?? `Discord API: ${response.status}` });
			return;
		}
		if (!data.access_token) {
			res.status(500).json({ error: 'No access token in response' });
			return;
		}
		res.send({ access_token: data.access_token });
	} catch (err) {
		res.status(500).json({ error: (err as Error).message ?? 'Token exchange failed' });
	}
});

app.listen(port, () => {
	console.log(`App is listening on port ${port} !`);
});
