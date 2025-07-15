import {
	ReplayRepository,
	ReplaySearchFilters,
} from '@/infrastructure/persistence/repositories/ReplayRepository';
import {
	Replay,
	IReplay,
	IGameEvent,
	IReplayAnalytics,
} from '@/infrastructure/persistence/models/Replay';
import { Types } from 'mongoose';

// Mock mongoose and the Replay model
jest.mock('@/infrastructure/persistence/models/Replay');

describe('ReplayRepository', () => {
	let repository: ReplayRepository;
	let mockReplay: jest.Mocked<typeof Replay>;

	beforeEach(() => {
		repository = new ReplayRepository();
		mockReplay = Replay as jest.Mocked<typeof Replay>;
		jest.clearAllMocks();
	});

	const createMockReplayData = (): Partial<IReplay> => ({
		gameId: 'test-game-123',
		metadata: {
			gameId: 'test-game-123',
			gameName: 'Test Game',
			gameType: 'cash',
			maxPlayers: 6,
			actualPlayers: 4,
			smallBlindAmount: 10,
			bigBlindAmount: 20,
			turnTimeLimit: 30,
			gameStartTime: new Date('2023-01-01T10:00:00Z').getTime(),
			gameEndTime: new Date('2023-01-01T11:30:00Z').getTime(),
			gameDuration: 5400000, // 90 minutes
			totalHands: 45,
			totalActions: 180,
			playerNames: {
				player1: 'Alice',
				player2: 'Bob',
				player3: 'Charlie',
				player4: 'David',
			},
			winners: ['player1'],
		},
		events: [],
		handSummaries: [],
		analytics: {
			totalEvents: 180,
			avgHandDuration: 120000,
			actionDistribution: { bet: 50, call: 80, fold: 50 },
			phaseDistribution: { preflop: 45, flop: 30, turn: 15, river: 10 },
			playerPerformance: {},
			gameFlow: {
				peakPotSize: 800,
				longestHand: 300000,
				shortestHand: 30000,
				mostActivePlayer: 'player1',
			},
		},
		fileSize: 1024000,
		version: '1.0.0',
		createdAt: new Date('2023-01-01T11:30:00Z'),
		updatedAt: new Date('2023-01-01T11:30:00Z'),
	});

	const createMockGameEvent = (
		overrides?: Partial<IGameEvent>,
	): IGameEvent => ({
		type: 'action',
		timestamp: Date.now(),
		data: {
			action: {
				type: 'bet',
				amount: 50,
			},
		},
		handNumber: 1,
		phase: 'preflop',
		playerId: 'player1',
		...overrides,
	});

	describe('create', () => {
		it('should create a new replay successfully', async () => {
			const replayData = createMockReplayData();
			const mockSavedReplay = { ...replayData, _id: new Types.ObjectId() };

			const mockReplayInstance = {
				save: jest.fn().mockResolvedValue(mockSavedReplay),
			};
			(mockReplay as any).mockImplementation(() => mockReplayInstance);

			const result = await repository.create(replayData);

			expect(mockReplay).toHaveBeenCalledWith(replayData);
			expect(mockReplayInstance.save).toHaveBeenCalled();
			expect(result).toEqual(mockSavedReplay);
		});

		it('should throw error when creation fails', async () => {
			const replayData = createMockReplayData();
			const mockReplayInstance = {
				save: jest.fn().mockRejectedValue(new Error('Database error')),
			};
			(mockReplay as any).mockImplementation(() => mockReplayInstance);

			await expect(repository.create(replayData)).rejects.toThrow(
				'Failed to create replay: Database error',
			);
		});
	});

	describe('findById', () => {
		it('should find replay by valid ObjectId', async () => {
			const mockId = new Types.ObjectId().toString();
			const mockReplayData = createMockReplayData();
			mockReplay.findById = jest.fn().mockResolvedValue(mockReplayData);

			const result = await repository.findById(mockId);

			expect(mockReplay.findById).toHaveBeenCalledWith(mockId);
			expect(result).toEqual(mockReplayData);
		});

		it('should return null for invalid ObjectId', async () => {
			const invalidId = 'invalid-id';

			const result = await repository.findById(invalidId);

			expect(result).toBeNull();
			expect(mockReplay.findById).not.toHaveBeenCalled();
		});

		it('should throw error when database query fails', async () => {
			const mockId = new Types.ObjectId().toString();
			mockReplay.findById = jest
				.fn()
				.mockRejectedValue(new Error('Database error'));

			await expect(repository.findById(mockId)).rejects.toThrow(
				'Failed to find replay by ID: Database error',
			);
		});
	});

	describe('findByGameId', () => {
		it('should find replay by game ID', async () => {
			const gameId = 'test-game-123';
			const mockReplayData = createMockReplayData();
			mockReplay.findOne = jest.fn().mockResolvedValue(mockReplayData);

			const result = await repository.findByGameId(gameId);

			expect(mockReplay.findOne).toHaveBeenCalledWith({ gameId });
			expect(result).toEqual(mockReplayData);
		});

		it('should return null when replay not found', async () => {
			const gameId = 'non-existent-game';
			mockReplay.findOne = jest.fn().mockResolvedValue(null);

			const result = await repository.findByGameId(gameId);

			expect(result).toBeNull();
		});

		it('should throw error when query fails', async () => {
			const gameId = 'test-game-123';
			mockReplay.findOne = jest
				.fn()
				.mockRejectedValue(new Error('Database error'));

			await expect(repository.findByGameId(gameId)).rejects.toThrow(
				'Failed to find replay by game ID: Database error',
			);
		});
	});

	describe('findAll', () => {
		const createMockQueryResult = () => [
			{
				_id: new Types.ObjectId(),
				gameId: 'game-1',
				metadata: {
					gameName: 'Game 1',
					gameType: 'cash',
					actualPlayers: 4,
					gameDuration: 3600000,
					totalHands: 30,
				},
				createdAt: new Date('2023-01-01T10:00:00Z'),
				fileSize: 1024000,
			},
			{
				_id: new Types.ObjectId(),
				gameId: 'game-2',
				metadata: {
					gameName: 'Game 2',
					gameType: 'tournament',
					actualPlayers: 6,
					gameDuration: 7200000,
					totalHands: 60,
				},
				createdAt: new Date('2023-01-01T12:00:00Z'),
				fileSize: 2048000,
			},
		];

		it('should return all replays with default filters', async () => {
			const mockResults = createMockQueryResult();
			const mockQuery = {
				select: jest.fn().mockReturnThis(),
				sort: jest.fn().mockReturnThis(),
				limit: jest.fn().mockReturnThis(),
				skip: jest.fn().mockResolvedValue(mockResults),
			};
			mockReplay.find = jest.fn().mockReturnValue(mockQuery);

			const result = await repository.findAll();

			expect(mockReplay.find).toHaveBeenCalledWith({});
			expect(mockQuery.limit).toHaveBeenCalledWith(50);
			expect(mockQuery.skip).toHaveBeenCalledWith(0);
			expect(result).toHaveLength(2);
			expect(result[0].gameId).toBe('game-1');
			expect(result[0].fileSizeMB).toBe('0.98');
		});

		it('should apply game type filter', async () => {
			const mockResults = createMockQueryResult().slice(0, 1);
			const mockQuery = {
				select: jest.fn().mockReturnThis(),
				sort: jest.fn().mockReturnThis(),
				limit: jest.fn().mockReturnThis(),
				skip: jest.fn().mockResolvedValue(mockResults),
			};
			mockReplay.find = jest.fn().mockReturnValue(mockQuery);

			const filters: ReplaySearchFilters = { gameType: 'cash' };
			await repository.findAll(filters);

			expect(mockReplay.find).toHaveBeenCalledWith({
				'metadata.gameType': 'cash',
			});
		});

		it('should apply player count filter', async () => {
			const mockResults = createMockQueryResult().slice(0, 1);
			const mockQuery = {
				select: jest.fn().mockReturnThis(),
				sort: jest.fn().mockReturnThis(),
				limit: jest.fn().mockReturnThis(),
				skip: jest.fn().mockResolvedValue(mockResults),
			};
			mockReplay.find = jest.fn().mockReturnValue(mockQuery);

			const filters: ReplaySearchFilters = { playerCount: 4 };
			await repository.findAll(filters);

			expect(mockReplay.find).toHaveBeenCalledWith({
				'metadata.actualPlayers': 4,
			});
		});

		it('should apply date range filter', async () => {
			const mockResults = createMockQueryResult();
			const mockQuery = {
				select: jest.fn().mockReturnThis(),
				sort: jest.fn().mockReturnThis(),
				limit: jest.fn().mockReturnThis(),
				skip: jest.fn().mockResolvedValue(mockResults),
			};
			mockReplay.find = jest.fn().mockReturnValue(mockQuery);

			const dateFrom = new Date('2023-01-01T00:00:00Z');
			const dateTo = new Date('2023-01-31T23:59:59Z');
			const filters: ReplaySearchFilters = { dateFrom, dateTo };

			await repository.findAll(filters);

			expect(mockReplay.find).toHaveBeenCalledWith({
				createdAt: {
					$gte: dateFrom,
					$lte: dateTo,
				},
			});
		});

		it('should apply pagination', async () => {
			const mockResults = createMockQueryResult();
			const mockQuery = {
				select: jest.fn().mockReturnThis(),
				sort: jest.fn().mockReturnThis(),
				limit: jest.fn().mockReturnThis(),
				skip: jest.fn().mockResolvedValue(mockResults),
			};
			mockReplay.find = jest.fn().mockReturnValue(mockQuery);

			const filters: ReplaySearchFilters = { limit: 10, offset: 20 };
			await repository.findAll(filters);

			expect(mockQuery.limit).toHaveBeenCalledWith(10);
			expect(mockQuery.skip).toHaveBeenCalledWith(20);
		});

		it('should throw error when query fails', async () => {
			const mockQuery = {
				select: jest.fn().mockReturnThis(),
				sort: jest.fn().mockReturnThis(),
				limit: jest.fn().mockReturnThis(),
				skip: jest.fn().mockRejectedValue(new Error('Database error')),
			};
			mockReplay.find = jest.fn().mockReturnValue(mockQuery);

			await expect(repository.findAll()).rejects.toThrow(
				'Failed to find replays: Database error',
			);
		});
	});

	describe('getEventsByGameId', () => {
		it('should return events for a game', async () => {
			const gameId = 'test-game-123';
			const mockEvents = [
				createMockGameEvent({ handNumber: 1 }),
				createMockGameEvent({ handNumber: 1 }),
				createMockGameEvent({ handNumber: 2 }),
			];
			const mockReplay = { events: mockEvents };

			const mockQuery = {
				select: jest.fn().mockResolvedValue(mockReplay),
			};
			(Replay.findOne as jest.Mock).mockReturnValue(mockQuery);

			const result = await repository.getEventsByGameId(gameId);

			expect(Replay.findOne).toHaveBeenCalledWith({ gameId });
			expect(mockQuery.select).toHaveBeenCalledWith('events');
			expect(result).toHaveLength(3);
			expect(result[0].type).toBe('action');
		});

		it('should filter events by hand number', async () => {
			const gameId = 'test-game-123';
			const mockEvents = [
				createMockGameEvent({ handNumber: 1 }),
				createMockGameEvent({ handNumber: 1 }),
				createMockGameEvent({ handNumber: 2 }),
			];
			const mockReplay = { events: mockEvents };

			const mockQuery = {
				select: jest.fn().mockResolvedValue(mockReplay),
			};
			(Replay.findOne as jest.Mock).mockReturnValue(mockQuery);

			const result = await repository.getEventsByGameId(gameId, {
				handNumber: 1,
			});

			expect(result).toHaveLength(2);
			expect(result.every((event) => event.handNumber === 1)).toBe(true);
		});

		it('should return empty array when replay not found', async () => {
			const gameId = 'non-existent-game';
			const mockQuery = {
				select: jest.fn().mockResolvedValue(null),
			};
			(Replay.findOne as jest.Mock).mockReturnValue(mockQuery);

			const result = await repository.getEventsByGameId(gameId);

			expect(result).toEqual([]);
		});
	});

	describe('exists', () => {
		it('should return true when replay exists', async () => {
			const gameId = 'test-game-123';
			mockReplay.countDocuments = jest.fn().mockResolvedValue(1);

			const result = await repository.exists(gameId);

			expect(mockReplay.countDocuments).toHaveBeenCalledWith({ gameId });
			expect(result).toBe(true);
		});

		it('should return false when replay does not exist', async () => {
			const gameId = 'non-existent-game';
			mockReplay.countDocuments = jest.fn().mockResolvedValue(0);

			const result = await repository.exists(gameId);

			expect(result).toBe(false);
		});

		it('should throw error when query fails', async () => {
			const gameId = 'test-game-123';
			mockReplay.countDocuments = jest
				.fn()
				.mockRejectedValue(new Error('Database error'));

			await expect(repository.exists(gameId)).rejects.toThrow(
				'Failed to check if replay exists: Database error',
			);
		});
	});

	describe('delete', () => {
		it('should delete replay successfully', async () => {
			const gameId = 'test-game-123';
			mockReplay.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });

			const result = await repository.delete(gameId);

			expect(mockReplay.deleteOne).toHaveBeenCalledWith({ gameId });
			expect(result).toBe(true);
		});

		it('should return false when no replay is deleted', async () => {
			const gameId = 'non-existent-game';
			mockReplay.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 0 });

			const result = await repository.delete(gameId);

			expect(result).toBe(false);
		});

		it('should throw error when deletion fails', async () => {
			const gameId = 'test-game-123';
			mockReplay.deleteOne = jest
				.fn()
				.mockRejectedValue(new Error('Database error'));

			await expect(repository.delete(gameId)).rejects.toThrow(
				'Failed to delete replay: Database error',
			);
		});
	});

	describe('updateAnalytics', () => {
		it('should update analytics successfully', async () => {
			const gameId = 'test-game-123';
			const analytics: IReplayAnalytics = {
				totalEvents: 200,
				avgHandDuration: 150000,
				actionDistribution: { bet: 60, call: 90, fold: 50 },
				phaseDistribution: { preflop: 50, flop: 35, turn: 15 },
				playerPerformance: {},
				gameFlow: {
					peakPotSize: 900,
					longestHand: 400000,
					shortestHand: 25000,
					mostActivePlayer: 'player2',
				},
			};
			const mockUpdatedReplay = { gameId, analytics };

			mockReplay.findOneAndUpdate = jest
				.fn()
				.mockResolvedValue(mockUpdatedReplay);

			const result = await repository.updateAnalytics(gameId, analytics);

			expect(mockReplay.findOneAndUpdate).toHaveBeenCalledWith(
				{ gameId },
				{ analytics, updatedAt: expect.any(Date) },
				{ new: true },
			);
			expect(result).toEqual(mockUpdatedReplay);
		});

		it('should throw error when update fails', async () => {
			const gameId = 'test-game-123';
			const analytics: IReplayAnalytics = {
				totalEvents: 200,
				avgHandDuration: 150000,
				actionDistribution: { bet: 60, call: 90, fold: 50 },
				phaseDistribution: { preflop: 50, flop: 35, turn: 15 },
				playerPerformance: {},
				gameFlow: {
					peakPotSize: 900,
					longestHand: 400000,
					shortestHand: 25000,
					mostActivePlayer: 'player2',
				},
			};

			mockReplay.findOneAndUpdate = jest
				.fn()
				.mockRejectedValue(new Error('Database error'));

			await expect(
				repository.updateAnalytics(gameId, analytics),
			).rejects.toThrow('Failed to update analytics: Database error');
		});
	});

	describe('getStorageStats', () => {
		it('should return storage statistics', async () => {
			const mockAggregateResult = [
				{
					totalReplays: 10,
					totalSizeBytes: 10485760, // 10 MB
					oldestReplay: new Date('2023-01-01T00:00:00Z'),
					newestReplay: new Date('2023-01-10T00:00:00Z'),
				},
			];

			mockReplay.aggregate = jest.fn().mockResolvedValue(mockAggregateResult);

			const result = await repository.getStorageStats();

			expect(result.totalReplays).toBe(10);
			expect(result.totalSizeBytes).toBe(10485760);
			expect(result.totalSizeMB).toBe('10.00');
			expect(result.avgSizePerReplayMB).toBe('1.00');
			expect(result.oldestReplay).toEqual(new Date('2023-01-01T00:00:00Z'));
			expect(result.newestReplay).toEqual(new Date('2023-01-10T00:00:00Z'));
		});

		it('should handle empty database', async () => {
			mockReplay.aggregate = jest.fn().mockResolvedValue([]);

			const result = await repository.getStorageStats();

			expect(result.totalReplays).toBe(0);
			expect(result.totalSizeBytes).toBe(0);
			expect(result.totalSizeMB).toBe('0.00');
			expect(result.avgSizePerReplayMB).toBe('0.00');
			expect(result.oldestReplay).toBeNull();
			expect(result.newestReplay).toBeNull();
		});

		it('should throw error when aggregation fails', async () => {
			mockReplay.aggregate = jest
				.fn()
				.mockRejectedValue(new Error('Database error'));

			await expect(repository.getStorageStats()).rejects.toThrow(
				'Failed to get storage stats: Database error',
			);
		});
	});
});
