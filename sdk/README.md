# PokaiEngine Bot SDK

A comprehensive TypeScript/JavaScript SDK for building poker bots that connect to PokaiEngine servers.

## 🚀 Quick Start

```bash
npm install pokai-bot-sdk
```

```javascript
import { PokaiBot, ActionType } from 'pokai-bot-sdk';

const bot = new PokaiBot({
	credentials: {
		botId: 'your-bot-id',
		apiKey: 'your-api-key',
	},
});

await bot.connect();
await bot.joinGame({ gameId: 'game-1', chipStack: 1000 });
```

## 📚 Table of Contents

- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Strategy Helpers](#strategy-helpers)
- [Error Handling](#error-handling)
- [TypeScript Support](#typescript-support)

## 🔧 Installation

```bash
# npm
npm install pokai-bot-sdk

# yarn
yarn add pokai-bot-sdk

# pnpm
pnpm add pokai-bot-sdk
```

## 🎯 Basic Usage

### Creating a Bot

```javascript
import { PokaiBot } from 'pokai-bot-sdk';

const bot = new PokaiBot({
	credentials: {
		botId: 'your-bot-id',
		apiKey: 'your-api-key',
	},
	serverUrl: 'http://localhost:3000', // Optional
	debug: true, // Optional
});
```

### Connecting and Playing

```javascript
// Connect to server
await bot.connect();

// List available games
const games = await bot.getGames();
console.log(`Found ${games.length} games`);

// Join a game
await bot.joinGame({
	gameId: games[0].gameId,
	chipStack: 1000,
});

// Set up event handlers
bot.setEventHandlers({
	onTurnStart: async (data) => {
		console.log(`My turn! Time limit: ${data.timeLimit}s`);

		// Get game state and possible actions
		const gameState = await bot.getGameState();
		const actions = await bot.getPossibleActions();

		// Make a decision
		if (actions.find((a) => a.type === 'check')) {
			await bot.submitAction('check');
		} else {
			await bot.submitAction('fold');
		}
	},

	onGameEvent: (event) => {
		if (event.type === 'hand_complete') {
			console.log('Hand finished!');
		}
	},
});
```

## 📖 API Reference

### PokaiBot Class

#### Constructor Options

```typescript
interface BotConfig {
	credentials: {
		botId: string;
		apiKey: string;
	};
	serverUrl?: string; // Default: 'http://localhost:3000'
	reconnectAttempts?: number; // Default: 5
	reconnectDelay?: number; // Default: 2000ms
	actionTimeout?: number; // Default: 25000ms
	debug?: boolean; // Default: false
}
```

#### Core Methods

```javascript
// Connection management
await bot.connect();
bot.disconnect();
bot.isReady(); // returns boolean

// Game management
const games = await bot.getGames();
await bot.joinGame({ gameId: 'game-1', chipStack: 1000 });
await bot.leaveGame();

// Game actions
await bot.submitAction(ActionType.Call);
await bot.submitAction(ActionType.Bet, 100);
await bot.submitAction(ActionType.Raise, 200);

// Game state
const gameState = await bot.getGameState();
const actions = await bot.getPossibleActions();

// Utility
const gameId = bot.getCurrentGameId();
const playerId = bot.getCurrentPlayerId();
const cachedState = bot.getCachedGameState();
```

#### Event Handlers

```javascript
bot.setEventHandlers({
	onGameJoined: (data) => {
		/* Game joined successfully */
	},
	onTurnStart: (data) => {
		/* Your turn to act */
	},
	onTurnWarning: (data) => {
		/* Time running out */
	},
	onGameState: (gameState) => {
		/* Game state updated */
	},
	onGameEvent: (event) => {
		/* Game event occurred */
	},
	onActionSuccess: (action) => {
		/* Action succeeded */
	},
	onActionError: (error) => {
		/* Action failed */
	},
	onError: (error, code) => {
		/* General error */
	},
	onDisconnected: (reason) => {
		/* Connection lost */
	},
	onReconnected: () => {
		/* Reconnected */
	},
});
```

### Action Types

```javascript
import { ActionType } from 'pokai-bot-sdk';

ActionType.Fold; // 'fold'
ActionType.Check; // 'check'
ActionType.Call; // 'call'
ActionType.Bet; // 'bet'
ActionType.Raise; // 'raise'
ActionType.AllIn; // 'all-in'
```

### Game State Structure

```typescript
interface GameState {
	gameId: string;
	currentPhase: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
	currentPlayerToAct: string | null;
	potSize: number;
	communityCards: Card[];
	playerCards: Card[];
	possibleActions: PossibleAction[];
	players: Player[];
	dealerPosition: number;
	smallBlindPosition: number;
	bigBlindPosition: number;
	handNumber: number;
	timeLimit?: number;
}
```

## 🎮 Examples

### 1. Basic Bot

```javascript
import { PokaiBot, ActionType } from 'pokai-bot-sdk';

const bot = new PokaiBot({
	credentials: { botId: 'basic-bot', apiKey: 'your-key' },
});

bot.setEventHandlers({
	onTurnStart: async () => {
		const actions = await bot.getPossibleActions();

		// Simple strategy: check/call when possible, fold otherwise
		if (actions.find((a) => a.type === ActionType.Check)) {
			await bot.submitAction(ActionType.Check);
		} else if (actions.find((a) => a.type === ActionType.Call)) {
			await bot.submitAction(ActionType.Call);
		} else {
			await bot.submitAction(ActionType.Fold);
		}
	},
});

await bot.connect();
```

### 2. Aggressive Bot

```javascript
import {
	PokaiBot,
	ActionType,
	createAggressiveDecision,
	findAction,
} from 'pokai-bot-sdk';

const bot = new PokaiBot({
	credentials: { botId: 'aggressive-bot', apiKey: 'your-key' },
});

bot.setEventHandlers({
	onTurnStart: async () => {
		const actions = await bot.getPossibleActions();
		const decision = createAggressiveDecision(actions, 0.8);

		await bot.submitAction(decision.action, decision.amount);
	},
});
```

### 3. Pot Odds Bot

```javascript
import {
	PokaiBot,
	ActionType,
	calculatePotOdds,
	isProfitableCall,
} from 'pokai-bot-sdk';

const bot = new PokaiBot({
	credentials: { botId: 'pot-odds-bot', apiKey: 'your-key' },
});

bot.setEventHandlers({
	onTurnStart: async () => {
		const gameState = await bot.getGameState();
		const actions = await bot.getPossibleActions();

		const callAction = actions.find((a) => a.type === ActionType.Call);

		if (callAction && callAction.minAmount) {
			const potOdds = calculatePotOdds(gameState.potSize, callAction.minAmount);
			const winProbability = 0.4; // Your hand evaluation logic here

			if (isProfitableCall(potOdds, winProbability)) {
				await bot.submitAction(ActionType.Call);
			} else {
				await bot.submitAction(ActionType.Fold);
			}
		}
	},
});
```

## 🛠 Strategy Helpers

The SDK includes utility functions to help with common poker calculations:

### Card Analysis

```javascript
import {
	formatCard,
	formatCards,
	isPair,
	isSuited,
	isConnected,
} from 'pokai-bot-sdk';

const hand = [
	{ suit: 'H', rank: 14 }, // Ace of Hearts
	{ suit: 'H', rank: 13 }, // King of Hearts
];

console.log(formatCards(hand)); // "A♥ K♥"
console.log(isPair(hand)); // false
console.log(isSuited(hand)); // true
console.log(isConnected(hand)); // true
```

### Pot Odds

```javascript
import { calculatePotOdds, isProfitableCall } from 'pokai-bot-sdk';

const potOdds = calculatePotOdds(100, 20); // $100 pot, $20 to call
console.log(potOdds);
// {
//   potSize: 100,
//   betToCall: 20,
//   odds: 6,           // 6:1 odds
//   percentage: 16.67  // Need 16.67% equity
// }

const profitable = isProfitableCall(potOdds, 0.25); // 25% win rate
console.log(profitable); // true (25% > 16.67%)
```

### Position Analysis

```javascript
import { getPositionName, getPositionType } from 'pokai-bot-sdk';

const position = getPositionName(0, 6); // "Button"
const type = getPositionType(0, 6); // "late"
```

### Betting Helpers

```javascript
import { findAction, getMinBetAmount, calculateBetSize } from 'pokai-bot-sdk';

const actions = await bot.getPossibleActions();
const raiseAction = findAction(actions, ActionType.Raise);
const minBet = getMinBetAmount(actions);
const potBet = calculateBetSize(gameState.potSize, 75); // 75% pot bet
```

## ❌ Error Handling

The SDK includes specific error types for different failure scenarios:

```javascript
import {
	PokaiError,
	AuthenticationError,
	GameError,
	ConnectionError,
} from 'pokai-bot-sdk';

try {
	await bot.connect();
} catch (error) {
	if (error instanceof AuthenticationError) {
		console.error('Authentication failed:', error.message);
	} else if (error instanceof ConnectionError) {
		console.error('Connection failed:', error.message);
	} else if (error instanceof GameError) {
		console.error('Game error:', error.message);
	}
}
```

## 🔍 Debugging

Enable debug mode for detailed logging:

```javascript
const bot = new PokaiBot({
	credentials: { botId: 'debug-bot', apiKey: 'your-key' },
	debug: true,
});
```

Or provide your own logger:

```javascript
import { PokaiBot } from 'pokai-bot-sdk';

const customLogger = {
	debug: (msg, ...args) => console.debug(`[DEBUG] ${msg}`, ...args),
	info: (msg, ...args) => console.info(`[INFO] ${msg}`, ...args),
	warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
	error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
};

const bot = new PokaiBot(config, customLogger);
```

## 📝 TypeScript Support

The SDK is written in TypeScript and includes full type definitions:

```typescript
import { PokaiBot, GameState, ActionType, BotConfig } from 'pokai-bot-sdk';

const config: BotConfig = {
	credentials: {
		botId: 'typed-bot',
		apiKey: 'your-api-key',
	},
	debug: true,
};

const bot = new PokaiBot(config);

bot.setEventHandlers({
	onTurnStart: async (data: { timeLimit: number }) => {
		const gameState: GameState = await bot.getGameState();
		await bot.submitAction(ActionType.Check);
	},
});
```

## 🔧 Advanced Configuration

### Custom Reconnection Logic

```javascript
const bot = new PokaiBot({
	credentials: { botId: 'resilient-bot', apiKey: 'your-key' },
	reconnectAttempts: 10,
	reconnectDelay: 3000,
	actionTimeout: 20000,
});

bot.setEventHandlers({
	onDisconnected: (reason) => {
		console.log(`Lost connection: ${reason}`);
	},
	onReconnected: () => {
		console.log('Reconnected successfully');
	},
});
```

### Human-like Timing

```javascript
import { addRandomDelay } from 'pokai-bot-sdk';

bot.setEventHandlers({
	onTurnStart: async () => {
		// Add realistic thinking time
		await addRandomDelay(1000, 3000);

		const actions = await bot.getPossibleActions();
		// Make decision...
	},
});
```

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- Documentation: [Full API Docs](./docs/)
- Examples: [Example Bots](./examples/)
- Issues: [GitHub Issues](https://github.com/your-org/pokai-engine/issues)

---

Made with ❤️ by the PokaiEngine team
