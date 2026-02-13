import { DiscordSDK } from '@discord/embedded-app-sdk';
import './style.css';

let auth: { access_token: string } | null = null;
const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID ?? import.meta.env.VITE_CLIENT_ID;
const discordSdk = new DiscordSDK(clientId ?? '');

const WORD_LENGTH = 5;
const WORD_LENGTH_6 = 6;
const WORD_LENGTH_7 = 7;
const MAX_GUESSES = 6;
const MAX_WRONG_HANGMAN = 6;
const FEEDBACK = { absent: 0, present: 1, correct: 2 } as const;
const FLIP_DELAY_MS = 120;

const HTP_DISMISSED_KEY = '7circles-htp-dismissed';

/** Show a "How to Play" overlay popup. Calls onDismiss when closed. */
function showHowToPlay(onDismiss: () => void): void {
	// Don't show twice
	if (document.querySelector('.htp-overlay')) return;

	const overlay = document.createElement('div');
	overlay.className = 'htp-overlay';

	overlay.innerHTML = `
		<div class="htp-popup">
			<button class="htp-close" aria-label="Close">✕</button>
			<div class="htp-header">
				<h2 class="htp-title">7 Circles of Wordle:</h2>
				<h4 class="htp-title">A very normal game</h4>

			</div>
			<div class="htp-body">
				<p class="htp-line htp-line-1">Welcome welcome welcome,<br>cats and foxes alike ;)</p>
				<p class="htp-line htp-line-2">Only those without <em>skill issues</em><br>can hope to make it to the end</p>
				<p class="htp-line htp-line-3">I trust you'll try your best for me <span class="htp-wink">:)</span></p>
				<p class="htp-line htp-line-4 htp-goodluck">Good luck!</p>
			</div>
			<div class="htp-rules">(Resets Daily)</div>
			<button class="htp-go-btn">Begin!</button>
		</div>
	`;

	function dismiss() {
		try { localStorage.setItem(HTP_DISMISSED_KEY, 'true'); } catch {}
		overlay.style.animation = 'none';
		overlay.style.opacity = '0';
		overlay.style.transition = 'opacity 0.25s ease';
		setTimeout(() => {
			overlay.remove();
			onDismiss();
		}, 250);
	}

	overlay.querySelector('.htp-close')?.addEventListener('click', dismiss);
	overlay.querySelector('.htp-go-btn')?.addEventListener('click', dismiss);
	overlay.addEventListener('click', (e) => {
		if (e.target === overlay) dismiss();
	});

	document.body.appendChild(overlay);
}

const CIRCLE_NAMES: Record<number, { label: string; name: string }> = {
	1: { label: 'Circle 1', name: 'Hangman' },
	2: { label: 'Circle 2', name: 'Wordle' },
	3: { label: 'Circle 3', name: 'Anagrams' },
	4: { label: 'Circle 4', name: 'Chains ;)' },
	5: { label: 'Circle 5', name: 'Totally Normal Wordle' },
	6: { label: 'Circle 6', name: 'Big Wordle' },
	7: { label: 'Circle 7', name: 'Evil Wordle' },
};

function setStageTitle(el: HTMLElement, stage: number): void {
	const info = CIRCLE_NAMES[stage];
	if (!info) { el.textContent = `Circle ${stage}`; return; }
	el.innerHTML = '';
	const labelSpan = document.createElement('span');
	labelSpan.className = 'title-label';
	labelSpan.textContent = info.label;
	const nameSpan = document.createElement('span');
	nameSpan.className = 'title-name';
	nameSpan.textContent = info.name;
	const separator = document.createElement('span');
	separator.className = 'title-separator';
	separator.textContent = '·';
	el.appendChild(labelSpan);
	el.appendChild(separator);
	el.appendChild(nameSpan);
}

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
		scope: ['identify', 'guilds', 'applications.commands', 'dm_channels.messages.write' as any],
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

function renderGameOver(app: HTMLDivElement): void {
	app.innerHTML = `
		<div class="screen screen-gameover">
			<div style="font-size:3.5rem;margin-bottom:0.5rem">🕯️ :(((</div>
			<h1 class="screen-title">Oh no!</h1>
			<p class="screen-text">The flame of passion flickers out… try again tomorrow</p>
		</div>
	`;
}

function renderVictory(app: HTMLDivElement): void {
	// Create sparkle particles
	let sparklesHtml = '';
	for (let i = 0; i < 20; i++) {
		const left = Math.random() * 100;
		const delay = Math.random() * 3;
		const size = 2 + Math.random() * 4;
		const hue = 30 + Math.random() * 40; // warm golden range
		sparklesHtml += `<div class="victory-ember" style="left:${left}%;bottom:-10px;width:${size}px;height:${size}px;background:hsl(${hue},90%,65%);animation-delay:${delay}s;animation-duration:${2 + Math.random() * 2}s"></div>`;
	}
	app.innerHTML = `
		<div class="screen screen-victory">
			<div class="victory-embers">${sparklesHtml}</div>
			<div style="font-size:4rem;margin-bottom:0.5rem">🎉🔥🎉</div>
			<h1 class="screen-title">All Seven Circles Complete!</h1>
			<p class="screen-text">You did it!! Every circle cleared 🥳<br>See you tomorrow for a new challenge ✨</p>
		</div>
	`;
}

/** Cute inter-stage congratulations screen. Shows for 3s then calls onDone. */
function renderStageCongrats(
	app: HTMLDivElement,
	completedCircle: number,
	nextCircle: number,
	signal: AbortSignal,
	onDone: () => void
): void {
	const nextInfo = CIRCLE_NAMES[nextCircle];
	const nextLabel = nextInfo ? `${nextInfo.label} · ${nextInfo.name}` : `Circle ${nextCircle}`;
	// Teasing per-stage messages that get progressively more cheeky
	const stageMessages: Record<number, string> = {
		1: 'Aww, you\'re doing great 🥺',
		2: 'Okay smarty-pants…',
		3: 'You\'re doing so well!! …for now ',
		4: 'Wow you\'re actually kinda good at this 😳',
		5: 'You won\'t last much longer ;)',
		6: 'Wait, you\'re still going?? �',
	};
	const cheer = stageMessages[completedCircle] ?? 'Not bad… 👀';

	const wrapper = document.createElement('div');
	wrapper.className = 'stage-congrats';
	wrapper.innerHTML = `
		<div class="congrats-flame-ring"></div>
		<div class="congrats-circle-num">${completedCircle} / 7</div>
		<div class="congrats-label">Circle ${completedCircle} — Complete!</div>
		<div class="congrats-title">${cheer}</div>
		<div class="congrats-subtitle">Up next: ${nextLabel}</div>
		<div class="congrats-progress-bar"><div class="congrats-progress-fill" style="width:0%"></div></div>
	`;
	app.appendChild(wrapper);

	// Animate progress bar
	requestAnimationFrame(() => {
		const fill = app.querySelector('.congrats-progress-fill') as HTMLElement;
		if (fill) fill.style.width = '100%';
	});

	const timer = setTimeout(() => {
		if (!signal.aborted) onDone();
	}, 3000);

	signal.addEventListener('abort', () => clearTimeout(timer));
}

// ---- Stage 1: Hangman ----

function renderHangman(
	app: HTMLDivElement,
	onWin: (solvedWord?: string) => void,
	onGameOver: () => void,
	initialStage1?: Stage1Data | null,
	onSaveStage1?: (data: Stage1Data) => void,
	signal?: AbortSignal
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
	setStageTitle(title, 1);
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

	const keyRows = [
		'Q W E R T Y U I O P'.split(' '),
		'A S D F G H J K L'.split(' '),
		['Enter', ...'Z X C V B N M'.split(' '), 'Backspace'],
	];
	const keyboard = document.createElement('div');
	keyboard.className = 'wordle-keyboard';
	keyRows.forEach((keyRow) => {
		const rowEl = document.createElement('div');
		rowEl.className = 'keyboard-row';
		keyRow.forEach((key) => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'keyboard-key';
			if (key === 'Enter') btn.className += ' key-enter';
			if (key === 'Backspace') btn.className += ' key-backspace';
			btn.textContent = key === 'Backspace' ? '⌫' : key === 'Enter' ? 'Enter' : key;
			btn.addEventListener('click', () => {
				if (key === 'Enter') {
					guessWord();
				} else if (key === 'Backspace') {
					currentWordGuess = currentWordGuess.slice(0, -1);
					updateUI();
				} else {
					if (currentWordGuess.length < WORD_LENGTH) {
						currentWordGuess += key;
						updateUI();
					}
					guessLetter(key);
				}
			});
			rowEl.appendChild(btn);
		});
		keyboard.appendChild(rowEl);
	});

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
	}, { signal });
}

// ---- Stage 3: Unscramble (Anagram) ----

function renderAnagram(
	app: HTMLDivElement,
	onWin: (solvedWord?: string) => void,
	onGameOver: () => void,
	initialStage3?: Stage3Data | null,
	onSaveStage3?: (data: Stage3Data) => void,
	signal?: AbortSignal
): void {
	let letters = initialStage3?.letters ?? '';
	let submitted = false;
	let timeLeft = 60;
	let timerHandle: ReturnType<typeof setInterval> | null = null;

	// Answer slots: 5 positions, some may be revealed (locked)
	const answerSlots: (string | null)[] = Array(WORD_LENGTH).fill(null);
	const revealedPositions = new Set<number>();
	// Track which source tile index each answer slot came from (for un-tapping)
	const slotSources: (number | null)[] = Array(WORD_LENGTH).fill(null);
	// Track which source tiles are "used" (placed into answer)
	const usedSourceTiles = new Set<number>();
	// Hint positions to reveal at 15s intervals: positions 0, 1, 2
	const hintSchedule = [
		{ atTime: 45, pos: 0 },
		{ atTime: 30, pos: 1 },
		{ atTime: 15, pos: 2 },
	];

	function setMsg(text: string, isError = false): void {
		const el = app.querySelector('.anagram-message');
		if (el) {
			el.textContent = text;
			el.className = 'anagram-message' + (isError ? ' error' : '');
		}
	}

	function updateTimerDisplay(): void {
		const timerEl = app.querySelector('.anagram-timer');
		if (!timerEl) return;
		timerEl.textContent = `${timeLeft}s`;
		timerEl.className = 'anagram-timer' + (timeLeft <= 10 ? ' anagram-timer-urgent' : '');
	}

	function renderSourceTiles(): void {
		const container = app.querySelector('.anagram-source-tiles');
		if (!container) return;
		const allTiles = container.querySelectorAll<HTMLElement>('.anagram-tile');
		allTiles.forEach((tile, i) => {
			tile.classList.toggle('anagram-tile-used', usedSourceTiles.has(i));
		});
	}

	function renderAnswerSlots(): void {
		const container = app.querySelector('.anagram-answer-slots');
		if (!container) return;
		const slots = container.querySelectorAll<HTMLElement>('.anagram-slot');
		slots.forEach((slot, i) => {
			const letter = answerSlots[i];
			slot.textContent = letter ?? '';
			slot.classList.toggle('anagram-slot-filled', letter !== null);
			slot.classList.toggle('anagram-slot-revealed', revealedPositions.has(i));
		});
	}

	function placeLetterInNextSlot(sourceTileIndex: number, letter: string): void {
		// Find the first empty non-revealed slot
		for (let i = 0; i < WORD_LENGTH; i++) {
			if (answerSlots[i] === null && !revealedPositions.has(i)) {
				answerSlots[i] = letter;
				slotSources[i] = sourceTileIndex;
				usedSourceTiles.add(sourceTileIndex);
				renderSourceTiles();
				renderAnswerSlots();
				return;
			}
		}
	}

	function removeLetterFromSlot(slotIndex: number): void {
		if (revealedPositions.has(slotIndex)) return; // can't remove revealed
		const sourceIdx = slotSources[slotIndex];
		answerSlots[slotIndex] = null;
		slotSources[slotIndex] = null;
		if (sourceIdx !== null) {
			usedSourceTiles.delete(sourceIdx);
		}
		renderSourceTiles();
		renderAnswerSlots();
	}

	async function revealHint(pos: number): Promise<void> {
		if (revealedPositions.has(pos) || submitted) return;
		try {
			const res = await fetch(`/api/anagram/hint/${pos}`);
			const data = await res.json();
			if (res.ok && data.letter) {
				// If a player-placed letter is in this slot, remove it back to source
				if (answerSlots[pos] !== null) {
					const sourceIdx = slotSources[pos];
					if (sourceIdx !== null) usedSourceTiles.delete(sourceIdx);
					slotSources[pos] = null;
				}
				answerSlots[pos] = data.letter;
				revealedPositions.add(pos);
				renderAnswerSlots();
				renderSourceTiles();
			}
		} catch {}
	}

	async function submitGuess(): Promise<void> {
		const guess = answerSlots.join('');
		if (guess.length !== WORD_LENGTH || answerSlots.includes(null) || submitted) return;
		submitted = true;
		if (timerHandle) clearInterval(timerHandle);
		setMsg('');
		const res = await fetch('/api/anagram/guess', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ guess: guess.toLowerCase() }),
		});
		const data = await res.json();
		if (!res.ok) {
			submitted = false;
			setMsg(data.error ?? 'Invalid guess', true);
			return;
		}
		if (data.won) {
			onWin(guess.toLowerCase());
		} else {
			setMsg('Wrong word. Game over.', true);
			onGameOver();
		}
	}

	async function fetchLetters(): Promise<void> {
		if (letters) return;
		const res = await fetch('/api/anagram/letters');
		const data = await res.json();
		if (res.ok && data.letters) {
			letters = data.letters;
			onSaveStage3?.({ letters });
		}
	}

	function buildUI(): void {
		app.innerHTML = '';

		const title = document.createElement('h1');
		title.className = 'wordle-title';
		setStageTitle(title, 3);

		const timerEl = document.createElement('div');
		timerEl.className = 'anagram-timer';
		timerEl.textContent = `${timeLeft}s`;

		const label = document.createElement('div');
		label.className = 'anagram-label';
		label.textContent = 'Pick 5 of 6 letters — one is fake!';

		// Source tiles (6 scrambled letters to tap)
		const sourceTilesContainer = document.createElement('div');
		sourceTilesContainer.className = 'anagram-source-tiles';
		const letterArr = letters.split('');
		letterArr.forEach((ch, i) => {
			const tile = document.createElement('button');
			tile.type = 'button';
			tile.className = 'anagram-tile';
			tile.textContent = ch.toUpperCase();
			tile.addEventListener('click', () => {
				if (submitted || usedSourceTiles.has(i)) return;
				placeLetterInNextSlot(i, ch.toUpperCase());
			});
			sourceTilesContainer.appendChild(tile);
		});

		// Answer slots (5 positions)
		const answerContainer = document.createElement('div');
		answerContainer.className = 'anagram-answer-slots';
		for (let i = 0; i < WORD_LENGTH; i++) {
			const slot = document.createElement('div');
			slot.className = 'anagram-slot';
			slot.addEventListener('click', () => {
				if (submitted) return;
				removeLetterFromSlot(i);
			});
			answerContainer.appendChild(slot);
		}

		const msg = document.createElement('div');
		msg.className = 'anagram-message';

		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'reset-btn anagram-submit';
		btn.textContent = 'Submit';
		btn.addEventListener('click', () => submitGuess());

		app.appendChild(title);
		app.appendChild(timerEl);
		app.appendChild(label);
		app.appendChild(sourceTilesContainer);
		app.appendChild(answerContainer);
		app.appendChild(msg);
		app.appendChild(btn);

		// Start timer
		timerHandle = setInterval(() => {
			if (submitted) { if (timerHandle) clearInterval(timerHandle); return; }
			timeLeft--;
			updateTimerDisplay();

			// Check hint reveals
			for (const hint of hintSchedule) {
				if (timeLeft === hint.atTime && !revealedPositions.has(hint.pos)) {
					revealHint(hint.pos);
				}
			}

			if (timeLeft <= 0) {
				if (timerHandle) clearInterval(timerHandle);
				if (!submitted) {
					submitted = true;
					setMsg('Time\'s up! Game over.', true);
					onGameOver();
				}
			}
		}, 1000);

		// Clean up timer on abort (stage change)
		signal?.addEventListener('abort', () => {
			if (timerHandle) clearInterval(timerHandle);
		});
	}

	fetchLetters().then(() => buildUI());
}

// ---- Stage 4: Word Chain ----

const CHAIN_LENGTH = 4; // number of words the player must add
const CHAIN_TIME_LIMIT = 60; // seconds

type Stage4ChainData = {
	startWord: string;
	chain: string[]; // words submitted so far (not including startWord)
	timeLeft: number;
	finished: boolean;
};

function renderWordChain(
	app: HTMLDivElement,
	onWin: (solvedWord?: string) => void,
	onGameOver: () => void,
	initialStage4?: Stage4ChainData | null,
	onSaveStage4?: (data: Stage4ChainData) => void,
	signal?: AbortSignal
): void {
	let startWord = initialStage4?.startWord ?? '';
	let chain: string[] = initialStage4?.chain ? [...initialStage4.chain] : [];
	let timeLeft = initialStage4?.timeLeft ?? CHAIN_TIME_LIMIT;
	let finished = initialStage4?.finished ?? false;
	let currentInput = '';
	let timerInterval: ReturnType<typeof setInterval> | null = null;

	function save(): void {
		onSaveStage4?.({ startWord, chain: [...chain], timeLeft, finished });
	}

	function allWords(): string[] {
		return [startWord, ...chain];
	}

	function lastWord(): string {
		const all = allWords();
		return all[all.length - 1];
	}

	function requiredLetter(): string {
		const lw = lastWord();
		return lw[lw.length - 1].toUpperCase();
	}

	function setMsg(text: string, isError = false): void {
		const el = app.querySelector('.chain-message');
		if (el) {
			el.textContent = text;
			el.className = 'chain-message' + (isError ? ' error' : '');
		}
	}

	function updateTimerDisplay(): void {
		const el = app.querySelector('.chain-timer');
		if (el) {
			const mins = Math.floor(timeLeft / 60);
			const secs = timeLeft % 60;
			el.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
			if (timeLeft <= 10) el.classList.add('chain-timer-urgent');
			else el.classList.remove('chain-timer-urgent');
		}
	}

	function renderChainDisplay(): void {
		const container = app.querySelector('.chain-links');
		if (!container) return;
		container.innerHTML = '';
		const all = allWords();
		all.forEach((word, i) => {
			const link = document.createElement('div');
			link.className = 'chain-link' + (i === 0 ? ' chain-link-start' : ' chain-link-player');
			// Highlight the linking letters
			const letters = word.toUpperCase().split('');
			letters.forEach((letter, j) => {
				const span = document.createElement('span');
				span.className = 'chain-letter';
				// First letter links to previous word's last letter
				if (i > 0 && j === 0) span.classList.add('chain-letter-link');
				// Last letter is the bridge to the next word
				if (j === letters.length - 1 && i < all.length - 1) span.classList.add('chain-letter-link');
				// Last letter of the last word is the required start for next
				if (j === letters.length - 1 && i === all.length - 1 && chain.length < CHAIN_LENGTH) span.classList.add('chain-letter-next');
				span.textContent = letter;
				link.appendChild(span);
			});
			container.appendChild(link);
			// Add connector arrow between words
			if (i < all.length - 1) {
				const arrow = document.createElement('div');
				arrow.className = 'chain-arrow';
				arrow.textContent = '🔗';
				container.appendChild(arrow);
			}
		});
		// Show empty slots for remaining chain links
		for (let i = chain.length; i < CHAIN_LENGTH; i++) {
			const arrow = document.createElement('div');
			arrow.className = 'chain-arrow chain-arrow-empty';
			arrow.textContent = '🔗';
			container.appendChild(arrow);
			const slot = document.createElement('div');
			slot.className = 'chain-link chain-link-empty';
			slot.textContent = '? ? ? ? ?';
			container.appendChild(slot);
		}
	}

	function updateInputDisplay(): void {
		const inputDisplay = app.querySelector('.chain-input-display');
		if (!inputDisplay) return;
		inputDisplay.innerHTML = '';
		for (let i = 0; i < WORD_LENGTH; i++) {
			const cellEl = document.createElement('span');
			cellEl.className = 'chain-input-cell' + (currentInput[i] ? ' filled' : '');
			cellEl.textContent = (currentInput[i] ?? '').toUpperCase();
			// Highlight first cell with required letter hint
			if (i === 0 && !currentInput[0]) {
				cellEl.textContent = requiredLetter();
				cellEl.classList.add('chain-input-hint');
			}
			inputDisplay.appendChild(cellEl);
		}
	}

	function startTimer(): void {
		if (timerInterval || finished) return;
		timerInterval = setInterval(() => {
			if (signal?.aborted) { stopTimer(); return; }
			timeLeft--;
			updateTimerDisplay();
			save();
			if (timeLeft <= 0) {
				stopTimer();
				finished = true;
				save();
				setMsg('Time\'s up! 💀', true);
				onGameOver();
			}
		}, 1000);
	}

	function stopTimer(): void {
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
	}

	// Clean up timer if render is aborted
	signal?.addEventListener('abort', () => stopTimer());

	let submitting = false;
	async function submitWord(): Promise<void> {
		if (submitting || finished || currentInput.length !== WORD_LENGTH) return;
		submitting = true;
		setMsg('');
		try {
			const res = await fetch('/api/chain/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ guess: currentInput.toLowerCase(), previousWord: lastWord(), chain: allWords().map(w => w.toLowerCase()) }),
			});
			if (signal?.aborted) return;
			const data = await res.json();
			if (!res.ok) {
				setMsg(data.error ?? 'Invalid word', true);
				return;
			}
			// Valid chain word!
			chain.push(currentInput.toLowerCase());
			currentInput = '';
			save();
			renderChainDisplay();
			updateInputDisplay();

			if (chain.length >= CHAIN_LENGTH) {
				// Won!
				stopTimer();
				finished = true;
				save();
				setMsg('Chain complete! 🔗🔥', false);
				onWin(chain[chain.length - 1]);
			} else {
				setMsg(`${CHAIN_LENGTH - chain.length} more to go! Next word starts with "${requiredLetter()}"`, false);
			}
		} finally {
			submitting = false;
		}
	}

	function handleKey(key: string): void {
		if (finished) return;
		if (key === 'Enter') {
			if (currentInput.length === WORD_LENGTH) submitWord();
			else setMsg('Not enough letters', true);
			return;
		}
		if (key === 'Backspace') {
			currentInput = currentInput.slice(0, -1);
			updateInputDisplay();
			setMsg('');
			return;
		}
		if (key.length === 1 && /^[A-Za-z]$/.test(key) && currentInput.length < WORD_LENGTH) {
			currentInput += key.toUpperCase();
			updateInputDisplay();
			setMsg('');
		}
	}

	// Build UI
	app.innerHTML = '';
	const title = document.createElement('h1');
	title.className = 'wordle-title';
	setStageTitle(title, 4);
	app.appendChild(title);

	const subtitle = document.createElement('p');
	subtitle.className = 'chain-subtitle';
	subtitle.textContent = `Build a chain of ${CHAIN_LENGTH} words! Each must start with the last letter of the previous.`;
	app.appendChild(subtitle);

	const timer = document.createElement('div');
	timer.className = 'chain-timer';
	app.appendChild(timer);

	const linksContainer = document.createElement('div');
	linksContainer.className = 'chain-links';
	app.appendChild(linksContainer);

	const inputDisplay = document.createElement('div');
	inputDisplay.className = 'chain-input-display';
	app.appendChild(inputDisplay);

	const msg = document.createElement('div');
	msg.className = 'chain-message';
	app.appendChild(msg);

	// Keyboard
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
	app.appendChild(keyboard);

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === 'Backspace') { e.preventDefault(); handleKey(e.key); }
		else if (e.key.length === 1 && /^[A-Za-z]$/.test(e.key)) { e.preventDefault(); handleKey(e.key.toUpperCase()); }
	}, { signal });

	// Fetch starting word if needed
	if (!startWord) {
		(async () => {
			const res = await fetch('/api/chain/start');
			if (signal?.aborted) return;
			const data = await res.json();
			if (data.word) {
				startWord = data.word;
				save();
				renderChainDisplay();
				updateInputDisplay();
				updateTimerDisplay();
				if (!finished && chain.length < CHAIN_LENGTH) {
					setMsg(`Chain starts with "${startWord.toUpperCase()}". Next word starts with "${requiredLetter()}"!`, false);
					startTimer();
				}
			}
		})();
	} else {
		renderChainDisplay();
		updateInputDisplay();
		updateTimerDisplay();
		if (!finished && chain.length < CHAIN_LENGTH) {
			setMsg(`Next word starts with "${requiredLetter()}"`, false);
			startTimer();
		} else if (finished && chain.length >= CHAIN_LENGTH) {
			setMsg('Chain complete! 🔗🔥', false);
		}
	}

	updateTimerDisplay();
}

// ---- Wordle 5 (stages 2, 5) ----

function renderWordle5(
	app: HTMLDivElement,
	stage: 2 | 5,
	onWin: (solvedWord?: string) => void,
	onGameOver: () => void,
	initialStage?: Stage2Or3Data | null,
	previousStageSolvedWord?: string,
	onSaveStage?: (data: Stage2Or3Data) => void,
	signal?: AbortSignal
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
		const inner = document.createElement('div');
		inner.className = 'wordle-cell-inner';
		const front = document.createElement('div');
		front.className = 'wordle-cell-front';
		const back = document.createElement('div');
		back.className = 'wordle-cell-back';
		inner.appendChild(front);
		inner.appendChild(back);
		c.appendChild(inner);
		return c;
	};

	const grid = document.createElement('div');
	grid.className = 'wordle-grid';
	for (let i = 0; i < MAX_GUESSES; i++) {
		const r = row();
		for (let j = 0; j < WORD_LENGTH; j++) r.appendChild(cell());
		grid.appendChild(r);
	}

	function animateRevealRow(rowIndex: number): void {
		const rowEl = grid.querySelectorAll('.wordle-row')[rowIndex];
		if (!rowEl) return;
		const cells = rowEl.querySelectorAll('.wordle-cell');
		cells.forEach((cellEl, i) => {
			setTimeout(() => {
				const inner = cellEl.querySelector('.wordle-cell-inner');
				if (inner) inner.classList.add('flip');
			}, i * FLIP_DELAY_MS);
		});
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

	function updateGrid(animatingRowIndex: number = -1): void {
		const rows = grid.querySelectorAll('.wordle-row');
		rows.forEach((rowEl, rowIndex) => {
			const cells = rowEl.querySelectorAll('.wordle-cell');
			if (rowIndex < completedRows.length) {
				const rowState = completedRows[rowIndex];
				rowState.forEach((s, colIndex) => {
					const cellEl = cells[colIndex];
					const inner = cellEl.querySelector('.wordle-cell-inner');
					const front = cellEl.querySelector('.wordle-cell-front');
					const back = cellEl.querySelector('.wordle-cell-back');
					if (inner && front && back) {
						front.textContent = s.letter;
						back.textContent = s.letter;
						back.className = 'wordle-cell-back';
						if (s.feedback !== null) {
							back.classList.add(
								s.feedback === FEEDBACK.correct ? 'correct' :
								s.feedback === FEEDBACK.present ? 'present' : 'absent'
							);
						}
						inner.classList.remove('flip');
						if (rowIndex !== animatingRowIndex) inner.classList.add('flip');
					}
				});
			} else if (rowIndex === completedRows.length) {
				for (let i = 0; i < WORD_LENGTH; i++) {
					const cellEl = cells[i];
					const front = cellEl.querySelector('.wordle-cell-front');
					const back = cellEl.querySelector('.wordle-cell-back');
					const letter = currentGuess[i] ?? '';
					if (front) front.textContent = letter;
					if (back) { back.textContent = letter; back.className = 'wordle-cell-back'; }
					cellEl.className = 'wordle-cell' + (letter ? ' filled' : '');
				}
			} else {
				cells.forEach((c) => {
					const front = c.querySelector('.wordle-cell-front');
					const back = c.querySelector('.wordle-cell-back');
					if (front) front.textContent = '';
					if (back) { back.textContent = ''; back.className = 'wordle-cell-back'; }
					c.className = 'wordle-cell';
				});
			}
		});
	}

	function setMessage(text: string, isError = false): void {
		const msgEl = app.querySelector('.wordle-message');
		if (msgEl) {
			msgEl.textContent = text;
			msgEl.className = 'wordle-message' + (isError ? ' error' : '');
		}
	}

	let submittingGuess = false;
	async function handleKey(key: string): Promise<void> {
		if (gameOver) return;
		if (key === 'Enter') {
			if (submittingGuess || currentGuess.length !== WORD_LENGTH) {
				if (currentGuess.length !== WORD_LENGTH) {
					setMessage('Not enough letters', true);
				}
				return;
			}
			submittingGuess = true;
			setMessage('');
			const body: { guess: string; stage: number; history?: { guess: string; feedback: number[] }[] } = {
				guess: currentGuess.toLowerCase(),
				stage,
			};
			if (stage === 5) body.history = history;
			try {
				const res = await fetch('/api/wordle/guess', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				});
				// If this render was aborted (reset/stage change), discard result
				if (signal?.aborted) return;
				const data = await res.json();
				if (!res.ok) {
					setMessage(data.error ?? 'Invalid guess', true);
					return;
				}
				const rowState: CellState[] = currentGuess.split('').map((letter, i) => ({
					letter: letter.toUpperCase(),
					feedback: data.feedback[i],
				}));
				completedRows.push(rowState);
				history.push({ guess: currentGuess.toLowerCase(), feedback: data.feedback });
				const solvedWord = currentGuess.toLowerCase();
				const isAllCorrect = Array.isArray(data.feedback)
					&& data.feedback.length === WORD_LENGTH
					&& data.feedback.every((v: number) => v === FEEDBACK.correct);
				const nextGuess = '';
				currentGuess = nextGuess;
				onSaveStage?.({
					completedRows: completedRows.map((row) => row.map((c) => ({ letter: c.letter, feedback: c.feedback }))),
					history: [...history],
					currentGuess: nextGuess,
				});
				if (Boolean(data.won) && isAllCorrect) {
					onWin(solvedWord);
				} else if (completedRows.length >= MAX_GUESSES) onGameOver();
				const revealedRowIndex = completedRows.length - 1;
				updateGrid(revealedRowIndex);
				animateRevealRow(revealedRowIndex);
				updateKeyboardState();
			} finally {
				submittingGuess = false;
			}
			return;
		}
		if (key === 'Backspace') {
			currentGuess = currentGuess.slice(0, -1);
			updateGrid();
			setMessage('');
			onSaveStage?.({ completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))), history: [...history], currentGuess: currentGuess.slice(0, -1) });
			return;
		}
		if (key.length === 1 && /^[A-Za-z]$/.test(key) && currentGuess.length < WORD_LENGTH) {
			currentGuess += key.toUpperCase();
			updateGrid();
			setMessage('');
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
	}, { signal });

	const title = document.createElement('h1');
	title.className = 'wordle-title';
	setStageTitle(title, stage);

	app.innerHTML = '';
	app.appendChild(title);
	app.appendChild(grid);
	app.appendChild(message);
	app.appendChild(keyboard);

	// Check if we need to submit the carried-over word from previous stage
	const shouldAutoSubmitPrefill = stage === 2 || stage === 5;
	// This should happen if:
	// 1. No completed rows yet, OR
	// 2. First row exists but doesn't match the previous stage's word, OR
	// 3. First row exists but has null/invalid feedback
	const needsSubmission = shouldAutoSubmitPrefill && previousStageSolvedWord && previousStageSolvedWord.length === WORD_LENGTH && (() => {
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
	if (needsSubmission && previousStageSolvedWord) {
		(async () => {
			const word = previousStageSolvedWord.toUpperCase();
			try {
				const body: { guess: string; stage: number; history?: { guess: string; feedback: number[] }[] } = {
					guess: previousStageSolvedWord.toLowerCase(),
					stage,
				};
				if (stage === 5 as number) body.history = history;
				const res = await fetch('/api/wordle/guess', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				});
				// If the render was aborted (e.g. user reset), stop processing
				if (signal?.aborted) return;
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
				const isAllCorrect = Array.isArray(data.feedback)
					&& data.feedback.length === WORD_LENGTH
					&& data.feedback.every((v: number) => v === FEEDBACK.correct);
				if (Boolean(data.won) && isAllCorrect) {
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

// ---- Wordle 6 (Circle 6) ----

function renderWordle6(
	app: HTMLDivElement,
	onWin: (solvedWord?: string) => void,
	onGameOver: () => void,
	initialStage6?: Stage2Or3Data | null,
	previousStageSolvedWord?: string,
	onSaveStage6?: (data: Stage2Or3Data) => void,
	signal?: AbortSignal
): void {
	const toCellState = (r: WordleRowState[]): CellState[] =>
		r.map((c) => ({ letter: c.letter, feedback: c.feedback as CellState['feedback'] }));
	let completedRows: CellState[][] = initialStage6?.completedRows?.length
		? initialStage6.completedRows.map((row) => toCellState(row))
		: [];
	let currentGuess = initialStage6?.currentGuess ?? '';
	let gameOver = false;

	const cell6 = () => {
		const c = document.createElement('div');
		c.className = 'wordle-cell';
		const inner = document.createElement('div');
		inner.className = 'wordle-cell-inner';
		const front = document.createElement('div');
		front.className = 'wordle-cell-front';
		const back = document.createElement('div');
		back.className = 'wordle-cell-back';
		inner.appendChild(front);
		inner.appendChild(back);
		c.appendChild(inner);
		return c;
	};

	const grid = document.createElement('div');
	grid.className = 'wordle-grid wordle-grid-6';
	for (let i = 0; i < MAX_GUESSES; i++) {
		const r = document.createElement('div');
		r.className = 'wordle-row';
		for (let j = 0; j < WORD_LENGTH_6; j++) r.appendChild(cell6());
		grid.appendChild(r);
	}

	function animateRevealRow6(rowIndex: number): void {
		const rowEl = grid.querySelectorAll('.wordle-row')[rowIndex];
		if (!rowEl) return;
		const cells = rowEl.querySelectorAll('.wordle-cell');
		cells.forEach((cellEl, i) => {
			setTimeout(() => {
				const inner = cellEl.querySelector('.wordle-cell-inner');
				if (inner) inner.classList.add('flip');
			}, i * FLIP_DELAY_MS);
		});
	}

	function setMessage6(text: string, isError = false): void {
		const msgEl = app.querySelector('.wordle-message');
		if (msgEl) {
			msgEl.textContent = text;
			msgEl.className = 'wordle-message' + (isError ? ' error' : '');
		}
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

	function updateGrid(animatingRowIndex: number = -1): void {
		const rows = grid.querySelectorAll('.wordle-row');
		rows.forEach((rowEl, rowIndex) => {
			const cells = rowEl.querySelectorAll('.wordle-cell');
			if (rowIndex < completedRows.length) {
				completedRows[rowIndex].forEach((s, colIndex) => {
					const cellEl = cells[colIndex];
					const isBlank = s.letter === '' && s.feedback === null;
					const inner = cellEl.querySelector('.wordle-cell-inner');
					const front = cellEl.querySelector('.wordle-cell-front');
					const back = cellEl.querySelector('.wordle-cell-back');
					if (inner && front && back) {
						front.textContent = isBlank ? '' : s.letter;
						back.textContent = isBlank ? '' : s.letter;
						back.className = 'wordle-cell-back' + (isBlank ? ' blank' : '');
						if (!isBlank && s.feedback !== null) {
							back.classList.add(
								s.feedback === FEEDBACK.correct ? 'correct' :
								s.feedback === FEEDBACK.present ? 'present' : 'absent'
							);
						}
						inner.classList.remove('flip');
						if (rowIndex !== animatingRowIndex) inner.classList.add('flip');
					}
					if (isBlank) cellEl.classList.add('blank');
					else cellEl.classList.remove('blank');
				});
			} else if (rowIndex === completedRows.length) {
				for (let i = 0; i < WORD_LENGTH_6; i++) {
					const cellEl = cells[i];
					const letter = currentGuess[i] ?? '';
					const front = cellEl.querySelector('.wordle-cell-front');
					const back = cellEl.querySelector('.wordle-cell-back');
					if (front) front.textContent = letter;
					if (back) { back.textContent = letter; back.className = 'wordle-cell-back'; }
					cellEl.className = 'wordle-cell' + (letter ? ' filled' : '');
				}
			} else {
				cells.forEach((c) => {
					const front = c.querySelector('.wordle-cell-front');
					const back = c.querySelector('.wordle-cell-back');
					if (front) front.textContent = '';
					if (back) { back.textContent = ''; back.className = 'wordle-cell-back'; }
					c.className = 'wordle-cell';
				});
			}
		});
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

	let submittingGuess = false;
	async function handleKey(key: string): Promise<void> {
		if (gameOver) return;
		if (key === 'Enter') {
			if (submittingGuess || currentGuess.length !== WORD_LENGTH_6) {
				if (currentGuess.length !== WORD_LENGTH_6) setMessage6('Not enough letters', true);
				return;
			}
			submittingGuess = true;
			setMessage6('');
			try {
				const res = await fetch('/api/wordle/guess', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ guess: currentGuess.toLowerCase(), stage: 6 }),
				});
				const data = await res.json();
				if (!res.ok) {
					setMessage6(data.error ?? 'Invalid guess', true);
					return;
				}
				const rowState: CellState[] = currentGuess.split('').map((letter, i) => ({
					letter: letter.toUpperCase(),
					feedback: data.feedback[i],
				}));
				completedRows.push(rowState);
				const solvedWord = currentGuess.toLowerCase();
				currentGuess = '';
				onSaveStage6?.({
					completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))),
					history: [],
					currentGuess: '',
				});
				if (data.won) onWin(solvedWord);
				else if (completedRows.length >= MAX_GUESSES) onGameOver();
				else {
					const revealedRowIndex = completedRows.length - 1;
					updateGrid(revealedRowIndex);
					animateRevealRow6(revealedRowIndex);
				}
				updateKeyboardState();
			} finally {
				submittingGuess = false;
			}
			return;
		}
		if (key === 'Backspace') {
			currentGuess = currentGuess.slice(0, -1);
			updateGrid();
			setMessage6('');
			onSaveStage6?.({ completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))), history: [], currentGuess: currentGuess.slice(0, -1) });
			return;
		}
		if (key.length === 1 && /^[A-Za-z]$/.test(key) && currentGuess.length < WORD_LENGTH_6) {
			currentGuess += key.toUpperCase();
			updateGrid();
			setMessage6('');
			onSaveStage6?.({ completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))), history: [], currentGuess: currentGuess });
		}
	}

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === 'Backspace') { e.preventDefault(); handleKey(e.key); }
		else if (e.key.length === 1 && /^[A-Za-z]$/.test(e.key)) { e.preventDefault(); handleKey(e.key.toUpperCase()); }
	}, { signal });

	const title = document.createElement('h1');
	title.className = 'wordle-title';
	setStageTitle(title, 6);

	app.innerHTML = '';
	app.appendChild(title);
	app.appendChild(grid);
	app.appendChild(message);
	app.appendChild(keyboard);

	if (completedRows.length > 0) updateKeyboardState();
	updateGrid();

	// Pre-fill first row: previous stage's 5-letter word + 1 blank cell
	if (completedRows.length === 0 && previousStageSolvedWord && previousStageSolvedWord.length === WORD_LENGTH) {
		(async () => {
			const word = previousStageSolvedWord.toUpperCase();
			try {
				const res = await fetch('/api/wordle/stage6-prefill', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ word5: previousStageSolvedWord.toLowerCase() }),
				});
				const data = await res.json();
				if (!res.ok) {
					const firstRow: CellState[] = [
						...word.split('').map((l) => ({ letter: l, feedback: null })),
						{ letter: '', feedback: null },
					];
					completedRows = [firstRow];
					onSaveStage6?.({
						completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))),
						history: [],
						currentGuess: '',
					});
					updateGrid();
					return;
				}
				const rowState: CellState[] = [
					...word.split('').map((letter, i) => ({ letter, feedback: data.feedback[i] })),
					{ letter: '', feedback: null },
				];
				completedRows = [rowState];
				onSaveStage6?.({
					completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))),
					history: [],
					currentGuess: '',
				});
				updateGrid();
				updateKeyboardState();
			} catch (err) {
				const firstRow: CellState[] = [
					...word.split('').map((l) => ({ letter: l, feedback: null })),
					{ letter: '', feedback: null },
				];
				completedRows = [firstRow];
				onSaveStage6?.({
					completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))),
					history: [],
					currentGuess: '',
				});
				updateGrid();
			}
		})();
	}
}

// ---- Wordle 7 (Circle 7) ----

function renderWordle7(
	app: HTMLDivElement,
	onWin: (solvedWord?: string) => void,
	onGameOver: () => void,
	initialStage7?: Stage7Data | null,
	previousStageSolvedWord?: string,
	onSaveStage7?: (data: Stage7Data) => void,
	signal?: AbortSignal
): void {
	const toCellState = (r: WordleRowState[]): CellState[] =>
		r.map((c) => ({ letter: c.letter, feedback: c.feedback as CellState['feedback'] }));
	let completedRows: CellState[][] = initialStage7?.completedRows?.length
		? initialStage7.completedRows.map((row) => toCellState(row))
		: [];
	let currentGuess = initialStage7?.currentGuess ?? '';
	let gameOver = false;

	const cell7 = () => {
		const c = document.createElement('div');
		c.className = 'wordle-cell';
		const inner = document.createElement('div');
		inner.className = 'wordle-cell-inner';
		const front = document.createElement('div');
		front.className = 'wordle-cell-front';
		const back = document.createElement('div');
		back.className = 'wordle-cell-back';
		inner.appendChild(front);
		inner.appendChild(back);
		c.appendChild(inner);
		return c;
	};

	const grid = document.createElement('div');
	grid.className = 'wordle-grid wordle-grid-7';
	for (let i = 0; i < MAX_GUESSES; i++) {
		const r = document.createElement('div');
		r.className = 'wordle-row';
		for (let j = 0; j < WORD_LENGTH_7; j++) r.appendChild(cell7());
		grid.appendChild(r);
	}

	function animateRevealRow7(rowIndex: number): void {
		const rowEl = grid.querySelectorAll('.wordle-row')[rowIndex];
		if (!rowEl) return;
		const cells = rowEl.querySelectorAll('.wordle-cell');
		cells.forEach((cellEl, i) => {
			setTimeout(() => {
				const inner = cellEl.querySelector('.wordle-cell-inner');
				if (inner) inner.classList.add('flip');
			}, i * FLIP_DELAY_MS);
		});
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

	function updateGrid(animatingRowIndex: number = -1): void {
		const rows = grid.querySelectorAll('.wordle-row');
		rows.forEach((rowEl, rowIndex) => {
			const cells = rowEl.querySelectorAll('.wordle-cell');
			if (rowIndex < completedRows.length) {
				completedRows[rowIndex].forEach((s, colIndex) => {
					const cellEl = cells[colIndex];
					const isBlank = s.letter === '' && s.feedback === null;
					const inner = cellEl.querySelector('.wordle-cell-inner');
					const front = cellEl.querySelector('.wordle-cell-front');
					const back = cellEl.querySelector('.wordle-cell-back');
					if (inner && front && back) {
						front.textContent = isBlank ? '' : s.letter;
						back.textContent = isBlank ? '' : s.letter;
						back.className = 'wordle-cell-back' + (isBlank ? ' blank' : '');
						if (!isBlank && s.feedback !== null) {
							back.classList.add(
								s.feedback === FEEDBACK.correct ? 'correct' :
								s.feedback === FEEDBACK.present ? 'present' : 'absent'
							);
						}
						inner.classList.remove('flip');
						if (rowIndex !== animatingRowIndex && !isBlank) inner.classList.add('flip');
						cellEl.className = 'wordle-cell' + (isBlank ? ' blank' : '');
					}
				});
			} else if (rowIndex === completedRows.length) {
				for (let i = 0; i < WORD_LENGTH_7; i++) {
					const cellEl = cells[i];
					const letter = currentGuess[i] ?? '';
					const front = cellEl.querySelector('.wordle-cell-front');
					const back = cellEl.querySelector('.wordle-cell-back');
					if (front) front.textContent = letter;
					if (back) { back.textContent = letter; back.className = 'wordle-cell-back'; }
					cellEl.className = 'wordle-cell' + (letter ? ' filled' : '');
				}
			} else {
				cells.forEach((c) => {
					const front = c.querySelector('.wordle-cell-front');
					const back = c.querySelector('.wordle-cell-back');
					if (front) front.textContent = '';
					if (back) { back.textContent = ''; back.className = 'wordle-cell-back'; }
					c.className = 'wordle-cell';
				});
			}
		});
	}

	function setMessage7(text: string, isError = false): void {
		const msgEl = app.querySelector('.wordle-message');
		if (msgEl) {
			msgEl.textContent = text;
			msgEl.className = 'wordle-message' + (isError ? ' error' : '');
		}
	}

	let submittingGuess = false;
	async function handleKey(key: string): Promise<void> {
		if (gameOver) return;
		if (key === 'Enter') {
			if (submittingGuess || currentGuess.length !== WORD_LENGTH_7) {
				if (currentGuess.length !== WORD_LENGTH_7) {
					setMessage7('Not enough letters', true);
				}
				return;
			}
			submittingGuess = true;
			setMessage7('');
			try {
				const res = await fetch('/api/wordle/guess', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ guess: currentGuess.toLowerCase(), stage: 7 }),
				});
				const data = await res.json();
				if (!res.ok) {
					setMessage7(data.error ?? 'Invalid guess', true);
					return;
				}
				const rowState: CellState[] = currentGuess.split('').map((letter, i) => ({
					letter: letter.toUpperCase(),
					feedback: data.feedback[i],
				}));
				completedRows.push(rowState);
				currentGuess = '';
				onSaveStage7?.({
					completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))),
					currentGuess: '',
				});
				if (data.won) onWin();
				else if (completedRows.length >= MAX_GUESSES) onGameOver();
				const revealedRowIndex = completedRows.length - 1;
				updateGrid(revealedRowIndex);
				animateRevealRow7(revealedRowIndex);
				updateKeyboardState();
			} finally {
				submittingGuess = false;
			}
			return;
		}
		if (key === 'Backspace') {
			currentGuess = currentGuess.slice(0, -1);
			updateGrid();
			setMessage7('');
			onSaveStage7?.({ completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))), currentGuess: currentGuess.slice(0, -1) });
			return;
		}
		if (key.length === 1 && /^[A-Za-z]$/.test(key) && currentGuess.length < WORD_LENGTH_7) {
			currentGuess += key.toUpperCase();
			updateGrid();
			setMessage7('');
			onSaveStage7?.({ completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))), currentGuess: currentGuess });
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
	}, { signal });

	const title = document.createElement('h1');
	title.className = 'wordle-title';
	setStageTitle(title, 7);

	app.innerHTML = '';
	app.appendChild(title);
	app.appendChild(grid);
	app.appendChild(message);
	app.appendChild(keyboard);

	// Update keyboard state if we have saved progress with completed rows
	if (completedRows.length > 0) {
		updateKeyboardState();
	}
	
	// Pre-fill first row: previous stage's 6-letter word + 1 blank cell
	if (completedRows.length === 0 && previousStageSolvedWord && previousStageSolvedWord.length === WORD_LENGTH_6) {
		(async () => {
			const word = previousStageSolvedWord.toUpperCase();
			try {
				const res = await fetch('/api/wordle/stage7-prefill', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ word6: previousStageSolvedWord.toLowerCase() }),
				});
				const data = await res.json();
				if (!res.ok) {
					const firstRow: CellState[] = [
						...word.split('').map((l) => ({ letter: l, feedback: null })),
						{ letter: '', feedback: null },
					];
					completedRows = [firstRow];
					onSaveStage7?.({
						completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))),
						currentGuess: '',
					});
					updateGrid();
					return;
				}
				const rowState: CellState[] = [
					...word.split('').map((letter, i) => ({ letter, feedback: data.feedback[i] })),
					{ letter: '', feedback: null },
				];
				completedRows = [rowState];
				onSaveStage7?.({
					completedRows: completedRows.map((r) => r.map((c) => ({ letter: c.letter, feedback: c.feedback }))),
					currentGuess: '',
				});
				updateGrid();
				updateKeyboardState();
			} catch (err) {
				const firstRow: CellState[] = [
					...word.split('').map((l) => ({ letter: l, feedback: null })),
					{ letter: '', feedback: null },
				];
				completedRows = [firstRow];
				onSaveStage7?.({
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
type Stage3Data = { letters?: string };
type WordleRowState = { letter: string; feedback: number | null };
type Stage2Or3Data = { completedRows: WordleRowState[][]; history: { guess: string; feedback: number[] }[]; currentGuess: string };
type Stage7Data = { completedRows: WordleRowState[][]; currentGuess: string };

type Progress = {
	stage: number;
	gameOver: boolean;
	victory: boolean;
	stage1?: Stage1Data;
	stage2?: Stage2Or3Data;
	stage3?: Stage3Data;
	stage4?: Stage4ChainData;
	stage5?: Stage2Or3Data;
	stage6?: Stage2Or3Data;
	stage7?: Stage7Data;
	solvedWord1?: string;
	solvedWord2?: string;
	solvedWord3?: string;
	solvedWord4?: string;
	solvedWord5?: string;
	solvedWord6?: string;
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

/** One point per letter revealed over the entire run. */
function computeDailyScore(progress: Progress): number {
	let score = 0;
	if (progress.stage1?.revealed?.length) {
		score += progress.stage1.revealed.filter((c) => c != null && c !== '').length;
	}
	if (progress.stage2?.completedRows?.length) {
		score += progress.stage2.completedRows.length * WORD_LENGTH;
	}
	if (progress.solvedWord3?.length === WORD_LENGTH) {
		score += WORD_LENGTH;
	}
	if (progress.stage4?.chain?.length) {
		score += progress.stage4.chain.length * WORD_LENGTH;
	}
	if (progress.stage5?.completedRows?.length) {
		score += progress.stage5.completedRows.length * WORD_LENGTH;
	}
	if (progress.stage6?.completedRows?.length) {
		score += progress.stage6.completedRows.length * WORD_LENGTH_6;
	}
	if (progress.stage7?.completedRows?.length) {
		score += progress.stage7.completedRows.length * WORD_LENGTH_7;
	}
	return score;
}

async function reportScore(payload: {
	channelId: string | null;
	stageReached: number;
	victory: boolean;
	gameOver: boolean;
	dailyScore: number;
	username?: string;
}): Promise<void> {
	if (!payload.channelId) return;
	const headers = getAuthHeaders();
	if (!headers) return;
	await fetch('/api/report-score', {
		method: 'POST',
		headers: { ...headers, 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});
}

function renderGame(app: HTMLDivElement, initial: Progress | null = null): void {
	const progressState: Progress = {
		stage: Math.min(7, Math.max(1, Number(initial?.stage) || 1)),
		gameOver: Boolean(initial?.gameOver),
		victory: Boolean(initial?.victory),
		stage1: initial?.stage1,
		stage2: initial?.stage2,
		stage3: initial?.stage3,
		stage4: initial?.stage4,
		stage5: initial?.stage5,
		stage6: initial?.stage6,
		stage7: initial?.stage7,
		solvedWord1: initial?.solvedWord1,
		solvedWord2: initial?.solvedWord2,
		solvedWord3: initial?.solvedWord3,
		solvedWord4: initial?.solvedWord4,
		solvedWord5: initial?.solvedWord5,
		solvedWord6: initial?.solvedWord6,
	};

	function mergeSave(patch: Partial<Progress>): void {
		Object.assign(progressState, patch);
		saveProgress(progressState);
	}

	function goToNextStage(solvedWord?: string): void {
		const currentStage = progressState.stage;
		const next = currentStage + 1;
		if (next > 7) return;

		if (currentStage === 1 && solvedWord?.length === WORD_LENGTH) {
			progressState.solvedWord1 = solvedWord;
			mergeSave({ solvedWord1: solvedWord, stage: next });
		} else if (currentStage === 2 && solvedWord?.length === WORD_LENGTH) {
			progressState.solvedWord2 = solvedWord;
			mergeSave({ solvedWord2: solvedWord, stage: next });
		} else if (currentStage === 3 && solvedWord?.length === WORD_LENGTH) {
			progressState.solvedWord3 = solvedWord;
			mergeSave({ solvedWord3: solvedWord, stage: next });
		} else if (currentStage === 4 && solvedWord?.length === WORD_LENGTH) {
			progressState.solvedWord4 = solvedWord;
			mergeSave({ solvedWord4: solvedWord, stage: next });
		} else if (currentStage === 5 && solvedWord?.length === WORD_LENGTH) {
			progressState.solvedWord5 = solvedWord;
			mergeSave({ solvedWord5: solvedWord, stage: next });
		} else if (currentStage === 6 && solvedWord?.length === WORD_LENGTH_6) {
			progressState.solvedWord6 = solvedWord;
			mergeSave({ solvedWord6: solvedWord, stage: next });
		} else {
			mergeSave({ stage: next });
		}

		// Show fiery inter-stage congrats for 3 seconds, then advance
		if (renderAbort) renderAbort.abort();
		renderAbort = new AbortController();
		const congratsSignal = renderAbort.signal;

		// Keep the completed circle's theme during congrats
		app.innerHTML = '';

		renderStageCongrats(app, currentStage, next, congratsSignal, () => {
			progressState.stage = next;
			// Transition to next circle's theme
			const circle = String(next);
			app.setAttribute('data-circle', circle);
			document.body.setAttribute('data-circle', circle);
			reRender();
		});
	}

	async function doGameOver(): Promise<void> {
		progressState.gameOver = true;
		mergeSave({ gameOver: true });
		reportScore({
			channelId: discordSdk.channelId ?? null,
			stageReached: progressState.stage,
			victory: false,
			gameOver: true,
			dailyScore: computeDailyScore(progressState),
			username: undefined,
		}).catch(() => {});
		reRender();
	}

	function doVictory(): void {
		progressState.victory = true;
		mergeSave({ victory: true });
		reportScore({
			channelId: discordSdk.channelId ?? null,
			stageReached: 7,
			victory: true,
			gameOver: false,
			dailyScore: computeDailyScore(progressState),
			username: undefined,
		}).catch(() => {});
		reRender();
	}

	// AbortController to clean up keydown listeners from previous renders.
	// Each reRender aborts the previous controller, removing stale listeners.
	let renderAbort: AbortController | null = null;

	function reRender(): void {
		// Abort any previous render's keydown listeners
		if (renderAbort) renderAbort.abort();
		renderAbort = new AbortController();
		const renderSignal = renderAbort.signal;

		const circle = String(progressState.stage);
		app.setAttribute('data-circle', circle);
		document.body.setAttribute('data-circle', circle);
		app.innerHTML = '';
		// Render cute flame doodles building up from the bottom — more each stage
		const flameContainer = document.createElement('div');
		flameContainer.className = 'flame-doodles';
		const stage = progressState.stage;
		// Number of flame doodles scales with stage: 3, 5, 8, 12, 16, 22, 30
		const flameCounts = [0, 3, 5, 8, 12, 16, 22, 30];
		const numFlames = flameCounts[Math.min(stage, 7)] ?? 3;
		const flameEmojis = ['🔥', '🕯️', '✨', '🔥', '🕯️'];
		for (let i = 0; i < numFlames; i++) {
			const flame = document.createElement('span');
			flame.className = 'flame-doodle';
			flame.textContent = flameEmojis[i % flameEmojis.length];
			// Distribute across the bottom, with some randomness
			const left = (i / numFlames) * 90 + Math.random() * 10;
			const bottomOffset = Math.random() * (stage * 6); // Higher stages = flames creep higher
			const size = 0.8 + Math.random() * 0.8;
			const delay = Math.random() * 2;
			flame.style.cssText = `left:${left}%;bottom:${bottomOffset}px;font-size:${size}rem;animation-delay:${delay}s;`;
			flameContainer.appendChild(flame);
		}
		app.appendChild(flameContainer);

		if (progressState.gameOver) return renderGameOver(app);
		if (progressState.victory) return renderVictory(app);
		if (progressState.stage === 1) {
			renderHangman(app, goToNextStage, doGameOver, progressState.stage1, (d) => mergeSave({ stage1: d }), renderSignal);
			// Show "How to Play" popup on first visit (stage 1 with no progress)
			const hasProgress = progressState.stage1 && (
				progressState.stage1.wrongGuesses.length > 0 ||
				progressState.stage1.revealed.some((r: string | null) => r !== null)
			);
			let dismissed = false;
			try { dismissed = localStorage.getItem(HTP_DISMISSED_KEY) === 'true'; } catch {}
			if (!hasProgress && !dismissed) {
				showHowToPlay(() => { /* popup dismissed, game is already rendered underneath */ });
			}
			return;
		}
		if (progressState.stage === 2) return renderWordle5(app, 2, goToNextStage, doGameOver, progressState.stage2, progressState.solvedWord1, (d) => mergeSave({ stage2: d }), renderSignal);
		if (progressState.stage === 3) return renderAnagram(app, goToNextStage, doGameOver, progressState.stage3, (d) => mergeSave({ stage3: d }), renderSignal);
		if (progressState.stage === 4) return renderWordChain(app, goToNextStage, doGameOver, progressState.stage4, (d) => mergeSave({ stage4: d }), renderSignal);
		if (progressState.stage === 5) return renderWordle5(app, 5, goToNextStage, doGameOver, progressState.stage5, progressState.solvedWord4, (d) => mergeSave({ stage5: d }), renderSignal);
		if (progressState.stage === 6) return renderWordle6(app, goToNextStage, doGameOver, progressState.stage6, progressState.solvedWord5, (d: Stage2Or3Data) => mergeSave({ stage6: d }), renderSignal);
		if (progressState.stage === 7) return renderWordle7(app, doVictory, doGameOver, progressState.stage7, progressState.solvedWord6, (d) => mergeSave({ stage7: d }), renderSignal);
	}

	reRender();
}

function showError(message: string): void {
	const app = document.querySelector<HTMLDivElement>('#app');
	if (app) app.innerHTML = `<p class="error-message">${message}</p>`;
}

const appEl = document.querySelector<HTMLDivElement>('#app');
if (appEl) {
	// Show cool loading screen (may already be set from HTML, but ensure it's there)
	if (!appEl.querySelector('.loading-screen')) {
		appEl.innerHTML = `
			<div class="loading-screen">
				<div class="loading-embers"></div>
				<div class="loading-flame-ring"><span class="loading-flame-emoji">🔥</span></div>
				<div class="loading-title">7 Circles of Wordle</div>
				<div class="loading-subtitle">Descend into the flames…</div>
				<div class="loading-dots"><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>
			</div>
		`;
	}
	// Spawn floating embers into the loading screen
	const embersContainer = appEl.querySelector('.loading-embers');
	if (embersContainer) {
		for (let i = 0; i < 12; i++) {
			const ember = document.createElement('div');
			ember.className = 'loading-ember';
			const left = Math.random() * 100;
			const size = 3 + Math.random() * 5;
			const hue = 25 + Math.random() * 35;
			const delay = Math.random() * 4;
			const dur = 3 + Math.random() * 3;
			ember.style.cssText = `left:${left}%;bottom:0;width:${size}px;height:${size}px;background:hsl(${hue},85%,60%);animation-delay:${delay}s;animation-duration:${dur}s;`;
			embersContainer.appendChild(ember);
		}
	}
}

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
