import fs from 'node:fs';
import path from 'node:path';

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

let wordList: string[] = [];

export function loadWordList(): void {
	// From dist/ we need to go up to server package root
	const filePath = path.join(__dirname, '..', 'wordlist.txt');
	const content = fs.readFileSync(filePath, 'utf-8');
	wordList = content
		.split('\n')
		.map((w) => w.trim().toLowerCase())
		.filter((w) => w.length === WORD_LENGTH);
}

export function getWordList(): string[] {
	return wordList;
}

/** Get today's word index (deterministic by UTC date). */
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

export function getTodayWord(): string {
	if (wordList.length === 0) loadWordList();
	const seed = getTodaySeed();
	const index = seed % wordList.length;
	return wordList[index];
}

/** Feedback: 0 = not in word, 1 = wrong position, 2 = correct position */
export function getFeedback(secret: string, guess: string): number[] {
	const result: number[] = [0, 0, 0, 0, 0];
	const secretCount: Record<string, number> = {};
	for (const c of secret) {
		secretCount[c] = (secretCount[c] ?? 0) + 1;
	}
	// First pass: mark correct (green)
	for (let i = 0; i < WORD_LENGTH; i++) {
		if (guess[i] === secret[i]) {
			result[i] = 2;
			secretCount[secret[i]]--;
		}
	}
	// Second pass: mark present (yellow)
	for (let i = 0; i < WORD_LENGTH; i++) {
		if (result[i] === 2) continue;
		const c = guess[i];
		if (secretCount[c] != null && secretCount[c] > 0) {
			result[i] = 1;
			secretCount[c]--;
		}
	}
	return result;
}

export function isWordValid(word: string): boolean {
	return wordList.length > 0 && wordList.includes(word.toLowerCase());
}

export function validateGuess(guess: string): { feedback: number[]; won: boolean } | { error: string } {
	if (wordList.length === 0) loadWordList();
	const g = guess.trim().toLowerCase();
	if (g.length !== WORD_LENGTH) {
		return { error: 'Guess must be 5 letters' };
	}
	if (!wordList.includes(g)) {
		return { error: 'Not in word list' };
	}
	const secret = getTodayWord();
	const feedback = getFeedback(secret, g);
	const won = feedback.every((v) => v === 2);
	return { feedback, won };
}
