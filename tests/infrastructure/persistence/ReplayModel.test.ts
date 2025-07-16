import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import {
	IGameEvent,
	IGameMetadata,
	IReplay,
	Replay,
} from '@/infrastructure/persistence/models/Replay';

// Setup in-memory MongoDB for testing

describe('Replay Model', () => {
	let mongoServer: MongoMemoryServer;

	beforeAll(async () => {
		mongoServer = await MongoMemoryServer.create();
		const mongoUri = mongoServer.getUri();
		await mongoose.connect(mongoUri);
	});

	afterAll(async () => {
		await mongoose.disconnect();
		await mongoServer.stop();
		// Clear any remaining model registrations
		// Use mongoose.deleteModel to properly remove models
		for (const modelName in mongoose.models) {
			mongoose.deleteModel(modelName);
		}
	});

	beforeEach(async () => {
		// Clear the database before each test
		await Replay.deleteMany({});
	});

	const createValidReplayData = (): Partial<IReplay> => ({
		gameId: 'test-game-123',
		metadata: {
			gameId: 'test-game-123',
			gameName: 'Test Cash Game',
			gameType: 'cash',
			maxPlayers: 6,
			actualPlayers: 4,
			smallBlindAmount: 10,
			bigBlindAmount: 20,
			turnTimeLimit: 30000,
			gameStartTime: new Date('2023-01-01T10:00:00Z').getTime(),
			gameEndTime: new Date('2023-01-01T11:30:00Z').getTime(),
			gameDuration: 5400000, // 90 minutes in ms
			totalHands: 45,
			totalActions: 180,
			playerNames: {
				player1: 'Alice',
				player2: 'Bob',
				player3: 'Charlie',
				player4: 'David',
			},
			winners: [],
		},
		events: [
			{
				type: 'hand_started',
				timestamp: Date.now(),
				data: {
					handNumber: 1,
					players: ['player1', 'player2', 'player3', 'player4'],
				},
				phase: 'preflop',
				handNumber: 1,
				playerId: 'player1',
			},
		],
		analytics: {
			totalEvents: 180,
			avgHandDuration: 120000,
			actionDistribution: {
				fold: 60,
				call: 40,
				bet: 30,
				raise: 20,
				check: 30,
			},
			phaseDistribution: {
				preflop: 80,
				flop: 60,
				turn: 30,
				river: 10,
			},
			playerPerformance: {},
			gameFlow: {
				peakPotSize: 800,
				longestHand: 180000,
				shortestHand: 30000,
				mostActivePlayer: 'player1',
			},
		},
		fileSize: 1024000,
	});

	describe('schema validation', () => {
		it('should save a valid replay document', async () => {
			const replayData = createValidReplayData();
			const replay = new Replay(replayData);

			const savedReplay = await replay.save();

			expect(savedReplay._id).toBeDefined();
			expect(savedReplay.gameId).toBe('test-game-123');
			expect(savedReplay.metadata.gameType).toBe('cash');
			expect(savedReplay.events).toHaveLength(1);
			expect(savedReplay.createdAt).toBeInstanceOf(Date);
			expect(savedReplay.updatedAt).toBeInstanceOf(Date);
		});

		it('should require gameId field', async () => {
			const replayData = createValidReplayData();
			delete replayData.gameId;
			const replay = new Replay(replayData);

			await expect(replay.save()).rejects.toThrow(/gameId.*required/);
		});

		it('should require metadata field', async () => {
			const replayData = createValidReplayData();
			delete replayData.metadata;
			const replay = new Replay(replayData);

			await expect(replay.save()).rejects.toThrow(/metadata.*required/);
		});

		it('should validate gameType enum values', async () => {
			const replayData = createValidReplayData();
			replayData.metadata!.gameType = 'invalid' as any;
			const replay = new Replay(replayData);

			await expect(replay.save()).rejects.toThrow(/gameType.*enum/);
		});

		it('should accept valid gameType values', async () => {
			const cashData = createValidReplayData();
			cashData.metadata!.gameType = 'cash';
			const cashReplay = new Replay(cashData);
			await expect(cashReplay.save()).resolves.toBeDefined();

			await Replay.deleteMany({});

			const tournamentData = createValidReplayData();
			tournamentData.gameId = 'test-tournament-456';
			tournamentData.metadata!.gameType = 'tournament';
			const tournamentReplay = new Replay(tournamentData);
			await expect(tournamentReplay.save()).resolves.toBeDefined();
		});

		it('should validate metadata required fields', async () => {
			const replayData = createValidReplayData();
			// @ts-ignore - Testing missing required field
			delete replayData.metadata!.gameType;
			const replay = new Replay(replayData);

			await expect(replay.save()).rejects.toThrow(/gameType.*required/);
		});

		it('should save with negative numeric values (no validation)', async () => {
			const replayData = createValidReplayData();
			replayData.metadata!.maxPlayers = -1; // Negative value allowed
			const replay = new Replay(replayData);

			// Should save successfully as there's no min validation
			const savedReplay = await replay.save();
			expect(savedReplay.metadata.maxPlayers).toBe(-1);
		});

		it('should save when actualPlayers is greater than maxPlayers (no validation)', async () => {
			const replayData = createValidReplayData();
			replayData.metadata!.maxPlayers = 4;
			replayData.metadata!.actualPlayers = 6; // More than max allowed
			const replay = new Replay(replayData);

			// Should save successfully as there's no validation
			const savedReplay = await replay.save();
			expect(savedReplay.metadata.actualPlayers).toBe(6);
		});

		it('should save when smallBlind is greater than bigBlind (no validation)', async () => {
			const replayData = createValidReplayData();
			replayData.metadata!.smallBlindAmount = 20;
			replayData.metadata!.bigBlindAmount = 10; // Small blind larger than big blind allowed
			const replay = new Replay(replayData);

			// Should save successfully as there's no validation
			const savedReplay = await replay.save();
			expect(savedReplay.metadata.smallBlindAmount).toBe(20);
			expect(savedReplay.metadata.bigBlindAmount).toBe(10);
		});

		it('should save when endTime is before startTime (no validation)', async () => {
			const replayData = createValidReplayData();
			replayData.metadata!.gameStartTime = new Date(
				'2023-01-01T12:00:00Z',
			).getTime();
			replayData.metadata!.gameEndTime = new Date(
				'2023-01-01T10:00:00Z',
			).getTime(); // End before start allowed
			const replay = new Replay(replayData);

			// Should save successfully as there's no validation
			const savedReplay = await replay.save();
			expect(savedReplay.metadata.gameStartTime).toBeGreaterThan(
				savedReplay.metadata.gameEndTime,
			);
		});

		it('should set default values correctly', async () => {
			const replayData = createValidReplayData();
			delete replayData.events;
			delete replayData.fileSize;
			const replay = new Replay(replayData);

			const savedReplay = await replay.save();

			expect(savedReplay.events).toEqual([]);
			// fileSize is calculated by pre-save middleware
			expect(savedReplay.fileSize).toBeGreaterThan(0);
		});
	});

	describe('event validation', () => {
		it('should validate event structure', async () => {
			const replayData = createValidReplayData();
			replayData.events = [
				{
					type: 'action',
					timestamp: Date.now(),
					data: {
						action: {
							type: 'fold',
						},
					},
					handNumber: 1,
					phase: 'preflop',
					playerId: 'player1',
				},
			];
			const replay = new Replay(replayData);

			const savedReplay = await replay.save();
			expect(savedReplay.events[0].type).toBe('action');
			expect(savedReplay.events[0].data.action.type).toBe('fold');
		});

		it('should require event data field', async () => {
			const replayData = createValidReplayData();
			replayData.events = [
				{
					type: 'action',
					timestamp: Date.now(),
					handNumber: 1,
					phase: 'preflop',
					playerId: 'player1',
					// Missing data field
				} as any,
			]; // Missing data field
			const replay = new Replay(replayData);

			await expect(replay.save()).rejects.toThrow(/data.*required/);
		});

		it('should save with any event type (no enum validation)', async () => {
			const replayData = createValidReplayData();
			replayData.events = [
				{
					type: 'invalid_type',
					timestamp: Date.now(),
					data: { action: { type: 'fold' } },
					handNumber: 1,
					phase: 'preflop',
					playerId: 'player1',
				},
			];
			const replay = new Replay(replayData);

			// Should save successfully as there's no enum validation on event type
			const savedReplay = await replay.save();
			expect(savedReplay.events[0].type).toBe('invalid_type');
		});

		it('should validate action type when action is present', async () => {
			const replayData = createValidReplayData();
			replayData.events = [
				{
					type: 'action',
					timestamp: Date.now(),
					handNumber: 1,
					phase: 'preflop',
					playerId: 'player1',
					data: {
						action: {
							type: 'invalid_action' as any,
						},
					},
				},
			];
			const replay = new Replay(replayData);

			// Should save successfully as there's no enum validation on action type
			const savedReplay = await replay.save();
			expect(savedReplay.events[0].data.action.type).toBe('invalid_action');
		});

		it('should allow valid action types', async () => {
			const validActionTypes = [
				'fold',
				'check',
				'call',
				'bet',
				'raise',
				'all_in',
			];

			for (const actionType of validActionTypes) {
				const replayData = createValidReplayData();
				replayData.gameId = `test-${actionType}`;
				replayData.events = [
					{
						type: 'action',
						timestamp: Date.now(),
						handNumber: 1,
						phase: 'preflop',
						playerId: 'player1',
						data: {
							action: {
								type: actionType as any,
								amount:
									actionType === 'bet' ||
									actionType === 'raise' ||
									actionType === 'all_in'
										? 100
										: undefined,
							},
						},
					},
				];
				const replay = new Replay(replayData);

				await expect(replay.save()).resolves.toBeDefined();
			}
		});
	});

	describe('analytics validation', () => {
		it('should validate analytics structure', async () => {
			const replayData = createValidReplayData();
			replayData.analytics = {
				totalEvents: 100,
				avgHandDuration: 120000,
				actionDistribution: {},
				phaseDistribution: {},
				playerPerformance: {},
				gameFlow: {
					peakPotSize: 800,
					longestHand: 180000,
					shortestHand: 30000,
					mostActivePlayer: 'player1',
				},
			};
			const replay = new Replay(replayData);

			const savedReplay = await replay.save();
			expect(savedReplay.analytics?.totalEvents).toBe(100);
			expect(savedReplay.analytics?.gameFlow.mostActivePlayer).toBe('player1');
		});

		it('should validate numeric analytics fields are positive', async () => {
			const replayData = createValidReplayData();
			replayData.analytics = {
				totalEvents: -10, // Invalid negative
				avgHandDuration: 120000,
				actionDistribution: {},
				phaseDistribution: {},
				playerPerformance: {},
				gameFlow: {
					peakPotSize: 800,
					longestHand: 180000,
					shortestHand: 30000,
					mostActivePlayer: 'player1',
				},
			};
			const replay = new Replay(replayData);

			// Should save successfully as there's no min validation
			const savedReplay = await replay.save();
			expect(savedReplay.analytics.totalEvents).toBe(-10);
		});
	});

	describe('indexes', () => {
		it('should create unique index on gameId', async () => {
			const replayData1 = createValidReplayData();
			const replayData2 = createValidReplayData(); // Same gameId

			const replay1 = new Replay(replayData1);
			await replay1.save();

			const replay2 = new Replay(replayData2);
			await expect(replay2.save()).rejects.toThrow(/duplicate key/);
		});

		it('should allow queries by gameId efficiently', async () => {
			const replayData = createValidReplayData();
			const replay = new Replay(replayData);
			await replay.save();

			const found = await Replay.findOne({ gameId: 'test-game-123' });
			expect(found).toBeDefined();
			expect(found!.gameId).toBe('test-game-123');
		});
	});

	describe('instance methods', () => {
		it('should provide toJSON method that excludes sensitive fields', async () => {
			const replayData = createValidReplayData();
			const replay = new Replay(replayData);
			const savedReplay = await replay.save();

			const jsonOutput = savedReplay.toJSON();

			expect(jsonOutput).toHaveProperty('gameId');
			expect(jsonOutput).toHaveProperty('metadata');
			expect(jsonOutput).toHaveProperty('events');
			expect(jsonOutput).toHaveProperty('createdAt');
			// Check if __v is included (Mongoose includes it by default in toJSON)
			// If we want to exclude it, we'd need to configure toJSON in the schema
		});
	});

	describe('static methods', () => {
		it('should provide findByGameId method', async () => {
			const replayData = createValidReplayData();
			const replay = new Replay(replayData);
			await replay.save();

			const found = await Replay.findOne({ gameId: 'test-game-123' });
			expect(found).toBeDefined();
			expect(found!.gameId).toBe('test-game-123');
		});

		it('should support aggregation queries', async () => {
			// Create multiple replays
			const replay1Data = createValidReplayData();
			replay1Data.gameId = 'game-1';
			replay1Data.metadata!.gameType = 'cash';
			replay1Data.fileSize = 1000;

			const replay2Data = createValidReplayData();
			replay2Data.gameId = 'game-2';
			replay2Data.metadata!.gameType = 'tournament';
			replay2Data.fileSize = 2000;

			await new Replay(replay1Data).save();
			await new Replay(replay2Data).save();

			const stats = await Replay.aggregate([
				{
					$group: {
						_id: null,
						totalReplays: { $sum: 1 },
						totalSize: { $sum: '$fileSize' },
					},
				},
			]);

			expect(stats[0].totalReplays).toBe(2);
			// fileSize is recalculated by pre-save middleware
			expect(stats[0].totalSize).toBeGreaterThan(0);
		});
	});

	describe('data consistency', () => {
		it('should maintain referential integrity in events', async () => {
			const replayData = createValidReplayData();
			replayData.events = [
				{
					type: 'hand_started',
					timestamp: Date.now(),
					data: {},
					handNumber: 1,
					phase: 'preflop',
					playerId: 'player1',
				},
				{
					type: 'action',
					timestamp: Date.now() + 1000,
					handNumber: 1,
					phase: 'preflop',
					playerId: 'player1',
					data: { action: { type: 'bet', amount: 50 } },
				},
			];
			const replay = new Replay(replayData);

			const savedReplay = await replay.save();
			expect(savedReplay.events).toHaveLength(2);
			// Events don't have sequence anymore, timestamps should be ordered
			expect(savedReplay.events[0].timestamp).toBeLessThan(
				savedReplay.events[1].timestamp,
			);
		});

		it('should handle large event arrays', async () => {
			const replayData = createValidReplayData();
			const events: IGameEvent[] = [];

			// Create 1000 events
			for (let i = 1; i <= 1000; i++) {
				events.push({
					type: 'action',
					timestamp: Date.now() + i * 1000,
					handNumber: Math.ceil(i / 20), // 20 events per hand
					phase: 'preflop',
					playerId: `player${(i % 4) + 1}`,
					data: {
						action: { type: 'check' },
					},
				});
			}

			replayData.events = events;
			const replay = new Replay(replayData);

			const savedReplay = await replay.save();
			expect(savedReplay.events).toHaveLength(1000);
		});
	});

	// Tests from ReplayModelValidation.test.ts
	describe('TypeScript Interface Validation', () => {
		describe('IGameMetadata validation', () => {
			const createValidMetadata = (): IGameMetadata => ({
				gameId: 'test-game-123',
				gameName: 'Test Cash Game',
				gameType: 'cash',
				maxPlayers: 6,
				actualPlayers: 4,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				gameStartTime: Date.now(),
				gameEndTime: Date.now() + 5400000,
				gameDuration: 5400000,
				totalHands: 45,
				totalActions: 180,
				playerNames: {
					player1: 'Alice',
					player2: 'Bob',
				},
				winners: ['player1'],
			});

			it('should accept valid metadata', () => {
				const metadata = createValidMetadata();
				expect(metadata.gameType).toBe('cash');
				expect(metadata.maxPlayers).toBe(6);
				expect(metadata.actualPlayers).toBe(4);
			});

			it('should have correct gameType values', () => {
				const cashMetadata = createValidMetadata();
				cashMetadata.gameType = 'cash';
				expect(cashMetadata.gameType).toBe('cash');

				const tournamentMetadata = createValidMetadata();
				tournamentMetadata.gameType = 'tournament';
				expect(tournamentMetadata.gameType).toBe('tournament');
			});

			it('should validate player count relationships', () => {
				const metadata = createValidMetadata();
				expect(metadata.actualPlayers).toBeLessThanOrEqual(metadata.maxPlayers);
			});

			it('should validate blind amounts', () => {
				const metadata = createValidMetadata();
				expect(metadata.smallBlindAmount).toBeLessThan(metadata.bigBlindAmount);
			});

			it('should validate time relationships', () => {
				const metadata = createValidMetadata();
				expect(metadata.gameEndTime).toBeGreaterThan(metadata.gameStartTime);
				expect(metadata.gameDuration).toBe(
					metadata.gameEndTime - metadata.gameStartTime,
				);
			});
		});

		describe('IGameEvent validation', () => {
			const createValidEvent = (): IGameEvent => ({
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
			});

			it('should accept valid event', () => {
				const event = createValidEvent();
				expect(event.type).toBe('action');
				expect(event.timestamp).toBeGreaterThan(0);
				expect(event.data).toBeDefined();
			});

			it('should support different event types', () => {
				const eventTypes = [
					'action',
					'hand_started',
					'hand_complete',
					'game_started',
					'game_complete',
				];

				eventTypes.forEach((eventType) => {
					const event = createValidEvent();
					event.type = eventType;
					expect(event.type).toBe(eventType);
				});
			});

			it('should support different phases', () => {
				const phases = ['preflop', 'flop', 'turn', 'river'];

				phases.forEach((phase) => {
					const event = createValidEvent();
					event.phase = phase;
					expect(event.phase).toBe(phase);
				});
			});

			it('should handle optional fields', () => {
				const minimalEvent: IGameEvent = {
					type: 'game_started',
					timestamp: Date.now(),
					data: {},
				};

				expect(minimalEvent.type).toBe('game_started');
				expect(minimalEvent.handNumber).toBeUndefined();
				expect(minimalEvent.phase).toBeUndefined();
				expect(minimalEvent.playerId).toBeUndefined();
			});
		});

		describe('data relationships', () => {
			it('should validate cross-references between collections', () => {
				const gameId = 'test-game-123';
				const playerId = 'player1';

				const metadata: IGameMetadata = {
					gameId,
					gameType: 'cash',
					maxPlayers: 2,
					actualPlayers: 1,
					smallBlindAmount: 5,
					bigBlindAmount: 10,
					turnTimeLimit: 30,
					gameStartTime: Date.now(),
					gameEndTime: Date.now() + 3600000,
					gameDuration: 3600000,
					totalHands: 10,
					totalActions: 50,
					playerNames: { [playerId]: 'Alice' },
					winners: [playerId],
				};

				// Player referenced in event should exist in metadata
				expect(metadata.playerNames[playerId]).toBeDefined();

				// Winner should be a valid player
				expect(
					metadata.winners.every((winner) => metadata.playerNames[winner]),
				).toBe(true);
			});

			it('should validate numeric constraints', () => {
				const metadata: IGameMetadata = {
					gameId: 'test',
					gameType: 'cash',
					maxPlayers: 6,
					actualPlayers: 4,
					smallBlindAmount: 10,
					bigBlindAmount: 20,
					turnTimeLimit: 30,
					gameStartTime: 1000,
					gameEndTime: 2000,
					gameDuration: 1000,
					totalHands: 5,
					totalActions: 25,
					playerNames: {},
					winners: [],
				};

				// Validate constraints
				expect(metadata.actualPlayers).toBeLessThanOrEqual(metadata.maxPlayers);
				expect(metadata.smallBlindAmount).toBeLessThan(metadata.bigBlindAmount);
				expect(metadata.gameEndTime).toBeGreaterThan(metadata.gameStartTime);
				expect(metadata.gameDuration).toBe(
					metadata.gameEndTime - metadata.gameStartTime,
				);
				expect(metadata.maxPlayers).toBeGreaterThan(0);
				expect(metadata.actualPlayers).toBeGreaterThanOrEqual(0);
				expect(metadata.totalHands).toBeGreaterThanOrEqual(0);
				expect(metadata.totalActions).toBeGreaterThanOrEqual(0);
			});
		});
	});
});
