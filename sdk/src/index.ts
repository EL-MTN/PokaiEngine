/**
 * PokaiEngine Bot SDK
 *
 * A comprehensive TypeScript/JavaScript SDK for building poker bots
 * that connect to PokaiEngine servers.
 *
 * @example
 * ```typescript
 * import { PokaiBot, ActionType } from 'pokai-bot-sdk';
 *
 * const bot = new PokaiBot({
 *   credentials: {
 *     botId: 'your-bot-id',
 *     apiKey: 'your-api-key'
 *   }
 * });
 *
 * await bot.connect();
 * await bot.joinGame({ gameId: 'game-1', chipStack: 1000 });
 * ```
 */

// Core exports
export { PokaiBot } from './PokaiBot';

// Type exports
export type {
	// Core game types
	Card,
	Action,
	PossibleAction,
	Player,
	GameState,
	GameEvent,
	GameInfo,

	// Configuration types
	BotCredentials,
	BotConfig,
	JoinGameOptions,
	BotEventHandlers,

	// Spectator Types
	SpectatorAuthOptions,
	SpectateGameOptions,
	SpectatorGameInfo,

	// Response types
	SocketResponse,
	AuthResponse,
	GameListResponse,

	// Strategy types
	HandStrength,
	PotOdds,
	BotDecision,

	// Utility types
	Logger,
	LogLevel,
} from './types';

// Enum exports
export { ActionType } from './types';

// Error exports
export {
	PokaiError,
	AuthenticationError,
	GameError,
	ConnectionError,
} from './types';

// Utility exports
export {
	// Card utilities
	formatCard,
	formatCards,
	isPair,
	isSuited,
	isConnected,

	// Pot odds
	calculatePotOdds,
	isProfitableCall,

	// Position utilities
	getPositionName,
	getPositionType,

	// Betting utilities
	findAction,
	getMinBetAmount,
	getMaxBetAmount,
	calculateBetSize,

	// Player utilities
	findPlayer,
	getActivePlayers,
	getPlayersInHand,
	calculateTotalPot,

	// Decision helpers
	createAggressiveDecision,
	createConservativeDecision,
	createPotOddsDecision,

	// Validation
	isActionValid,
	isBetAmountValid,

	// Timing
	addRandomDelay,
	createActionTimeout,
} from './utils';

// SDK version
export const VERSION = '1.0.0';
