import { jest } from '@jest/globals';

import { GameReplayRecorder } from '@/domain/replay/GameReplayRecorder';
import { ReplayAnalyzer } from '@/domain/replay/ReplayAnalyzer';
import { ReplayManager } from '@/domain/replay/ReplayManager';
import {
	ActionType,
	GameConfig,
	GamePhase,
	GameState,
	PlayerDecisionContext,
	PlayerInfo,
	Position,
	ReplayData,
} from '@/domain/types';
import { ReplayStorage } from '@/infrastructure/storage/ReplayStorage';

// Mock dependencies
jest.mock('@/domain/replay/GameReplayRecorder');
jest.mock('@/domain/replay/ReplayAnalyzer');
jest.mock('@/infrastructure/storage/ReplayStorage');
jest.mock('@/infrastructure/logging/Logger', () => ({
	replayLogger: {
		info: jest.fn(),
		error: jest.fn(),
	},
}));

const MockedGameReplayRecorder = GameReplayRecorder as jest.MockedClass<
	typeof GameReplayRecorder
>;
const MockedReplayAnalyzer = ReplayAnalyzer as jest.MockedClass<
	typeof ReplayAnalyzer
>;
const MockedReplayStorage = ReplayStorage as jest.MockedClass<
	typeof ReplayStorage
>;

describe('ReplayManager', () => {
	let replayManager: ReplayManager;
	let mockRecorder: jest.Mocked<GameReplayRecorder>;
	let mockAnalyzer: jest.Mocked<ReplayAnalyzer>;
	let mockStorage: jest.Mocked<ReplayStorage>;

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
			{
				id: 'player1',
				name: 'Player 1',
				chipStack: 1000,
				position: Position.SmallBlind,
				isActive: true,
				isFolded: false,
				currentBet: 0,
				hasActed: false,
				isAllIn: false,
				totalBetThisHand: 0,
			} as PlayerInfo,
		],
		currentPlayerToAct: 'player1',
		dealerPosition: 0,
		smallBlindPosition: 0,
		bigBlindPosition: 1,
		smallBlindAmount: 10,
		bigBlindAmount: 20,
		minimumRaise: 20,
		communityCards: [],
		pots: [{ amount: 30, eligiblePlayers: ['player1'], isMainPot: true }],
		isComplete: false,
	});

	const createMockReplayData = (): ReplayData => ({
		gameId: 'test-game-123',
		startTime: new Date(),
		endTime: new Date(),
		events: [],
		initialGameState: createMockGameState(),
		finalGameState: createMockGameState(),
		metadata: {
			gameConfig: createMockGameConfig(),
			playerNames: { player1: 'Player 1' },
			handCount: 1,
			totalEvents: 5,
			totalActions: 2,
			gameDuration: 60000,
			avgHandDuration: 30000,
			winners: [{ playerId: 'player1', handsWon: 1 }],
			finalChipCounts: { player1: 1050 },
			createdAt: new Date(),
			version: '1.0.0',
		},
	});

	beforeEach(() => {
		jest.clearAllMocks();

		// Setup mocks
		mockRecorder =
			new MockedGameReplayRecorder() as jest.Mocked<GameReplayRecorder>;
		mockAnalyzer = new MockedReplayAnalyzer() as jest.Mocked<ReplayAnalyzer>;
		mockStorage = new MockedReplayStorage() as jest.Mocked<ReplayStorage>;

		// Mock constructor calls
		MockedGameReplayRecorder.mockImplementation(() => mockRecorder);
		MockedReplayAnalyzer.mockImplementation(() => mockAnalyzer);
		MockedReplayStorage.mockImplementation(() => mockStorage);

		replayManager = new ReplayManager();
	});

	describe('Recording Coordination', () => {
		const gameId = 'test-game-123';
		const gameConfig = createMockGameConfig();
		const gameState = createMockGameState();
		const playerNames = new Map([['player1', 'Player 1']]);

		test('should delegate start recording to recorder', () => {
			replayManager.startRecording(gameId, gameConfig, gameState, playerNames);

			expect(mockRecorder.startRecording).toHaveBeenCalledWith(
				gameId,
				gameConfig,
				gameState,
				playerNames,
			);
		});

		test('should delegate event recording to recorder', () => {
			const event = {
				type: 'hand_started',
				timestamp: Date.now(),
				handNumber: 1,
				phase: GamePhase.PreFlop,
			};
			const gameStateBefore = createMockGameState();
			const gameStateAfter = createMockGameState();
			const playerDecisionContext: PlayerDecisionContext = {
				playerId: 'player1',
				possibleActions: [],
				timeToDecide: 5000,
				position: Position.SmallBlind,
				chipStack: 1000,
				potOdds: 0.2,
				effectiveStackSize: 1000,
			};

			replayManager.recordEvent(
				gameId,
				event,
				gameStateBefore,
				gameStateAfter,
				playerDecisionContext,
			);

			expect(mockRecorder.recordEvent).toHaveBeenCalledWith(
				gameId,
				event,
				gameStateBefore,
				gameStateAfter,
				playerDecisionContext,
			);
		});

		test('should delegate player decision recording to recorder', () => {
			const action = {
				type: ActionType.Call,
				amount: 20,
				playerId: 'player1',
				timestamp: Date.now(),
			};
			const possibleActions = [
				{
					type: ActionType.Fold,
					minAmount: 0,
					maxAmount: 0,
					description: 'Fold',
				},
				{
					type: ActionType.Call,
					minAmount: 20,
					maxAmount: 20,
					description: 'Call 20',
				},
			];
			const gameStateBefore = createMockGameState();
			const gameStateAfter = createMockGameState();
			const equity = { before: 0.45, after: 0.4 };

			replayManager.recordPlayerDecision(
				gameId,
				'player1',
				action,
				possibleActions,
				gameStateBefore,
				gameStateAfter,
				5000,
				equity,
			);

			expect(mockRecorder.recordPlayerDecision).toHaveBeenCalledWith(
				gameId,
				'player1',
				action,
				possibleActions,
				gameStateBefore,
				gameStateAfter,
				5000,
				equity,
			);
		});

		test('should end recording and auto-save to storage', async () => {
			const replayData = createMockReplayData();
			mockRecorder.getReplayData.mockReturnValue(replayData);
			mockStorage.saveReplay.mockResolvedValue({
				fileSuccess: true,
				mongoSuccess: true,
				filePath: '/path/to/replay.json',
			});

			await replayManager.endRecording(gameId, gameState);

			expect(mockRecorder.endRecording).toHaveBeenCalledWith(gameId, gameState);
			expect(mockRecorder.getReplayData).toHaveBeenCalledWith(gameId);
			expect(mockStorage.saveReplay).toHaveBeenCalledWith(replayData);
		});

		test('should handle auto-save errors gracefully', async () => {
			const replayData = createMockReplayData();
			mockRecorder.getReplayData.mockReturnValue(replayData);
			mockStorage.saveReplay.mockRejectedValue(new Error('Storage error'));

			// Should not throw
			await expect(
				replayManager.endRecording(gameId, gameState),
			).resolves.not.toThrow();
			expect(mockStorage.saveReplay).toHaveBeenCalled();
		});

		test('should handle end recording when no replay data exists', async () => {
			mockRecorder.getReplayData.mockReturnValue(undefined);

			await replayManager.endRecording(gameId, gameState);

			expect(mockRecorder.endRecording).toHaveBeenCalledWith(gameId, gameState);
			expect(mockStorage.saveReplay).not.toHaveBeenCalled();
		});
	});

	describe('Storage Integration', () => {
		const gameId = 'test-game-123';

		test('should save replay with recorder data', async () => {
			const replayData = createMockReplayData();
			mockRecorder.getReplayData.mockReturnValue(replayData);
			mockStorage.saveReplay.mockResolvedValue({
				fileSuccess: true,
				mongoSuccess: false,
				filePath: '/path/to/replay.json',
				error: 'MongoDB unavailable',
			});

			const result = await replayManager.saveReplay(gameId);

			expect(mockRecorder.getReplayData).toHaveBeenCalledWith(gameId);
			expect(mockStorage.saveReplay).toHaveBeenCalledWith(replayData);
			expect(result).toEqual({
				fileSuccess: true,
				mongoSuccess: false,
				filePath: '/path/to/replay.json',
				error: 'MongoDB unavailable',
			});
		});

		test('should return error when no replay data found', async () => {
			mockRecorder.getReplayData.mockReturnValue(undefined);

			const result = await replayManager.saveReplay(gameId);

			expect(result).toEqual({
				fileSuccess: false,
				mongoSuccess: false,
				error: 'No replay data found',
			});
		});

		test('should delegate file loading to storage', () => {
			const replayData = createMockReplayData();
			mockStorage.loadReplayFromFile.mockReturnValue(replayData);

			const result = replayManager.loadReplayFromFile('/path/to/replay.json');

			expect(mockStorage.loadReplayFromFile).toHaveBeenCalledWith(
				'/path/to/replay.json',
			);
			expect(result).toBe(replayData);
		});

		test('should delegate MongoDB loading to storage', async () => {
			const mongoReplay = { gameId, events: [], metadata: {} };
			mockStorage.loadReplayFromMongo.mockResolvedValue(mongoReplay);

			const result = await replayManager.loadReplayFromMongo(gameId);

			expect(mockStorage.loadReplayFromMongo).toHaveBeenCalledWith(gameId);
			expect(result).toBe(mongoReplay);
		});

		test('should delegate listing available replays to storage', () => {
			const replays = ['replay1.json', 'replay2.json'];
			mockStorage.listAvailableReplays.mockReturnValue(replays);

			const result = replayManager.listAvailableReplays();

			expect(mockStorage.listAvailableReplays).toHaveBeenCalled();
			expect(result).toBe(replays);
		});

		test('should delegate listing recent replays to storage', async () => {
			const replays: ReplayData[] = [];
			mockStorage.listRecentReplays.mockResolvedValue(replays);

			const result = await replayManager.listRecentReplays(25);

			expect(mockStorage.listRecentReplays).toHaveBeenCalledWith(25);
			expect(result).toBe(replays);
		});

		test('should use default limit for recent replays', async () => {
			const replays: ReplayData[] = [];
			mockStorage.listRecentReplays.mockResolvedValue(replays);

			await replayManager.listRecentReplays();

			expect(mockStorage.listRecentReplays).toHaveBeenCalledWith(50);
		});
	});

	describe('Analysis Integration', () => {
		test('should delegate analysis to analyzer', () => {
			const replayData = createMockReplayData();
			const mockAnalysis = {
				handAnalysis: [],
				playerStatistics: {},
				gameFlow: {
					totalDuration: 60000,
					actionDistribution: {},
					phaseDistribution: {
						[GamePhase.PreFlop]: 10,
						[GamePhase.Flop]: 5,
						[GamePhase.Turn]: 3,
						[GamePhase.River]: 2,
						[GamePhase.Showdown]: 1,
						[GamePhase.HandComplete]: 1,
					},
					potSizeProgression: [],
					avgHandDuration: 30000,
				},
				interestingMoments: [],
			};
			mockAnalyzer.analyzeReplay.mockReturnValue(mockAnalysis);

			const result = replayManager.analyzeReplay(replayData);

			expect(mockAnalyzer.analyzeReplay).toHaveBeenCalledWith(replayData);
			expect(result).toBe(mockAnalysis);
		});

		test('should analyze recorded game with recorder data', () => {
			const gameId = 'test-game-123';
			const replayData = createMockReplayData();
			const mockAnalysis = {
				handAnalysis: [],
				playerStatistics: {},
				gameFlow: {
					totalDuration: 60000,
					actionDistribution: {},
					phaseDistribution: {
						[GamePhase.PreFlop]: 10,
						[GamePhase.Flop]: 5,
						[GamePhase.Turn]: 3,
						[GamePhase.River]: 2,
						[GamePhase.Showdown]: 1,
						[GamePhase.HandComplete]: 1,
					},
					potSizeProgression: [],
					avgHandDuration: 30000,
				},
				interestingMoments: [],
			};
			mockRecorder.getReplayData.mockReturnValue(replayData);
			mockAnalyzer.analyzeReplay.mockReturnValue(mockAnalysis);

			const result = replayManager.analyzeRecordedGame(gameId);

			expect(mockRecorder.getReplayData).toHaveBeenCalledWith(gameId);
			expect(mockAnalyzer.analyzeReplay).toHaveBeenCalledWith(replayData);
			expect(result).toBe(mockAnalysis);
		});

		test('should return null when analyzing non-existent recorded game', () => {
			const gameId = 'non-existent';
			mockRecorder.getReplayData.mockReturnValue(undefined);

			const result = replayManager.analyzeRecordedGame(gameId);

			expect(result).toBeNull();
		});

		test('should delegate player comparison to analyzer', () => {
			const replayData = createMockReplayData();
			const mockComparison = {
				player1: {
					playerId: 'player1',
					name: 'Player 1',
					handsPlayed: 1,
					actionsCount: 5,
					avgDecisionTime: 3000,
					aggression: 0.4,
					tightness: 0.2,
					winRate: 0.6,
					chipStackProgression: [],
				},
				player2: {
					playerId: 'player2',
					name: 'Player 2',
					handsPlayed: 1,
					actionsCount: 3,
					avgDecisionTime: 5000,
					aggression: 0.2,
					tightness: 0.4,
					winRate: 0.4,
					chipStackProgression: [],
				},
				comparison: {
					moreAggressive: 'player1',
					fasterDecisions: 'player1',
					moreActive: 'player1',
				},
			};
			mockAnalyzer.comparePlayerStats.mockReturnValue(mockComparison);

			const result = replayManager.comparePlayerStats(
				replayData,
				'player1',
				'player2',
			);

			expect(mockAnalyzer.comparePlayerStats).toHaveBeenCalledWith(
				replayData,
				'player1',
				'player2',
			);
			expect(result).toBe(mockComparison);
		});

		test('should delegate summary stats to analyzer', () => {
			const replayData = createMockReplayData();
			const mockSummary = {
				totalHands: 5,
				totalActions: 20,
				avgPotSize: 150,
				longestHand: 45000,
				shortestHand: 15000,
				mostActivePlayer: 'Player 1',
			};
			mockAnalyzer.getSummaryStats.mockReturnValue(mockSummary);

			const result = replayManager.getSummaryStats(replayData);

			expect(mockAnalyzer.getSummaryStats).toHaveBeenCalledWith(replayData);
			expect(result).toBe(mockSummary);
		});
	});

	describe('Recorder Access Methods', () => {
		const gameId = 'test-game-123';

		test('should delegate getReplayData to recorder', () => {
			const replayData = createMockReplayData();
			mockRecorder.getReplayData.mockReturnValue(replayData);

			const result = replayManager.getReplayData(gameId);

			expect(mockRecorder.getReplayData).toHaveBeenCalledWith(gameId);
			expect(result).toBe(replayData);
		});

		test('should delegate isRecording to recorder', () => {
			mockRecorder.isRecording.mockReturnValue(true);

			const result = replayManager.isRecording(gameId);

			expect(mockRecorder.isRecording).toHaveBeenCalledWith(gameId);
			expect(result).toBe(true);
		});

		test('should delegate getActiveRecordings to recorder', () => {
			const activeGames = ['game1', 'game2'];
			mockRecorder.getActiveRecordings.mockReturnValue(activeGames);

			const result = replayManager.getActiveRecordings();

			expect(mockRecorder.getActiveRecordings).toHaveBeenCalled();
			expect(result).toBe(activeGames);
		});

		test('should delegate getCompletedRecordings to recorder', () => {
			const completedGames = ['game3', 'game4'];
			mockRecorder.getCompletedRecordings.mockReturnValue(completedGames);

			const result = replayManager.getCompletedRecordings();

			expect(mockRecorder.getCompletedRecordings).toHaveBeenCalled();
			expect(result).toBe(completedGames);
		});

		test('should delegate removeRecording to recorder', () => {
			mockRecorder.removeRecording.mockReturnValue(true);

			const result = replayManager.removeRecording(gameId);

			expect(mockRecorder.removeRecording).toHaveBeenCalledWith(gameId);
			expect(result).toBe(true);
		});

		test('should delegate getMemoryStats to recorder', () => {
			const memoryStats = {
				totalRecordings: 5,
				activeRecordings: 2,
				completedRecordings: 3,
			};
			mockRecorder.getMemoryStats.mockReturnValue(memoryStats);

			const result = replayManager.getMemoryStats();

			expect(mockRecorder.getMemoryStats).toHaveBeenCalled();
			expect(result).toBe(memoryStats);
		});
	});

	describe('Storage Utility Methods', () => {
		test('should delegate storage statistics to storage', async () => {
			const storageStats = {
				fileCount: 5,
				totalSize: 1024 * 1024,
				mongoConnected: true,
			};
			mockStorage.getStorageStatistics.mockResolvedValue(storageStats);

			const result = await replayManager.getStorageStatistics();

			expect(mockStorage.getStorageStatistics).toHaveBeenCalled();
			expect(result).toBe(storageStats);
		});

		test('should delegate replay deletion to storage', async () => {
			const deleteResult = {
				fileDeleted: true,
				mongoDeleted: false,
				error: 'MongoDB unavailable',
			};
			mockStorage.deleteReplay.mockResolvedValue(deleteResult);

			const result = await replayManager.deleteReplay('test-game-123');

			expect(mockStorage.deleteReplay).toHaveBeenCalledWith('test-game-123');
			expect(result).toBe(deleteResult);
		});

		test('should export replay in JSON format', () => {
			const gameId = 'test-game-123';
			const replayData = createMockReplayData();
			const exportedData = JSON.stringify(replayData);
			mockRecorder.getReplayData.mockReturnValue(replayData);
			mockStorage.exportReplay.mockReturnValue(exportedData);

			const result = replayManager.exportReplay(gameId, 'json');

			expect(mockRecorder.getReplayData).toHaveBeenCalledWith(gameId);
			expect(mockStorage.exportReplay).toHaveBeenCalledWith(replayData, 'json');
			expect(result).toBe(exportedData);
		});

		test('should export replay in compressed format', () => {
			const gameId = 'test-game-123';
			const replayData = createMockReplayData();
			const compressedData = Buffer.from('compressed data');
			mockRecorder.getReplayData.mockReturnValue(replayData);
			mockStorage.exportReplay.mockReturnValue(compressedData);

			const result = replayManager.exportReplay(gameId, 'compressed');

			expect(mockRecorder.getReplayData).toHaveBeenCalledWith(gameId);
			expect(mockStorage.exportReplay).toHaveBeenCalledWith(
				replayData,
				'compressed',
			);
			expect(result).toBe(compressedData);
		});

		test('should use default JSON format for export', () => {
			const gameId = 'test-game-123';
			const replayData = createMockReplayData();
			const exportedData = JSON.stringify(replayData);
			mockRecorder.getReplayData.mockReturnValue(replayData);
			mockStorage.exportReplay.mockReturnValue(exportedData);

			const result = replayManager.exportReplay(gameId);

			expect(mockStorage.exportReplay).toHaveBeenCalledWith(replayData, 'json');
			expect(result).toBe(exportedData);
		});

		test('should return undefined when exporting non-existent replay', () => {
			const gameId = 'non-existent';
			mockRecorder.getReplayData.mockReturnValue(undefined);

			const result = replayManager.exportReplay(gameId);

			expect(result).toBeUndefined();
		});

		test('should delegate MongoDB availability check to storage', () => {
			mockStorage.isMongoAvailable.mockReturnValue(true);

			const result = replayManager.isMongoAvailable();

			expect(mockStorage.isMongoAvailable).toHaveBeenCalled();
			expect(result).toBe(true);
		});

		test('should delegate health check to storage', async () => {
			const healthStatus = { file: true, mongo: true };
			mockStorage.healthCheck.mockResolvedValue(healthStatus);

			const result = await replayManager.healthCheck();

			expect(mockStorage.healthCheck).toHaveBeenCalled();
			expect(result).toBe(healthStatus);
		});
	});

	describe('Error Handling', () => {
		test('should handle storage errors in health check', async () => {
			mockStorage.healthCheck.mockRejectedValue(new Error('Storage error'));

			// Should still resolve, not throw
			await expect(replayManager.healthCheck()).rejects.toThrow(
				'Storage error',
			);
		});

		test('should handle errors in storage statistics', async () => {
			mockStorage.getStorageStatistics.mockRejectedValue(
				new Error('Connection error'),
			);

			await expect(replayManager.getStorageStatistics()).rejects.toThrow(
				'Connection error',
			);
		});

		test('should handle errors in deletion', async () => {
			mockStorage.deleteReplay.mockRejectedValue(new Error('Delete failed'));

			await expect(replayManager.deleteReplay('test-game')).rejects.toThrow(
				'Delete failed',
			);
		});
	});

	describe('Integration Workflows', () => {
		test('should handle complete recording workflow', async () => {
			const gameId = 'workflow-test';
			const gameConfig = createMockGameConfig();
			const gameState = createMockGameState();
			const playerNames = new Map([['player1', 'Player 1']]);
			const replayData = createMockReplayData();

			// Setup mocks for workflow
			mockRecorder.getReplayData.mockReturnValue(replayData);
			mockStorage.saveReplay.mockResolvedValue({
				fileSuccess: true,
				mongoSuccess: true,
				filePath: '/path/to/replay.json',
			});

			// Complete workflow
			replayManager.startRecording(gameId, gameConfig, gameState, playerNames);

			const event = {
				type: 'hand_started',
				timestamp: Date.now(),
				handNumber: 1,
				phase: GamePhase.PreFlop,
			};
			replayManager.recordEvent(gameId, event);

			await replayManager.endRecording(gameId, gameState);

			// Verify complete workflow
			expect(mockRecorder.startRecording).toHaveBeenCalled();
			expect(mockRecorder.recordEvent).toHaveBeenCalled();
			expect(mockRecorder.endRecording).toHaveBeenCalled();
			expect(mockStorage.saveReplay).toHaveBeenCalled();
		});

		test('should handle analysis workflow', () => {
			const gameId = 'analysis-test';
			const replayData = createMockReplayData();
			const mockAnalysis = {
				handAnalysis: [
					{
						handNumber: 1,
						duration: 30000,
						totalActions: 5,
						potSize: 150,
						players: ['player1'],
						keyDecisions: [],
						unusual: false,
					},
				],
				playerStatistics: {
					player1: {
						playerId: 'player1',
						name: 'Player 1',
						handsPlayed: 1,
						actionsCount: 5,
						avgDecisionTime: 3000,
						aggression: 0.4,
						tightness: 0.2,
						winRate: 0.6,
						chipStackProgression: [],
					},
				},
				gameFlow: {
					totalDuration: 60000,
					actionDistribution: { call: 2, raise: 1 },
					phaseDistribution: {
						[GamePhase.PreFlop]: 10,
						[GamePhase.Flop]: 5,
						[GamePhase.Turn]: 3,
						[GamePhase.River]: 2,
						[GamePhase.Showdown]: 1,
						[GamePhase.HandComplete]: 1,
					},
					potSizeProgression: [],
					avgHandDuration: 30000,
				},
				interestingMoments: [],
			};

			mockRecorder.getReplayData.mockReturnValue(replayData);
			mockAnalyzer.analyzeReplay.mockReturnValue(mockAnalysis);

			const analysis = replayManager.analyzeRecordedGame(gameId);

			expect(analysis).toBe(mockAnalysis);
			expect(mockRecorder.getReplayData).toHaveBeenCalledWith(gameId);
			expect(mockAnalyzer.analyzeReplay).toHaveBeenCalledWith(replayData);
		});
	});
});
