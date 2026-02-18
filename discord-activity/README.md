# Discord Embedded App Starter

This repo is a minimal starter-project. Getting an embedded app running in Discord can be complex. The goal of this example is to get you up-and-running as quickly as possible, while making it easy to swap in pieces to fit your embedded app's client and server needs.

## Client architecture

The client (aka front-end) is using [ViteJS](https://vitejs.dev/)'s Vanilla Typescript starter project. Vite has great starter projects in [many common javascript frameworks](https://vitejs.dev/guide/#trying-vite-online). All of these projects use the same config setup, which means that if you prefer React, Svelte, etc... you can swap frameworks and still get the following:

- Fast typescript bundling with hot-module-reloading
- Identical configuration API
- Identical environment variable API

Note: ViteJS is not required to use Discord's `embedded-app-sdk`. ViteJS is a meta-client-framework we are using to make it easy to help you get running quickly, but the core concepts of developing an embedded application are the same, regardless of how you are consuming `embedded-app-sdk`.

## Server architecture

The server (aka back-end) is using Express with typescript. Any file in the server project can be imported by the client, in case you need to share business logic.

## Setting up your Discord Application

Before we write any code, lets follow the instructions [here](https://discord.com/developers/docs/activities/building-an-activity#step-1-creating-a-new-app) to make sure your Discord application is set up correctly.

## Setting up your environment variables

In this directory (`/examples/discord-activity-starter`) we need to create a `.env` file with the OAuth2 variables, as described [here](https://discord.com/developers/docs/activities/building-an-activity#find-your-oauth2-credentials).

```env
VITE_CLIENT_ID=123456789012345678
CLIENT_SECRET=abcdefghijklmnopqrstuvwxyzabcdef
```

### Adding a new environment variable

In order to add new environment variables, you will need to do the following:

1. Add the environment key and value to `.env`
2. Add the key to [/examples/discord-activity-starter/packages/client/src/vite-env.d.ts](/examples/discord-activity-starter/packages/client/src/vite-env.d.ts)
3. Add the key to [/examples/discord-activity-starter/packages/server/environment.d.ts](/examples/discord-activity-starter/packages/server/environment.d.ts)

This will ensure that you have type safety when consuming your environment variables

## Running your app locally

As described [here](https://discord.com/developers/docs/activities/building-an-activity#step-4-running-your-app-locally-in-discord), we encourage using a tunnel solution such as [cloudflared](https://github.com/cloudflare/cloudflared#installing-cloudflared) for local development.
To run your app locally, run the following from this directory (/examples/discord-activity-starter)

```
pnpm install # only need to run this the first time
pnpm dev
pnpm tunnel # from another terminal
```

Be sure to complete all the steps listed [here](https://discord.com/developers/docs/activities/building-an-activity) to ensure your development setup is working as expected.

## 7 Circles of Wordle — progress and reset

Progress (stage, game over, victory) is stored per user per day. Relaunching the activity restores your state.

### Reset progress (for testing)

- **In the activity:** On Game Over or Victory, click **"Reset my progress (testing)"** to clear today's progress and start from Stage 1.
- **From a channel:** Use the slash command **`/wordle-reset`** in any channel; your progress for the day is cleared.

### Enabling `/wordle-reset` (slash command)

The app handles the interaction per [Discord Application Commands](https://discord.com/developers/interactions/application-commands#slash-command-interaction): type `2` = Application Command, response type `4` = CHANNEL_MESSAGE_WITH_SOURCE.

**Option A — Register via script (CHAT_INPUT type 1):**

1. In the [Developer Portal](https://discord.com/developers/applications) → your app → **General Information**, copy **Public Key**. Add to `.env`: `PUBLIC_KEY=your_public_key_hex`. Ensure `BOT_TOKEN` and `VITE_APPLICATION_ID` (or `VITE_CLIENT_ID`) are in `.env`.
2. Set **Interactions Endpoint URL** to `https://your-tunnel.trycloudflare.com/api/discord/interactions` (use your real tunnel URL). Save.
3. From this directory run: `node scripts/register-slash-command.js` to register the slash command via the Discord API (type 1 = CHAT_INPUT).
4. Run `npm install` in `packages/server` (adds `tweetnacl` for signature verification).

**Option B — Manual:** **Commands** → **New Command**. Name: `wordle-reset`, description: e.g. "Reset your daily progress (for testing)". Save.

### Score reporting

When a player hits Game Over or completes all four stages (victory), the app sends a message to the **channel** where the activity is running (if `BOT_TOKEN` is set and the Embedded App SDK provides a `channelId`). The message reports how far they got or that they won. In DMs or when `channelId` is unavailable, reporting is skipped.

### Progress and mobile

- **Full progress:** Per-stage state is saved (Hangman revealed letters/wrong guesses, Wordle rows and current guess for each stage). Relaunching restores exactly where you left off, including words already guessed.
- **Mobile:** The activity is responsive with touch-friendly tap targets (min 44px), safe-area insets, and viewport settings for small screens.
