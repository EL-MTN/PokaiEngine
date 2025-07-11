import { EnhancedGameLogger } from '../../logging/EnhancedGameLogger';
import { ReplaySystem } from '../../logging/ReplaySystem';
import { GameConfig, GameState, GameEvent, GamePhase, ActionType } from '../../types';

describe('EnhancedGameLogger', () => {
	let enhancedLogger: EnhancedGameLogger;
	let replaySystem: ReplaySystem;

	beforeEach(() => {
		enhancedLogger = new EnhancedGameLogger({
			enabled: true,
			directory: './test-replays',
			autoSave: false,
			maxReplaysInMemory: 10,
			checkpointInterval: 10
		});
		replaySystem = new ReplaySystem(enhancedLogger);
	});

	const createMockGameConfig = (): GameConfig => ({
		maxPlayers: 2,
		smallBlindAmount: 5,
		bigBlindAmount: 10,
		turnTimeLimit: 30,
		isTournament: false
	});

	const createMockGameState = (): GameState => ({
		id: 'test-game',
		players: [
			{
				id: 'player1',
				name: 'TestPlayer1',
				chipStack: 1000,
				isActive: true,
				hasActed: false,
				isFolded: false,
				isAllIn: false,
				currentBet: 0,
				totalBetThisHand: 0
			},
			{
				id: 'player2',
				name: 'TestPlayer2',
				chipStack: 1000,
				isActive: true,
				hasActed: false,
				isFolded: false,
				isAllIn: false,
				currentBet: 0,
				totalBetThisHand: 0
			}
		],
		communityCards: [],
		pots: [{ amount: 15, eligiblePlayers: ['player1', 'player2'], isMainPot: true }],
		currentPhase: GamePhase.PreFlop,
		currentPlayerToAct: 'player1',
		dealerPosition: 0,
		smallBlindPosition: 0,
		bigBlindPosition: 1,
		smallBlindAmount: 5,
		bigBlindAmount: 10,
		minimumRaise: 10,
		handNumber: 1,
		isComplete: false
	});

	it('should start and end game logging', () => {
		const gameId = 'test-game';
		const config = createMockGameConfig();
		const gameState = createMockGameState();
		const playerNames = new Map([
			['player1', 'TestPlayer1'],
			['player2', 'TestPlayer2']
		]);

		// Start logging
		enhancedLogger.startGame(gameId, config, gameState, playerNames);

		// Verify replay data was created
		const replayData = enhancedLogger.getReplayData(gameId);
		expect(replayData).toBeDefined();
		expect(replayData?.gameId).toBe(gameId);
		expect(replayData?.metadata.playerNames['player1']).toBe('TestPlayer1');
		expect(replayData?.metadata.playerNames['player2']).toBe('TestPlayer2');

		// End logging
		enhancedLogger.endGame(gameId, gameState);

		// Verify end time was set
		const finalReplayData = enhancedLogger.getReplayData(gameId);
		expect(finalReplayData?.endTime).toBeDefined();
	});

	it('should log events with sequence IDs', () => {
		const gameId = 'test-game';
		const config = createMockGameConfig();
		const gameState = createMockGameState();
		const playerNames = new Map([
			['player1', 'TestPlayer1'],
			['player2', 'TestPlayer2']
		]);

		// Start logging
		enhancedLogger.startGame(gameId, config, gameState, playerNames);

		// Log some events
		const event1: GameEvent = {
			type: 'hand_started',
			timestamp: Date.now(),
			handNumber: 1,
			gameState
		};

		const event2: GameEvent = {
			type: 'action_taken',
			playerId: 'player1',
			action: {
				type: ActionType.Call,
				amount: 10,
				playerId: 'player1',
				timestamp: Date.now()
			},
			timestamp: Date.now(),
			handNumber: 1,
			gameState
		};

		enhancedLogger.logEvent(gameId, event1);
		enhancedLogger.logEvent(gameId, event2);

		// Verify events were logged with sequence IDs
		const replayData = enhancedLogger.getReplayData(gameId);
		expect(replayData?.events).toHaveLength(3); // game_started + 2 events
		expect(replayData?.events[1].sequenceId).toBe(2); // First manual event
		expect(replayData?.events[2].sequenceId).toBe(3); // Second manual event
		expect(replayData?.metadata.totalEvents).toBe(3);
		expect(replayData?.metadata.totalActions).toBe(1);
	});

	it('should create replay analysis', () => {
		const gameId = 'test-game';
		const config = createMockGameConfig();
		const gameState = createMockGameState();
		const playerNames = new Map([
			['player1', 'TestPlayer1'],
			['player2', 'TestPlayer2']
		]);

		// Start logging
		enhancedLogger.startGame(gameId, config, gameState, playerNames);

		// Log a complete hand
		const events: GameEvent[] = [
			{
				type: 'hand_started',
				timestamp: Date.now(),
				handNumber: 1,
				gameState
			},
			{
				type: 'action_taken',
				playerId: 'player1',
				action: {
					type: ActionType.Call,
					amount: 10,
					playerId: 'player1',
					timestamp: Date.now()
				},
				timestamp: Date.now(),
				handNumber: 1,
				gameState
			},
			{
				type: 'hand_complete',
				timestamp: Date.now() + 10000,
				handNumber: 1,
				gameState: { ...gameState, isComplete: true }
			}
		];

		events.forEach(event => enhancedLogger.logEvent(gameId, event));
		enhancedLogger.endGame(gameId, gameState);

		// Load replay into replay system and analyze
		const replayData = enhancedLogger.getReplayData(gameId);
		expect(replayData).toBeDefined();

		const loaded = replaySystem.loadReplay(replayData!);
		expect(loaded).toBe(true);

		const analysis = replaySystem.analyzeReplay();
		expect(analysis).toBeDefined();
		expect(analysis?.handAnalysis).toHaveLength(1);
		expect(analysis?.playerStatistics['player1']).toBeDefined();
		expect(analysis?.playerStatistics['player2']).toBeDefined();
	});

	it('should support replay playback controls', () => {
		const gameId = 'test-game';
		const config = createMockGameConfig();
		const gameState = createMockGameState();
		const playerNames = new Map([
			['player1', 'TestPlayer1'],
			['player2', 'TestPlayer2']
		]);

		// Start logging and add events
		enhancedLogger.startGame(gameId, config, gameState, playerNames);
		
		const event1: GameEvent = {
			type: 'hand_started',
			timestamp: Date.now(),
			handNumber: 1,
			gameState
		};

		const event2: GameEvent = {
			type: 'hand_complete',
			timestamp: Date.now() + 5000,
			handNumber: 1,
			gameState: { ...gameState, isComplete: true }
		};

		enhancedLogger.logEvent(gameId, event1);
		enhancedLogger.logEvent(gameId, event2);

		// Load into replay system
		const replayData = enhancedLogger.getReplayData(gameId);
		const loaded = replaySystem.loadReplay(replayData!);
		expect(loaded).toBe(true);

		// Test playback controls
		const controls = replaySystem.getControls();
		expect(controls.isPlaying).toBe(false);
		expect(controls.canStepForward).toBe(true);
		expect(controls.canStepBackward).toBe(false);
		expect(controls.totalEvents).toBe(3); // game_started + 2 events

		// Step forward
		const stepped = replaySystem.stepForward();
		expect(stepped).toBe(true);

		const newControls = replaySystem.getControls();
		expect(newControls.canStepBackward).toBe(true);

		// Test seeking
		const seeked = replaySystem.seekToEvent(0);
		expect(seeked).toBe(true);
	});
});