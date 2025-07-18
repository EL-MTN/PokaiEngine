# 🚀 Quick Start Guide

Get your first poker bot running in 5 minutes!

## 📋 Prerequisites

- Node.js 16+ installed
- PokaiEngine server running (locally or remote)
- Bot credentials (botId and apiKey)

## 🔧 Installation

```bash
npm install pokai-bot-sdk
```

## 🤖 Your First Bot (3 steps)

### Step 1: Create the bot file

Create `my-bot.js`:

```javascript
import { PokaiBot, ActionType } from 'pokai-bot-sdk';

// Step 2: Configure your bot
const bot = new PokaiBot({
	credentials: {
		botId: 'your-bot-id', // Replace with your bot ID
		apiKey: 'your-api-key', // Replace with your API key
	},
	debug: true, // Enable logging to see what's happening
});

// Step 3: Define bot behavior
bot.setEventHandlers({
	onGameJoined: (data) => {
		console.log(`🎮 Joined game ${data.gameId} with $${data.chipStack}`);
	},

	onTurnStart: async (data) => {
		console.log(`🎯 My turn! (${data.timeLimit}s to decide)`);

		try {
			// Get what actions we can take
			const actions = await bot.getPossibleActions();
			console.log(
				`Available actions: ${actions.map((a) => a.type).join(', ')}`,
			);

			// Simple strategy: check when possible, otherwise call, otherwise fold
			if (actions.find((a) => a.type === ActionType.Check)) {
				await bot.submitAction(ActionType.Check);
				console.log('✅ Checked');
			} else if (actions.find((a) => a.type === ActionType.Call)) {
				await bot.submitAction(ActionType.Call);
				console.log('✅ Called');
			} else {
				await bot.submitAction(ActionType.Fold);
				console.log('✅ Folded');
			}
		} catch (error) {
			console.error('❌ Error during turn:', error.message);
		}
	},

	onGameEvent: (event) => {
		if (event.type === 'hand_complete') {
			console.log('🏁 Hand finished');
		}
	},

	onError: (error) => {
		console.error('❌ Bot error:', error);
	},
});

// Start the bot
async function startBot() {
	try {
		console.log('🔗 Connecting to server...');
		await bot.connect();
		console.log('✅ Connected!');

		console.log('📋 Looking for games...');
		const games = await bot.getGames();

		if (games.length === 0) {
			console.log('❌ No games available');
			return;
		}

		console.log(`🎮 Found ${games.length} games, joining the first one...`);
		await bot.joinGame({
			gameId: games[0].gameId,
			chipStack: 1000,
		});

		console.log('🚀 Bot is now playing! Press Ctrl+C to stop.');
	} catch (error) {
		console.error('❌ Failed to start bot:', error.message);
		process.exit(1);
	}
}

// Handle graceful shutdown
process.on('SIGINT', () => {
	console.log('\n🛑 Stopping bot...');
	bot.disconnect();
	process.exit(0);
});

startBot();
```

### Step 4: Run your bot

```bash
node my-bot.js
```

You should see output like:

```
🔗 Connecting to server...
✅ Connected!
📋 Looking for games...
🎮 Found 1 games, joining the first one...
🎮 Joined game test-game with $1000
🚀 Bot is now playing! Press Ctrl+C to stop.
🎯 My turn! (30s to decide)
Available actions: check, bet
✅ Checked
```

## 🎯 Next Steps

### 1. Improve Your Strategy

Replace the simple strategy with something smarter:

```javascript
onTurnStart: async (data) => {
	const gameState = await bot.getGameState();
	const actions = await bot.getPossibleActions();

	// Look at your cards
	const myCards = gameState.playerCards;
	console.log(`My hand: ${formatCards(myCards)}`);

	// Check if you have a pair
	if (isPair(myCards)) {
		// Be more aggressive with pairs
		const raiseAction = actions.find((a) => a.type === ActionType.Raise);
		if (raiseAction) {
			await bot.submitAction(ActionType.Raise, raiseAction.minAmount);
			return;
		}
	}

	// Default behavior
	// ... rest of your strategy
};
```

### 2. Use Strategy Helpers

```javascript
import {
	PokaiBot,
	ActionType,
	formatCards,
	isPair,
	calculatePotOdds,
	createAggressiveDecision,
} from 'pokai-bot-sdk';

onTurnStart: async () => {
	const gameState = await bot.getGameState();
	const actions = await bot.getPossibleActions();

	// Use built-in aggressive strategy
	const decision = createAggressiveDecision(actions, 0.7);
	await bot.submitAction(decision.action, decision.amount);
	console.log(`Strategy: ${decision.reasoning}`);
};
```

### 3. Add Error Handling

```javascript
bot.setEventHandlers({
	onError: (error, code) => {
		if (code === 'AUTH_ERROR') {
			console.error('Authentication failed - check your credentials');
		} else if (code === 'GAME_ERROR') {
			console.error('Game error:', error);
		}
	},

	onDisconnected: (reason) => {
		console.log(`Lost connection: ${reason}`);
		// Bot will automatically try to reconnect
	},

	onReconnected: () => {
		console.log('Reconnected successfully!');
	},
});
```

### 4. Study the Examples

Check out the included examples for inspiration:

- `examples/basic-bot.js` - Simple check/call/fold strategy
- `examples/aggressive-bot.js` - Aggressive betting strategy
- `examples/advanced-strategy-bot.js` - Sophisticated poker strategy

### 5. Learn the API

Key methods you'll use:

```javascript
// Game management
await bot.connect();
await bot.joinGame({ gameId: 'game-1', chipStack: 1000 });
await bot.leaveGame();

// Actions
await bot.submitAction(ActionType.Check);
await bot.submitAction(ActionType.Bet, 100);
await bot.submitAction(ActionType.Raise, 200);

// Information
const gameState = await bot.getGameState();
const actions = await bot.getPossibleActions();
const games = await bot.getGames();
```

## 🔧 Configuration Options

```javascript
const bot = new PokaiBot({
	credentials: {
		botId: 'your-bot-id',
		apiKey: 'your-api-key',
	},
	serverUrl: 'http://localhost:3000', // Server URL
	reconnectAttempts: 5, // Auto-reconnection attempts
	reconnectDelay: 2000, // Delay between attempts (ms)
	actionTimeout: 25000, // Action timeout (ms)
	debug: true, // Enable debug logging
});
```

## 🆘 Troubleshooting

### "Authentication failed"

- Check your botId and apiKey are correct
- Make sure the PokaiEngine server is running
- Verify the server URL is correct

### "No games available"

- Create a game using the PokaiEngine dashboard
- Or wait for other players to create games

### "Connection timeout"

- Check if the server is running on the specified URL
- Try changing the serverUrl in configuration

### Bot stops responding

- Check the console for error messages
- Enable debug mode for more detailed logs
- The bot has automatic reconnection built-in

## 📚 Learn More

- [Full API Reference](../README.md#api-reference)
- [Strategy Helpers](../README.md#strategy-helpers)
- [Example Bots](../examples/)
- [TypeScript Usage](../README.md#typescript-support)

Happy bot building! 🤖🎮
