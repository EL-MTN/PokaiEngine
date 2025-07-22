import { jest } from '@jest/globals';

import { GameReplayRecorder } from '@/engine/replay/GameReplayRecorder';
import {
	Action,
	ActionType,
	GameConfig,
	GameEvent,
	GamePhase,
	GameState,
	PlayerInfo,
	Position,
	PossibleAction,
	Rank,
	Suit,
} from '@/types';

// Mock the logger
jest.mock('@/services/logging/Logger', () => ({
	replayLogger: {
		info: jest.fn(),
		error: jest.fn(),
	},
}));

describe('GameReplayRecorder', () => {
	let recorder: GameReplayRecorder;

	const createMockGameConfig = (): GameConfig => ({
		maxPlayers: 6,
		smallBlindAmount: 10,
		bigBlindAmount: 20,
		turnTimeLimit: 30000,
		isTournament: false,
	});

	const createMockGameState = (): GameState => ({
		id: 'game-1',
		currentPhase: GamePhase.PreFlop,
		handNumber: 1,
		players: [
			createMockPlayer('player1', 'Player One', Position.SmallBlind),
			createMockPlayer2(),
		],
		currentPlayerToAct: 'player1',
		dealerPosition: 0,
		smallBlindPosition: 0,
		bigBlindPosition: 1,
		smallBlindAmount: 10,
		bigBlindAmount: 20,
		minimumRaise: 20,
		communityCards: [],
		pots: [
			{ amount: 30, eligiblePlayers: ['player1', 'player2'], isMainPot: true },
		],
		isComplete: false,
	});

	const createMockPlayer = (
		id: string,
		name: string,
		position: Position,
		chipStack = 1000,
	): PlayerInfo => ({
		id,
		name,
		chipStack,
		position,
		isActive: true,
		isFolded: false,
		currentBet: 0,
		hasActed: false,
		isAllIn: false,
		totalBetThisHand: 0,
		holeCards: [
			{ suit: Suit.Hearts, rank: Rank.Ace },
			{ suit: Suit.Spades, rank: Rank.King },
		],
	});

	const createMockPlayer2 = (): PlayerInfo => ({
		id: 'player2',
		name: 'Player Two',
		chipStack: 1000,
		position: Position.BigBlind,
		isActive: true,
		isFolded: false,
		currentBet: 0,
		hasActed: false,
		isAllIn: false,
		totalBetThisHand: 0,
		holeCards: [
			{ suit: Suit.Clubs, rank: Rank.Queen },
			{ suit: Suit.Diamonds, rank: Rank.Jack },
		],
	});

	const createMockAction = (type: ActionType, amount?: number): Action => ({
		type,
		amount,
		playerId: 'player1',
		timestamp: Date.now(),
	});

	const mockPossibleActions: PossibleAction[] = [
		{ type: ActionType.Fold, minAmount: 0, maxAmount: 0, description: 'Fold' },
		{
			type: ActionType.Call,
			minAmount: 20,
			maxAmount: 20,
			description: 'Call 20',
		},
		{
			type: ActionType.Raise,
			minAmount: 40,
			maxAmount: 1000,
			description: 'Raise 40-1000',
		},
	];

	beforeEach(() => {
		jest.clearAllMocks();
		recorder = new GameReplayRecorder();
	});

	describe('Constructor and Configuration', () => {
		test('should initialize with default config', () => {
			const defaultRecorder = new GameReplayRecorder();
			const stats = defaultRecorder.getMemoryStats();
			expect(stats.totalRecordings).toBe(0);
		});

		test('should accept custom configuration', () => {
			const customRecorder = new GameReplayRecorder({
				enabled: false,
				maxReplaysInMemory: 50,
				checkpointInterval: 25,
			});

			// Should not record when disabled
			const gameId = 'test-game';
			const gameConfig = createMockGameConfig();
			const gameState = createMockGameState();
			const playerNames = new Map([['player1', 'Player 1']]);

			customRecorder.startRecording(gameId, gameConfig, gameState, playerNames);
			expect(customRecorder.isRecording(gameId)).toBe(false);
		});
	});

	describe('Recording Lifecycle', () => {
		const gameId = 'test-game-123';
		const gameConfig = createMockGameConfig();
		const playerNames = new Map([
			['player1', 'Player 1'],
			['player2', 'Player 2'],
		]);

		test('should start recording successfully', () => {
			const gameState = createMockGameState();

			recorder.startRecording(gameId, gameConfig, gameState, playerNames);

			expect(recorder.isRecording(gameId)).toBe(true);
			const replayData = recorder.getReplayData(gameId);
			expect(replayData).toBeDefined();
			expect(replayData?.gameId).toBe(gameId);
			expect(replayData?.metadata.playerNames).toEqual({
				player1: 'Player 1',
				player2: 'Player 2',
			});
			expect(replayData?.events.length).toBe(1); // game_started event
			expect(replayData?.events[0].type).toBe('game_started');
		});

		test('should end recording successfully', async () => {
			const gameState = createMockGameState();
			recorder.startRecording(gameId, gameConfig, gameState, playerNames);

			// Add small delay to ensure duration > 0
			await new Promise((resolve) => setTimeout(resolve, 1));
			recorder.endRecording(gameId, gameState);

			expect(recorder.isRecording(gameId)).toBe(false);
			const replayData = recorder.getReplayData(gameId);
			expect(replayData?.endTime).toBeDefined();
			expect(replayData?.finalGameState).toBeDefined();
			expect(replayData?.metadata.gameDuration).toBeGreaterThanOrEqual(0);
		});

		test('should handle end recording for non-existent game', () => {
			const gameState = createMockGameState();

			// Should not throw
			expect(() =>
				recorder.endRecording('non-existent', gameState),
			).not.toThrow();
		});

		test('should track multiple recordings', () => {
			const gameState1 = createMockGameState();
			const gameState2 = createMockGameState();

			recorder.startRecording('game1', gameConfig, gameState1, playerNames);
			recorder.startRecording('game2', gameConfig, gameState2, playerNames);

			expect(recorder.getActiveRecordings()).toContain('game1');
			expect(recorder.getActiveRecordings()).toContain('game2');
			expect(recorder.getMemoryStats().activeRecordings).toBe(2);
		});
	});

	describe('Event Recording', () => {
		const gameId = 'test-game';
		const gameConfig = createMockGameConfig();
		const playerNames = new Map([['player1', 'Player 1']]);

		beforeEach(() => {
			const gameState = createMockGameState();
			recorder.startRecording(gameId, gameConfig, gameState, playerNames);
		});

		test('should record game events', () => {
			const gameStateBefore = createMockGameState();
			const gameStateAfter = createMockGameState();
			const event: GameEvent = {
				type: 'hand_started',
				timestamp: Date.now(),
				handNumber: 1,
				phase: GamePhase.PreFlop,
				gameState: gameStateAfter,
			};

			recorder.recordEvent(gameId, event, gameStateBefore, gameStateAfter);

			const replayData = recorder.getReplayData(gameId);
			expect(replayData?.events.length).toBe(2); // game_started + hand_started

			const recordedEvent = replayData?.events[1];
			expect(recordedEvent?.type).toBe('hand_started');
			expect(recordedEvent?.sequenceId).toBeDefined();
			expect(recordedEvent?.gameStateBefore).toBeDefined();
			expect(recordedEvent?.gameStateAfter).toBeDefined();
		});

		test('should calculate event duration', () => {
			const event1: GameEvent = {
				type: 'hand_started',
				timestamp: 1000,
				handNumber: 1,
				phase: GamePhase.PreFlop,
				gameState: createMockGameState(),
			};

			const event2: GameEvent = {
				type: 'action_taken',
				timestamp: 2000,
				handNumber: 1,
				phase: GamePhase.PreFlop,
				action: createMockAction(ActionType.Call),
				gameState: createMockGameState(),
			};

			recorder.recordEvent(gameId, event1);
			recorder.recordEvent(gameId, event2);

			const replayData = recorder.getReplayData(gameId);
			const lastEvent = replayData?.events[replayData.events.length - 1];
			expect(lastEvent?.eventDuration).toBe(1000);
		});

		test('should update metadata for different event types', () => {
			const handStartEvent: GameEvent = {
				type: 'hand_started',
				timestamp: Date.now(),
				handNumber: 1,
				phase: GamePhase.PreFlop,
				gameState: createMockGameState(),
			};

			const actionEvent: GameEvent = {
				type: 'action_taken',
				timestamp: Date.now(),
				handNumber: 1,
				phase: GamePhase.PreFlop,
				action: createMockAction(ActionType.Call),
				gameState: createMockGameState(),
			};

			recorder.recordEvent(gameId, handStartEvent);
			recorder.recordEvent(gameId, actionEvent);

			const replayData = recorder.getReplayData(gameId);
			expect(replayData?.metadata.handCount).toBe(1);
			expect(replayData?.metadata.totalActions).toBe(1);
			expect(replayData?.metadata.totalEvents).toBe(3); // game_started + hand_started + action_taken
		});

		test('should not record events for disabled recorder', () => {
			const disabledRecorder = new GameReplayRecorder({ enabled: false });
			const event: GameEvent = {
				type: 'hand_started',
				timestamp: Date.now(),
				handNumber: 1,
				phase: GamePhase.PreFlop,
				gameState: createMockGameState(),
			};

			disabledRecorder.recordEvent(gameId, event);

			const replayData = disabledRecorder.getReplayData(gameId);
			expect(replayData).toBeUndefined();
		});

		test('should not record events for non-existent game', () => {
			const event: GameEvent = {
				type: 'hand_started',
				timestamp: Date.now(),
				handNumber: 1,
				phase: GamePhase.PreFlop,
				gameState: createMockGameState(),
			};

			// Should not throw
			expect(() => recorder.recordEvent('non-existent', event)).not.toThrow();
		});
	});

	describe('Player Decision Recording', () => {
		const gameId = 'test-game';
		const gameConfig = createMockGameConfig();
		const playerNames = new Map([['player1', 'Player 1']]);

		beforeEach(() => {
			const gameState = createMockGameState();
			recorder.startRecording(gameId, gameConfig, gameState, playerNames);
		});

		test('should record player decision with context', () => {
			const gameStateBefore = createMockGameState();
			const gameStateAfter = createMockGameState();
			const action = createMockAction(ActionType.Call, 20);
			const possibleActions = mockPossibleActions;

			recorder.recordPlayerDecision(
				gameId,
				'player1',
				action,
				possibleActions,
				gameStateBefore,
				gameStateAfter,
				5000, // 5 seconds to decide
				{ before: 0.45, after: 0.4 },
			);

			const replayData = recorder.getReplayData(gameId);
			const lastEvent = replayData?.events[replayData.events.length - 1];

			expect(lastEvent?.type).toBe('action_taken');
			expect(lastEvent?.playerDecisionContext).toBeDefined();
			expect(lastEvent?.playerDecisionContext?.timeToDecide).toBe(5000);
			expect(lastEvent?.playerDecisionContext?.equityBefore).toBe(0.45);
			expect(lastEvent?.playerDecisionContext?.equityAfter).toBe(0.4);
			expect(lastEvent?.playerDecisionContext?.potOdds).toBeDefined();
		});

		test('should calculate pot odds correctly', () => {
			const gameStateBefore = createMockGameState();
			gameStateBefore.pots = [
				{
					amount: 100,
					eligiblePlayers: ['player1', 'player2'],
					isMainPot: true,
				},
			];

			const gameStateAfter = createMockGameState();
			const action = createMockAction(ActionType.Call, 20);
			const possibleActions = mockPossibleActions;

			recorder.recordPlayerDecision(
				gameId,
				'player1',
				action,
				possibleActions,
				gameStateBefore,
				gameStateAfter,
				3000,
			);

			const replayData = recorder.getReplayData(gameId);
			const lastEvent = replayData?.events[replayData.events.length - 1];
			const context = lastEvent?.playerDecisionContext;

			expect(context?.potOdds).toBeCloseTo(20 / (100 + 20)); // call / (pot + call)
		});

		test('should handle player not found in game state', () => {
			const gameStateBefore = createMockGameState();
			const gameStateAfter = createMockGameState();
			const action = createMockAction(ActionType.Call, 20);
			const possibleActions = mockPossibleActions;

			// Should not throw when player not found
			expect(() => {
				recorder.recordPlayerDecision(
					gameId,
					'non-existent-player',
					action,
					possibleActions,
					gameStateBefore,
					gameStateAfter,
					1000,
				);
			}).not.toThrow();
		});

		test('should calculate effective stack size correctly', () => {
			const gameStateBefore = createMockGameState();
			gameStateBefore.players = [
				{
					...gameStateBefore.players[0],
					id: 'player1',
					chipStack: 500,
				},
				{
					...gameStateBefore.players[1],
					id: 'player2',
					chipStack: 1000,
				},
			];

			const gameStateAfter = createMockGameState();
			const action = createMockAction(ActionType.Call, 20);
			const possibleActions = mockPossibleActions;

			recorder.recordPlayerDecision(
				gameId,
				'player1',
				action,
				possibleActions,
				gameStateBefore,
				gameStateAfter,
				2000,
			);

			const replayData = recorder.getReplayData(gameId);
			const lastEvent = replayData?.events[replayData.events.length - 1];
			const context = lastEvent?.playerDecisionContext;

			expect(context?.effectiveStackSize).toBe(500); // Min of player's stack (500) and max opponent (1000)
		});
	});

	describe('Checkpoint Creation', () => {
		const gameId = 'test-game';
		const gameConfig = createMockGameConfig();
		const playerNames = new Map([['player1', 'Player 1']]);

		test('should create checkpoints at configured intervals', () => {
			const checkpointRecorder = new GameReplayRecorder({
				checkpointInterval: 3,
			});
			const gameState = createMockGameState();
			checkpointRecorder.startRecording(
				gameId,
				gameConfig,
				gameState,
				playerNames,
			);

			// Record events to trigger checkpoint
			for (let i = 0; i < 5; i++) {
				const event: GameEvent = {
					type: 'action_taken',
					timestamp: Date.now() + i * 1000,
					handNumber: 1,
					phase: GamePhase.PreFlop,
					action: createMockAction(ActionType.Call),
					gameState: createMockGameState(),
				};
				checkpointRecorder.recordEvent(gameId, event, gameState, gameState);
			}

			const replayData = checkpointRecorder.getReplayData(gameId);
			expect(replayData?.checkpoints).toBeDefined();
			expect(replayData?.checkpoints?.length).toBeGreaterThan(0);
		});

		test('should not create checkpoints without gameStateAfter', () => {
			const checkpointRecorder = new GameReplayRecorder({
				checkpointInterval: 2,
			});
			const gameState = createMockGameState();
			checkpointRecorder.startRecording(
				gameId,
				gameConfig,
				gameState,
				playerNames,
			);

			// Record events without gameStateAfter
			const event: GameEvent = {
				type: 'action_taken',
				timestamp: Date.now(),
				handNumber: 1,
				phase: GamePhase.PreFlop,
				action: createMockAction(ActionType.Call),
				gameState: gameState,
			};
			checkpointRecorder.recordEvent(gameId, event, gameState); // No gameStateAfter

			const replayData = checkpointRecorder.getReplayData(gameId);
			expect(replayData?.checkpoints?.length).toBe(0);
		});
	});

	describe('Memory Management', () => {
		test('should remove old recordings when memory limit exceeded', () => {
			const memoryRecorder = new GameReplayRecorder({ maxReplaysInMemory: 2 });
			const gameConfig = createMockGameConfig();
			const playerNames = new Map([['player1', 'Player 1']]);

			// Create multiple recordings
			for (let i = 1; i <= 4; i++) {
				const gameId = `game-${i}`;
				const gameState = createMockGameState();
				memoryRecorder.startRecording(
					gameId,
					gameConfig,
					gameState,
					playerNames,
				);

				// End the first two recordings to make them inactive
				if (i <= 2) {
					memoryRecorder.endRecording(gameId, gameState);
				}
			}

			const stats = memoryRecorder.getMemoryStats();
			expect(stats.totalRecordings).toBeLessThanOrEqual(2);
			expect(stats.activeRecordings).toBe(2); // game-3 and game-4 should still be active
		});

		test('should prefer removing inactive recordings', () => {
			const memoryRecorder = new GameReplayRecorder({ maxReplaysInMemory: 3 });
			const gameConfig = createMockGameConfig();
			const playerNames = new Map([['player1', 'Player 1']]);

			// Create recordings
			const gameState = createMockGameState();
			memoryRecorder.startRecording(
				'game-1',
				gameConfig,
				gameState,
				playerNames,
			);
			memoryRecorder.endRecording('game-1', gameState); // Make inactive

			memoryRecorder.startRecording(
				'game-2',
				gameConfig,
				gameState,
				playerNames,
			);
			memoryRecorder.startRecording(
				'game-3',
				gameConfig,
				gameState,
				playerNames,
			);
			memoryRecorder.startRecording(
				'game-4',
				gameConfig,
				gameState,
				playerNames,
			);

			// game-1 (inactive) should be removed first
			expect(memoryRecorder.isRecording('game-1')).toBe(false);
			expect(memoryRecorder.isRecording('game-2')).toBe(true);
			expect(memoryRecorder.isRecording('game-3')).toBe(true);
			expect(memoryRecorder.isRecording('game-4')).toBe(true);
		});
	});

	describe('Recording Status and Queries', () => {
		const gameConfig = createMockGameConfig();
		const playerNames = new Map([['player1', 'Player 1']]);

		test('should track active recordings correctly', () => {
			const gameState = createMockGameState();

			recorder.startRecording('game-1', gameConfig, gameState, playerNames);
			recorder.startRecording('game-2', gameConfig, gameState, playerNames);

			const activeRecordings = recorder.getActiveRecordings();
			expect(activeRecordings).toContain('game-1');
			expect(activeRecordings).toContain('game-2');
			expect(activeRecordings.length).toBe(2);
		});

		test('should track completed recordings correctly', () => {
			const gameState = createMockGameState();

			recorder.startRecording('game-1', gameConfig, gameState, playerNames);
			recorder.endRecording('game-1', gameState);

			const completedRecordings = recorder.getCompletedRecordings();
			expect(completedRecordings).toContain('game-1');
			expect(completedRecordings.length).toBe(1);

			const activeRecordings = recorder.getActiveRecordings();
			expect(activeRecordings.length).toBe(0);
		});

		test('should remove recordings correctly', () => {
			const gameState = createMockGameState();

			recorder.startRecording('game-1', gameConfig, gameState, playerNames);
			expect(recorder.isRecording('game-1')).toBe(true);

			const removed = recorder.removeRecording('game-1');
			expect(removed).toBe(true);
			expect(recorder.isRecording('game-1')).toBe(false);
			expect(recorder.getReplayData('game-1')).toBeUndefined();
		});

		test('should return false when removing non-existent recording', () => {
			const removed = recorder.removeRecording('non-existent');
			expect(removed).toBe(false);
		});

		test('should provide accurate memory statistics', () => {
			const gameState = createMockGameState();

			// Initially empty
			let stats = recorder.getMemoryStats();
			expect(stats.totalRecordings).toBe(0);
			expect(stats.activeRecordings).toBe(0);
			expect(stats.completedRecordings).toBe(0);

			// Add active recording
			recorder.startRecording('game-1', gameConfig, gameState, playerNames);
			stats = recorder.getMemoryStats();
			expect(stats.totalRecordings).toBe(1);
			expect(stats.activeRecordings).toBe(1);
			expect(stats.completedRecordings).toBe(0);

			// Complete recording
			recorder.endRecording('game-1', gameState);
			stats = recorder.getMemoryStats();
			expect(stats.totalRecordings).toBe(1);
			expect(stats.activeRecordings).toBe(0);
			expect(stats.completedRecordings).toBe(1);
		});
	});

	describe('Data Cloning and Visibility', () => {
		const gameId = 'test-game';
		const gameConfig = createMockGameConfig();
		const playerNames = new Map([['player1', 'Player 1']]);

		beforeEach(() => {
			const gameState = createMockGameState();
			recorder.startRecording(gameId, gameConfig, gameState, playerNames);
		});

		test('should clone game state safely', () => {
			const originalState = createMockGameState();
			originalState.players[0].chipStack = 500;

			const event: GameEvent = {
				type: 'action_taken',
				timestamp: Date.now(),
				handNumber: 1,
				phase: GamePhase.PreFlop,
				action: createMockAction(ActionType.Call),
				gameState: originalState,
			};

			recorder.recordEvent(gameId, event, originalState, originalState);

			// Modify original state
			originalState.players[0].chipStack = 1000;

			// Cloned state should not be affected
			const replayData = recorder.getReplayData(gameId);
			const clonedState = replayData?.events[1].gameStateAfter;
			expect(clonedState?.players[0].chipStack).toBe(500);
		});

		test('should handle undefined game state gracefully', () => {
			const event: GameEvent = {
				type: 'action_taken',
				timestamp: Date.now(),
				handNumber: 1,
				phase: GamePhase.PreFlop,
				action: createMockAction(ActionType.Call),
				gameState: createMockGameState(),
			};

			// Should not throw when cloning undefined state
			expect(() => {
				recorder.recordEvent(gameId, event, undefined, undefined);
			}).not.toThrow();
		});

		test('should preserve object immutability through cloning', () => {
			const originalEvent: GameEvent = {
				type: 'action_taken',
				timestamp: Date.now(),
				handNumber: 1,
				phase: GamePhase.PreFlop,
				action: createMockAction(ActionType.Call),
				gameState: createMockGameState(),
			};

			recorder.recordEvent(gameId, originalEvent);

			// Modify original event
			originalEvent.handNumber = 999;

			// Cloned event should not be affected
			const replayData = recorder.getReplayData(gameId);
			const clonedEvent = replayData?.events[1];
			expect(clonedEvent?.handNumber).toBe(1);
		});
	});

	describe('Statistics Calculation', () => {
		const gameId = 'test-game';
		const gameConfig = createMockGameConfig();
		const playerNames = new Map([
			['player1', 'Player 1'],
			['player2', 'Player 2'],
		]);

		test('should calculate average hand duration', () => {
			const gameState = createMockGameState();
			recorder.startRecording(gameId, gameConfig, gameState, playerNames);

			// Simulate a hand
			const handStartEvent: GameEvent = {
				type: 'hand_started',
				timestamp: 1000,
				handNumber: 1,
				phase: GamePhase.PreFlop,
				gameState: gameState,
			};

			const handCompleteEvent: GameEvent = {
				type: 'hand_complete',
				timestamp: 6000, // 5 second hand
				handNumber: 1,
				phase: GamePhase.Showdown,
				gameState: gameState,
			};

			recorder.recordEvent(gameId, handStartEvent);
			recorder.recordEvent(gameId, handCompleteEvent);
			recorder.endRecording(gameId, gameState);

			const replayData = recorder.getReplayData(gameId);
			expect(replayData?.metadata.avgHandDuration).toBe(5000);
		});

		test('should calculate final chip counts', () => {
			const gameState = createMockGameState();
			gameState.players[0].chipStack = 1200;
			gameState.players[1].chipStack = 800;

			recorder.startRecording(gameId, gameConfig, gameState, playerNames);
			recorder.endRecording(gameId, gameState);

			const replayData = recorder.getReplayData(gameId);
			expect(replayData?.metadata.finalChipCounts).toEqual({
				player1: 1200,
				player2: 800,
			});
		});
	});

	describe('Error Handling', () => {
		test('should handle invalid game state cloning', () => {
			const recorder = new GameReplayRecorder();

			// Should throw when trying to clone undefined state
			expect(() => {
				(recorder as any).cloneGameState(undefined);
			}).toThrow('Cannot clone undefined game state');
		});

		test('should handle missing call action in possible actions', () => {
			const gameId = 'test-game';
			const gameConfig = createMockGameConfig();
			const playerNames = new Map([['player1', 'Player 1']]);
			const gameState = createMockGameState();

			recorder.startRecording(gameId, gameConfig, gameState, playerNames);

			const possibleActions: PossibleAction[] = [
				{
					type: ActionType.Fold,
					minAmount: 0,
					maxAmount: 0,
					description: 'Fold',
				},
				{
					type: ActionType.Raise,
					minAmount: 40,
					maxAmount: 1000,
					description: 'Raise 40-1000',
				},
			]; // No call action

			// Should not throw
			expect(() => {
				recorder.recordPlayerDecision(
					gameId,
					'player1',
					createMockAction(ActionType.Fold),
					possibleActions,
					gameState,
					gameState,
					1000,
				);
			}).not.toThrow();
		});

		test('should handle empty opponent list for effective stack calculation', () => {
			const gameId = 'test-game';
			const gameConfig = createMockGameConfig();
			const playerNames = new Map([['player1', 'Player 1']]);
			const gameState = createMockGameState();

			// Only one active player
			gameState.players = [gameState.players[0]];

			recorder.startRecording(gameId, gameConfig, gameState, playerNames);

			// Should not throw when calculating effective stack with no opponents
			expect(() => {
				recorder.recordPlayerDecision(
					gameId,
					'player1',
					createMockAction(ActionType.Fold),
					mockPossibleActions,
					gameState,
					gameState,
					1000,
				);
			}).not.toThrow();
		});
	});
});
