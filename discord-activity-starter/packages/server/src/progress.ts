/** Per-stage progress for restore. */
export type Stage1Data = {
	revealed: (string | null)[];
	wrongGuesses: string[];
	currentWordGuess: string;
};

export type WordleRowState = { letter: string; feedback: number | null };
export type Stage2Or3Data = {
	completedRows: WordleRowState[][];
	history: { guess: string; feedback: number[] }[];
	currentGuess: string;
};

export type Stage4Data = {
	completedRows: WordleRowState[][];
	currentGuess: string;
};

/** Stage 7 = 7-letter Wordle (same shape as old stage 4). */
export type Stage7Data = {
	completedRows: WordleRowState[][];
	currentGuess: string;
};

export type ProgressRecord = {
	stage: number;
	gameOver: boolean;
	victory: boolean;
	stage1?: Stage1Data;
	stage2?: Stage2Or3Data;
	stage3?: Stage2Or3Data;
	stage4?: Stage2Or3Data;
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

/** Progress per user per day. Key: `${userId}:${dateStr}` */
const store = new Map<string, ProgressRecord>();

function today(): string {
	const d = new Date();
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function key(userId: string): string {
	return `${userId}:${today()}`;
}

const defaultProgress: ProgressRecord = {
	stage: 1,
	gameOver: false,
	victory: false,
};

export function getProgress(userId: string): ProgressRecord {
	const k = key(userId);
	const v = store.get(k);
	return v ? { ...defaultProgress, ...v } : { ...defaultProgress };
}

export function setProgress(userId: string, data: Partial<ProgressRecord>): void {
	const k = key(userId);
	const current = store.get(k) ?? { ...defaultProgress };
	const merged: ProgressRecord = {
		...current,
		...(typeof data.stage === 'number' && data.stage >= 1 && data.stage <= 7 && { stage: data.stage }),
		...(typeof data.gameOver === 'boolean' && { gameOver: data.gameOver }),
		...(typeof data.victory === 'boolean' && { victory: data.victory }),
		...(data.stage1 !== undefined && { stage1: data.stage1 }),
		...(data.stage2 !== undefined && { stage2: data.stage2 }),
		...(data.stage3 !== undefined && { stage3: data.stage3 }),
		...(data.stage4 !== undefined && { stage4: data.stage4 }),
		...(data.stage5 !== undefined && { stage5: data.stage5 }),
		...(data.stage6 !== undefined && { stage6: data.stage6 }),
		...(data.stage7 !== undefined && { stage7: data.stage7 }),
		...(typeof data.solvedWord1 === 'string' && { solvedWord1: data.solvedWord1 }),
		...(typeof data.solvedWord2 === 'string' && { solvedWord2: data.solvedWord2 }),
		...(typeof data.solvedWord3 === 'string' && { solvedWord3: data.solvedWord3 }),
		...(typeof data.solvedWord4 === 'string' && { solvedWord4: data.solvedWord4 }),
		...(typeof data.solvedWord5 === 'string' && { solvedWord5: data.solvedWord5 }),
		...(typeof data.solvedWord6 === 'string' && { solvedWord6: data.solvedWord6 }),
	};
	store.set(k, merged);
}

export function resetProgress(userId: string): void {
	store.delete(key(userId));
}
