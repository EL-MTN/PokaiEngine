import { GameLogger } from '@/services/logging/GameLogger';
import {
	Action,
	ActionType,
	GameEvent,
	GamePhase,
	GameState,
	PlayerInfo,
	Pot,
} from '@/types';

describe('GameLogger', () => {
	let gameLogger: GameLogger;
	let initialGameState: GameState;
	let playerNames: Map<string, string>;

	beforeEach(() => {
		gameLogger = new GameLogger();
		const players: PlayerInfo[] = [
			{
				id: 'p1',
				name: 'Player 1',
				chipStack: 1000,
				currentBet: 0,
				isAllIn: false,
				isFolded: false,
				hasActed: false,
				isActive: true,
				totalBetThisHand: 0,
			},
			{
				id: 'p2',
				name: 'Player 2',
				chipStack: 1000,
				currentBet: 0,
				isAllIn: false,
				isFolded: false,
				hasActed: false,
				isActive: true,
				totalBetThisHand: 0,
			},
		];
		const pots: Pot[] = [
			{ amount: 0, eligiblePlayers: ['p1', 'p2'], isMainPot: true },
		];
		initialGameState = {
			id: 'test-game',
			players,
			communityCards: [],
			pots,
			currentPhase: GamePhase.PreFlop,
			currentPlayerToAct: 'p1',
			dealerPosition: 0,
			smallBlindPosition: 0,
			bigBlindPosition: 1,
			smallBlindAmount: 10,
			bigBlindAmount: 20,
			minimumRaise: 20,
			handNumber: 1,
			isComplete: false,
		};
		playerNames = new Map([
			['p1', 'Player 1'],
			['p2', 'Player 2'],
		]);
	});

	it('should start logging a new game', () => {
		gameLogger.startGame('test-game', initialGameState, playerNames);
		const gameLog = gameLogger.getGameLog('test-game');
		expect(gameLog).toBeDefined();
		expect(gameLog?.gameId).toBe('test-game');
		expect(gameLog?.initialGameState).toEqual(initialGameState);
	});

	it('should log a game event', () => {
		gameLogger.startGame('test-game', initialGameState, playerNames);
		const event: GameEvent = {
			type: 'hand_started',
			handNumber: 1,
			timestamp: Date.now(),
		};
		gameLogger.logEvent('test-game', event);
		const gameLog = gameLogger.getGameLog('test-game');
		expect(gameLog?.events).toHaveLength(1);
		expect(gameLog?.events[0]).toEqual(event);
	});

	it('should throw an error when logging an event for a non-existent game', () => {
		const event: GameEvent = {
			type: 'hand_started',
			handNumber: 1,
			timestamp: Date.now(),
		};
		expect(() => gameLogger.logEvent('non-existent-game', event)).toThrow(
			'No log found for game non-existent-game',
		);
	});

	it('should end logging for a game', () => {
		gameLogger.startGame('test-game', initialGameState, playerNames);
		const finalGameState: GameState = {
			...initialGameState,
			pots: [{ amount: 100, eligiblePlayers: ['p1'], isMainPot: true }],
		};
		gameLogger.endGame('test-game', finalGameState);
		const gameLog = gameLogger.getGameLog('test-game');
		expect(gameLog?.endTime).toBeDefined();
		expect(gameLog?.finalGameState).toEqual(finalGameState);
	});

	it('should throw an error when ending a non-existent game', () => {
		const finalGameState: GameState = {
			...initialGameState,
			pots: [{ amount: 100, eligiblePlayers: ['p1'], isMainPot: true }],
		};
		expect(() =>
			gameLogger.endGame('non-existent-game', finalGameState),
		).toThrow('No log found for game non-existent-game');
	});

	it('should export and import a game log', () => {
		gameLogger.startGame('test-game', initialGameState, playerNames);
		const event: GameEvent = {
			type: 'hand_started',
			handNumber: 1,
			timestamp: Date.now(),
		};
		gameLogger.logEvent('test-game', event);
		const exportedLog = gameLogger.exportGameLog('test-game');
		expect(exportedLog).toBeDefined();

		const newLogger = new GameLogger();
		const gameId = newLogger.importGameLog(exportedLog!);
		expect(gameId).toBe('test-game');
		const importedLog = newLogger.getGameLog('test-game');
		expect(importedLog).toBeDefined();
		expect(importedLog?.events).toHaveLength(1);
	});

	it('should return undefined when importing invalid JSON', () => {
		const gameId = gameLogger.importGameLog('invalid json');
		expect(gameId).toBeUndefined();
	});

	it('should increment hand count on hand_started event', () => {
		gameLogger.startGame('test-game', initialGameState, playerNames);
		const event: GameEvent = {
			type: 'hand_started',
			handNumber: 1,
			timestamp: Date.now(),
		};
		gameLogger.logEvent('test-game', event);
		const gameLog = gameLogger.getGameLog('test-game');
		expect(gameLog?.metadata.handCount).toBe(1);
	});

	it('should return an empty array for hand events of a non-existent game', () => {
		const events = gameLogger.getHandEvents('non-existent-game', 1);
		expect(events).toEqual([]);
	});

	it('should return undefined for hand summary of a non-existent hand', () => {
		gameLogger.startGame('test-game', initialGameState, playerNames);
		const summary = gameLogger.getHandSummary('test-game', 1);
		expect(summary).toBeUndefined();
	});

	it('should return undefined for hand summary if start or end event is missing', () => {
		gameLogger.startGame('test-game', initialGameState, playerNames);
		const startEvent: GameEvent = {
			type: 'hand_started',
			handNumber: 1,
			timestamp: Date.now(),
		};
		gameLogger.logEvent('test-game', startEvent);
		let summary = gameLogger.getHandSummary('test-game', 1);
		expect(summary).toBeUndefined();

		const endEvent: GameEvent = {
			type: 'hand_complete',
			handNumber: 1,
			timestamp: Date.now(),
		};
		gameLogger.logEvent('test-game', endEvent);
		summary = gameLogger.getHandSummary('test-game', 1);
		expect(summary).toBeDefined();
	});

	it('should calculate game statistics correctly', () => {
		gameLogger.startGame('test-game', initialGameState, playerNames);
		const action: Action = {
			type: ActionType.Bet,
			amount: 50,
			playerId: 'p1',
			timestamp: Date.now(),
		};
		const event1: GameEvent = {
			type: 'action_taken',
			handNumber: 1,
			timestamp: Date.now(),
			action,
			playerId: 'p1',
		};
		const event2: GameEvent = {
			type: 'hand_started',
			handNumber: 2,
			timestamp: Date.now(),
			playerId: 'p1',
		};
		gameLogger.logEvent('test-game', event1);
		gameLogger.logEvent('test-game', event2);

		const stats = gameLogger.getGameStatistics('test-game');
		expect(stats).toBeDefined();
		expect(stats?.totalHands).toBe(1);
		expect(stats?.totalActions).toBe(1);
		expect(stats?.playerStats.get('p1')?.actionsCount).toBe(1);
		expect(stats?.playerStats.get('p1')?.handsPlayed).toBe(1);
	});

	describe('clearOldLogs', () => {
		beforeEach(() => {
			jest.useFakeTimers();
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		it('should clear old logs', () => {
			gameLogger.startGame('test-game', initialGameState, playerNames);

			jest.advanceTimersByTime(1000);

			const removedCount = gameLogger.clearOldLogs(500);
			expect(removedCount).toBe(1);
			const gameLog = gameLogger.getGameLog('test-game');
			expect(gameLog).toBeUndefined();
		});
	});
});
