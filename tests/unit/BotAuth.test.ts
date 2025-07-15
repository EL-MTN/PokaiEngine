import mongoose from 'mongoose';

import { BotAuthService } from '@/application/services/BotAuthService';
import { Bot } from '@/infrastructure/persistence/models/Bot';

// Mock the logger
jest.mock('@/infrastructure/logging/Logger', () => ({
	authLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
	},
}));

describe('Bot Authentication', () => {
	let authService: BotAuthService;

	beforeAll(async () => {
		// Connect to in-memory MongoDB
		await mongoose.connect('mongodb://localhost:27017/pokai-test');
	});

	afterAll(async () => {
		// Clean up
		await mongoose.connection.dropDatabase();
		await mongoose.connection.close();
	});

	beforeEach(async () => {
		// Clear all bots before each test
		await Bot.deleteMany({});
		authService = BotAuthService.getInstance();
		authService.clearAllCache();
	});

	describe('Bot Registration', () => {
		it('should register a new bot successfully', async () => {
			const botData = {
				botName: 'TestBot',
				developer: 'Test Developer',
				email: 'test@example.com',
			};

			const credentials = await authService.registerBot(botData);

			expect(credentials).toBeDefined();
			expect(credentials.botId).toBeDefined();
			expect(credentials.apiKey).toBeDefined();
			expect(credentials.botName).toBe(botData.botName);
			expect(credentials.developer).toBe(botData.developer);
			expect(credentials.email).toBe(botData.email);

			// Verify bot was saved to database
			const savedBot = await Bot.findOne({ botId: credentials.botId });
			expect(savedBot).toBeDefined();
			expect(savedBot?.status).toBe('active');
		});

		it('should generate unique bot IDs', async () => {
			const bot1 = await authService.registerBot({
				botName: 'TestBot',
				developer: 'Dev1',
				email: 'dev1@example.com',
			});

			const bot2 = await authService.registerBot({
				botName: 'TestBot', // Same name
				developer: 'Dev2',
				email: 'dev2@example.com',
			});

			expect(bot1.botId).not.toBe(bot2.botId);
		});
	});

	describe('Bot Validation', () => {
		it('should validate correct credentials', async () => {
			// Register a bot
			const credentials = await authService.registerBot({
				botName: 'ValidBot',
				developer: 'Test Dev',
				email: 'valid@example.com',
			});

			// Validate with correct credentials
			const isValid = await authService.validateBot(
				credentials.botId,
				credentials.apiKey,
			);

			expect(isValid).toBe(true);
		});

		it('should reject invalid API key', async () => {
			const credentials = await authService.registerBot({
				botName: 'TestBot',
				developer: 'Test Dev',
				email: 'test@example.com',
			});

			const isValid = await authService.validateBot(
				credentials.botId,
				'wrong-api-key',
			);

			expect(isValid).toBe(false);
		});

		it('should reject non-existent bot', async () => {
			const isValid = await authService.validateBot(
				'non-existent-bot-id',
				'some-api-key',
			);

			expect(isValid).toBe(false);
		});

		it('should reject suspended bot', async () => {
			const credentials = await authService.registerBot({
				botName: 'SuspendedBot',
				developer: 'Test Dev',
				email: 'suspended@example.com',
			});

			// Suspend the bot
			await authService.suspendBot(credentials.botId);

			// Try to validate
			const isValid = await authService.validateBot(
				credentials.botId,
				credentials.apiKey,
			);

			expect(isValid).toBe(false);
		});

		it('should reject revoked bot', async () => {
			const credentials = await authService.registerBot({
				botName: 'RevokedBot',
				developer: 'Test Dev',
				email: 'revoked@example.com',
			});

			// Revoke the bot
			await authService.revokeBot(credentials.botId);

			// Try to validate
			const isValid = await authService.validateBot(
				credentials.botId,
				credentials.apiKey,
			);

			expect(isValid).toBe(false);
		});
	});

	describe('Bot Management', () => {
		it('should regenerate API key', async () => {
			const credentials = await authService.registerBot({
				botName: 'RegenBot',
				developer: 'Test Dev',
				email: 'regen@example.com',
			});

			const oldKey = credentials.apiKey;
			const newKey = await authService.regenerateApiKey(credentials.botId);

			expect(newKey).toBeDefined();
			expect(newKey).not.toBe(oldKey);

			// Old key should not work
			const oldKeyValid = await authService.validateBot(
				credentials.botId,
				oldKey,
			);
			expect(oldKeyValid).toBe(false);

			// New key should work
			const newKeyValid = await authService.validateBot(
				credentials.botId,
				newKey,
			);
			expect(newKeyValid).toBe(true);
		});

		it('should suspend and reactivate bot', async () => {
			const credentials = await authService.registerBot({
				botName: 'SuspendBot',
				developer: 'Test Dev',
				email: 'suspend@example.com',
			});

			// Suspend
			await authService.suspendBot(credentials.botId);
			let bot = await authService.getBot(credentials.botId);
			expect(bot?.status).toBe('suspended');

			// Validation should fail
			let isValid = await authService.validateBot(
				credentials.botId,
				credentials.apiKey,
			);
			expect(isValid).toBe(false);

			// Reactivate
			await authService.reactivateBot(credentials.botId);
			bot = await authService.getBot(credentials.botId);
			expect(bot?.status).toBe('active');

			// Validation should work again
			isValid = await authService.validateBot(
				credentials.botId,
				credentials.apiKey,
			);
			expect(isValid).toBe(true);
		});

		it('should not reactivate revoked bot', async () => {
			const credentials = await authService.registerBot({
				botName: 'RevokeBot',
				developer: 'Test Dev',
				email: 'revoke@example.com',
			});

			// Revoke
			await authService.revokeBot(credentials.botId);

			// Try to reactivate
			await expect(
				authService.reactivateBot(credentials.botId),
			).rejects.toThrow('Cannot reactivate a revoked bot');
		});
	});

	describe('Bot Statistics', () => {
		it('should update bot statistics', async () => {
			const credentials = await authService.registerBot({
				botName: 'StatsBot',
				developer: 'Test Dev',
				email: 'stats@example.com',
			});

			// Update stats
			await authService.updateBotStats(
				credentials.botId,
				3, // games played
				50, // hands played
				1500, // winnings
			);

			const stats = await authService.getBotStats(credentials.botId);
			expect(stats).toBeDefined();
			expect(stats?.gamesPlayed).toBe(3);
			expect(stats?.handsPlayed).toBe(50);
			expect(stats?.totalWinnings).toBe(1500);
			expect(stats?.lastGameAt).toBeDefined();
		});
	});

	describe('Bot Listing', () => {
		beforeEach(async () => {
			// Create some test bots
			await authService.registerBot({
				botName: 'ActiveBot1',
				developer: 'Dev A',
				email: 'bot1@example.com',
			});

			const bot2 = await authService.registerBot({
				botName: 'SuspendedBot',
				developer: 'Dev B',
				email: 'bot2@example.com',
			});
			await authService.suspendBot(bot2.botId);

			await authService.registerBot({
				botName: 'ActiveBot2',
				developer: 'Dev A',
				email: 'bot3@example.com',
			});
		});

		it('should list all bots', async () => {
			const bots = await authService.listBots();
			expect(bots).toHaveLength(3);
		});

		it('should filter by status', async () => {
			const activeBots = await authService.listBots({ status: 'active' });
			expect(activeBots).toHaveLength(2);

			const suspendedBots = await authService.listBots({ status: 'suspended' });
			expect(suspendedBots).toHaveLength(1);
		});

		it('should filter by developer', async () => {
			const devABots = await authService.listBots({ developer: 'Dev A' });
			expect(devABots).toHaveLength(2);

			const devBBots = await authService.listBots({ developer: 'Dev B' });
			expect(devBBots).toHaveLength(1);
		});

		it('should not include API keys in listing', async () => {
			const bots = await authService.listBots();
			bots.forEach((bot) => {
				expect(bot.apiKey).toBeUndefined();
			});
		});
	});

	describe('Caching', () => {
		it('should cache bot on validation', async () => {
			const credentials = await authService.registerBot({
				botName: 'CacheBot',
				developer: 'Test Dev',
				email: 'cache@example.com',
			});

			// First validation - hits database
			const isValid1 = await authService.validateBot(
				credentials.botId,
				credentials.apiKey,
			);
			expect(isValid1).toBe(true);

			// Mock database call to verify cache is used
			const findOneSpy = jest.spyOn(Bot, 'findOne');

			// Clear the spy call count
			findOneSpy.mockClear();

			// Second validation - should use cache (no database call)
			const isValid2 = await authService.validateBot(
				credentials.botId,
				credentials.apiKey,
			);
			expect(isValid2).toBe(true);
			expect(findOneSpy).not.toHaveBeenCalled();

			// Restore the spy
			findOneSpy.mockRestore();
		});

		it('should clear cache on bot update', async () => {
			const credentials = await authService.registerBot({
				botName: 'ClearCacheBot',
				developer: 'Test Dev',
				email: 'clearcache@example.com',
			});

			// Validate to cache
			await authService.validateBot(credentials.botId, credentials.apiKey);

			// Suspend bot (should clear cache)
			await authService.suspendBot(credentials.botId);

			// Validation should fail (not using stale cache)
			const isValid = await authService.validateBot(
				credentials.botId,
				credentials.apiKey,
			);
			expect(isValid).toBe(false);
		});
	});
});
