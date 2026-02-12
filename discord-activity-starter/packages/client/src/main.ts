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
	onWin: (solvedWord?: string) => void,
	onGameOver: () => void,
	initialStage1?: Stage1Data | null,
	onSaveStage1?: (data: Stage1Data) => void
): void {
	const revealed: (string | null)[] = initialStage1?.revealed?.length === WORD_LENGTH
		? [...initialStage1.revealed]
		: Array(WORD_LENGTH).fill(null);
	const wrongGuesses: string[] = initialStage1?.wrongGuesses ? [...initialStage1.wrongGuesses] : [];
	let currentWordGuess = initialStage1?.currentWordGuess ?? '';

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
			if (revealed.every((c) => c != null)) {
				const solvedWord = revealed.map((c) => c ?? '').join('').toLowerCase();
				onWin(solvedWord);
			}
		}
		updateUI();
		onSaveStage1?.({ revealed: [...revealed], wrongGuesses: [...wrongGuesses], currentWordGuess });
	}

	let guessWordSubmitting = false;
	async function guessWord(): Promise<void> {
		if (guessWordSubmitting || currentWordGuess.length !== WORD_LENGTH) return;
		guessWordSubmitting = true;
		const word = currentWordGuess.toLowerCase();
		currentWordGuess = '';
		updateUI();
		try {
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
		if (data.won) {
			onWin(word);
		} else onGameOver();
		onSaveStage1?.({ revealed: [...revealed], wrongGuesses: [...wrongGuesses], currentWordGuess });
		} finally {
			guessWordSubmitting = false;
		}
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
	onWin: (solvedWord?: string) => void,
	onGameOver: () => void,
	initialStage?: Stage2Or3Data | null,
	previousStageSolvedWord?: string,
	onSaveStage?: (data: Stage2Or3Data) => void
): void {
	const toCellState = (r: WordleRowState[]): CellState[] =>
		r.map((c) => ({ letter: c.letter, feedback: c.feedback as CellState['feedback'] }));
	let completedRows: CellState[][] = initialStage?.completedRows?.length
		? initialStage.completedRows.map((row) => toCellState(row))
		: [];
	let history: { guess: string; feedback: number[] }[] = initialStage?.history ? [...initialStage.history] : [];
	let currentGuess = initialStage?.currentGuess ?? '';
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

	let submittingGuess = false;
	async function handleKey(key: string): Promise<void> {
		if (gameOver) return;
		if (key === 'Enter') {
			if (submittingGuess || currentGuess.length !== WORD_LENGTH) {
				if (currentGuess.length !== WORD_LENGTH) {
					message.textContent = 'Not enough letters';
					message.className = 'wordle-message error';
				}
				return;
			}
			submittingGuess = true;
			message.textContent = '';
			const body: { guess: string; stage: number; history?: { guess: string; feedback: number[] }[] } = {
				guess: currentGuess.toLowerCase(),
				stage,
			};
			if (stage === 3) body.history = history;
			try {
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
				const solvedWord = currentGuess.toLowerCase();
				const nextGuess = '';
				currentGuess = nextGuess;
				onSaveStage?.({
					completedRows: completedRows.map((row) => row.map((c) => ({ letter: c.letter, feedback: c.feedback }))),
					history: [...history],
					currentGuess: nextGuess,
				});
				if (data.won) {
					onWin(solvedWord);
				} else if (completedRows.length >= MAX_GUESSES) onGameOver();
				updateGrid();
				updateKeyboardState();
			} finally {
				submittingGuess = false;
			}
			return;
		}
		if (key === 'Backspace') {
			currentGuess = currentGuess.slice(0, -1);
			updateGrid();
			message.textContent = '';
			onSaveStage?.({ completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))), history: [...history], currentGuess: currentGuess.slice(0, -1) });
			return;
		}
		if (key.length === 1 && /^[A-Za-z]$/.test(key) && currentGuess.length < WORD_LENGTH) {
			currentGuess += key.toUpperCase();
			updateGrid();
			message.textContent = '';
			onSaveStage?.({ completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))), history: [...history], currentGuess: currentGuess });
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
	title.textContent = stage === 2 ? 'Stage 2: Wordle' : 'Stage 3: Antagonistic Wordle';

	app.innerHTML = '';
	app.appendChild(title);
	app.appendChild(grid);
	app.appendChild(message);
	app.appendChild(keyboard);

	// Check if we need to submit the carried-over word from previous stage
	// This should happen if:
	// 1. No completed rows yet, OR
	// 2. First row exists but doesn't match the previous stage's word, OR
	// 3. First row exists but has null/invalid feedback
	const needsSubmission = previousStageSolvedWord && previousStageSolvedWord.length === WORD_LENGTH && (() => {
		if (completedRows.length === 0) return true; // No rows yet, need to submit
		const firstRow = completedRows[0];
		if (firstRow.length !== WORD_LENGTH) return true; // First row has wrong length
		const firstRowWord = firstRow.map(c => c.letter.toLowerCase()).join('');
		if (firstRowWord !== previousStageSolvedWord.toLowerCase()) return true; // First row doesn't match
		// Check if all cells have valid feedback (0, 1, or 2)
		const hasValidFeedback = firstRow.every(c => 
			c.feedback !== null && 
			c.feedback !== undefined && 
			typeof c.feedback === 'number' && 
			c.feedback >= 0 && 
			c.feedback <= 2
		);
		return !hasValidFeedback; // Need to submit if feedback is invalid
	})();

	// Update keyboard state if we have saved progress with completed rows
	if (completedRows.length > 0 && !needsSubmission) {
		updateKeyboardState();
	}

	// Pre-fill first row: previous stage's solved word (5 letters) if provided.
	// Treat the prefilled word like it was guessed: submit it to the server
	// so we get feedback, update history, keyboard state, and trigger win/game-over if applicable.
	if (needsSubmission) {
		(async () => {
			const word = previousStageSolvedWord.toUpperCase();
			try {
				const body: { guess: string; stage: number; history?: { guess: string; feedback: number[] }[] } = {
					guess: previousStageSolvedWord.toLowerCase(),
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
					// Fallback: show letters with no feedback and persist minimal state
					const firstRow: CellState[] = word.split('').map((l) => ({ letter: l, feedback: null }));
					// Replace first row if it exists, otherwise add it
					if (completedRows.length > 0) {
						completedRows[0] = firstRow;
					} else {
						completedRows = [firstRow];
					}
					onSaveStage?.({ completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))), history: [...history], currentGuess: '' });
					updateGrid();
					return;
				}
				// Use returned feedback to populate the first row and history
				const rowState: CellState[] = word.split('').map((letter, i) => ({ letter, feedback: data.feedback[i] }));
				// Replace first row if it exists, otherwise add it
				if (completedRows.length > 0) {
					completedRows[0] = rowState;
				} else {
					completedRows = [rowState];
				}
				// Only add to history if not already there
				const guessLower = previousStageSolvedWord.toLowerCase();
				if (!history.some(h => h.guess === guessLower)) {
					history.push({ guess: guessLower, feedback: data.feedback });
				}
				currentGuess = '';
				onSaveStage?.({ completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))), history: [...history], currentGuess: '' });
				updateGrid();
				updateKeyboardState();
				if (data.won) {
					onWin(previousStageSolvedWord.toLowerCase());
				} else if (completedRows.length >= MAX_GUESSES) {
					onGameOver();
				}
			} catch (err) {
				// Network/error fallback: show letters without feedback
				const firstRow: CellState[] = word.split('').map((l) => ({ letter: l, feedback: null }));
				if (completedRows.length > 0) {
					completedRows[0] = firstRow;
				} else {
					completedRows = [firstRow];
				}
				onSaveStage?.({ completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))), history: [...history], currentGuess: '' });
				updateGrid();
			}
		})();
	}

	updateGrid();
}

// ---- Wordle 7 (stage 4) ----

function renderWordle7(
	app: HTMLDivElement,
	onWin: (solvedWord?: string) => void,
	onGameOver: () => void,
	initialStage4?: Stage4Data | null,
	previousStageSolvedWord?: string,
	onSaveStage4?: (data: Stage4Data) => void
): void {
	const toCellState = (r: WordleRowState[]): CellState[] =>
		r.map((c) => ({ letter: c.letter, feedback: c.feedback as CellState['feedback'] }));
	let completedRows: CellState[][] = initialStage4?.completedRows?.length
		? initialStage4.completedRows.map((row) => toCellState(row))
		: [];
	let currentGuess = initialStage4?.currentGuess ?? '';
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
					const isBlank = s.letter === '' && s.feedback === null;
					cellEl.textContent = isBlank ? '' : s.letter;
					cellEl.className = 'wordle-cell' + (isBlank ? ' blank' : '');
					if (!isBlank && s.feedback !== null) {
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

	let submittingGuess = false;
	async function handleKey(key: string): Promise<void> {
		if (gameOver) return;
		if (key === 'Enter') {
			if (submittingGuess || currentGuess.length !== WORD_LENGTH_7) {
				if (currentGuess.length !== WORD_LENGTH_7) {
					message.textContent = 'Not enough letters';
					message.className = 'wordle-message error';
				}
				return;
			}
			submittingGuess = true;
			message.textContent = '';
			try {
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
				onSaveStage4?.({
					completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))),
					currentGuess: '',
				});
				if (data.won) onWin();
				else if (completedRows.length >= MAX_GUESSES) onGameOver();
				updateGrid();
				updateKeyboardState();
			} finally {
				submittingGuess = false;
			}
			return;
		}
		if (key === 'Backspace') {
			currentGuess = currentGuess.slice(0, -1);
			updateGrid();
			message.textContent = '';
			onSaveStage4?.({ completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))), currentGuess: currentGuess.slice(0, -1) });
			return;
		}
		if (key.length === 1 && /^[A-Za-z]$/.test(key) && currentGuess.length < WORD_LENGTH_7) {
			currentGuess += key.toUpperCase();
			updateGrid();
			message.textContent = '';
			onSaveStage4?.({ completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))), currentGuess: currentGuess });
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

	// Update keyboard state if we have saved progress with completed rows
	if (completedRows.length > 0) {
		updateKeyboardState();
	}
	
	// Pre-fill first row: previous stage's solved word (5 letters) + 2 blank cells
	// Treat the prefilled word like it was guessed: submit it to get feedback
	if (completedRows.length === 0 && previousStageSolvedWord && previousStageSolvedWord.length === WORD_LENGTH) {
		(async () => {
			const word = previousStageSolvedWord.toUpperCase();
			try {
				const res = await fetch('/api/wordle/stage4-prefill', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ word5: previousStageSolvedWord.toLowerCase() }),
				});
				const data = await res.json();
				if (!res.ok) {
					// Fallback: show letters with no feedback
					const firstRow: CellState[] = [
						...word.split('').map((l) => ({ letter: l, feedback: null })),
						{ letter: '', feedback: null },
						{ letter: '', feedback: null },
					];
					completedRows = [firstRow];
					onSaveStage4?.({
						completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))),
						currentGuess: '',
					});
					updateGrid();
					return;
				}
				// Use returned feedback to populate the first row
				const rowState: CellState[] = [
					...word.split('').map((letter, i) => ({ letter, feedback: data.feedback[i] })),
					{ letter: '', feedback: null },
					{ letter: '', feedback: null },
				];
				completedRows = [rowState];
				onSaveStage4?.({
					completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))),
					currentGuess: '',
				});
				updateGrid();
				updateKeyboardState();
			} catch (err) {
				// Network/error fallback: show letters without feedback
				const firstRow: CellState[] = [
					...word.split('').map((l) => ({ letter: l, feedback: null })),
					{ letter: '', feedback: null },
					{ letter: '', feedback: null },
				];
				completedRows = [firstRow];
				onSaveStage4?.({
					completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))),
					currentGuess: '',
				});
				updateGrid();
			}
		})();
	}
	
	updateGrid();
}

// ---- Main game flow ----

type Stage1Data = { revealed: (string | null)[]; wrongGuesses: string[]; currentWordGuess: string };
type WordleRowState = { letter: string; feedback: number | null };
type Stage2Or3Data = { completedRows: WordleRowState[][]; history: { guess: string; feedback: number[] }[]; currentGuess: string };
type Stage4Data = { completedRows: WordleRowState[][]; currentGuess: string };

type Progress = {
	stage: number;
	gameOver: boolean;
	victory: boolean;
	stage1?: Stage1Data;
	stage2?: Stage2Or3Data;
	stage3?: Stage2Or3Data;
	stage4?: Stage4Data;
	solvedWord1?: string;
	solvedWord2?: string;
	solvedWord3?: string;
};

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

async function reportScore(payload: { channelId: string | null; stageReached: number; victory: boolean; gameOver: boolean; username?: string }): Promise<void> {
	if (!payload.channelId) return;
	const headers = getAuthHeaders();
	if (!headers) return;
	await fetch('/api/report-score', {
		method: 'POST',
		headers: { ...headers, 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});
}

async function resetProgress(): Promise<void> {
	const headers = getAuthHeaders();
	if (!headers) return;
	await fetch('/api/reset', { method: 'POST', headers });
}

function renderGame(app: HTMLDivElement, initial: Progress | null = null): void {
	const progressState: Progress = {
		stage: Math.min(4, Math.max(1, Number(initial?.stage) || 1)),
		gameOver: Boolean(initial?.gameOver),
		victory: Boolean(initial?.victory),
		stage1: initial?.stage1,
		stage2: initial?.stage2,
		stage3: initial?.stage3,
		stage4: initial?.stage4,
		solvedWord1: initial?.solvedWord1,
		solvedWord2: initial?.solvedWord2,
		solvedWord3: initial?.solvedWord3,
	};
	const canReset = !!getAuthHeaders();

	function mergeSave(patch: Partial<Progress>): void {
		Object.assign(progressState, patch);
		saveProgress(progressState);
	}

	function goToNextStage(solvedWord?: string): void {
		const currentStage = progressState.stage;
		const next = currentStage + 1;
		if (next > 4) return;
		
		// Save the solved word from current stage before advancing
		if (currentStage === 1 && solvedWord && solvedWord.length === WORD_LENGTH) {
			progressState.solvedWord1 = solvedWord;
			mergeSave({ solvedWord1: solvedWord, stage: next });
		} else if (currentStage === 2 && solvedWord && solvedWord.length === WORD_LENGTH) {
			progressState.solvedWord2 = solvedWord;
			mergeSave({ solvedWord2: solvedWord, stage: next });
		} else if (currentStage === 3 && solvedWord && solvedWord.length === WORD_LENGTH) {
			progressState.solvedWord3 = solvedWord;
			mergeSave({ solvedWord3: solvedWord, stage: next });
		} else {
			mergeSave({ stage: next });
		}
		
		progressState.stage = next;
		reRender();
	}

	async function doGameOver(): Promise<void> {
		progressState.gameOver = true;
		mergeSave({ gameOver: true });
		reportScore({
			channelId: discordSdk.channelId ?? null,
			stageReached: progressState.stage,
			victory: false,
			gameOver: true,
			username: undefined,
		}).catch(() => {});
		reRender();
	}

	function doVictory(): void {
		progressState.victory = true;
		mergeSave({ victory: true });
		reportScore({
			channelId: discordSdk.channelId ?? null,
			stageReached: 4,
			victory: true,
			gameOver: false,
			username: undefined,
		}).catch(() => {});
		reRender();
	}

	async function onReset(): Promise<void> {
		await resetProgress();
		progressState.stage = 1;
		progressState.gameOver = false;
		progressState.victory = false;
		progressState.stage1 = undefined;
		progressState.stage2 = undefined;
		progressState.stage3 = undefined;
		progressState.stage4 = undefined;
		reRender();
	}

	function reRender(): void {
		app.innerHTML = '';
		if (progressState.gameOver) return renderGameOver(app, canReset ? onReset : null);
		if (progressState.victory) return renderVictory(app, canReset ? onReset : null);
		if (progressState.stage === 1) return renderHangman(app, goToNextStage, doGameOver, progressState.stage1, (d) => mergeSave({ stage1: d }));
		if (progressState.stage === 2) return renderWordle5(app, 2, goToNextStage, doGameOver, progressState.stage2, progressState.solvedWord1, (d) => mergeSave({ stage2: d }));
		if (progressState.stage === 3) return renderWordle5(app, 3, goToNextStage, doGameOver, progressState.stage3, progressState.solvedWord2, (d) => mergeSave({ stage3: d }));
		if (progressState.stage === 4) return renderWordle7(app, doVictory, doGameOver, progressState.stage4, progressState.solvedWord3, (d) => mergeSave({ stage4: d }));
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
