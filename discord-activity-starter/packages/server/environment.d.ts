declare global {
	namespace NodeJS {
		interface ProcessEnv {
			VITE_CLIENT_ID?: string;
			VITE_DISCORD_CLIENT_ID?: string;
			CLIENT_SECRET?: string;
			DISCORD_CLIENT_SECRET?: string;
			PUBLIC_KEY?: string;
			NODE_ENV: 'development' | 'production';
			PORT?: string;
			PWD: string;
		}
	}
}

export type {};
