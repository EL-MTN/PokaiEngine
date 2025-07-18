import { jest } from '@jest/globals';

import { GameReplayRecorder } from '@/engine/replay/GameReplayRecorder';
import { ReplayAnalyzer } from '@/engine/replay/ReplayAnalyzer';
import { ReplaySystem } from '@/services/logging/ReplaySystem';
import { ReplayStorage } from '@/services/replay/ReplayStorage';
import { GamePhase, GameState, ReplayData } from '@/types';

// Mock dependencies
jest.mock('@/services/replay/ReplayStorage');
jest.mock('@/engine/replay/ReplayAnalyzer');
jest.mock('@/services/logging/Logger', () => ({
	replayLogger: {
		info: jest.fn(),
		error: jest.fn(),
	},
}));

const MockedReplayStorage = ReplayStorage as jest.MockedClass<
	typeof ReplayStorage
>;
const MockedReplayAnalyzer = ReplayAnalyzer as jest.MockedClass<
	typeof ReplayAnalyzer
>;

describe('ReplaySystem', () => {
	let replaySystem: ReplaySystem;
	let mockReplayStorage: jest.Mocked<ReplayStorage>;
	let mockReplayAnalyzer: jest.Mocked<ReplayAnalyzer>;
	let mockRecorder: jest.Mocked<GameReplayRecorder>;

	const createMockReplayData = (): ReplayData => ({
		gameId: 'test-game-123',
		startTime: new Date('2024-01-01T10:00:00Z'),
		endTime: new Date('2024-01-01T11:00:00Z'),
		events: [
			{
				type: 'game_started',
				timestamp: Date.now(),
				handNumber: 0,
				phase: GamePhase.PreFlop,
				playerId: 'player1',
				sequenceId: 1,
				gameStateBefore: createMockGameState(),
				gameStateAfter: createMockGameState(),
			},
			{
				type: 'hand_started',
				timestamp: Date.now() + 1000,
				handNumber: 1,
				phase: GamePhase.PreFlop,
				playerId: 'player1',
				sequenceId: 2,
				gameStateBefore: createMockGameState(),
				gameStateAfter: createMockGameState(),
			},
			{
				type: 'bet',
				timestamp: Date.now() + 2000,
				handNumber: 1,
				phase: GamePhase.PreFlop,
				playerId: 'player1',
				sequenceId: 3,
				gameStateBefore: createMockGameState(),
				gameStateAfter: createMockGameState(),
			},
		],
		initialGameState: createMockGameState(),
		finalGameState: createMockGameState(),
		metadata: {
			gameConfig: {
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30000,
				isTournament: false,
			},
			playerNames: { player1: 'Player 1', player2: 'Player 2' },
			handCount: 1,
			totalEvents: 3,
			totalActions: 2,
			gameDuration: 3600000,
			avgHandDuration: 180000,
			winners: [{ playerId: 'player1', handsWon: 5 }],
			finalChipCounts: { player1: 2000, player2: 1000 },
			createdAt: new Date('2024-01-01T10:00:00Z'),
			version: '1.0.0',
		},
		checkpoints: [
			{
				eventIndex: 0,
				sequenceId: 1,
				handNumber: 0,
				phase: GamePhase.PreFlop,
				gameState: createMockGameState(),
				timestamp: Date.now(),
			},
		],
	});

	const createMockGameState = (): GameState => ({
		id: 'game-1',
		currentPhase: GamePhase.PreFlop,
		handNumber: 1,
		players: [],
		currentPlayerToAct: 'player1',
		dealerPosition: 0,
		smallBlindPosition: 0,
		bigBlindPosition: 1,
		smallBlindAmount: 10,
		bigBlindAmount: 20,
		minimumRaise: 20,
		communityCards: [],
		pots: [],
		isComplete: false,
	});

	beforeEach(() => {
		jest.clearAllMocks();

		// Setup mocks
		mockReplayStorage = new MockedReplayStorage() as jest.Mocked<ReplayStorage>;
		mockReplayAnalyzer =
			new MockedReplayAnalyzer() as jest.Mocked<ReplayAnalyzer>;
		mockRecorder = {
			getCurrentReplay: jest.fn(),
		} as unknown as jest.Mocked<GameReplayRecorder>;

		// Mock constructor calls
		MockedReplayStorage.mockImplementation(() => mockReplayStorage);
		MockedReplayAnalyzer.mockImplementation(() => mockReplayAnalyzer);

		replaySystem = new ReplaySystem(mockRecorder);
	});

	describe('Loading Replays', () => {
		test('should load replay data successfully', () => {
			const replayData = createMockReplayData();

			const result = replaySystem.loadReplay(replayData);

			expect(result).toBe(true);
			const controls = replaySystem.getControls();
			expect(controls.totalEvents).toBe(3);
			expect(controls.currentPosition.eventIndex).toBe(0);
		});

		test('should handle load replay errors', () => {
			const invalidData = undefined as any;

			const result = replaySystem.loadReplay(invalidData);

			expect(result).toBe(false);
		});

		test('should load replay from file successfully', () => {
			const replayData = createMockReplayData();
			mockReplayStorage.loadReplayFromFile.mockReturnValue(replayData);

			const result = replaySystem.loadReplayFromFile('test-file.json');

			expect(result).toBe(true);
			expect(mockReplayStorage.loadReplayFromFile).toHaveBeenCalledWith(
				'test-file.json',
			);
		});

		test('should handle file load failures', () => {
			mockReplayStorage.loadReplayFromFile.mockReturnValue(undefined);

			const result = replaySystem.loadReplayFromFile('non-existent.json');

			expect(result).toBe(false);
		});

		test('should load replay from MongoDB successfully', async () => {
			const mongoReplay = {
				gameId: 'test-game-123',
				metadata: {
					gameStartTime: '2024-01-01T10:00:00Z',
					gameEndTime: '2024-01-01T11:00:00Z',
					maxPlayers: 6,
					smallBlindAmount: 10,
					bigBlindAmount: 20,
					turnTimeLimit: 30000,
					gameType: 'cash',
					playerNames: { player1: 'Player 1', player2: 'Player 2' },
					totalHands: 1,
					totalActions: 2,
					gameDuration: 3600000,
					winners: ['player1'],
				},
				analytics: {
					totalEvents: 3,
					avgHandDuration: 180000,
				},
				events: [
					{
						type: 'game_started',
						timestamp: Date.now(),
						handNumber: 0,
						phase: GamePhase.PreFlop,
						playerId: 'player1',
						data: {
							gameStateBefore: createMockGameState(),
							gameStateAfter: createMockGameState(),
						},
					},
				],
				createdAt: '2024-01-01T10:00:00Z',
				version: '1.0.0',
			};
			mockReplayStorage.loadReplayFromMongo.mockResolvedValue(mongoReplay);

			const result = await replaySystem.loadReplayFromMongo('test-game-123');

			expect(result).toBe(true);
			expect(mockReplayStorage.loadReplayFromMongo).toHaveBeenCalledWith(
				'test-game-123',
			);
		});

		test('should handle MongoDB load failures', async () => {
			mockReplayStorage.loadReplayFromMongo.mockResolvedValue(null);

			const result = await replaySystem.loadReplayFromMongo('non-existent');

			expect(result).toBe(false);
		});

		test('should handle MongoDB load errors', async () => {
			mockReplayStorage.loadReplayFromMongo.mockRejectedValue(
				new Error('MongoDB error'),
			);

			const result = await replaySystem.loadReplayFromMongo('test-game-123');

			expect(result).toBe(false);
		});
	});

	describe('Playback Controls', () => {
		beforeEach(() => {
			const replayData = createMockReplayData();
			replaySystem.loadReplay(replayData);
		});

		test('should start playback', () => {
			replaySystem.play();

			const controls = replaySystem.getControls();
			expect(controls.isPlaying).toBe(true);
			expect(controls.playbackSpeed).toBe(1.0);

			replaySystem.stop();
		});

		test('should not start playback if no replay loaded', () => {
			const emptySystem = new ReplaySystem();
			emptySystem.play();

			const controls = emptySystem.getControls();
			expect(controls.isPlaying).toBe(false);
		});

		test('should not start playback if already playing', () => {
			replaySystem.play();
			const controls1 = replaySystem.getControls();

			replaySystem.play(); // Try to start again
			const controls2 = replaySystem.getControls();

			expect(controls1.isPlaying).toBe(true);
			expect(controls2.isPlaying).toBe(true);
			replaySystem.stop();
		});

		test('should pause playback', () => {
			replaySystem.play();
			replaySystem.pause();

			const controls = replaySystem.getControls();
			expect(controls.isPlaying).toBe(false);
		});

		test('should stop playback and reset position', () => {
			replaySystem.stepForward();
			replaySystem.play();
			replaySystem.stop();

			const controls = replaySystem.getControls();
			expect(controls.isPlaying).toBe(false);
			expect(controls.currentPosition.eventIndex).toBe(0);
		});

		test('should step forward through events', () => {
			const result1 = replaySystem.stepForward();
			expect(result1).toBe(true);

			const controls1 = replaySystem.getControls();
			expect(controls1.currentPosition.eventIndex).toBe(1);

			const result2 = replaySystem.stepForward();
			expect(result2).toBe(true);

			const controls2 = replaySystem.getControls();
			expect(controls2.currentPosition.eventIndex).toBe(2);
		});

		test('should not step forward beyond last event', () => {
			// Move to last event
			replaySystem.seekToEvent(2);

			const result = replaySystem.stepForward();
			expect(result).toBe(false);
		});

		test('should step backward through events', () => {
			replaySystem.seekToEvent(2);

			const result = replaySystem.stepBackward();
			expect(result).toBe(true);

			const controls = replaySystem.getControls();
			expect(controls.currentPosition.eventIndex).toBe(1);
		});

		test('should not step backward beyond first event', () => {
			const result = replaySystem.stepBackward();
			expect(result).toBe(false);
		});

		test('should seek to specific event', () => {
			const result = replaySystem.seekToEvent(1);
			expect(result).toBe(true);

			const controls = replaySystem.getControls();
			expect(controls.currentPosition.eventIndex).toBe(1);
		});

		test('should not seek to invalid event index', () => {
			const result1 = replaySystem.seekToEvent(-1);
			expect(result1).toBe(false);

			const result2 = replaySystem.seekToEvent(10);
			expect(result2).toBe(false);
		});

		test('should seek to specific hand', () => {
			const result = replaySystem.seekToHand(1);
			expect(result).toBe(true);

			const controls = replaySystem.getControls();
			expect(controls.currentPosition.eventIndex).toBe(1); // hand_started event
		});

		test('should not seek to non-existent hand', () => {
			const result = replaySystem.seekToHand(5);
			expect(result).toBe(false);
		});

		test('should seek to checkpoint', () => {
			const result = replaySystem.seekToCheckpoint(2);
			expect(result).toBe(true);

			const controls = replaySystem.getControls();
			expect(controls.currentPosition.eventIndex).toBe(0); // Latest checkpoint before event 2
		});

		test('should handle seek to checkpoint with no checkpoints', () => {
			const replayData = createMockReplayData();
			delete replayData.checkpoints;
			replaySystem.loadReplay(replayData);

			const result = replaySystem.seekToCheckpoint(1);
			expect(result).toBe(false);
		});
	});

	describe('Playback Speed Control', () => {
		beforeEach(() => {
			const replayData = createMockReplayData();
			replaySystem.loadReplay(replayData);
		});

		test('should set playback speed within valid range', () => {
			replaySystem.setPlaybackSpeed(2.0);

			const controls = replaySystem.getControls();
			expect(controls.playbackSpeed).toBe(2.0);
		});

		test('should clamp playback speed to minimum', () => {
			replaySystem.setPlaybackSpeed(0.1);

			const controls = replaySystem.getControls();
			expect(controls.playbackSpeed).toBe(0.25);
		});

		test('should clamp playback speed to maximum', () => {
			replaySystem.setPlaybackSpeed(10.0);

			const controls = replaySystem.getControls();
			expect(controls.playbackSpeed).toBe(8.0);
		});

		test('should restart playback with new speed if currently playing', async () => {
			replaySystem.play();
			replaySystem.setPlaybackSpeed(4.0);

			// Should still be playing with new speed
			await new Promise((resolve) => setTimeout(resolve, 50));

			const controls = replaySystem.getControls();
			expect(controls.isPlaying).toBe(true);
			expect(controls.playbackSpeed).toBe(4.0);
			replaySystem.stop();
		});
	});

	describe('Event and Position Callbacks', () => {
		beforeEach(() => {
			const replayData = createMockReplayData();
			replaySystem.loadReplay(replayData);
		});

		test('should call event callbacks when stepping through events', () => {
			const eventCallback = jest.fn();
			const positionCallback = jest.fn();

			replaySystem.onEvent(eventCallback);
			replaySystem.onPositionChange(positionCallback);

			replaySystem.stepForward();

			expect(eventCallback).toHaveBeenCalledTimes(1);
			expect(positionCallback).toHaveBeenCalledTimes(1);
		});

		test('should handle callback errors gracefully', () => {
			const errorCallback = jest.fn(() => {
				throw new Error('Callback error');
			});

			replaySystem.onEvent(errorCallback);

			// Should not throw
			expect(() => replaySystem.stepForward()).not.toThrow();
		});

		test('should clear event callbacks', () => {
			const eventCallback = jest.fn();
			replaySystem.onEvent(eventCallback);

			replaySystem.clearEventCallbacks();
			replaySystem.stepForward();

			expect(eventCallback).not.toHaveBeenCalled();
		});

		test('should clear position callbacks', () => {
			const positionCallback = jest.fn();
			replaySystem.onPositionChange(positionCallback);

			replaySystem.clearPositionCallbacks();
			replaySystem.stepForward();

			expect(positionCallback).not.toHaveBeenCalled();
		});
	});

	describe('Game State and Analysis', () => {
		beforeEach(() => {
			const replayData = createMockReplayData();
			replaySystem.loadReplay(replayData);
		});

		test('should get current game state', () => {
			const gameState = replaySystem.getCurrentGameState();
			expect(gameState).toBeDefined();
			expect(gameState?.currentPhase).toBe(GamePhase.PreFlop);
		});

		test('should return initial game state when at beginning', () => {
			const gameState = replaySystem.getCurrentGameState();
			expect(gameState).toBeDefined();
		});

		test('should get hand replay data', () => {
			const handData = { handNumber: 1, events: [] };
			mockReplayStorage.buildHandReplayData.mockReturnValue(handData as any);

			const result = replaySystem.getHandReplay(1);

			expect(result).toEqual(handData);
			expect(mockReplayStorage.buildHandReplayData).toHaveBeenCalledWith(
				'test-game-123',
				1,
				expect.any(Array),
			);
		});

		test('should return undefined for hand replay when no replay loaded', () => {
			const emptySystem = new ReplaySystem();
			const result = emptySystem.getHandReplay(1);
			expect(result).toBeUndefined();
		});

		test('should analyze replay', () => {
			const mockAnalysis = { totalHands: 1, totalPlayers: 2 };
			mockReplayAnalyzer.analyzeReplay.mockReturnValue(mockAnalysis as any);

			const result = replaySystem.analyzeReplay();

			expect(result).toEqual(mockAnalysis);
			expect(mockReplayAnalyzer.analyzeReplay).toHaveBeenCalled();
		});

		test('should return null for analysis when no replay loaded', () => {
			const emptySystem = new ReplaySystem();
			const result = emptySystem.analyzeReplay();
			expect(result).toBeNull();
		});
	});

	describe('MongoDB Integration', () => {
		test('should get replay analysis from MongoDB', async () => {
			const mockAnalysis = { handCount: 5, playerStats: {} };
			mockReplayStorage.getReplayAnalysis.mockResolvedValue(mockAnalysis);

			const result =
				await replaySystem.getReplayAnalysisFromMongo('test-game-123');

			expect(result).toEqual(mockAnalysis);
			expect(mockReplayStorage.getReplayAnalysis).toHaveBeenCalledWith(
				'test-game-123',
			);
		});

		test('should handle MongoDB analysis errors', async () => {
			mockReplayStorage.getReplayAnalysis.mockRejectedValue(
				new Error('MongoDB error'),
			);

			const result =
				await replaySystem.getReplayAnalysisFromMongo('test-game-123');

			expect(result).toBeNull();
		});

		test('should get hand replay from MongoDB', async () => {
			const mockHandReplay = { handNumber: 1, events: [] };
			mockReplayStorage.getHandReplay.mockResolvedValue(mockHandReplay);

			const result = await replaySystem.getHandReplayFromMongo(
				'test-game-123',
				1,
			);

			expect(result).toEqual(mockHandReplay);
			expect(mockReplayStorage.getHandReplay).toHaveBeenCalledWith(
				'test-game-123',
				1,
			);
		});

		test('should handle MongoDB hand replay errors', async () => {
			mockReplayStorage.getHandReplay.mockRejectedValue(
				new Error('MongoDB error'),
			);

			const result = await replaySystem.getHandReplayFromMongo(
				'test-game-123',
				1,
			);

			expect(result).toBeNull();
		});

		test('should list MongoDB replays', async () => {
			const mockReplays = [{ gameId: 'game1' }, { gameId: 'game2' }];
			mockReplayStorage.listRecentReplays.mockResolvedValue(mockReplays);

			const result = await replaySystem.listMongoReplays(10);

			expect(result).toEqual(mockReplays);
			expect(mockReplayStorage.listRecentReplays).toHaveBeenCalledWith(10);
		});

		test('should use default limit for listing MongoDB replays', async () => {
			mockReplayStorage.listRecentReplays.mockResolvedValue([]);

			await replaySystem.listMongoReplays();

			expect(mockReplayStorage.listRecentReplays).toHaveBeenCalledWith(50);
		});

		test('should handle MongoDB list errors', async () => {
			mockReplayStorage.listRecentReplays.mockRejectedValue(
				new Error('MongoDB error'),
			);

			const result = await replaySystem.listMongoReplays();

			expect(result).toEqual([]);
		});

		test('should check MongoDB availability', () => {
			mockReplayStorage.isMongoAvailable.mockReturnValue(true);

			const result = replaySystem.isMongoAvailable();

			expect(result).toBe(true);
			expect(mockReplayStorage.isMongoAvailable).toHaveBeenCalled();
		});
	});

	describe('Controls State', () => {
		test('should return correct controls for empty system', () => {
			const emptySystem = new ReplaySystem();
			const controls = emptySystem.getControls();

			expect(controls).toEqual({
				isPlaying: false,
				playbackSpeed: 1.0,
				currentPosition: {
					eventIndex: 0,
					sequenceId: 0,
					handNumber: 0,
					phase: GamePhase.PreFlop,
					timestamp: 0,
				},
				canStepForward: false,
				canStepBackward: false,
				totalEvents: 0,
			});
		});

		test('should return correct controls with loaded replay', () => {
			const replayData = createMockReplayData();
			replaySystem.loadReplay(replayData);

			const controls = replaySystem.getControls();

			expect(controls.totalEvents).toBe(3);
			expect(controls.canStepForward).toBe(true);
			expect(controls.canStepBackward).toBe(false);
			expect(controls.currentPosition.eventIndex).toBe(0);
		});

		test('should update navigation flags correctly', () => {
			const replayData = createMockReplayData();
			replaySystem.loadReplay(replayData);

			// At beginning
			let controls = replaySystem.getControls();
			expect(controls.canStepForward).toBe(true);
			expect(controls.canStepBackward).toBe(false);

			// In middle
			replaySystem.stepForward();
			controls = replaySystem.getControls();
			expect(controls.canStepForward).toBe(true);
			expect(controls.canStepBackward).toBe(true);

			// At end
			replaySystem.seekToEvent(2);
			controls = replaySystem.getControls();
			expect(controls.canStepForward).toBe(false);
			expect(controls.canStepBackward).toBe(true);
		});
	});

	describe('Error Handling', () => {
		test('should handle operations on unloaded replay gracefully', () => {
			const emptySystem = new ReplaySystem();

			expect(emptySystem.stepForward()).toBe(false);
			expect(emptySystem.stepBackward()).toBe(false);
			expect(emptySystem.seekToEvent(0)).toBe(false);
			expect(emptySystem.seekToHand(1)).toBe(false);
			expect(emptySystem.seekToCheckpoint(0)).toBe(false);
			expect(emptySystem.getCurrentGameState()).toBeNull();
			expect(emptySystem.getHandReplay(1)).toBeUndefined();
			expect(emptySystem.analyzeReplay()).toBeNull();

			// These should not throw
			expect(() => emptySystem.play()).not.toThrow();
			expect(() => emptySystem.pause()).not.toThrow();
			expect(() => emptySystem.stop()).not.toThrow();
		});

		test('should handle malformed replay data', () => {
			const malformedData = {
				gameId: 'test',
				events: null, // Invalid
			} as any;

			const result = replaySystem.loadReplay(malformedData);
			expect(result).toBe(false);
		});
	});

	describe('Auto-stop Playback', () => {
		test('should auto-stop when reaching end of replay', () => {
			const replayData = createMockReplayData();
			replaySystem.loadReplay(replayData);

			// Seek to last event
			replaySystem.seekToEvent(2);

			// Try to step forward (should fail and stop playback)
			const canStep = replaySystem.stepForward();
			expect(canStep).toBe(false);

			const controls = replaySystem.getControls();
			expect(controls.canStepForward).toBe(false);
		});
	});
});
