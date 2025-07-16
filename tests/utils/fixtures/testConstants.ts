import { BlindLevel, GameConfig } from '@core/types';

export const TEST_GAME_CONFIG: GameConfig = {
	maxPlayers: 6,
	smallBlindAmount: 10,
	bigBlindAmount: 20,
	turnTimeLimit: 30,
	handStartDelay: 0,
	isTournament: false,
};

export const TEST_BLIND_LEVELS: BlindLevel[] = [
	{ level: 1, smallBlind: 10, bigBlind: 20, ante: 0, duration: 15 },
	{ level: 2, smallBlind: 15, bigBlind: 30, ante: 0, duration: 15 },
	{ level: 3, smallBlind: 25, bigBlind: 50, ante: 5, duration: 15 },
	{ level: 4, smallBlind: 50, bigBlind: 100, ante: 10, duration: 15 },
	{ level: 5, smallBlind: 100, bigBlind: 200, ante: 25, duration: 15 },
];

export const TEST_TIMEOUTS = {
	SHORT: 100,
	MEDIUM: 500,
	LONG: 1000,
	ACTION: 30000,
};

export const TEST_PLAYER_IDS = {
	ALICE: 'alice-123',
	BOB: 'bob-456',
	CHARLIE: 'charlie-789',
	DAVID: 'david-012',
	EVE: 'eve-345',
};

export const TEST_BOT_TOKENS = {
	VALID: 'valid-bot-token-123',
	INVALID: 'invalid-bot-token',
	EXPIRED: 'expired-bot-token',
};

export const TEST_GAME_IDS = {
	CASH_GAME: 'cash-game-123',
	TOURNAMENT: 'tournament-456',
	SIT_N_GO: 'sit-n-go-789',
};

export const TEST_SOCKET_IDS = {
	PLAYER_1: 'socket-player-1',
	PLAYER_2: 'socket-player-2',
	SPECTATOR: 'socket-spectator',
	ADMIN: 'socket-admin',
};

export const TEST_DELAYS = {
	HAND_START: 2000,
	BOT_ACTION_MIN: 1000,
	BOT_ACTION_MAX: 3000,
	SHOWDOWN: 3000,
	GAME_RESET: 5000,
};

export const TEST_CHIP_AMOUNTS = {
	MIN_BET: 20,
	SMALL_STACK: 200,
	MEDIUM_STACK: 1000,
	LARGE_STACK: 5000,
	DEEP_STACK: 10000,
};
