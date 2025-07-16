/**
 * Example test file demonstrating how to use MongoDB test utilities
 * This file shows various testing patterns and best practices
 */

import { Types } from 'mongoose';

import { Bot } from '@/infrastructure/persistence/models/Bot';
import { Replay } from '@/infrastructure/persistence/models/Replay';

import {
	MongoMockUtils,
	MongoTestData,
	MongoTestSetup,
	MongoTestUtils,
	withMongoDB,
} from './index';

// Example 1: Using in-memory MongoDB with automatic setup
describe('MongoDB Test Utilities Examples', () => {
	// Setup MongoDB for this test suite
	beforeAll(async () => {
		await MongoTestSetup.setup();
	});

	afterAll(async () => {
		await MongoTestSetup.teardown();
	});

	beforeEach(async () => {
		await MongoTestSetup.reset();
	});

	describe('In-Memory MongoDB Testing', () => {
		it('should work with real MongoDB operations', async () => {
			// Create test data
			const botData = MongoTestData.createTestBot({
				botName: 'Example Bot',
				developer: 'Test Developer',
			});

			// Save to real MongoDB (in-memory)
			const bot = new Bot(botData);
			const savedBot = await bot.save();

			// Test the saved data
			expect(savedBot._id).toBeDefined();
			expect(savedBot.botName).toBe('Example Bot');
			expect(savedBot.developer).toBe('Test Developer');
			expect(savedBot.status).toBe('active');

			// Query the database
			const foundBot = await Bot.findOne({ botName: 'Example Bot' });
			expect(foundBot).toBeTruthy();
			expect(foundBot?.botId).toBe(savedBot.botId);
		});

		it('should handle multiple documents', async () => {
			// Create multiple test documents
			const bots = [
				MongoTestData.createTestBot({ botName: 'Bot 1', developer: 'Dev A' }),
				MongoTestData.createTestBot({ botName: 'Bot 2', developer: 'Dev B' }),
				MongoTestData.createTestBot({ botName: 'Bot 3', developer: 'Dev A' }),
			];

			// Insert all bots
			const savedBots = await Bot.insertMany(bots);
			expect(savedBots).toHaveLength(3);

			// Query by developer
			const devABots = await Bot.find({ developer: 'Dev A' });
			expect(devABots).toHaveLength(2);

			// Test aggregation
			const stats = await Bot.aggregate([
				{ $group: { _id: '$developer', count: { $sum: 1 } } },
				{ $sort: { count: -1 } },
			]);
			expect(stats).toHaveLength(2);
		});

		it('should work with complex queries', async () => {
			// Create test replay data
			const replayData = MongoTestData.createTestReplay({
				gameId: 'complex-game',
				metadata: {
					...MongoTestData.createTestReplay().metadata,
					gameType: 'tournament',
					actualPlayers: 6,
					gameDuration: 7200000, // 2 hours
				},
			});

			const replay = new Replay(replayData);
			await replay.save();

			// Test complex queries
			const tournamentReplays = await Replay.find({
				'metadata.gameType': 'tournament',
				'metadata.actualPlayers': { $gte: 6 },
				'metadata.gameDuration': { $gte: 3600000 }, // >= 1 hour
			});

			expect(tournamentReplays).toHaveLength(1);
			expect(tournamentReplays[0].gameId).toBe('complex-game');
		});
	});

	describe('Test Data Creation', () => {
		it('should create consistent test data', () => {
			const bot1 = MongoTestData.createTestBot();
			const bot2 = MongoTestData.createTestBot();

			// Should have different IDs but same structure
			expect(bot1.botId).not.toBe(bot2.botId);
			expect(bot1.botName).toBe(bot2.botName);
			expect(bot1.status).toBe('active');
			expect(bot2.status).toBe('active');
		});

		it('should allow customization of test data', () => {
			const customBot = MongoTestData.createTestBot({
				botName: 'Custom Bot',
				developer: 'Custom Developer',
				status: 'suspended',
			});

			expect(customBot.botName).toBe('Custom Bot');
			expect(customBot.developer).toBe('Custom Developer');
			expect(customBot.status).toBe('suspended');
		});

		it('should create ObjectIds properly', () => {
			const id1 = MongoTestData.createObjectId();
			const id2 = MongoTestData.createObjectId();
			const customId = MongoTestData.createObjectId('507f1f77bcf86cd799439011');

			expect(id1).toBeInstanceOf(Types.ObjectId);
			expect(id2).toBeInstanceOf(Types.ObjectId);
			expect(id1.toString()).not.toBe(id2.toString());
			expect(customId.toString()).toBe('507f1f77bcf86cd799439011');
		});
	});

	describe('Database Management', () => {
		it('should clear database between tests', async () => {
			// Add some data
			const bot = new Bot(MongoTestData.createTestBot());
			await bot.save();

			// Verify data exists
			const count1 = await Bot.countDocuments();
			expect(count1).toBe(1);

			// Clear database
			await MongoTestUtils.clearDatabase();

			// Verify data is gone
			const count2 = await Bot.countDocuments();
			expect(count2).toBe(0);
		});

		it('should provide connection information', () => {
			expect(MongoTestUtils.isMongoConnected()).toBe(true);

			const stats = MongoTestUtils.getConnectionStats();
			expect(stats.readyState).toBe(1);
			expect(stats.host).toBeTruthy();
			expect(stats.port).toBeTruthy();
			expect(stats.name).toBeTruthy();
		});
	});
});

// Example 2: Using mocked MongoDB
describe('Mocked MongoDB Testing', () => {
	let mockBotModel: jest.Mocked<typeof Bot>;
	let mockReplayModel: jest.Mocked<typeof Replay>;

	beforeEach(() => {
		mockBotModel = MongoMockUtils.createMockModel('Bot') as any;
		mockReplayModel = MongoMockUtils.createMockModel('Replay') as any;

		// Setup default mock behaviors
		MongoMockUtils.setupModelMocks(mockBotModel);
		MongoMockUtils.setupModelMocks(mockReplayModel);
	});

	it('should work with mocked models', async () => {
		const testBot = MongoTestData.createTestBot();

		// Mock the creation
		mockBotModel.create.mockResolvedValue(testBot as any);

		// Test the function that would use the model
		const result = await mockBotModel.create(testBot);

		expect(mockBotModel.create).toHaveBeenCalledWith(testBot);
		expect(result).toEqual(testBot);
	});

	it('should handle query chaining', async () => {
		const testBots = [
			MongoTestData.createTestBot({ botName: 'Bot 1' }),
			MongoTestData.createTestBot({ botName: 'Bot 2' }),
		];

		const mockQuery = MongoMockUtils.createMockQuery();
		mockQuery.exec.mockResolvedValue(testBots);
		mockBotModel.find.mockReturnValue(mockQuery);

		// Test query chaining
		const result = await mockBotModel
			.find({ status: 'active' })
			.sort({ createdAt: -1 })
			.limit(10)
			.exec();

		expect(mockBotModel.find).toHaveBeenCalledWith({ status: 'active' });
		expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
		expect(mockQuery.limit).toHaveBeenCalledWith(10);
		expect(result).toEqual(testBots);
	});

	it('should handle updates and deletes', async () => {
		const botId = 'test-bot-id';

		mockBotModel.findByIdAndUpdate.mockResolvedValue({
			...MongoTestData.createTestBot(),
			_id: botId,
			status: 'suspended',
		} as any);

		mockBotModel.deleteOne.mockResolvedValue({ deletedCount: 1 } as any);

		// Test update
		const updated = await mockBotModel.findByIdAndUpdate(
			botId,
			{ status: 'suspended' },
			{ new: true },
		);

		expect(updated?.status).toBe('suspended');

		// Test delete
		const deleteResult = await mockBotModel.deleteOne({ _id: botId });
		expect(deleteResult.deletedCount).toBe(1);
	});

	it('should support complex aggregations', async () => {
		const aggregationResult = [
			{ _id: 'active', count: 5 },
			{ _id: 'suspended', count: 2 },
		];

		mockBotModel.aggregate.mockResolvedValue(aggregationResult as any);

		const result = await mockBotModel.aggregate([
			{ $group: { _id: '$status', count: { $sum: 1 } } },
		]);

		expect(mockBotModel.aggregate).toHaveBeenCalledWith([
			{ $group: { _id: '$status', count: { $sum: 1 } } },
		]);
		expect(result).toEqual(aggregationResult);
	});
});

// Example 3: Manual setup (for when you need more control)
describe('Manual MongoDB Setup', () => {
	beforeAll(async () => {
		await MongoTestSetup.setup();
	});

	afterAll(async () => {
		await MongoTestSetup.teardown();
	});

	beforeEach(async () => {
		await MongoTestSetup.reset();
	});

	it('should work with manual setup', async () => {
		// This test has full control over the setup/teardown process
		const bot = new Bot(MongoTestData.createTestBot());
		await bot.save();

		const found = await Bot.findOne({ botId: bot.botId });
		expect(found).toBeTruthy();
	});
});

// Example 4: Testing error conditions
describe('Error Handling Examples', () => {
	let mockModel: jest.Mocked<any>;

	beforeEach(() => {
		mockModel = MongoMockUtils.createMockModel('ErrorTest');
	});

	it('should handle database connection errors', async () => {
		mockModel.create.mockRejectedValue(new Error('Connection failed'));

		await expect(mockModel.create({})).rejects.toThrow('Connection failed');
	});

	it('should handle validation errors', async () => {
		const validationError = new Error('Validation failed');
		validationError.name = 'ValidationError';

		mockModel.save.mockRejectedValue(validationError);

		await expect(mockModel.save()).rejects.toThrow('Validation failed');
	});

	it('should handle duplicate key errors', async () => {
		const duplicateError = new Error('Duplicate key error');
		(duplicateError as any).code = 11000;

		mockModel.create.mockRejectedValue(duplicateError);

		await expect(mockModel.create({})).rejects.toThrow('Duplicate key error');
	});
});

// Example 5: Using withMongoDB helper (alternative approach)
// eslint-disable-next-line jest/valid-describe-callback
describe(
	'WithMongoDB Helper Example',
	withMongoDB(() => {
		it('should work with automatic setup', async () => {
			// MongoDB is automatically set up and torn down
			const bot = new Bot(MongoTestData.createTestBot());
			await bot.save();

			const found = await Bot.findOne({ botId: bot.botId });
			expect(found).toBeTruthy();
		});
	}),
);
