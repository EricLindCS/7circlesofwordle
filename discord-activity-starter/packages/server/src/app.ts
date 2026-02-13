import path from 'node:path';
import dotenv from 'dotenv';
import express, {
	type Application,
	type Request,
	type Response,
} from 'express';
import nacl from 'tweetnacl';
import { fetchAndRetry } from './utils';
import {
	loadWordList,
	getTodayWord,
	getTodayWordStage2,
	getTodayWordStage3,
	getTodayWordStage4,
	getTodayWordStage6,
	getTodayWord7,
	hangmanGuessLetter,
	hangmanGuessWord,
	getAnagramLettersStage3,
	getAnagramHint,
	validateAnagramStage3,
	validateChainWord,
	validateGuessStage2,
	validateGuessStage5,
	validateGuessStage6,
	validateGuessStage7,
	getFeedbackForFirst5Letters,
	getFeedbackForFirst6Letters,
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
	const { stage, gameOver, victory, stage1, stage2, stage3, stage4, stage5, stage6, stage7, solvedWord1, solvedWord2, solvedWord3, solvedWord4, solvedWord5, solvedWord6 } = req.body ?? {};
	const patch: Record<string, unknown> = {
		stage: typeof stage === 'number' && stage >= 1 && stage <= 7 ? stage : undefined,
		gameOver: typeof gameOver === 'boolean' ? gameOver : undefined,
		victory: typeof victory === 'boolean' ? victory : undefined,
	};
	if (stage1 != null && Array.isArray(stage1.revealed)) patch.stage1 = stage1;
	if (stage2 != null && Array.isArray(stage2.completedRows)) patch.stage2 = stage2;
	if (stage3 != null && typeof stage3 === 'object') patch.stage3 = stage3;
	if (stage4 != null && Array.isArray(stage4.completedRows)) patch.stage4 = stage4;
	if (stage5 != null && Array.isArray(stage5.completedRows)) patch.stage5 = stage5;
	if (stage6 != null && Array.isArray(stage6.completedRows)) patch.stage6 = stage6;
	if (stage7 != null && Array.isArray(stage7.completedRows)) patch.stage7 = stage7;
	if (typeof solvedWord1 === 'string') patch.solvedWord1 = solvedWord1;
	if (typeof solvedWord2 === 'string') patch.solvedWord2 = solvedWord2;
	if (typeof solvedWord3 === 'string') patch.solvedWord3 = solvedWord3;
	if (typeof solvedWord4 === 'string') patch.solvedWord4 = solvedWord4;
	if (typeof solvedWord5 === 'string') patch.solvedWord5 = solvedWord5;
	if (typeof solvedWord6 === 'string') patch.solvedWord6 = solvedWord6;
	setProgress(userId, patch as Parameters<typeof setProgress>[1]);
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

// Total score per user (all-time). Key: userId
const totalScoreStore = new Map<string, number>();

// ── Daily channel/user score tracking for daily summary messages ──
type DailyUserEntry = {
	username: string;
	dailyScore: number;
	stageReached: number;
	victory: boolean;
	gameOver: boolean;
};
// channelId → Map<userId, DailyUserEntry>
const dailyChannelScores = new Map<string, Map<string, DailyUserEntry>>();
let currentTrackingDate = (() => {
	const d = new Date();
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
})();

function todayUTC(): string {
	const d = new Date();
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const STAGE_NAMES: Record<number, string> = {
	1: 'Circle 1 (Hangman)',
	2: 'Circle 2 (Wordle)',
	3: 'Circle 3 (Anagrams)',
	4: 'Circle 4 (Chains ;))',
	5: 'Circle 5 (Totally Normal Wordle)',
	6: 'Circle 6 (Big Wordle)',
	7: 'Circle 7 (Evil Wordle)',
};

/** Send daily summary to all channels that had games yesterday, then clear the store. */
async function sendDailySummaries(): Promise<void> {
	const botToken = process.env.BOT_TOKEN;
	if (!botToken) {
		console.warn('[daily-summary] No BOT_TOKEN, skipping daily summaries.');
		return;
	}
	if (dailyChannelScores.size === 0) {
		console.log('[daily-summary] No games played yesterday, nothing to send.');
		return;
	}

	console.log(`[daily-summary] Sending summaries to ${dailyChannelScores.size} channel(s)…`);

	for (const [channelId, users] of dailyChannelScores) {
		if (users.size === 0) continue;

		const entries = [...users.entries()];
		const totalDailyPts = entries.reduce((sum, [, u]) => sum + u.dailyScore, 0);
		const avgPts = totalDailyPts / entries.length;

		// Build per-user lines
		const userLines = entries.map(([userId, u]) => {
			const stageName = STAGE_NAMES[u.stageReached] ?? `Circle ${u.stageReached}`;
			const allTimeTotal = totalScoreStore.get(userId) ?? 0;
			let outcome: string;
			if (u.victory) {
				outcome = '✅ conquered all seven circles!';
			} else if (u.gameOver) {
				outcome = `💀 fell at ${stageName}`;
			} else {
				outcome = `🚶 wandered away at ${stageName}`;
			}
			return `  **${u.username}** — ${outcome}\n    Daily: **${u.dailyScore}** pts · All-time: **${allTimeTotal}** pts`;
		});

		const content = [
			`📊 **7 Circles of Wordle — Daily Recap** 📊`,
			``,
			...userLines,
			``,
			`**Channel stats:** ${entries.length} player${entries.length === 1 ? '' : 's'} · Avg: **${avgPts.toFixed(1)}** pts · Total: **${totalDailyPts}** pts`,
			``,
			`🔥 A new day dawns — new words are ready! Good luck! 🔥`,
		].join('\n');

		try {
			const discordRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bot ${botToken}`,
				},
				body: JSON.stringify({ content }),
			});
			if (!discordRes.ok) {
				const err = await discordRes.text();
				console.warn(`[daily-summary] Failed to send to channel ${channelId}:`, discordRes.status, err);
			}
		} catch (e) {
			console.warn(`[daily-summary] Error sending to channel ${channelId}:`, e);
		}
	}

	// Clear daily tracking after sending
	dailyChannelScores.clear();
	console.log('[daily-summary] Done, daily scores cleared.');
}

/** Check if the UTC date has rolled over; if so, send summaries and reset tracking. */
async function checkDayRollover(): Promise<void> {
	const today = todayUTC();
	if (today !== currentTrackingDate) {
		console.log(`[daily-summary] Day rolled over: ${currentTrackingDate} → ${today}`);
		await sendDailySummaries();
		currentTrackingDate = today;
	}
}

// Check for day rollover every 60 seconds
setInterval(() => {
	checkDayRollover().catch((e) => console.warn('[daily-summary] rollover check error:', e));
}, 60_000);

// Report score to channel/DM after game over or victory (requires BOT_TOKEN)
app.post('/api/report-score', async (req: Request, res: Response) => {
	const userId = await userIdFromToken(req);
	if (!userId) {
		res.status(401).json({ error: 'Unauthorized' });
		return;
	}
	const botToken = process.env.BOT_TOKEN;
	if (!botToken) {
		res.status(503).json({ error: 'Score reporting not configured' });
		return;
	}
	const { channelId, stageReached, victory, gameOver, dailyScore, username } = req.body ?? {};
	if (!channelId || typeof channelId !== 'string') {
		res.json({ ok: true, skipped: true, reason: 'No channelId' });
		return;
	}
	const daily = typeof dailyScore === 'number' && dailyScore >= 0 ? dailyScore : 0;
	const prevTotal = totalScoreStore.get(userId) ?? 0;
	const newTotal = prevTotal + daily;
	totalScoreStore.set(userId, newTotal);

	// Track this play for daily summary
	await checkDayRollover();
	if (typeof channelId === 'string' && channelId) {
		if (!dailyChannelScores.has(channelId)) {
			dailyChannelScores.set(channelId, new Map());
		}
		const channelUsers = dailyChannelScores.get(channelId)!;
		const displayNameEntry = typeof username === 'string' && username.trim() ? username.trim() : `User ${userId}`;
		channelUsers.set(userId, {
			username: displayNameEntry,
			dailyScore: daily,
			stageReached: Number(stageReached) || 1,
			victory: Boolean(victory),
			gameOver: Boolean(gameOver),
		});
	}

	const stageNames: Record<number, string> = {
		1: 'Circle 1 (Hangman)',
		2: 'Circle 2 (Wordle)',
		3: 'Circle 3 (Anagrams)',
		4: 'Circle 4 (Chains ;))',
		5: 'Circle 5 (Totally Normal Wordle)',
		6: 'Circle 6 (Big Wordle)',
		7: 'Circle 7 (Evil Wordle)',
	};
	const stageName = stageNames[Number(stageReached)] ?? `Circle ${stageReached}`;
	const displayName = typeof username === 'string' && username.trim() ? username.trim() : `User <@${userId}>`;
	const scoreLine = `Daily score: **${daily}** pts · Total score: **${newTotal}** pts`;

	// Randomized flavor messages
	const defeatVerbs = [
		`burned up at ${stageName}`,
		`fell into the abyss at ${stageName}`,
		`got cooked at ${stageName}`,
		`was consumed by flames at ${stageName}`,
		`got toasted at ${stageName}`,
		`tripped into the fire at ${stageName}`,
		`couldn't escape ${stageName}`,
		`met their doom at ${stageName}`,
		`got roasted at ${stageName}`,
		`was swallowed whole by ${stageName}`,
	];
	const victoryVerbs = [
		'conquered all seven circles!',
		'escaped the flames unscathed!',
		'survived all seven circles somehow!',
		'made it out alive!',
		'walked through fire and emerged victorious!',
		'is officially flame-proof!',
		'beat all seven circles and lived to tell the tale!',
		'danced through every circle like it was nothing!',
	];
	const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

	let content: string;
	if (Boolean(victory)) {
		content = `🔥 **7 Circles of Wordle** — **${displayName}** ${pick(victoryVerbs)} 🎉\n${scoreLine}`;
	} else if (Boolean(gameOver)) {
		content = `🕯️ **7 Circles of Wordle** — **${displayName}** ${pick(defeatVerbs)} 💀\n${scoreLine}`;
	} else {
		content = `🕯️ **7 Circles of Wordle** — **${displayName}** wandered away at ${stageName}.\n${scoreLine}`;
	}
	// Helper: send a message to a channel with a given auth header
	async function sendToChannel(targetChannelId: string, msg: string, authHeader: string): Promise<globalThis.Response> {
		return fetch(`https://discord.com/api/v10/channels/${targetChannelId}/messages`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: authHeader,
			},
			body: JSON.stringify({ content: msg }),
		});
	}

	// Extract user's Bearer token from the request
	const userBearerToken = req.headers.authorization?.startsWith('Bearer ')
		? req.headers.authorization.slice(7)
		: null;

	try {
		// First try with Bot token (works for guild text channels where bot has Send Messages)
		const botRes = await sendToChannel(channelId, content, `Bot ${botToken}`);
		if (botRes.ok) {
			res.json({ ok: true });
			return;
		}

		const errStatus = botRes.status;
		const errBody = await botRes.text();
		console.warn(`[report-score] Bot send to ${channelId} failed (${errStatus}: ${errBody})`);

		// Fallback: use the user's OAuth Bearer token (works for DM channels the user is in)
		if (userBearerToken) {
			console.log(`[report-score] Trying user Bearer token for channel ${channelId}…`);
			const userRes = await sendToChannel(channelId, content, `Bearer ${userBearerToken}`);
			if (userRes.ok) {
				console.log(`[report-score] Sent via user Bearer token to ${channelId}`);
				res.json({ ok: true, method: 'bearer' });
				return;
			}
			const userErr = await userRes.text();
			console.warn(`[report-score] User Bearer send also failed (${userRes.status}: ${userErr})`);
		}

		res.status(502).json({ error: 'Failed to send message to channel' });
	} catch (e) {
		console.warn('[report-score]', e);
		res.status(500).json({ error: 'Failed to report score' });
	}
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

// Stage 3: Anagram (unscramble)
app.get('/api/anagram/letters', (_req: Request, res: Response) => {
	res.json({ letters: getAnagramLettersStage3() });
});

app.post('/api/anagram/guess', (req: Request, res: Response) => {
	const { guess } = req.body ?? {};
	const result = validateAnagramStage3(String(guess ?? ''));
	if ('error' in result) {
		res.status(400).json({ error: result.error });
		return;
	}
	res.json(result);
});

app.get('/api/anagram/hint/:pos', (req: Request, res: Response) => {
	const pos = Number(req.params.pos);
	const result = getAnagramHint(pos);
	if ('error' in result) {
		res.status(400).json({ error: result.error });
		return;
	}
	res.json(result);
});

// Stage 4: Word Chain
app.get('/api/chain/start', (_req: Request, res: Response) => {
	res.json({ word: getTodayWordStage4() });
});

app.post('/api/chain/validate', (req: Request, res: Response) => {
	const { guess, previousWord, chain } = req.body ?? {};
	if (!guess || !previousWord) {
		res.status(400).json({ error: 'Missing guess or previousWord' });
		return;
	}
	const chainArr = Array.isArray(chain) ? chain.map(String) : undefined;
	const result = validateChainWord(String(guess), String(previousWord), chainArr);
	if (!result.valid) {
		res.status(400).json({ error: result.error ?? 'Invalid word' });
		return;
	}
	res.json({ valid: true });
});

// Wordle stages 2, 5 (5-letter), 6 (6-letter), 7 (7-letter). Stage 3 is anagram, Stage 4 is chain.
app.post('/api/wordle/guess', (req: Request, res: Response) => {
	const { guess, stage, history } = req.body ?? {};
	const g = guess ?? '';
	if (stage === 2) {
		// Debug: log guess vs secret in non-production to help track incorrect wins
		if (process.env.NODE_ENV !== 'production') {
			try {
				const secretDbg = getTodayWordStage2();
				console.log(`[debug] /api/wordle/guess stage=2 — guess=${g} secret=${secretDbg}`);
			} catch (e) {
				console.log('[debug] /api/wordle/guess stage=2 — failed to read secret', e);
			}
		}
		const result = validateGuessStage2(g);
		if ('error' in result) {
			res.status(400).json({ error: result.error });
			return;
		}
		res.json(result);
		return;
	}
	if (stage === 5) {
		const result = validateGuessStage5(g, Array.isArray(history) ? history : []);
		if ('error' in result) {
			res.status(400).json({ error: result.error });
			return;
		}
		res.json(result);
		return;
	}
	if (stage === 6) {
		const result = validateGuessStage6(g);
		if ('error' in result) {
			res.status(400).json({ error: result.error });
			return;
		}
		res.json(result);
		return;
	}
	if (stage === 7) {
		const result = validateGuessStage7(g);
		if ('error' in result) {
			res.status(400).json({ error: result.error });
			return;
		}
		res.json(result);
		return;
	}
	res.status(400).json({ error: 'Missing or invalid stage (2, 4, 5, 6, or 7)' });
});

// Stage 6 prefill: feedback for first 5 letters (from stage 5's 5-letter word)
app.post('/api/wordle/stage6-prefill', (req: Request, res: Response) => {
	const { word5 } = req.body ?? {};
	const w = String(word5 ?? '').trim().toLowerCase();
	if (w.length !== 5) {
		res.status(400).json({ error: 'Word must be 5 letters' });
		return;
	}
	const secret6 = getTodayWordStage6();
	const feedback = getFeedbackForFirst5Letters(secret6, w);
	res.json({ feedback });
});

// Stage 7 prefill: feedback for first 6 letters (from stage 6's 6-letter word)
app.post('/api/wordle/stage7-prefill', (req: Request, res: Response) => {
	const { word6 } = req.body ?? {};
	const w = String(word6 ?? '').trim().toLowerCase();
	if (w.length !== 6) {
		res.status(400).json({ error: 'Word must be 6 letters' });
		return;
	}
	const secret7 = getTodayWord7();
	const feedback = getFeedbackForFirst6Letters(secret7, w);
	res.json({ feedback });
});

// Debug endpoint: return today's secrets for each stage (only in non-production)
if (process.env.NODE_ENV !== 'production') {
	app.get('/api/debug/today-words', (_req: Request, res: Response) => {
		try {
			res.json({
				date: new Date().toISOString().slice(0, 10),
				stage1: getTodayWord(),
				stage2: getTodayWordStage2(),
				stage3: getTodayWordStage3(),
				stage4: getTodayWordStage4(),
				stage6: getTodayWordStage6(),
				stage7: getTodayWord7(),
			});
		} catch (e) {
			res.status(500).json({ error: (e as Error).message ?? String(e) });
		}
	});
}

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
