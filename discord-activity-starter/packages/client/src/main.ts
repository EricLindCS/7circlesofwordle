import { DiscordSDK } from '@discord/embedded-app-sdk';
import './style.css';

let auth: { access_token: string } | null = null;
const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID ?? import.meta.env.VITE_CLIENT_ID;
const discordSdk = new DiscordSDK(clientId ?? '');

const WORD_LENGTH = 5;
const WORD_LENGTH_7 = 7;
const MAX_GUESSES = 6;
const MAX_WRONG_HANGMAN = 6;
const FEEDBACK = { absent: 0, present: 1, correct: 2 } as const;

type CellState = { letter: string; feedback: typeof FEEDBACK[keyof typeof FEEDBACK] | null };

function isStandalone(): boolean {
	if (typeof window === 'undefined') return false;
	const inIframe = window.parent !== window;
	const fromDiscordProxy = window.location.hostname.endsWith('.discordsays.com');
	return !inIframe && !fromDiscordProxy;
}

async function setupDiscordSdk(): Promise<void> {
	await discordSdk.ready();
	console.log('Discord SDK is ready');
	if (!clientId) throw new Error('VITE_DISCORD_CLIENT_ID or VITE_CLIENT_ID must be set in .env');
	const { code } = await discordSdk.commands.authorize({
		client_id: clientId,
		response_type: 'code',
		state: '',
		prompt: 'none',
		scope: ['identify', 'guilds', 'applications.commands'],
	});
	const response = await fetch('/api/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ code }),
	});
	const data = await response.json();
	if (!response.ok) throw new Error(data.error ?? `Token request failed: ${response.status}`);
	const { access_token } = data;
	auth = await discordSdk.commands.authenticate({ access_token });
	if (auth == null) throw new Error('Authenticate command failed');
	console.log('Discord SDK is authenticated');
}

// ---- Game over & victory ----

function renderGameOver(app: HTMLDivElement, onReset: (() => void) | null): void {
	app.innerHTML = `
		<div class="screen screen-gameover">
			<h1 class="screen-title">Game Over</h1>
			<p class="screen-text">Try again tomorrow.</p>
			${onReset ? '<button type="button" class="reset-btn">Reset my progress (testing)</button>' : ''}
		</div>
	`;
	if (onReset) app.querySelector('.reset-btn')?.addEventListener('click', onReset);
}

function renderVictory(app: HTMLDivElement, onReset: (() => void) | null): void {
	app.innerHTML = `
		<div class="screen screen-victory">
			<h1 class="screen-title">You did it!</h1>
			<p class="screen-text">All four stages complete. See you tomorrow.</p>
			${onReset ? '<button type="button" class="reset-btn">Reset my progress (testing)</button>' : ''}
		</div>
	`;
	if (onReset) app.querySelector('.reset-btn')?.addEventListener('click', onReset);
}

// ---- Stage 1: Hangman ----

function renderHangman(
	app: HTMLDivElement,
	onWin: () => void,
	onGameOver: () => void
): void {
	const revealed: (string | null)[] = Array(WORD_LENGTH).fill(null);
	const wrongGuesses: string[] = [];
	let currentWordGuess = '';

	function updateUI(): void {
		const wordEl = app.querySelector('.hangman-word');
		if (wordEl) wordEl.textContent = revealed.map((c) => (c ?? '_')).join(' ');
		const wrongEl = app.querySelector('.hangman-wrong');
		if (wrongEl) wrongEl.textContent = `Wrong: ${wrongGuesses.join(', ') || '—'}`;
		const wordGuessEl = app.querySelector('.hangman-word-guess');
		if (wordGuessEl) wordGuessEl.textContent = currentWordGuess.padEnd(WORD_LENGTH, ' ').split('').join(' ');
		const msgEl = app.querySelector('.hangman-message');
		if (msgEl) (msgEl as HTMLElement).textContent = '';
	}

	async function guessLetter(letter: string): Promise<void> {
		if (wrongGuesses.includes(letter) || revealed.some((c) => c === letter)) return;
		const res = await fetch('/api/hangman/guess', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ letter }),
		});
		const data = await res.json();
		if (!res.ok) {
			(app.querySelector('.hangman-message') as HTMLElement).textContent = data.error ?? 'Error';
			return;
		}
		if (data.isWrong) {
			wrongGuesses.push(letter);
			if (wrongGuesses.length >= MAX_WRONG_HANGMAN) onGameOver();
		} else {
			for (const i of data.positions) revealed[i] = letter;
			if (revealed.every((c) => c != null)) onWin();
		}
		updateUI();
	}

	async function guessWord(): Promise<void> {
		if (currentWordGuess.length !== WORD_LENGTH) return;
		const word = currentWordGuess.toLowerCase();
		currentWordGuess = '';
		updateUI();
		const res = await fetch('/api/hangman/guess', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ word }),
		});
		const data = await res.json();
		if (!res.ok) {
			(app.querySelector('.hangman-message') as HTMLElement).textContent = data.error ?? 'Error';
			return;
		}
		if (data.won) onWin();
		else onGameOver();
	}

	app.innerHTML = '';
	const title = document.createElement('h1');
	title.className = 'wordle-title';
	title.textContent = 'Stage 1: Hangman';
	app.appendChild(title);

	const wordDiv = document.createElement('div');
	wordDiv.className = 'hangman-word';
	wordDiv.textContent = revealed.map(() => '_').join(' ');
	app.appendChild(wordDiv);

	const wrongDiv = document.createElement('div');
	wrongDiv.className = 'hangman-wrong';
	wrongDiv.textContent = 'Wrong: —';
	app.appendChild(wrongDiv);

	const wordGuessLabel = document.createElement('div');
	wordGuessLabel.className = 'hangman-word-guess-label';
	wordGuessLabel.textContent = 'Type 5 letters and press Enter to guess word:';
	app.appendChild(wordGuessLabel);
	const wordGuessDiv = document.createElement('div');
	wordGuessDiv.className = 'hangman-word-guess';
	wordGuessDiv.textContent = '_ _ _ _ _';
	app.appendChild(wordGuessDiv);

	const msgDiv = document.createElement('div');
	msgDiv.className = 'hangman-message wordle-message';
	app.appendChild(msgDiv);

	const keys = 'Q W E R T Y U I O P A S D F G H J K L Z X C V B N M'.split(' ');
	const keyboard = document.createElement('div');
	keyboard.className = 'wordle-keyboard';
	const row1 = document.createElement('div');
	row1.className = 'keyboard-row';
	keys.forEach((key) => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'keyboard-key';
		btn.textContent = key;
		btn.addEventListener('click', () => guessLetter(key));
		row1.appendChild(btn);
	});
	keyboard.appendChild(row1);

	const enterRow = document.createElement('div');
	enterRow.className = 'keyboard-row';
	const enterBtn = document.createElement('button');
	enterBtn.type = 'button';
	enterBtn.className = 'keyboard-key key-enter';
	enterBtn.textContent = 'Enter (guess word)';
	enterBtn.addEventListener('click', () => guessWord());
	enterRow.appendChild(enterBtn);
	keyboard.appendChild(enterRow);

	app.appendChild(keyboard);

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			guessWord();
			return;
		}
		if (e.key === 'Backspace') {
			e.preventDefault();
			currentWordGuess = currentWordGuess.slice(0, -1);
			updateUI();
			return;
		}
		if (e.key.length === 1 && /^[A-Za-z]$/.test(e.key)) {
			e.preventDefault();
			// Build word guess for Enter; otherwise guess as letter
			if (currentWordGuess.length < WORD_LENGTH) {
				currentWordGuess += e.key.toUpperCase();
				updateUI();
			}
			guessLetter(e.key.toUpperCase());
		}
	});
}

// ---- Wordle 5 (stages 2 & 3) ----

function renderWordle5(
	app: HTMLDivElement,
	stage: 2 | 3,
	onWin: () => void,
	onGameOver: () => void
): void {
	let completedRows: CellState[][] = [];
	let history: { guess: string; feedback: number[] }[] = [];
	let currentGuess = '';
	let gameOver = false;

	const row = () => {
		const r = document.createElement('div');
		r.className = 'wordle-row';
		return r;
	};
	const cell = () => {
		const c = document.createElement('div');
		c.className = 'wordle-cell';
		return c;
	};

	const grid = document.createElement('div');
	grid.className = 'wordle-grid';
	for (let i = 0; i < MAX_GUESSES; i++) {
		const r = row();
		for (let j = 0; j < WORD_LENGTH; j++) r.appendChild(cell());
		grid.appendChild(r);
	}

	const message = document.createElement('div');
	message.className = 'wordle-message';

	const keys = [
		'Q W E R T Y U I O P'.split(' '),
		'A S D F G H J K L'.split(' '),
		['Enter', ...'Z X C V B N M'.split(' '), 'Backspace'],
	];
	const keyboard = document.createElement('div');
	keyboard.className = 'wordle-keyboard';
	keys.forEach((keyRow) => {
		const rowEl = document.createElement('div');
		rowEl.className = 'keyboard-row';
		keyRow.forEach((key) => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'keyboard-key';
			if (key === 'Enter') btn.className += ' key-enter';
			if (key === 'Backspace') btn.className += ' key-backspace';
			btn.textContent = key === 'Backspace' ? '⌫' : key;
			btn.addEventListener('click', () => handleKey(key));
			rowEl.appendChild(btn);
		});
		keyboard.appendChild(rowEl);
	});

	function updateGrid(): void {
		const rows = grid.querySelectorAll('.wordle-row');
		rows.forEach((rowEl, rowIndex) => {
			const cells = rowEl.querySelectorAll('.wordle-cell');
			if (rowIndex < completedRows.length) {
				const rowState = completedRows[rowIndex];
				rowState.forEach((s, colIndex) => {
					const cellEl = cells[colIndex];
					cellEl.textContent = s.letter;
					cellEl.className = 'wordle-cell';
					if (s.feedback !== null) {
						cellEl.classList.add(
							s.feedback === FEEDBACK.correct ? 'correct' :
							s.feedback === FEEDBACK.present ? 'present' : 'absent'
						);
					}
				});
			} else if (rowIndex === completedRows.length) {
				for (let i = 0; i < WORD_LENGTH; i++) {
					cells[i].textContent = currentGuess[i] ?? '';
					cells[i].className = 'wordle-cell' + (currentGuess[i] ? ' filled' : '');
				}
			} else {
				cells.forEach((c) => { c.textContent = ''; c.className = 'wordle-cell'; });
			}
		});
	}

	async function handleKey(key: string): Promise<void> {
		if (gameOver) return;
		if (key === 'Enter') {
			if (currentGuess.length !== WORD_LENGTH) {
				message.textContent = 'Not enough letters';
				message.className = 'wordle-message error';
				return;
			}
			message.textContent = '';
			const body: { guess: string; stage: number; history?: { guess: string; feedback: number[] }[] } = {
				guess: currentGuess.toLowerCase(),
				stage,
			};
			if (stage === 3) body.history = history;
			const res = await fetch('/api/wordle/guess', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			const data = await res.json();
			if (!res.ok) {
				message.textContent = data.error ?? 'Invalid guess';
				message.className = 'wordle-message error';
				return;
			}
			const rowState: CellState[] = currentGuess.split('').map((letter, i) => ({
				letter: letter.toUpperCase(),
				feedback: data.feedback[i],
			}));
			completedRows.push(rowState);
			history.push({ guess: currentGuess.toLowerCase(), feedback: data.feedback });
			currentGuess = '';
			if (data.won) onWin();
			else if (completedRows.length >= MAX_GUESSES) onGameOver();
			updateGrid();
			updateKeyboardState();
			return;
		}
		if (key === 'Backspace') {
			currentGuess = currentGuess.slice(0, -1);
			updateGrid();
			message.textContent = '';
			return;
		}
		if (key.length === 1 && /^[A-Za-z]$/.test(key) && currentGuess.length < WORD_LENGTH) {
			currentGuess += key.toUpperCase();
			updateGrid();
			message.textContent = '';
		}
	}

	const keyFeedback: Record<string, number> = {};
	function updateKeyboardState(): void {
		completedRows.flat().forEach(({ letter, feedback }) => {
			const k = letter.toUpperCase();
			if (feedback != null && (keyFeedback[k] == null || feedback > keyFeedback[k])) keyFeedback[k] = feedback;
		});
		keyboard.querySelectorAll('.keyboard-key').forEach((btn) => {
			const letter = (btn as HTMLElement).textContent?.trim();
			if (letter && letter.length === 1) {
				btn.className = 'keyboard-key';
				if (keyFeedback[letter] === FEEDBACK.correct) btn.classList.add('correct');
				else if (keyFeedback[letter] === FEEDBACK.present) btn.classList.add('present');
				else if (keyFeedback[letter] === FEEDBACK.absent) btn.classList.add('absent');
			}
		});
	}

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === 'Backspace') { e.preventDefault(); handleKey(e.key); }
		else if (e.key.length === 1 && /^[A-Za-z]$/.test(e.key)) { e.preventDefault(); handleKey(e.key.toUpperCase()); }
	});

	const title = document.createElement('h1');
	title.className = 'wordle-title';
	title.textContent = stage === 2 ? 'Stage 2: Wordle (same word)' : 'Stage 3: Antagonistic Wordle';

	app.innerHTML = '';
	app.appendChild(title);
	app.appendChild(grid);
	app.appendChild(message);
	app.appendChild(keyboard);
	updateGrid();
}

// ---- Wordle 7 (stage 4) ----

function renderWordle7(app: HTMLDivElement, onWin: () => void, onGameOver: () => void): void {
	let completedRows: CellState[][] = [];
	let currentGuess = '';
	let gameOver = false;

	const grid = document.createElement('div');
	grid.className = 'wordle-grid wordle-grid-7';
	for (let i = 0; i < MAX_GUESSES; i++) {
		const r = document.createElement('div');
		r.className = 'wordle-row';
		for (let j = 0; j < WORD_LENGTH_7; j++) {
			const c = document.createElement('div');
			c.className = 'wordle-cell';
			r.appendChild(c);
		}
		grid.appendChild(r);
	}

	const message = document.createElement('div');
	message.className = 'wordle-message';

	const keys = [
		'Q W E R T Y U I O P'.split(' '),
		'A S D F G H J K L'.split(' '),
		['Enter', ...'Z X C V B N M'.split(' '), 'Backspace'],
	];
	const keyboard = document.createElement('div');
	keyboard.className = 'wordle-keyboard';
	keys.forEach((keyRow) => {
		const rowEl = document.createElement('div');
		rowEl.className = 'keyboard-row';
		keyRow.forEach((key) => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'keyboard-key';
			if (key === 'Enter') btn.className += ' key-enter';
			if (key === 'Backspace') btn.className += ' key-backspace';
			btn.textContent = key === 'Backspace' ? '⌫' : key;
			btn.addEventListener('click', () => handleKey(key));
			rowEl.appendChild(btn);
		});
		keyboard.appendChild(rowEl);
	});

	function updateGrid(): void {
		const rows = grid.querySelectorAll('.wordle-row');
		rows.forEach((rowEl, rowIndex) => {
			const cells = rowEl.querySelectorAll('.wordle-cell');
			if (rowIndex < completedRows.length) {
				completedRows[rowIndex].forEach((s, colIndex) => {
					const cellEl = cells[colIndex];
					cellEl.textContent = s.letter;
					cellEl.className = 'wordle-cell';
					if (s.feedback !== null) {
						cellEl.classList.add(
							s.feedback === FEEDBACK.correct ? 'correct' :
							s.feedback === FEEDBACK.present ? 'present' : 'absent'
						);
					}
				});
			} else if (rowIndex === completedRows.length) {
				for (let i = 0; i < WORD_LENGTH_7; i++) {
					cells[i].textContent = currentGuess[i] ?? '';
					cells[i].className = 'wordle-cell' + (currentGuess[i] ? ' filled' : '');
				}
			} else {
				cells.forEach((c) => { c.textContent = ''; c.className = 'wordle-cell'; });
			}
		});
	}

	async function handleKey(key: string): Promise<void> {
		if (gameOver) return;
		if (key === 'Enter') {
			if (currentGuess.length !== WORD_LENGTH_7) {
				message.textContent = 'Not enough letters';
				message.className = 'wordle-message error';
				return;
			}
			message.textContent = '';
			const res = await fetch('/api/wordle/guess', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ guess: currentGuess.toLowerCase(), stage: 4 }),
			});
			const data = await res.json();
			if (!res.ok) {
				message.textContent = data.error ?? 'Invalid guess';
				message.className = 'wordle-message error';
				return;
			}
			const rowState: CellState[] = currentGuess.split('').map((letter, i) => ({
				letter: letter.toUpperCase(),
				feedback: data.feedback[i],
			}));
			completedRows.push(rowState);
			currentGuess = '';
			if (data.won) onWin();
			else if (completedRows.length >= MAX_GUESSES) onGameOver();
			updateGrid();
			updateKeyboardState();
			return;
		}
		if (key === 'Backspace') {
			currentGuess = currentGuess.slice(0, -1);
			updateGrid();
			message.textContent = '';
			return;
		}
		if (key.length === 1 && /^[A-Za-z]$/.test(key) && currentGuess.length < WORD_LENGTH_7) {
			currentGuess += key.toUpperCase();
			updateGrid();
			message.textContent = '';
		}
	}

	const keyFeedback: Record<string, number> = {};
	function updateKeyboardState(): void {
		completedRows.flat().forEach(({ letter, feedback }) => {
			const k = letter.toUpperCase();
			if (feedback != null && (keyFeedback[k] == null || feedback > keyFeedback[k])) keyFeedback[k] = feedback;
		});
		keyboard.querySelectorAll('.keyboard-key').forEach((btn) => {
			const letter = (btn as HTMLElement).textContent?.trim();
			if (letter && letter.length === 1) {
				btn.className = 'keyboard-key';
				if (keyFeedback[letter] === FEEDBACK.correct) btn.classList.add('correct');
				else if (keyFeedback[letter] === FEEDBACK.present) btn.classList.add('present');
				else if (keyFeedback[letter] === FEEDBACK.absent) btn.classList.add('absent');
			}
		});
	}

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === 'Backspace') { e.preventDefault(); handleKey(e.key); }
		else if (e.key.length === 1 && /^[A-Za-z]$/.test(e.key)) { e.preventDefault(); handleKey(e.key.toUpperCase()); }
	});

	const title = document.createElement('h1');
	title.className = 'wordle-title';
	title.textContent = 'Stage 4: Wordle (7 letters)';

	app.innerHTML = '';
	app.appendChild(title);
	app.appendChild(grid);
	app.appendChild(message);
	app.appendChild(keyboard);
	updateGrid();
}

// ---- Main game flow ----

type Progress = { stage: number; gameOver: boolean; victory: boolean };

function getAuthHeaders(): Record<string, string> | null {
	if (!auth?.access_token) return null;
	return { Authorization: `Bearer ${auth.access_token}` };
}

async function fetchProgress(): Promise<Progress | null> {
	const headers = getAuthHeaders();
	if (!headers) return null;
	const res = await fetch('/api/progress', { headers });
	if (!res.ok) return null;
	return res.json();
}

async function saveProgress(data: Progress): Promise<void> {
	const headers = getAuthHeaders();
	if (!headers) return;
	await fetch('/api/progress', {
		method: 'POST',
		headers: { ...headers, 'Content-Type': 'application/json' },
		body: JSON.stringify(data),
	});
}

async function resetProgress(): Promise<void> {
	const headers = getAuthHeaders();
	if (!headers) return;
	await fetch('/api/reset', { method: 'POST', headers });
}

function renderGame(app: HTMLDivElement, initial: Progress | null = null): void {
	let stage = initial?.stage ?? 1;
	let gameOver = initial?.gameOver ?? false;
	let victory = initial?.victory ?? false;
	const canReset = !!getAuthHeaders();

	function goToNextStage(): void {
		stage++;
		saveProgress({ stage, gameOver, victory });
		reRender();
	}

	function doGameOver(): void {
		gameOver = true;
		saveProgress({ stage, gameOver, victory });
		reRender();
	}

	function doVictory(): void {
		victory = true;
		saveProgress({ stage, gameOver, victory });
		reRender();
	}

	async function onReset(): Promise<void> {
		await resetProgress();
		stage = 1;
		gameOver = false;
		victory = false;
		reRender();
	}

	function reRender(): void {
		app.innerHTML = '';
		if (gameOver) return renderGameOver(app, canReset ? onReset : null);
		if (victory) return renderVictory(app, canReset ? onReset : null);
		if (stage === 1) return renderHangman(app, goToNextStage, doGameOver);
		if (stage === 2) return renderWordle5(app, 2, goToNextStage, doGameOver);
		if (stage === 3) return renderWordle5(app, 3, goToNextStage, doGameOver);
		if (stage === 4) return renderWordle7(app, doVictory, doGameOver);
	}

	reRender();
}

function showError(message: string): void {
	const app = document.querySelector<HTMLDivElement>('#app');
	if (app) app.innerHTML = `<p class="error-message">${message}</p>`;
}

const appEl = document.querySelector<HTMLDivElement>('#app');
if (appEl) appEl.textContent = 'Loading…';

const AUTH_TIMEOUT_MS = 15000;

async function init(): Promise<void> {
	const el = document.querySelector<HTMLDivElement>('#app');
	if (!el) return;

	if (isStandalone()) {
		el.textContent = '';
		renderGame(el, null);
		return;
	}

	try {
		await Promise.race([
			setupDiscordSdk(),
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), AUTH_TIMEOUT_MS)),
		]);
	} catch (err) {
		el.textContent = '';
		const isTimeout = (err as Error)?.message === 'timeout';
		el.innerHTML = `
			<p class="error-message">${isTimeout ? 'Discord auth timed out.' : (err as Error)?.message ?? String(err)}</p>
			<p class="error-help">
				<strong>You must launch this activity from inside Discord</strong>. Join a voice channel → rocket/Activities → your app.<br/><br/>
				Also: OAuth2 Redirects add <code>https://127.0.0.1</code>; URL Mappings <code>/</code> → your tunnel host; <code>.env</code> with VITE_DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.
			</p>
			<button type="button" class="play-anyway-btn">Play anyway</button>
		`;
		el.querySelector('.play-anyway-btn')?.addEventListener('click', () => {
			el.innerHTML = '';
			renderGame(el, null);
		});
		console.error('Discord auth error:', err);
		return;
	}

	el.textContent = '';
	const progress = await fetchProgress();
	renderGame(el, progress);
}

init().catch((err) => {
	showError('Failed to start: ' + (err?.message ?? String(err)));
	console.error(err);
});

window.addEventListener('unhandledrejection', (e) => {
	showError('Error: ' + (e.reason?.message ?? String(e.reason)));
});
