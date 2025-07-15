import { ReplayManager } from '@/domain/replay/ReplayManager';
import { ReplaySystem } from '@/infrastructure/logging/ReplaySystem';
import {
	GameConfig,
	GameState,
	GameEvent,
	GamePhase,
	ActionType,
} from '@/domain/types';

describe('ReplayManager', () => {
	let replayManager: ReplayManager;
	let replaySystem: ReplaySystem;

	beforeEach(() => {
		replayManager = new ReplayManager();
		replaySystem = new ReplaySystem();
	});

	afterEach(() => {
		// Stop replay system to clean up any intervals
		replaySystem.stop();
	});

	const createMockGameConfig = (): GameConfig => ({
		maxPlayers: 2,
		smallBlindAmount: 5,
		bigBlindAmount: 10,
		turnTimeLimit: 30,
		isTournament: false,
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
				totalBetThisHand: 0,
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
				totalBetThisHand: 0,
			},
		],
		communityCards: [],
		pots: [
			{ amount: 15, eligiblePlayers: ['player1', 'player2'], isMainPot: true },
		],
		currentPhase: GamePhase.PreFlop,
		currentPlayerToAct: 'player1',
		dealerPosition: 0,
		smallBlindPosition: 0,
		bigBlindPosition: 1,
		smallBlindAmount: 5,
		bigBlindAmount: 10,
		minimumRaise: 10,
		handNumber: 1,
		isComplete: false,
	});

	it('should start and end game recording', async () => {
		const gameId = 'test-game';
		const config = createMockGameConfig();
		const gameState = createMockGameState();
		const playerNames = new Map([
			['player1', 'TestPlayer1'],
			['player2', 'TestPlayer2'],
		]);

		// Start recording
		replayManager.startRecording(gameId, config, gameState, playerNames);

		// Verify replay data was created
		const replayData = replayManager.getReplayData(gameId);
		expect(replayData).toBeDefined();
		expect(replayData?.gameId).toBe(gameId);
		expect(replayData?.metadata.playerNames['player1']).toBe('TestPlayer1');
		expect(replayData?.metadata.playerNames['player2']).toBe('TestPlayer2');

		// End recording
		await replayManager.endRecording(gameId, gameState);

		// Verify end time was set
		const finalReplayData = replayManager.getReplayData(gameId);
		expect(finalReplayData?.endTime).toBeDefined();
	});

	it('should record events with sequence IDs', async () => {
		const gameId = 'test-game';
		const config = createMockGameConfig();
		const gameState = createMockGameState();
		const playerNames = new Map([
			['player1', 'TestPlayer1'],
			['player2', 'TestPlayer2'],
		]);

		// Start recording
		replayManager.startRecording(gameId, config, gameState, playerNames);

		// Record some events
		const event1: GameEvent = {
			type: 'hand_started',
			timestamp: Date.now(),
			handNumber: 1,
			gameState,
		};

		const event2: GameEvent = {
			type: 'action_taken',
			playerId: 'player1',
			action: {
				type: ActionType.Call,
				amount: 10,
				playerId: 'player1',
				timestamp: Date.now(),
			},
			timestamp: Date.now(),
			handNumber: 1,
			gameState,
		};

		replayManager.recordEvent(gameId, event1);
		replayManager.recordEvent(gameId, event2);

		// Verify events were recorded with sequence IDs
		const replayData = replayManager.getReplayData(gameId);
		expect(replayData?.events).toHaveLength(3); // game_started + 2 events
		expect(replayData?.events[1].sequenceId).toBe(2); // First manual event
		expect(replayData?.events[2].sequenceId).toBe(3); // Second manual event
		expect(replayData?.metadata.totalEvents).toBe(3);
		expect(replayData?.metadata.totalActions).toBe(1);
	});

	it('should create replay analysis', async () => {
		const gameId = 'test-game';
		const config = createMockGameConfig();
		const gameState = createMockGameState();
		const playerNames = new Map([
			['player1', 'TestPlayer1'],
			['player2', 'TestPlayer2'],
		]);

		// Start recording
		replayManager.startRecording(gameId, config, gameState, playerNames);

		// Record a complete hand
		const events: GameEvent[] = [
			{
				type: 'hand_started',
				timestamp: Date.now(),
				handNumber: 1,
				gameState,
			},
			{
				type: 'action_taken',
				playerId: 'player1',
				action: {
					type: ActionType.Call,
					amount: 10,
					playerId: 'player1',
					timestamp: Date.now(),
				},
				timestamp: Date.now(),
				handNumber: 1,
				gameState,
			},
			{
				type: 'hand_complete',
				timestamp: Date.now() + 10000,
				handNumber: 1,
				gameState: { ...gameState, isComplete: true },
			},
		];

		for (const event of events) {
			replayManager.recordEvent(gameId, event);
		}
		await replayManager.endRecording(gameId, gameState);

		// Analyze recorded replay
		const analysis = replayManager.analyzeRecordedGame(gameId);
		expect(analysis).toBeDefined();
		expect(analysis?.handAnalysis).toHaveLength(1);
		expect(analysis?.playerStatistics['player1']).toBeDefined();
		expect(analysis?.playerStatistics['player2']).toBeDefined();
	});

	it('should support replay playback controls', async () => {
		const gameId = 'test-game';
		const config = createMockGameConfig();
		const gameState = createMockGameState();
		const playerNames = new Map([
			['player1', 'TestPlayer1'],
			['player2', 'TestPlayer2'],
		]);

		// Start recording and add events
		replayManager.startRecording(gameId, config, gameState, playerNames);

		const event1: GameEvent = {
			type: 'hand_started',
			timestamp: Date.now(),
			handNumber: 1,
			gameState,
		};

		const event2: GameEvent = {
			type: 'hand_complete',
			timestamp: Date.now() + 5000,
			handNumber: 1,
			gameState: { ...gameState, isComplete: true },
		};

		replayManager.recordEvent(gameId, event1);
		replayManager.recordEvent(gameId, event2);

		// Load into replay system
		const replayData = replayManager.getReplayData(gameId);
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
