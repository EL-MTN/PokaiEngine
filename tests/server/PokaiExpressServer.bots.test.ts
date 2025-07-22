import { BotAuthService } from '@/services/auth/BotAuthService';
import { createTestServer, request } from './PokaiExpressServer.setup';

describe('PokaiExpressServer - Bot Management Routes', () => {
	let server: any;
	let app: any;
	let authService: BotAuthService;

	beforeEach(() => {
		jest.clearAllMocks();
		const testServer = createTestServer();
		server = testServer.server;
		app = testServer.app;
		authService = BotAuthService.getInstance();
	});

	afterEach(async () => {
		const serverAny = server as any;
		if (serverAny.httpServer) {
			await new Promise<void>((resolve) => {
				serverAny.httpServer.close(() => resolve());
			});
		}
		jest.restoreAllMocks();
	});

	describe('POST /api/bots/register', () => {
		it('should register a new bot', async () => {
			const botData = {
				botName: 'TestBot',
				developer: 'TestDev',
				email: 'test@example.com',
			};

			const mockCredentials = {
				botId: 'test-bot-id',
				apiKey: 'test-api-key',
				botName: botData.botName,
				developer: botData.developer,
				email: botData.email,
			};

			jest.spyOn(authService, 'registerBot').mockResolvedValue(mockCredentials);

			const response = await request(app).post('/api/bots/register').send(botData);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				data: mockCredentials,
			});
		});

		it('should handle registration errors', async () => {
			const botData = {
				botName: 'TestBot',
				developer: 'TestDev',
				email: 'test@example.com',
			};

			jest
				.spyOn(authService, 'registerBot')
				.mockRejectedValue(new Error('Registration failed'));

			const response = await request(app).post('/api/bots/register').send(botData);

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toContain('Registration failed');
		});

		it('should validate required fields', async () => {
			const response = await request(app).post('/api/bots/register').send({
				botName: 'TestBot',
				// Missing developer and email
			});

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toContain('Missing required fields');
		});
	});

	describe('GET /api/bots', () => {
		it('should list all bots', async () => {
			const mockBots = [
				{
					botId: 'bot1',
					botName: 'Bot1',
					developer: 'Dev1',
					status: 'active',
				},
				{
					botId: 'bot2',
					botName: 'Bot2',
					developer: 'Dev2',
					status: 'suspended',
				},
			];

			jest.spyOn(authService, 'listBots').mockResolvedValue(mockBots);

			const response = await request(app).get('/api/bots');

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				data: mockBots,
			});
		});

		it('should filter bots by status', async () => {
			const mockBots = [
				{
					botId: 'bot1',
					botName: 'Bot1',
					developer: 'Dev1',
					status: 'active',
				},
			];

			jest.spyOn(authService, 'listBots').mockResolvedValue(mockBots);

			const response = await request(app).get('/api/bots?status=active');

			expect(response.status).toBe(200);
			expect(authService.listBots).toHaveBeenCalledWith({ status: 'active' });
		});
	});

	describe('GET /api/bots/:botId', () => {
		it('should get bot details', async () => {
			const mockBot = {
				botId: 'test-bot',
				botName: 'TestBot',
				developer: 'TestDev',
				status: 'active',
			};

			jest.spyOn(authService, 'getBot').mockResolvedValue(mockBot);

			const response = await request(app).get('/api/bots/test-bot');

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				data: mockBot,
			});
		});

		it('should handle bot not found', async () => {
			jest.spyOn(authService, 'getBot').mockResolvedValue(null);

			const response = await request(app).get('/api/bots/non-existent');

			expect(response.status).toBe(404);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toContain('Bot not found');
		});
	});

	describe('GET /api/bots/:botId/stats', () => {
		it('should get bot statistics', async () => {
			const mockStats = {
				gamesPlayed: 10,
				handsPlayed: 100,
				totalWinnings: 5000,
				lastGameAt: new Date(),
			};

			jest.spyOn(authService, 'getBotStats').mockResolvedValue(mockStats);

			const response = await request(app).get('/api/bots/test-bot/stats');

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.data).toMatchObject({
				gamesPlayed: 10,
				handsPlayed: 100,
				totalWinnings: 5000,
			});
			expect(response.body.data.lastGameAt).toBeDefined();
		});

		it('should handle stats not found', async () => {
			jest.spyOn(authService, 'getBotStats').mockResolvedValue(null);

			const response = await request(app).get('/api/bots/non-existent/stats');

			expect(response.status).toBe(404);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toContain('Bot not found');
		});
	});

	describe('POST /api/bots/:botId/regenerate-key', () => {
		it('should regenerate bot API key', async () => {
			const newKey = 'new-api-key';

			jest.spyOn(authService, 'regenerateApiKey').mockResolvedValue(newKey);

			const response = await request(app).post('/api/bots/test-bot/regenerate-key');

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				data: { apiKey: newKey },
			});
		});
	});

	describe('POST /api/bots/:botId/suspend', () => {
		it('should suspend a bot', async () => {
			jest.spyOn(authService, 'suspendBot').mockResolvedValue(undefined);

			const response = await request(app).post('/api/bots/test-bot/suspend');

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				message: 'Bot suspended successfully',
			});
		});
	});

	describe('POST /api/bots/:botId/reactivate', () => {
		it('should reactivate a bot', async () => {
			jest.spyOn(authService, 'reactivateBot').mockResolvedValue(undefined);

			const response = await request(app).post('/api/bots/test-bot/reactivate');

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				message: 'Bot reactivated successfully',
			});
		});
	});

	describe('POST /api/bots/:botId/revoke', () => {
		it('should revoke a bot', async () => {
			jest.spyOn(authService, 'revokeBot').mockResolvedValue(undefined);

			const response = await request(app).post('/api/bots/test-bot/revoke');

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				message: 'Bot revoked successfully',
			});
		});
	});
});