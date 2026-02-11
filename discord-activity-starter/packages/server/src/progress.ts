/** Progress per user per day. Key: `${userId}:${dateStr}` */
const store = new Map<string, { stage: number; gameOver: boolean; victory: boolean }>();

function today(): string {
	const d = new Date();
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function key(userId: string): string {
	return `${userId}:${today()}`;
}

export function getProgress(userId: string): { stage: number; gameOver: boolean; victory: boolean } {
	const k = key(userId);
	const v = store.get(k);
	return v ?? { stage: 1, gameOver: false, victory: false };
}

export function setProgress(
	userId: string,
	data: { stage: number; gameOver: boolean; victory: boolean }
): void {
	store.set(key(userId), data);
}

export function resetProgress(userId: string): void {
	store.delete(key(userId));
}
