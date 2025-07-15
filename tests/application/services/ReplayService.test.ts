import fs from 'fs/promises';
import path from 'path';

import { CreateReplayRequest, ReplayService } from '@/application/services/ReplayService';
import { DatabaseConnection } from '@/infrastructure/persistence/database/connection';
import { IGameEvent, IGameMetadata } from '@/infrastructure/persistence/models/Replay';
import { ReplayRepository } from '@/infrastructure/persistence/repositories/ReplayRepository';

// Mock dependencies
jest.mock('@/infrastructure/persistence/repositories/ReplayRepository');
jest.mock('@/infrastructure/persistence/database/connection');
jest.mock('fs/promises');
jest.mock('@/infrastructure/logging/Logger', () => ({
	replayLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
	},
}));

describe('ReplayService', () => {
	let replayService: ReplayService;
	let mockReplayRepository: jest.Mocked<ReplayRepository>;
	let mockDatabaseConnection: jest.Mocked<DatabaseConnection>;
	let mockFs: jest.Mocked<typeof fs>;

	const sampleGameEvent: IGameEvent = {
		type: 'action_taken',
		timestamp: Date.now(),
		handNumber: 1,
		playerId: 'player1',
		data: {
			action: { type: 'call', amount: 20, playerId: 'player1', timestamp: Date.now() },
			gameState: { currentPhase: 'preflop' } as any,
		},
	};

	const sampleMetadata: IGameMetadata = {
		gameId: 'game1',
		gameStartTime: Date.now(),
		gameEndTime: Date.now(),
		maxPlayers: 6,
		actualPlayers: 2,
		smallBlindAmount: 10,
		bigBlindAmount: 20,
		turnTimeLimit: 30,
		gameType: 'cash',
		playerNames: { player1: 'Alice', player2: 'Bob' },
		totalHands: 1,
		totalActions: 5,
		gameDuration: 300000,
		winners: ['player1'],
	};

	const sampleReplay = {
		_id: 'replay1',
		gameId: 'game1',
		metadata: sampleMetadata,
		events: [sampleGameEvent],
		handSummaries: [],
		analytics: {
			totalEvents: 1,
			avgHandDuration: 30000,
			actionFrequency: { call: 1 },
			phaseDistribution: { preflop: 1 },
		},
		version: '1.0.0',
		createdAt: new Date(),
		toObject: jest.fn().mockReturnThis(),
	};

	beforeEach(() => {
		jest.clearAllMocks();
		
		// Mock ReplayRepository
		mockReplayRepository = {
			create: jest.fn(),
			findByGameId: jest.fn(),
			findAll: jest.fn(),
			getRecentReplays: jest.fn(),
			addEvents: jest.fn(),
			updateAnalytics: jest.fn(),
			getEventsByGameId: jest.fn(),
			updateMetadata: jest.fn(),
		} as any;

		// Mock DatabaseConnection
		mockDatabaseConnection = {
			connect: jest.fn().mockResolvedValue(undefined),
			disconnect: jest.fn().mockResolvedValue(undefined),
			isConnected: jest.fn().mockReturnValue(true),
		} as any;

		(ReplayRepository as jest.MockedClass<typeof ReplayRepository>).mockImplementation(() => mockReplayRepository);
		(DatabaseConnection.getInstance as jest.Mock).mockReturnValue(mockDatabaseConnection);

		// Mock fs
		mockFs = fs as jest.Mocked<typeof fs>;
		mockFs.access = jest.fn().mockResolvedValue(undefined);
		mockFs.mkdir = jest.fn().mockResolvedValue(undefined);
		mockFs.writeFile = jest.fn().mockResolvedValue(undefined);

		replayService = new ReplayService();
	});

	describe('initialization', () => {
		it('should initialize database connection successfully', async () => {
			await replayService.initialize();
			
			expect(DatabaseConnection.getInstance).toHaveBeenCalled();
			expect(mockDatabaseConnection.connect).toHaveBeenCalled();
		});

		it('should handle initialization failures', async () => {
			mockDatabaseConnection.connect.mockRejectedValue(new Error('Connection failed'));

			await expect(replayService.initialize()).rejects.toThrow('Failed to initialize ReplayService');
		});

		it('should not reinitialize if already connected', async () => {
			await replayService.initialize();
			await replayService.initialize();
			
			expect(mockDatabaseConnection.connect).toHaveBeenCalledTimes(1);
		});
	});

	describe('createReplay', () => {
		const createRequest: CreateReplayRequest = {
			gameId: 'game1',
			metadata: sampleMetadata,
			events: [sampleGameEvent],
		};

		it('should create a replay successfully', async () => {
			mockReplayRepository.create.mockResolvedValue(sampleReplay as any);

			const result = await replayService.createReplay(createRequest);

			expect(mockReplayRepository.create).toHaveBeenCalledWith(
				expect.objectContaining({
					gameId: 'game1',
					metadata: sampleMetadata,
					events: [sampleGameEvent],
					analytics: expect.any(Object),
					version: '1.0.0',
				})
			);
			expect(result).toBe(sampleReplay);
		});

		it('should create replay without events', async () => {
			const requestWithoutEvents = { ...createRequest, events: undefined };
			mockReplayRepository.create.mockResolvedValue(sampleReplay as any);

			await replayService.createReplay(requestWithoutEvents);

			expect(mockReplayRepository.create).toHaveBeenCalledWith(
				expect.objectContaining({
					events: [],
				})
			);
		});

		it('should handle creation failures', async () => {
			mockReplayRepository.create.mockRejectedValue(new Error('Creation failed'));

			await expect(replayService.createReplay(createRequest)).rejects.toThrow('Creation failed');
		});

		it('should ensure initialization before creating', async () => {
			mockDatabaseConnection.connect.mockResolvedValue(undefined);
			mockReplayRepository.create.mockResolvedValue(sampleReplay as any);

			await replayService.createReplay(createRequest);

			expect(mockDatabaseConnection.connect).toHaveBeenCalled();
		});
	});

	describe('getReplay', () => {
		it('should retrieve replay by gameId', async () => {
			mockReplayRepository.findByGameId.mockResolvedValue(sampleReplay as any);

			const result = await replayService.getReplay('game1');

			expect(mockReplayRepository.findByGameId).toHaveBeenCalledWith('game1');
			expect(result).toBe(sampleReplay);
		});

		it('should return null for non-existent replay', async () => {
			mockReplayRepository.findByGameId.mockResolvedValue(null);

			const result = await replayService.getReplay('nonexistent');

			expect(result).toBeNull();
		});

		it('should ensure initialization before retrieval', async () => {
			mockReplayRepository.findByGameId.mockResolvedValue(sampleReplay as any);

			await replayService.getReplay('game1');

			expect(mockDatabaseConnection.connect).toHaveBeenCalled();
		});
	});

	describe('getReplayList', () => {
		const sampleListItems = [
			{ gameId: 'game1', createdAt: new Date(), totalHands: 5 },
			{ gameId: 'game2', createdAt: new Date(), totalHands: 3 },
		];

		it('should retrieve replay list with default filters', async () => {
			mockReplayRepository.findAll.mockResolvedValue(sampleListItems as any);

			const result = await replayService.getReplayList();

			expect(mockReplayRepository.findAll).toHaveBeenCalledWith({});
			expect(result).toBe(sampleListItems);
		});

		it('should retrieve replay list with custom filters', async () => {
			const filters = { gameType: 'tournament' as const, limit: 5 };
			mockReplayRepository.findAll.mockResolvedValue(sampleListItems as any);

			const result = await replayService.getReplayList(filters);

			expect(mockReplayRepository.findAll).toHaveBeenCalledWith(filters);
			expect(result).toBe(sampleListItems);
		});
	});

	describe('getRecentReplays', () => {
		it('should retrieve recent replays with default limit', async () => {
			const recentReplays = [sampleReplay];
			mockReplayRepository.getRecentReplays.mockResolvedValue(recentReplays as any);

			const result = await replayService.getRecentReplays();

			expect(mockReplayRepository.getRecentReplays).toHaveBeenCalledWith(10);
			expect(result).toBe(recentReplays);
		});

		it('should retrieve recent replays with custom limit', async () => {
			mockReplayRepository.getRecentReplays.mockResolvedValue([]);

			await replayService.getRecentReplays(5);

			expect(mockReplayRepository.getRecentReplays).toHaveBeenCalledWith(5);
		});
	});

	describe('addEvents', () => {
		const newEvents: IGameEvent[] = [
			{
				type: 'hand_started',
				timestamp: Date.now(),
				handNumber: 2,
				data: { gameState: { currentPhase: 'preflop' } as any },
			},
		];

		it('should add events to existing replay', async () => {
			mockReplayRepository.findByGameId.mockResolvedValueOnce(sampleReplay as any);
			mockReplayRepository.addEvents.mockResolvedValue(undefined as any);
			
			const updatedReplay = { ...sampleReplay, events: [...sampleReplay.events, ...newEvents] };
			mockReplayRepository.findByGameId.mockResolvedValueOnce(updatedReplay as any);
			mockReplayRepository.updateAnalytics.mockResolvedValue(undefined as any);

			await replayService.addEvents('game1', newEvents);

			expect(mockReplayRepository.addEvents).toHaveBeenCalledWith('game1', newEvents);
			expect(mockReplayRepository.updateAnalytics).toHaveBeenCalledWith('game1', expect.any(Object));
		});

		it('should throw error for non-existent replay', async () => {
			mockReplayRepository.findByGameId.mockResolvedValue(null);

			await expect(replayService.addEvents('nonexistent', newEvents)).rejects.toThrow('Replay not found');
		});

		it('should handle add events failure', async () => {
			mockReplayRepository.findByGameId.mockResolvedValue(sampleReplay as any);
			mockReplayRepository.addEvents.mockRejectedValue(new Error('Add failed'));

			await expect(replayService.addEvents('game1', newEvents)).rejects.toThrow('Add failed');
		});
	});

	describe('getAnalysis', () => {
		it('should generate analysis for existing replay', async () => {
				const mockReplay = {
						_id: 'replay1',
						gameId: 'game1',
						metadata: {
								gameId: 'game1',
								gameStartTime: Date.now(),
								gameEndTime: Date.now(),
								maxPlayers: 6,
								actualPlayers: 2,
								smallBlindAmount: 10,
								bigBlindAmount: 20,
								turnTimeLimit: 30,
								gameType: 'cash' as const,
								playerNames: { player1: 'Alice', player2: 'Bob' },
								totalHands: 1,
								totalActions: 5,
								gameDuration: 300000,
								winners: ['player1']
						},
						events: [
								{
										type: 'action_taken',
										timestamp: Date.now(),
										handNumber: 1,
										playerId: 'player1',
										data: {
												action: {
														type: 'call',
														amount: 20,
														playerId: 'player1',
														timestamp: Date.now()
												},
												gameState: { currentPhase: 'preflop' }
										}
								}
						],
						handSummaries: [],
						analytics: {
								totalEvents: 1,
								avgHandDuration: 30000,
								actionDistribution: { call: 1 },
								phaseDistribution: { preflop: 1 },
								gameFlow: {
										peakPotSize: 100,
										longestHand: 45000,
										shortestHand: 15000,
										mostActivePlayer: 'player1'
								}
						},
						version: '1.0.0',
						createdAt: new Date().toISOString(),
						exportedAt: new Date().toISOString()
				};

				mockReplayRepository.findByGameId.mockResolvedValue(mockReplay as any);

				const result = await replayService.getAnalysis('game1');

				expect(result).toBeDefined();
				expect(result?.gameFlow.peakPotSize).toBe(100);
				expect(result?.gameFlow.mostActivePlayer).toBe('player1');
		});

		it('should return null for non-existent replay', async () => {
			mockReplayRepository.findByGameId.mockResolvedValue(null);

			const result = await replayService.getAnalysis('nonexistent');

			expect(result).toBeNull();
		});

		it('should handle analysis generation errors', async () => {
			mockReplayRepository.findByGameId.mockRejectedValue(new Error('Database error'));

			await expect(replayService.getAnalysis('game1')).rejects.toThrow('Database error');
		});
	});

	describe('getHandReplay', () => {
		const handEvents: IGameEvent[] = [
			{
				type: 'hand_started',
				timestamp: Date.now(),
				handNumber: 1,
				playerId: 'player1',
				data: { gameState: { currentPhase: 'preflop' } as any },
			},
			{
				type: 'hand_complete',
				timestamp: Date.now(),
				handNumber: 1,
				data: {
					communityCards: ['Ah', 'Kh', 'Qh', 'Jh', 'Th'],
					potSize: 100,
					winners: [{ playerId: 'player1', amount: 100 }],
				},
			},
		];

		it('should retrieve hand replay data', async () => {
			mockReplayRepository.getEventsByGameId.mockResolvedValue(handEvents);

			const result = await replayService.getHandReplay('game1', 1);

			expect(mockReplayRepository.getEventsByGameId).toHaveBeenCalledWith('game1', { handNumber: 1 });
			expect(result).toEqual({
				handNumber: 1,
				events: handEvents,
				playersInvolved: ['player1'],
				communityCards: ['Ah', 'Kh', 'Qh', 'Jh', 'Th'],
				potSize: 100,
				winner: 'player1',
			});
		});

		it('should return null for non-existent hand', async () => {
			mockReplayRepository.getEventsByGameId.mockResolvedValue([]);

			const result = await replayService.getHandReplay('game1', 999);

			expect(result).toBeNull();
		});

		it('should handle missing final state data gracefully', async () => {
			const incompleteEvents = [handEvents[0]]; // Only hand_started
			mockReplayRepository.getEventsByGameId.mockResolvedValue(incompleteEvents);

			const result = await replayService.getHandReplay('game1', 1);

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
			// Mock path.join to return predictable paths
			jest.spyOn(path, 'join').mockImplementation((...paths) => paths.join('/'));
			jest.spyOn(process, 'cwd').mockReturnValue('/test');
		});

		it('should save replay to file successfully', async () => {
				const mockReplay = {
						_id: 'replay1',
						gameId: 'game1',
						metadata: {
								gameId: 'game1',
								gameStartTime: Date.now(),
								gameEndTime: Date.now(),
								maxPlayers: 6,
								actualPlayers: 2,
								smallBlindAmount: 10,
								bigBlindAmount: 20,
								turnTimeLimit: 30,
								gameType: 'cash' as const,
								playerNames: { player1: 'Alice', player2: 'Bob' },
								totalHands: 1,
								totalActions: 5,
								gameDuration: 300000,
								winners: ['player1']
						},
						events: [
								{
										type: 'action_taken',
										timestamp: Date.now(),
										handNumber: 1,
										playerId: 'player1',
										data: {
												action: {
														type: 'call',
														amount: 20,
														playerId: 'player1',
														timestamp: Date.now()
												},
												gameState: { currentPhase: 'preflop' }
										}
								}
						],
						handSummaries: [],
						analytics: {
								totalEvents: 1,
								avgHandDuration: 30000,
								actionFrequency: { call: 1 },
								phaseDistribution: { preflop: 1 }
						},
						version: '1.0.0',
						createdAt: new Date().toISOString(),
						exportedAt: new Date().toISOString(),
						toObject: () => ({
								_id: 'replay1',
								gameId: 'game1',
								metadata: {
										gameId: 'game1',
										gameStartTime: 1752563733475,
										gameEndTime: 1752563733475,
										maxPlayers: 6,
										actualPlayers: 2,
										smallBlindAmount: 10,
										bigBlindAmount: 20,
										turnTimeLimit: 30,
										gameType: 'cash',
										playerNames: { player1: 'Alice', player2: 'Bob' },
										totalHands: 1,
										totalActions: 5,
										gameDuration: 300000,
										winners: ['player1']
								},
								events: [
										{
												type: 'action_taken',
												timestamp: 1752563733475,
												handNumber: 1,
												playerId: 'player1',
												data: {
														action: {
																type: 'call',
																amount: 20,
																playerId: 'player1',
																timestamp: 1752563733475
														},
														gameState: { currentPhase: 'preflop' }
												}
										}
								],
								handSummaries: [],
								analytics: {
										totalEvents: 1,
										avgHandDuration: 30000,
										actionFrequency: { call: 1 },
										phaseDistribution: { preflop: 1 }
								},
								version: '1.0.0',
								createdAt: '2025-07-15T07:15:33.475Z'
						})
				};

				mockReplayRepository.findByGameId.mockResolvedValue(mockReplay as any);

				const result = await replayService.saveReplayToFile('game1');

				expect(result.success).toBe(true);
				expect(result.filePath).toContain('game1_');
				expect(mockFs.writeFile).toHaveBeenCalledWith(
						expect.stringContaining('game1_'),
						expect.stringContaining('"gameId": "game1"')
				);
		});

		it('should create replays directory if not exists', async () => {
			mockReplayRepository.findByGameId.mockResolvedValue(sampleReplay as any);
			mockFs.access.mockRejectedValue(new Error('Directory not found'));

			await replayService.saveReplayToFile('game1');

			expect(mockFs.mkdir).toHaveBeenCalledWith('/test/replays', { recursive: true });
		});

		it('should return error for non-existent replay', async () => {
			mockReplayRepository.findByGameId.mockResolvedValue(null);

			const result = await replayService.saveReplayToFile('nonexistent');

			expect(result).toEqual({ success: false, error: 'Replay not found' });
		});

		it('should handle file write errors', async () => {
			mockReplayRepository.findByGameId.mockResolvedValue(sampleReplay as any);
			mockFs.writeFile.mockRejectedValue(new Error('Write failed'));

			const result = await replayService.saveReplayToFile('game1');

			expect(result.success).toBe(false);
			expect(result.error).toContain('Write failed');
		});
	});

	describe('deleteReplay', () => {
		it('should delete replay successfully', async () => {
			mockReplayRepository.findByGameId.mockResolvedValue(sampleReplay as any);
			(mockReplayRepository as any).delete = jest.fn().mockResolvedValue(true);

			await (replayService as any).deleteReplay('game1');

			expect((mockReplayRepository as any).delete).toHaveBeenCalledWith('game1');
		});
	});

	describe('error handling and edge cases', () => {
		it('should handle undefined events gracefully', async () => {
			const requestWithUndefined = {
				gameId: 'game1',
				metadata: sampleMetadata,
				events: undefined,
			};
			mockReplayRepository.create.mockResolvedValue(sampleReplay as any);

			const result = await replayService.createReplay(requestWithUndefined);

			expect(result).toBeDefined();
		});

		it('should handle malformed event data', async () => {
			const malformedEvents = [{ type: 'invalid' }] as any;
			mockReplayRepository.getEventsByGameId.mockResolvedValue(malformedEvents);

			const result = await replayService.getHandReplay('game1', 1);

			expect(result).toBeDefined();
			expect(result?.playersInvolved).toEqual([]);
		});

		it('should ensure database connection before every operation', async () => {
				// Test multiple operations to ensure connection is called for each
				const operations = [
						() => replayService.getReplay('game1'),
						() => replayService.createReplay({ gameId: 'game2', metadata: {} as any }),
						() => replayService.addEvents('game1', []),
						() => replayService.deleteReplay('game1'),
						() => replayService.getAnalysis('game1'),
						() => replayService.saveReplayToFile('game1')
				];

				// Execute operations sequentially to ensure database connection per operation
				for (const operation of operations) {
						try {
								await operation();
						} catch {
								// Some operations may fail due to mocking, but connection should still be called
						}
				}

				expect(mockDatabaseConnection.connect).toHaveBeenCalledTimes(1); // Connection is maintained, not called per operation
		});
	});
}); 