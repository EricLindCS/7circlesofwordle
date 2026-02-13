import fs from 'node:fs';
import path from 'node:path';

const WORD_LENGTH = 5;
const WORD_LENGTH_6 = 6;
const WORD_LENGTH_7 = 7;
const MAX_WRONG_HANGMAN = 6;
const MAX_GUESSES_WORDLE = 6;

/** Use first N words of main list as "easy" for Hangman (stage 1). */
const EASY_WORD_LIST_SIZE = 1500;

let wordList: string[] = [];
let easyWordList: string[] = [];
let wordList6: string[] = [];
let wordList7: string[] = [];

function seedForStage(stage: number): number {
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
	easyWordList = wordList.slice(0, Math.min(EASY_WORD_LIST_SIZE, wordList.length));
}

function loadWordList6(): void {
	if (wordList6.length > 0) return;
	const filePath = path.join(__dirname, '..', '..', '..', 'sorted_scrabble.txt');
	const content = fs.readFileSync(filePath, 'utf-8');
	wordList6 = content
		.split('\n')
		.map((w) => w.trim().toLowerCase())
		.filter((w) => w.length === WORD_LENGTH_6);
}

function loadWordList7(): void {
	if (wordList7.length > 0) return;
	const filePath = path.join(__dirname, '..', '..', '..', 'sorted_scrabble.txt');
	const content = fs.readFileSync(filePath, 'utf-8');
	wordList7 = content
		.split('\n')
		.map((w) => w.trim().toLowerCase())
		.filter((w) => w.length === WORD_LENGTH_7);
}

/** Stage 1: Hangman uses easier word list (first 1500 words). */
export function getTodayWord(): string {
	if (wordList.length === 0) loadWordList();
	const index = seedForStage(1) % easyWordList.length;
	return easyWordList[index];
}

/** Set of 5-letter words already used by other stages (for distinct picks). */
function getUsed5LetterWords(excludeStages: number[]): Set<string> {
	const used = new Set<string>();
	if (excludeStages.includes(1)) used.add(getTodayWord());
	if (excludeStages.includes(2)) used.add(getTodayWordStage2());
	if (excludeStages.includes(3)) used.add(getTodayWordStage3());
	if (excludeStages.includes(4)) used.add(getTodayWordStage4());
	return used;
}

/** Stage 2: Regular 5-letter Wordle. */
export function getTodayWordStage2(): string {
	if (wordList.length === 0) loadWordList();
	const used = getUsed5LetterWords([1]);
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

/** Stage 3: Anagram (unscramble) – one 5-letter word per day. */
export function getTodayWordStage3(): string {
	if (wordList.length === 0) loadWordList();
	const used = getUsed5LetterWords([1, 2]);
	const index = seedForStage(3) % wordList.length;
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

/** Deterministic shuffle for anagram letters (same for all users per day). */
function shuffleWord(word: string): string {
	const seed = seedForStage(3);
	const arr = word.split('');
	for (let i = arr.length - 1; i > 0; i--) {
		const j = (seed + i * 31) % (i + 1);
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr.join('').toUpperCase();
}

export function getAnagramLettersStage3(): string {
	const word = getTodayWordStage3();
	// Add one decoy letter not in the word, then shuffle all 6
	const seed = seedForStage(3);
	const alphabet = 'abcdefghijklmnopqrstuvwxyz';
	const wordLetters = new Set(word.split(''));
	// Pick a decoy letter deterministically that's NOT in the word
	let decoy = '';
	for (let i = 0; i < 26; i++) {
		const candidate = alphabet[(seed + i * 7) % 26];
		if (!wordLetters.has(candidate)) { decoy = candidate; break; }
	}
	const allLetters = (word + decoy).split('');
	// Shuffle all 6 letters deterministically
	for (let i = allLetters.length - 1; i > 0; i--) {
		const j = (seed + i * 31) % (i + 1);
		[allLetters[i], allLetters[j]] = [allLetters[j], allLetters[i]];
	}
	return allLetters.join('').toUpperCase();
}

/** Return the correct letter at position `pos` (0-based) of today's anagram secret. */
export function getAnagramHint(pos: number): { position: number; letter: string } | { error: string } {
	const word = getTodayWordStage3();
	if (pos < 0 || pos >= word.length) return { error: 'Invalid position' };
	return { position: pos, letter: word[pos].toUpperCase() };
}

export function validateAnagramStage3(guess: string): { won: boolean } | { error: string } {
	if (wordList.length === 0) loadWordList();
	const g = guess.trim().toLowerCase();
	if (g.length !== WORD_LENGTH) return { error: 'Guess must be 5 letters' };
	if (!/^[a-z]+$/.test(g)) return { error: 'Letters only' };
	const secret = getTodayWordStage3();
	const won = sortLetters(g) === sortLetters(secret);
	return { won };
}

function sortLetters(w: string): string {
	return w.split('').sort().join('');
}

/** Stage 4: Word Chain — starting word for today. */
export function getTodayWordStage4(): string {
	if (wordList.length === 0) loadWordList();
	const used = getUsed5LetterWords([1, 2, 3]);
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

/** Stage 4: Word Chain — validate a chain word.
 *  `previousWord` is the last word in the chain so far.
 *  `chain` is all words in the chain so far (including the starting word).
 *  The guess must start with the last letter of previousWord, be a valid 5-letter word,
 *  and must NOT reuse any starting or ending letter already used in the chain. */
export function validateChainWord(guess: string, previousWord: string, chain?: string[]): { valid: boolean; error?: string } {
	if (wordList.length === 0) loadWordList();
	const g = guess.trim().toLowerCase();
	const prev = previousWord.trim().toLowerCase();
	if (g.length !== WORD_LENGTH) return { valid: false, error: 'Word must be 5 letters' };
	if (!wordList.includes(g)) return { valid: false, error: 'Not in word list' };
	const requiredStart = prev[prev.length - 1];
	if (g[0] !== requiredStart) return { valid: false, error: `Word must start with "${requiredStart.toUpperCase()}"` };

	// Check for repeated starting/ending letters
	if (chain && chain.length > 0) {
		const usedStartLetters = new Set(chain.map(w => w[0].toLowerCase()));
		const usedEndLetters = new Set(chain.map(w => w[w.length - 1].toLowerCase()));
		if (usedStartLetters.has(g[0])) {
			return { valid: false, error: `A word already starts with "${g[0].toUpperCase()}" — pick a different word!` };
		}
		if (usedEndLetters.has(g[g.length - 1])) {
			return { valid: false, error: `A word already ends with "${g[g.length - 1].toUpperCase()}" — pick a different word!` };
		}
	}

	return { valid: true };
}

/** Stage 5: Antagonistic Wordle – no single word; adversary picks. */
function getUsed5LetterForAdversary(): Set<string> {
	return getUsed5LetterWords([1, 2, 3, 4]);
}

/** Stage 6: 6-letter Wordle. */
export function getTodayWordStage6(): string {
	loadWordList6();
	const index = seedForStage(6) % wordList6.length;
	return wordList6[index];
}

/** Stage 7: 7-letter Wordle. */
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

function getFeedback6(secret: string, guess: string): number[] {
	return getFeedbackFor(secret, guess, WORD_LENGTH_6);
}

function getFeedback7(secret: string, guess: string): number[] {
	return getFeedbackFor(secret, guess, WORD_LENGTH_7);
}

/** Feedback for first 6 letters of 7-letter secret (for stage 7 prefill from stage 6). */
export function getFeedbackForFirst6Letters(secret7: string, guess6: string): number[] {
	const result: number[] = new Array(6).fill(0);
	const secretCount: Record<string, number> = {};
	for (const c of secret7) secretCount[c] = (secretCount[c] ?? 0) + 1;
	for (let i = 0; i < 6; i++) {
		if (guess6[i] === secret7[i]) {
			result[i] = 2;
			secretCount[secret7[i]]--;
		}
	}
	for (let i = 0; i < 6; i++) {
		if (result[i] === 2) continue;
		const c = guess6[i];
		if (secretCount[c] != null && secretCount[c] > 0) {
			result[i] = 1;
			secretCount[c]--;
		}
	}
	return result;
}

// ---- Stage 2: Regular Wordle 5 ----

export function validateGuessStage2(guess: string): { feedback: number[]; won: boolean } | { error: string } {
	if (wordList.length === 0) loadWordList();
	const g = guess.trim().toLowerCase();
	if (g.length !== WORD_LENGTH) return { error: 'Guess must be 5 letters' };
	if (!wordList.includes(g)) return { error: 'Not in word list' };
	const secret = getTodayWordStage2();
	const feedback = getFeedback(secret, g);
	return { feedback, won: feedback.every((v) => v === 2) };
}

// ---- Stage 4: Wordle 5 (another word) ----

export function validateGuessStage4(guess: string): { feedback: number[]; won: boolean } | { error: string } {
	if (wordList.length === 0) loadWordList();
	const g = guess.trim().toLowerCase();
	if (g.length !== WORD_LENGTH) return { error: 'Guess must be 5 letters' };
	if (!wordList.includes(g)) return { error: 'Not in word list' };
	const secret = getTodayWordStage4();
	const feedback = getFeedback(secret, g);
	return { feedback, won: feedback.every((v) => v === 2) };
}

// ---- Stage 5: Antagonistic Wordle 5 ----

function wordsConsistentWith(history: { guess: string; feedback: number[] }[]): string[] {
	const used = getUsed5LetterForAdversary();
	return wordList.filter((secret) => {
		if (used.has(secret)) return false;
		return history.every(({ guess, feedback }) => {
			const f = getFeedback(secret, guess);
			return f.every((v, i) => v === feedback[i]);
		});
	});
}

export function validateGuessStage5(
	guess: string,
	history: { guess: string; feedback: number[] }[]
): { feedback: number[]; won: boolean } | { error: string } {
	if (wordList.length === 0) loadWordList();
	const g = guess.trim().toLowerCase();
	if (g.length !== WORD_LENGTH) return { error: 'Guess must be 5 letters' };
	if (!wordList.includes(g)) return { error: 'Not in word list' };

	const consistent = wordsConsistentWith(history);
	if (consistent.length === 0) return { error: 'No consistent word' };

	const feedbackToWords: Record<string, string[]> = {};
	for (const secret of consistent) {
		const feedback = getFeedback(secret, g);
		const key = JSON.stringify(feedback);
		if (!feedbackToWords[key]) feedbackToWords[key] = [];
		feedbackToWords[key].push(secret);
	}

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

// ---- Stage 6: 6-letter Wordle ----

export function validateGuessStage6(guess: string): { feedback: number[]; won: boolean } | { error: string } {
	loadWordList6();
	const g = guess.trim().toLowerCase();
	if (g.length !== WORD_LENGTH_6) return { error: 'Guess must be 6 letters' };
	if (!wordList6.includes(g)) return { error: 'Not in word list' };
	const secret = getTodayWordStage6();
	const feedback = getFeedback6(secret, g);
	return { feedback, won: feedback.every((v) => v === 2) };
}

// ---- Stage 7: 7-letter Wordle ----

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

export function isWordValid6(word: string): boolean {
	loadWordList6();
	return wordList6.includes(word.toLowerCase());
}

export function isWordValid7(word: string): boolean {
	loadWordList7();
	return wordList7.includes(word.toLowerCase());
}
