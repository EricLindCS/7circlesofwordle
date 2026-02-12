import fs from 'node:fs';
import path from 'node:path';

const WORD_LENGTH = 5;
const WORD_LENGTH_7 = 7;
const MAX_WRONG_HANGMAN = 6;
const MAX_GUESSES_WORDLE = 6;

let wordList: string[] = [];
let wordList7: string[] = [];

function getTodaySeed(): number {
	const today = new Date();
	const dateStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
	let hash = 0;
	for (let i = 0; i < dateStr.length; i++) {
		hash = (hash << 5) - hash + dateStr.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
}

function seedForStage(stage: number): number {
	// Create a deterministic seed per (date, stage) by hashing the date string
	// combined with the stage number. This avoids collisions caused by the
	// prior iterative transform and guarantees different stages map to
	// different seeds (modulo word list length).
	const today = new Date();
	const dateStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
	const key = `${dateStr}:${stage}`;
	let hash = 0;
	for (let i = 0; i < key.length; i++) {
		hash = (hash << 5) - hash + key.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
}

export function loadWordList(): void {
	const filePath = path.join(__dirname, '..', 'wordlist.txt');
	const content = fs.readFileSync(filePath, 'utf-8');
	wordList = content
		.split('\n')
		.map((w) => w.trim().toLowerCase())
		.filter((w) => w.length === WORD_LENGTH);
}

function loadWordList7(): void {
	if (wordList7.length > 0) return;
	// From dist: ../../../ = discord-activity-starter
	const filePath = path.join(__dirname, '..', '..', '..', 'sorted_scrabble.txt');
	const content = fs.readFileSync(filePath, 'utf-8');
	wordList7 = content
		.split('\n')
		.map((w) => w.trim().toLowerCase())
		.filter((w) => w.length === WORD_LENGTH_7);
}

/** Today's 5-letter word for stage 1 (Hangman). One random word per day, same for all users. */
export function getTodayWord(): string {
	if (wordList.length === 0) loadWordList();
	const index = seedForStage(1) % wordList.length;
	return wordList[index];
}

/** Set of words already used by other stages (to pick a distinct word for a stage). Stage 3 is adversarial so has no single word. */
function getUsedWordsForStages(excludeStages: number[]): Set<string> {
	const used = new Set<string>();
	if (excludeStages.includes(1)) used.add(getTodayWord());
	if (excludeStages.includes(2)) used.add(getTodayWordStage2());
	if (excludeStages.includes(4)) used.add(getTodayWordStage4());
	if (excludeStages.includes(5)) used.add(getTodayWordStage5());
	if (excludeStages.includes(6)) used.add(getTodayWordStage6());
	return used;
}

/** Today's 5-letter word for stage 2 (Wordle). Different from stage 1, rolled daily. */
export function getTodayWordStage2(): string {
	if (wordList.length === 0) loadWordList();
	const used = getUsedWordsForStages([1]);
	const index = seedForStage(2) % wordList.length;
	let candidate = wordList[index];
	let attempts = 0;
	let currentIndex = index;
	while (used.has(candidate) && attempts < wordList.length) {
		currentIndex = (currentIndex + 1) % wordList.length;
		candidate = wordList[currentIndex];
		attempts++;
	}
	return candidate;
}

/** Today's 5-letter word for stage 4 (Circle 4). */
export function getTodayWordStage4(): string {
	if (wordList.length === 0) loadWordList();
	const used = getUsedWordsForStages([1, 2, 3]);
	const index = seedForStage(4) % wordList.length;
	let candidate = wordList[index];
	let attempts = 0;
	let currentIndex = index;
	while (used.has(candidate) && attempts < wordList.length) {
		currentIndex = (currentIndex + 1) % wordList.length;
		candidate = wordList[currentIndex];
		attempts++;
	}
	return candidate;
}

/** Today's 5-letter word for stage 5 (Circle 5). */
export function getTodayWordStage5(): string {
	if (wordList.length === 0) loadWordList();
	const used = getUsedWordsForStages([1, 2, 3, 4]);
	const index = seedForStage(5) % wordList.length;
	let candidate = wordList[index];
	let attempts = 0;
	let currentIndex = index;
	while (used.has(candidate) && attempts < wordList.length) {
		currentIndex = (currentIndex + 1) % wordList.length;
		candidate = wordList[currentIndex];
		attempts++;
	}
	return candidate;
}

/** Today's 5-letter word for stage 6 (Circle 6). */
export function getTodayWordStage6(): string {
	if (wordList.length === 0) loadWordList();
	const used = getUsedWordsForStages([1, 2, 3, 4, 5]);
	const index = seedForStage(6) % wordList.length;
	let candidate = wordList[index];
	let attempts = 0;
	let currentIndex = index;
	while (used.has(candidate) && attempts < wordList.length) {
		currentIndex = (currentIndex + 1) % wordList.length;
		candidate = wordList[currentIndex];
		attempts++;
	}
	return candidate;
}

/** Today's 7-letter word for stage 7 (final circle). */
export function getTodayWord7(): string {
	loadWordList7();
	const index = seedForStage(7) % wordList7.length;
	return wordList7[index];
}

// ---- Hangman (Stage 1) ----

export function hangmanGuessLetter(letter: string): { positions: number[]; isWrong: boolean } | { error: string } {
	if (wordList.length === 0) loadWordList();
	const c = letter.trim().toLowerCase();
	if (c.length !== 1 || !/^[a-z]$/.test(c)) return { error: 'Single letter required' };
	const secret = getTodayWord();
	const positions: number[] = [];
	for (let i = 0; i < secret.length; i++) {
		if (secret[i] === c) positions.push(i);
	}
	return { positions, isWrong: positions.length === 0 };
}

export function hangmanGuessWord(word: string): { won: boolean } | { error: string } {
	if (wordList.length === 0) loadWordList();
	const w = word.trim().toLowerCase();
	if (w.length !== WORD_LENGTH) return { error: 'Word must be 5 letters' };
	if (!wordList.includes(w)) return { error: 'Not in word list' };
	const secret = getTodayWord();
	return { won: w === secret };
}

// ---- Wordle feedback (shared) ----

function getFeedbackFor(secret: string, guess: string, len: number): number[] {
	const result: number[] = new Array(len).fill(0);
	const secretCount: Record<string, number> = {};
	for (const c of secret) secretCount[c] = (secretCount[c] ?? 0) + 1;
	for (let i = 0; i < len; i++) {
		if (guess[i] === secret[i]) {
			result[i] = 2;
			secretCount[secret[i]]--;
		}
	}
	for (let i = 0; i < len; i++) {
		if (result[i] === 2) continue;
		const c = guess[i];
		if (secretCount[c] != null && secretCount[c] > 0) {
			result[i] = 1;
			secretCount[c]--;
		}
	}
	return result;
}

export function getFeedback(secret: string, guess: string): number[] {
	return getFeedbackFor(secret, guess, WORD_LENGTH);
}

function getFeedback7(secret: string, guess: string): number[] {
	return getFeedbackFor(secret, guess, WORD_LENGTH_7);
}

/** Get feedback for a 5-letter word against the first 5 letters of a 7-letter word.
 *  Considers the full 7-letter word for letter counts (yellow feedback). */
export function getFeedbackForFirst5Letters(secret7: string, guess5: string): number[] {
	const result: number[] = new Array(5).fill(0);
	const secretCount: Record<string, number> = {};
	// Count all letters in the 7-letter word
	for (const c of secret7) secretCount[c] = (secretCount[c] ?? 0) + 1;
	// First pass: mark correct positions (green) in first 5 letters
	for (let i = 0; i < 5; i++) {
		if (guess5[i] === secret7[i]) {
			result[i] = 2;
			secretCount[secret7[i]]--;
		}
	}
	// Second pass: mark present letters (yellow) considering full 7-letter word
	for (let i = 0; i < 5; i++) {
		if (result[i] === 2) continue;
		const c = guess5[i];
		if (secretCount[c] != null && secretCount[c] > 0) {
			result[i] = 1;
			secretCount[c]--;
		}
	}
	return result;
}

// ---- Stage 2: Wordle (own daily word) ----

export function validateGuessStage2(guess: string): { feedback: number[]; won: boolean } | { error: string } {
	if (wordList.length === 0) loadWordList();
	const g = guess.trim().toLowerCase();
	if (g.length !== WORD_LENGTH) return { error: 'Guess must be 5 letters' };
	if (!wordList.includes(g)) return { error: 'Not in word list' };
	const secret = getTodayWordStage2();
	const feedback = getFeedback(secret, g);
	return { feedback, won: feedback.every((v) => v === 2) };
}

// ---- Stage 3: Antagonistic Wordle ----

/** Words in wordList that are consistent with every (guess, feedback) in history. */
function wordsConsistentWith(history: { guess: string; feedback: number[] }[]): string[] {
	const used = getUsedWordsForStages([1, 2, 4, 5, 6]);
	return wordList.filter((secret) => {
		if (used.has(secret)) return false;
		return history.every(({ guess, feedback }) => {
			const f = getFeedback(secret, guess);
			return f.every((v, i) => v === feedback[i]);
		});
	});
}

/** Adversarial: given history and new guess, return feedback that maximizes the size of the remaining consistent set. */
export function validateGuessStage3(
	guess: string,
	history: { guess: string; feedback: number[] }[]
): { feedback: number[]; won: boolean } | { error: string } {
	if (wordList.length === 0) loadWordList();
	const g = guess.trim().toLowerCase();
	if (g.length !== WORD_LENGTH) return { error: 'Guess must be 5 letters' };
	if (!wordList.includes(g)) return { error: 'Not in word list' };

	const consistent = wordsConsistentWith(history);
	if (consistent.length === 0) return { error: 'No consistent word' };

	// Group consistent words by the feedback they would produce for this guess
	const feedbackToWords: Record<string, string[]> = {};
	for (const secret of consistent) {
		const feedback = getFeedback(secret, g);
		const key = JSON.stringify(feedback);
		if (!feedbackToWords[key]) feedbackToWords[key] = [];
		feedbackToWords[key].push(secret);
	}

	// Adversary picks the feedback that leaves the largest set (hardest for player)
	let bestKey: string | null = null;
	let bestSize = 0;
	for (const [key, words] of Object.entries(feedbackToWords)) {
		if (words.length > bestSize) {
			bestSize = words.length;
			bestKey = key;
		}
	}
	const feedback = JSON.parse(bestKey!) as number[];
	const won = feedback.every((v) => v === 2);
	return { feedback, won };
}

// ---- Stages 4, 5, 6: 5-letter Wordle (each circle has its own word) ----

export function validateGuessStage4(guess: string): { feedback: number[]; won: boolean } | { error: string } {
	if (wordList.length === 0) loadWordList();
	const g = guess.trim().toLowerCase();
	if (g.length !== WORD_LENGTH) return { error: 'Guess must be 5 letters' };
	if (!wordList.includes(g)) return { error: 'Not in word list' };
	const secret = getTodayWordStage4();
	const feedback = getFeedback(secret, g);
	return { feedback, won: feedback.every((v) => v === 2) };
}

export function validateGuessStage5(guess: string): { feedback: number[]; won: boolean } | { error: string } {
	if (wordList.length === 0) loadWordList();
	const g = guess.trim().toLowerCase();
	if (g.length !== WORD_LENGTH) return { error: 'Guess must be 5 letters' };
	if (!wordList.includes(g)) return { error: 'Not in word list' };
	const secret = getTodayWordStage5();
	const feedback = getFeedback(secret, g);
	return { feedback, won: feedback.every((v) => v === 2) };
}

export function validateGuessStage6(guess: string): { feedback: number[]; won: boolean } | { error: string } {
	if (wordList.length === 0) loadWordList();
	const g = guess.trim().toLowerCase();
	if (g.length !== WORD_LENGTH) return { error: 'Guess must be 5 letters' };
	if (!wordList.includes(g)) return { error: 'Not in word list' };
	const secret = getTodayWordStage6();
	const feedback = getFeedback(secret, g);
	return { feedback, won: feedback.every((v) => v === 2) };
}

// ---- Stage 7: 7-letter Wordle (final circle) ----

export function validateGuessStage7(guess: string): { feedback: number[]; won: boolean } | { error: string } {
	loadWordList7();
	const g = guess.trim().toLowerCase();
	if (g.length !== WORD_LENGTH_7) return { error: 'Guess must be 7 letters' };
	if (!wordList7.includes(g)) return { error: 'Not in word list' };
	const secret = getTodayWord7();
	const feedback = getFeedback7(secret, g);
	return { feedback, won: feedback.every((v) => v === 2) };
}

export function isWordValid5(word: string): boolean {
	if (wordList.length === 0) loadWordList();
	return wordList.includes(word.toLowerCase());
}

export function isWordValid7(word: string): boolean {
	loadWordList7();
	return wordList7.includes(word.toLowerCase());
}
