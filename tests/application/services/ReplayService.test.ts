import fs from 'fs/promises';

import { ReplayService } from '@/services/replay/ReplayService';
import { DatabaseConnection } from '@/services/storage/database';
import { IGameEvent, IReplay } from '@/services/storage/models/Replay';
import { ReplayRepository } from '@/services/storage/repositories/ReplayRepository';
import { GamePhase } from '@/types';

jest.mock('@/services/storage/database');
jest.mock('@/services/storage/repositories/ReplayRepository');
jest.mock('fs/promises');

describe('ReplayService', () => {
	let replayService: ReplayService;
	let mockReplayRepository: jest.Mocked<ReplayRepository>;
	let mockDatabaseConnection: jest.Mocked<DatabaseConnection>;

	const mockGameId = 'test-game-123';
	const mockMetadata = {
		gameId: mockGameId,
		gameType: 'cash' as const,
		maxPlayers: 6,
		actualPlayers: 2,
		smallBlindAmount: 10,
		bigBlindAmount: 20,
		turnTimeLimit: 30,
		gameStartTime: Date.now(),
		gameEndTime: Date.now() + 3600000,
		gameDuration: 3600000,
		totalHands: 10,
		totalActions: 30,
		playerNames: { player1: 'Alice', player2: 'Bob' },
		winners: ['player1'],
	};

	const mockEvents: IGameEvent[] = [
		{
			type: 'hand_started',
			timestamp: Date.now(),
			handNumber: 1,
			phase: GamePhase.PreFlop,
			data: { players: ['player1', 'player2'] },
		},
		{
			type: 'action_taken',
			timestamp: Date.now() + 1000,
			handNumber: 1,
			playerId: 'player1',
			phase: GamePhase.PreFlop,
			data: {
				action: { type: 'call', amount: 20 },
				potSize: 40,
			},
		},
		{
			type: 'hand_complete',
			timestamp: Date.now() + 2000,
			handNumber: 1,
			phase: GamePhase.Showdown,
			data: {
				winners: [{ playerId: 'player1', amount: 40 }],
				potSize: 40,
				communityCards: [],
			},
		},
	];

	const mockReplay: Partial<IReplay> = {
		gameId: mockGameId,
		metadata: mockMetadata,
		events: mockEvents,
		handSummaries: [],
		analytics: {
			totalEvents: 3,
			avgHandDuration: 2000,
			actionDistribution: { call: 1 },
			phaseDistribution: { [GamePhase.PreFlop]: 2, [GamePhase.Showdown]: 1 },
			playerPerformance: {},
			gameFlow: {
				peakPotSize: 40,
				longestHand: 2000,
				shortestHand: 2000,
				mostActivePlayer: 'player1',
			},
		},
		version: '1.0.0',
		createdAt: new Date(),
		updatedAt: new Date(),
		toObject: jest.fn().mockReturnValue({
			gameId: mockGameId,
			metadata: mockMetadata,
			events: mockEvents,
			version: '1.0.0',
		}),
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockReplayRepository = {
			create: jest.fn(),
			findByGameId: jest.fn(),
			findAll: jest.fn(),
			getRecentReplays: jest.fn(),
			addEvents: jest.fn(),
			updateAnalytics: jest.fn(),
			getEventsByGameId: jest.fn(),
			delete: jest.fn(),
			getStorageStats: jest.fn(),
		} as any;

		mockDatabaseConnection = {
			connect: jest.fn().mockResolvedValue(undefined),
			disconnect: jest.fn().mockResolvedValue(undefined),
			healthCheck: jest.fn().mockResolvedValue(true),
			isConnectionReady: jest.fn().mockReturnValue(true),
		} as any;

		(DatabaseConnection.getInstance as jest.Mock).mockReturnValue(
			mockDatabaseConnection,
		);
		(ReplayRepository as jest.Mock).mockImplementation(
			() => mockReplayRepository,
		);

		replayService = new ReplayService();
	});

	describe('initialize', () => {
		it('should initialize database connection successfully', async () => {
			await replayService.initialize();

			expect(DatabaseConnection.getInstance).toHaveBeenCalled();
			expect(mockDatabaseConnection.connect).toHaveBeenCalled();
		});

		it('should not reinitialize if already connected', async () => {
			await replayService.initialize();
			await replayService.initialize();

			expect(mockDatabaseConnection.connect).toHaveBeenCalledTimes(1);
		});

		it('should throw error if database connection fails', async () => {
			mockDatabaseConnection.connect.mockRejectedValueOnce(
				new Error('Connection failed'),
			);

			await expect(replayService.initialize()).rejects.toThrow(
				'Failed to initialize ReplayService: Connection failed',
			);
		});
	});

	describe('createReplay', () => {
		it('should create a new replay successfully', async () => {
			mockReplayRepository.create.mockResolvedValueOnce(mockReplay as IReplay);

			const result = await replayService.createReplay({
				gameId: mockGameId,
				metadata: mockMetadata,
				events: mockEvents,
			});

			const createCall = mockReplayRepository.create.mock.calls[0][0];
			expect(createCall.gameId).toBe(mockGameId);
			expect(createCall.metadata).toEqual(mockMetadata);
			expect(createCall.events).toEqual(mockEvents);
			expect(createCall.version).toBe('1.0.0');

			// Check analytics were generated
			expect(createCall.analytics).toBeDefined();
			expect(createCall.analytics?.totalEvents).toBe(3);
			expect(result).toEqual(mockReplay);
		});

		it('should create replay with empty events if none provided', async () => {
			mockReplayRepository.create.mockResolvedValueOnce(mockReplay as IReplay);

			await replayService.createReplay({
				gameId: mockGameId,
				metadata: mockMetadata,
			});

			expect(mockReplayRepository.create).toHaveBeenCalledWith(
				expect.objectContaining({
					events: [],
					analytics: expect.objectContaining({
						totalEvents: 0,
					}),
				}),
			);
		});

		it('should handle creation errors', async () => {
			mockReplayRepository.create.mockRejectedValueOnce(
				new Error('Database error'),
			);

			await expect(
				replayService.createReplay({
					gameId: mockGameId,
					metadata: mockMetadata,
				}),
			).rejects.toThrow('Database error');
		});
	});

	describe('getReplay', () => {
		it('should retrieve replay by gameId', async () => {
			mockReplayRepository.findByGameId.mockResolvedValueOnce(
				mockReplay as IReplay,
			);

			const result = await replayService.getReplay(mockGameId);

			expect(mockReplayRepository.findByGameId).toHaveBeenCalledWith(
				mockGameId,
			);
			expect(result).toEqual(mockReplay);
		});

		it('should return null if replay not found', async () => {
			mockReplayRepository.findByGameId.mockResolvedValueOnce(null);

			const result = await replayService.getReplay(mockGameId);

			expect(result).toBeNull();
		});
	});

	describe('getReplayList', () => {
		it('should retrieve replay list with filters', async () => {
			const mockList = [
				{
					id: 'replay1',
					gameId: 'game1',
					gameType: 'cash' as const,
					actualPlayers: 2,
					gameDuration: 3600000,
					totalHands: 10,
					createdAt: new Date(),
					fileSizeMB: '1.5',
				},
				{
					id: 'replay2',
					gameId: 'game2',
					gameType: 'cash' as const,
					actualPlayers: 3,
					gameDuration: 7200000,
					totalHands: 20,
					createdAt: new Date(),
					fileSizeMB: '2.1',
				},
			];
			mockReplayRepository.findAll.mockResolvedValueOnce(mockList);

			const filters = { dateFrom: new Date(), dateTo: new Date() };
			const result = await replayService.getReplayList(filters);

			expect(mockReplayRepository.findAll).toHaveBeenCalledWith(filters);
			expect(result).toEqual(mockList);
		});

		it('should retrieve replay list without filters', async () => {
			const mockList = [
				{
					id: 'replay1',
					gameId: 'game1',
					gameType: 'cash' as const,
					actualPlayers: 2,
					gameDuration: 3600000,
					totalHands: 10,
					createdAt: new Date(),
					fileSizeMB: '1.5',
				},
			];
			mockReplayRepository.findAll.mockResolvedValueOnce(mockList);

			const result = await replayService.getReplayList();

			expect(mockReplayRepository.findAll).toHaveBeenCalledWith({});
			expect(result).toEqual(mockList);
		});
	});

	describe('getRecentReplays', () => {
		it('should retrieve recent replays with default limit', async () => {
			const mockList = Array(10).fill({
				gameId: 'game',
				startTime: new Date(),
			});
			mockReplayRepository.getRecentReplays.mockResolvedValueOnce(mockList);

			const result = await replayService.getRecentReplays();

			expect(mockReplayRepository.getRecentReplays).toHaveBeenCalledWith(10);
			expect(result).toEqual(mockList);
		});

		it('should retrieve recent replays with custom limit', async () => {
			const mockList = Array(5).fill({ gameId: 'game', startTime: new Date() });
			mockReplayRepository.getRecentReplays.mockResolvedValueOnce(mockList);

			const result = await replayService.getRecentReplays(5);

			expect(mockReplayRepository.getRecentReplays).toHaveBeenCalledWith(5);
			expect(result).toEqual(mockList);
		});
	});

	describe('addEvents', () => {
		it('should add events and update analytics', async () => {
			const newEvents: IGameEvent[] = [
				{
					type: 'action_taken',
					timestamp: Date.now(),
					handNumber: 2,
					playerId: 'player2',
					phase: GamePhase.Flop,
					data: { action: { type: 'raise', amount: 40 } },
				},
			];

			mockReplayRepository.findByGameId
				.mockResolvedValueOnce(mockReplay as IReplay)
				.mockResolvedValueOnce({
					...mockReplay,
					events: [...mockEvents, ...newEvents],
				} as IReplay);

			await replayService.addEvents(mockGameId, newEvents);

			expect(mockReplayRepository.addEvents).toHaveBeenCalledWith(
				mockGameId,
				newEvents,
			);
			expect(mockReplayRepository.updateAnalytics).toHaveBeenCalledWith(
				mockGameId,
				expect.objectContaining({
					totalEvents: 4,
					actionDistribution: expect.objectContaining({
						call: 1,
						raise: 1,
					}),
				}),
			);
		});

		it('should throw error if replay not found', async () => {
			mockReplayRepository.findByGameId.mockResolvedValueOnce(null);

			await expect(replayService.addEvents(mockGameId, [])).rejects.toThrow(
				`Replay not found for game ${mockGameId}`,
			);
		});

		it('should handle errors during event addition', async () => {
			mockReplayRepository.findByGameId.mockResolvedValueOnce(
				mockReplay as IReplay,
			);
			mockReplayRepository.addEvents.mockRejectedValueOnce(
				new Error('Database error'),
			);

			await expect(replayService.addEvents(mockGameId, [])).rejects.toThrow(
				'Database error',
			);
		});
	});

	describe('getAnalysis', () => {
		it('should generate detailed analysis for a replay', async () => {
			const mockReplayWithHands = {
				...mockReplay,
				events: [
					...mockEvents,
					{
						type: 'hand_started',
						timestamp: 1000000,
						handNumber: 2,
						phase: GamePhase.PreFlop,
						data: {},
					},
					{
						type: 'hand_complete',
						timestamp: 1065000, // Long hand (65 seconds)
						handNumber: 2,
						phase: GamePhase.Showdown,
						data: {
							winners: [{ playerId: 'player2', amount: 2000 }], // Big pot
							potSize: 2000,
							communityCards: [],
						},
					},
				],
			};
			mockReplayRepository.findByGameId.mockResolvedValueOnce(
				mockReplayWithHands as IReplay,
			);

			const result = await replayService.getAnalysis(mockGameId);

			expect(result).toBeDefined();
			expect(result?.handAnalysis).toHaveLength(2);
			expect(result?.interestingMoments).toHaveLength(2); // Long hand + big pot
			expect(result?.playerStatistics).toHaveProperty('player1');
			expect(result?.playerStatistics).toHaveProperty('player2');
			expect(result?.gameFlow.avgHandDuration).toBe(2000);
		});

		it('should return null if replay not found', async () => {
			mockReplayRepository.findByGameId.mockResolvedValueOnce(null);

			const result = await replayService.getAnalysis(mockGameId);

			expect(result).toBeNull();
		});

		it('should handle analysis errors', async () => {
			mockReplayRepository.findByGameId.mockRejectedValueOnce(
				new Error('Database error'),
			);

			await expect(replayService.getAnalysis(mockGameId)).rejects.toThrow(
				'Database error',
			);
		});
	});

	describe('getHandReplay', () => {
		it('should retrieve specific hand replay', async () => {
			const handEvents = mockEvents.filter((e) => e.handNumber === 1);
			mockReplayRepository.getEventsByGameId.mockResolvedValueOnce(handEvents);

			const result = await replayService.getHandReplay(mockGameId, 1);

			expect(mockReplayRepository.getEventsByGameId).toHaveBeenCalledWith(
				mockGameId,
				{ handNumber: 1 },
			);
			expect(result).toEqual({
				handNumber: 1,
				events: handEvents,
				playersInvolved: ['player1'],
				communityCards: [],
				potSize: 40,
				winner: 'player1',
			});
		});

		it('should return null if hand not found', async () => {
			mockReplayRepository.getEventsByGameId.mockResolvedValueOnce([]);

			const result = await replayService.getHandReplay(mockGameId, 99);

			expect(result).toBeNull();
		});

		it('should handle events without hand_complete', async () => {
			const incompleteEvents = mockEvents.filter(
				(e) => e.type !== 'hand_complete',
			);
			mockReplayRepository.getEventsByGameId.mockResolvedValueOnce(
				incompleteEvents,
			);

			const result = await replayService.getHandReplay(mockGameId, 1);

			expect(result).toEqual({
				handNumber: 1,
				events: incompleteEvents,
				playersInvolved: ['player1'],
				communityCards: [],
				potSize: 0,
				winner: undefined,
			});
		});
	});

	describe('saveReplayToFile', () => {
		beforeEach(() => {
			(fs.access as jest.Mock).mockRejectedValue(new Error('Not found'));
			(fs.mkdir as jest.Mock).mockResolvedValue(undefined);
			(fs.writeFile as jest.Mock).mockResolvedValue(undefined);
		});

		it('should save replay to file successfully', async () => {
			mockReplayRepository.findByGameId.mockResolvedValueOnce(
				mockReplay as IReplay,
			);

			const result = await replayService.saveReplayToFile(mockGameId);

			expect(result.success).toBe(true);
			expect(result.filePath).toMatch(/replays\/test-game-123_.*\.json$/);
			expect(fs.mkdir).toHaveBeenCalledWith(
				expect.stringContaining('replays'),
				{ recursive: true },
			);
			expect(fs.writeFile).toHaveBeenCalledWith(
				expect.any(String),
				expect.stringContaining(mockGameId),
			);
		});

		it('should handle existing replays directory', async () => {
			(fs.access as jest.Mock).mockResolvedValueOnce(undefined);
			mockReplayRepository.findByGameId.mockResolvedValueOnce(
				mockReplay as IReplay,
			);

			const result = await replayService.saveReplayToFile(mockGameId);

			expect(result.success).toBe(true);
			expect(fs.mkdir).not.toHaveBeenCalled();
		});

		it('should return error if replay not found', async () => {
			mockReplayRepository.findByGameId.mockResolvedValueOnce(null);

			const result = await replayService.saveReplayToFile(mockGameId);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Replay not found');
		});

		it('should handle file write errors', async () => {
			mockReplayRepository.findByGameId.mockResolvedValueOnce(
				mockReplay as IReplay,
			);
			(fs.writeFile as jest.Mock).mockRejectedValueOnce(
				new Error('Write failed'),
			);

			const result = await replayService.saveReplayToFile(mockGameId);

			expect(result.success).toBe(false);
			expect(result.error).toBe('Write failed');
		});
	});

	describe('deleteReplay', () => {
		it('should delete replay successfully', async () => {
			mockReplayRepository.delete.mockResolvedValueOnce(true);

			const result = await replayService.deleteReplay(mockGameId);

			expect(mockReplayRepository.delete).toHaveBeenCalledWith(mockGameId);
			expect(result).toBe(true);
		});

		it('should return false if replay not found', async () => {
			mockReplayRepository.delete.mockResolvedValueOnce(false);

			const result = await replayService.deleteReplay(mockGameId);

			expect(result).toBe(false);
		});
	});

	describe('getStorageStatistics', () => {
		it('should retrieve storage statistics', async () => {
			const mockStats = {
				totalReplays: 100,
				totalSizeBytes: 1048576,
				totalSizeMB: '1.00',
				avgSizePerReplayMB: '0.01',
				oldestReplay: new Date('2023-01-01'),
				newestReplay: new Date('2023-12-31'),
			};
			mockReplayRepository.getStorageStats.mockResolvedValueOnce(mockStats);

			const result = await replayService.getStorageStatistics();

			expect(mockReplayRepository.getStorageStats).toHaveBeenCalled();
			expect(result).toEqual(mockStats);
		});
	});

	describe('healthCheck', () => {
		it('should return true when database is healthy', async () => {
			await replayService.initialize();
			const result = await replayService.healthCheck();

			expect(mockDatabaseConnection.healthCheck).toHaveBeenCalled();
			expect(result).toBe(true);
		});

		it('should return false when database is not initialized', async () => {
			const result = await replayService.healthCheck();

			expect(result).toBe(false);
		});

		it('should return false when health check fails', async () => {
			await replayService.initialize();
			mockDatabaseConnection.healthCheck.mockRejectedValueOnce(
				new Error('Health check failed'),
			);

			const result = await replayService.healthCheck();

			expect(result).toBe(false);
		});
	});

	describe('generateAnalytics', () => {
		it('should generate comprehensive analytics from events', async () => {
			const complexEvents: IGameEvent[] = [
				{
					type: 'hand_started',
					timestamp: 1000,
					handNumber: 1,
					phase: GamePhase.PreFlop,
					data: {},
				},
				{
					type: 'action_taken',
					timestamp: 2000,
					handNumber: 1,
					playerId: 'player1',
					phase: GamePhase.PreFlop,
					data: { action: { type: 'raise', amount: 40 }, potSize: 60 },
				},
				{
					type: 'action_taken',
					timestamp: 3000,
					handNumber: 1,
					playerId: 'player2',
					phase: GamePhase.PreFlop,
					data: { action: { type: 'call', amount: 40 }, potSize: 100 },
				},
				{
					type: 'phase_change',
					timestamp: 4000,
					handNumber: 1,
					phase: GamePhase.Flop,
					data: {},
				},
				{
					type: 'action_taken',
					timestamp: 5000,
					handNumber: 1,
					playerId: 'player1',
					phase: GamePhase.Flop,
					data: { action: { type: 'bet', amount: 50 }, potSize: 150 },
				},
				{
					type: 'action_taken',
					timestamp: 6000,
					handNumber: 1,
					playerId: 'player2',
					phase: GamePhase.Flop,
					data: { action: { type: 'fold' }, potSize: 150 },
				},
				{
					type: 'hand_complete',
					timestamp: 7000,
					handNumber: 1,
					phase: GamePhase.Flop,
					data: { potSize: 150 },
				},
			];

			mockReplayRepository.create.mockResolvedValueOnce(mockReplay as IReplay);

			await replayService.createReplay({
				gameId: mockGameId,
				metadata: mockMetadata,
				events: complexEvents,
			});

			const createCall = mockReplayRepository.create.mock.calls[0][0];
			const analytics = createCall.analytics;

			expect(analytics?.totalEvents).toBe(7);

			// The avgHandDuration will be 0 because we need both hand_started and hand_complete
			// events with matching handNumbers to calculate duration
			expect(analytics?.avgHandDuration).toBeDefined();

			// Check the structure is correct
			expect(analytics?.actionDistribution).toBeDefined();
			expect(analytics?.phaseDistribution).toBeDefined();
			expect(analytics?.gameFlow).toBeDefined();
			expect(analytics?.playerPerformance).toBeDefined();
		});
	});
});
