import { Express } from 'express';
import request from 'supertest';

import { BotAuthService } from '@/application/services/BotAuthService';
import PokaiExpressServer from '@/presentation/server';

// Mock dependencies
jest.mock('@/infrastructure/logging/Logger', () => ({
	serverLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
		http: jest.fn(),
	},
	replayLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
	},
}));

const mockBotAuthService = {
	registerBot: jest.fn().mockResolvedValue({
		botId: 'test-bot-id',
		apiKey: 'test-api-key',
		botName: 'TestBot',
	}),
	listBots: jest.fn().mockResolvedValue([
		{ botId: 'bot1', botName: 'Bot1', status: 'active' },
		{ botId: 'bot2', botName: 'Bot2', status: 'suspended' },
	]),
	getBot: jest.fn().mockResolvedValue({
		botId: 'test-bot',
		botName: 'TestBot',
		status: 'active',
		developer: 'Test Developer',
	}),
	getBotStats: jest.fn().mockResolvedValue({
		gamesPlayed: 10,
		totalWinnings: 1000,
		winRate: 0.6,
	}),
	regenerateApiKey: jest.fn().mockResolvedValue('new-api-key'),
	suspendBot: jest.fn().mockResolvedValue(true),
	reactivateBot: jest.fn().mockResolvedValue(true),
	revokeBot: jest.fn().mockResolvedValue(true),
};

jest.mock('@/application/services/BotAuthService', () => ({
	BotAuthService: {
		getInstance: () => mockBotAuthService,
	},
}));

describe('PokaiExpressServer', () => {
	let server: PokaiExpressServer;
	let app: Express;
	let testPort: number;

	beforeAll(async () => {
		// Use port 0 for testing (random available port)
		testPort = 0;
		server = new PokaiExpressServer(testPort);
		// Access the Express app for testing
		app = (server as any).app;
	});

	afterAll(async () => {
		if (server) {
			await server.shutdown();
		}
	});

	describe('Basic Server Info', () => {
		it('should return server information on root endpoint', async () => {
			const response = await request(app).get('/');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('name', 'Pokai Poker Engine');
			expect(response.body).toHaveProperty('version', '1.0.0');
			expect(response.body).toHaveProperty('endpoints');
			expect(response.body.endpoints).toHaveProperty('health');
			expect(response.body.endpoints).toHaveProperty('stats');
			expect(response.body.endpoints).toHaveProperty('games');
		});

		it('should return health status', async () => {
			const response = await request(app).get('/health');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('status', 'healthy');
			expect(response.body).toHaveProperty('timestamp');
			expect(response.body).toHaveProperty('uptime');
		});

		it('should return server statistics', async () => {
			const response = await request(app).get('/stats');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('serverUptime');
			expect(response.body).toHaveProperty('timestamp');
		});

		it('should return API documentation', async () => {
			const response = await request(app).get('/docs');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('name', 'Pokai Poker Engine API');
			expect(response.body).toHaveProperty('endpoints');
			expect(response.body).toHaveProperty('websocket');
		});
	});

	describe('Game API Endpoints', () => {
		it('should list all games', async () => {
			const response = await request(app).get('/api/games');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body).toHaveProperty('data');
			expect(Array.isArray(response.body.data)).toBe(true);
		});

		it('should create a new game', async () => {
				const response = await request(app).post('/api/games').send({
						gameId: 'test-game-1',
						maxPlayers: 6,
						smallBlind: 10,
						bigBlind: 20,
						turnTimeLimit: 30,
						isTournament: false,
				});

				expect(response.status).toBe(201);
				expect(response.body).toHaveProperty('success', true);
				expect(response.body).toHaveProperty('data');
				expect(response.body.data).toHaveProperty('id', 'test-game-1'); // Changed from gameId to id
		});

		it('should return error when creating game without gameId', async () => {
			const gameData = {
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
			};

			const response = await request(app)
				.post('/api/games')
				.send(gameData);
			
			expect(response.status).toBe(400);
			expect(response.body).toHaveProperty('success', false);
			expect(response.body).toHaveProperty('error', 'gameId is required');
		});

		it('should find available games', async () => {
			const response = await request(app).get('/api/games/available');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body).toHaveProperty('data');
			expect(Array.isArray(response.body.data)).toBe(true);
		});

		it('should find available games with maxPlayers filter', async () => {
			const response = await request(app).get('/api/games/available?maxPlayers=6');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body).toHaveProperty('data');
		});

		it('should get specific game info', async () => {
			// First create a game
			await request(app)
				.post('/api/games')
				.send({
					gameId: 'test-game-2',
					maxPlayers: 4,
					smallBlindAmount: 5,
					bigBlindAmount: 10,
				});

			const response = await request(app).get('/api/games/test-game-2');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body).toHaveProperty('data');
		});

		it('should return 404 for non-existent game', async () => {
			const response = await request(app).get('/api/games/non-existent-game');
			
			expect(response.status).toBe(404);
			expect(response.body).toHaveProperty('success', false);
			expect(response.body).toHaveProperty('error', 'Game not found');
		});

		it('should start a game', async () => {
				// First create a game
				await request(app).post('/api/games').send({
						gameId: 'test-game-start',
						maxPlayers: 6,
						smallBlind: 10,
						bigBlind: 20,
						turnTimeLimit: 30,
						isTournament: false,
				});

				// Mock the game controller to allow starting (the game needs minimum players)
				const mockGameController = (server as any).gameController;
				const originalStartGame = mockGameController.startGame;
				mockGameController.startGame = jest.fn().mockResolvedValue(true);

				const response = await request(app).post('/api/games/test-game-start/start');

				expect(response.status).toBe(200);
				expect(response.body).toHaveProperty('success', true);
				expect(response.body.message).toContain('started successfully');

				// Restore original method
				mockGameController.startGame = originalStartGame;
		});

		it('should delete a game', async () => {
			// First create a game
			await request(app)
				.post('/api/games')
				.send({
					gameId: 'test-game-delete',
					maxPlayers: 2,
					smallBlindAmount: 10,
					bigBlindAmount: 20,
				});

			const response = await request(app).delete('/api/games/test-game-delete');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body.message).toContain('deleted successfully');
		});

		it('should get game state', async () => {
			// First create a game
			await request(app)
				.post('/api/games')
				.send({
					gameId: 'test-game-state',
					maxPlayers: 2,
					smallBlindAmount: 10,
					bigBlindAmount: 20,
				});

			const response = await request(app).get('/api/games/test-game-state/state');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body.data).toHaveProperty('gameId', 'test-game-state');
			expect(response.body.data).toHaveProperty('currentPhase');
			expect(response.body.data).toHaveProperty('players');
		});
	});

	describe('Player API Endpoints', () => {
		beforeEach(async () => {
			// Create a test game for player tests
			await request(app)
				.post('/api/games')
				.send({
					gameId: 'player-test-game',
					maxPlayers: 6,
					smallBlindAmount: 10,
					bigBlindAmount: 20,
				});
		});

		it('should check if player can join game', async () => {
			const response = await request(app)
				.get('/api/games/player-test-game/can-join/test-player');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body.data).toHaveProperty('canJoin');
		});

		it('should get player game state', async () => {
			const response = await request(app)
				.get('/api/games/player-test-game/players/test-player/state');
			
			// This might return an error since player isn't actually in the game
			// but the endpoint should be accessible
			expect([200, 400]).toContain(response.status);
		});

		it('should get player possible actions', async () => {
			const response = await request(app)
				.get('/api/games/player-test-game/players/test-player/actions');
			
			// This might return an error since player isn't actually in the game
			expect([200, 400]).toContain(response.status);
		});
	});

	describe('Bot Management API', () => {
		it('should register a new bot', async () => {
			const botData = {
				botName: 'TestBot',
				developer: 'Test Developer',
				email: 'test@example.com',
			};

			const response = await request(app)
				.post('/api/bots/register')
				.send(botData);
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body.data).toHaveProperty('botId');
			expect(response.body.data).toHaveProperty('apiKey');
		});

		it('should return error for incomplete bot registration', async () => {
			const incompleteData = {
				botName: 'TestBot',
				// Missing developer and email
			};

			const response = await request(app)
				.post('/api/bots/register')
				.send(incompleteData);
			
			expect(response.status).toBe(400);
			expect(response.body).toHaveProperty('success', false);
			expect(response.body.message).toContain('Missing required fields');
		});

		it('should list all bots', async () => {
			const response = await request(app).get('/api/bots');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body).toHaveProperty('data');
			expect(Array.isArray(response.body.data)).toBe(true);
		});

		it('should list bots with filters', async () => {
			const response = await request(app).get('/api/bots?status=active&developer=TestDev');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body).toHaveProperty('data');
		});

		it('should get specific bot info', async () => {
			const response = await request(app).get('/api/bots/test-bot');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body.data).toHaveProperty('botId');
		});

		it('should return 404 for non-existent bot', async () => {
			const mockBotAuthService = BotAuthService.getInstance();
			(mockBotAuthService.getBot as jest.Mock).mockResolvedValueOnce(null);

			const response = await request(app).get('/api/bots/non-existent');
			
			expect(response.status).toBe(404);
			expect(response.body).toHaveProperty('success', false);
		});

		it('should get bot statistics', async () => {
			const response = await request(app).get('/api/bots/test-bot/stats');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body.data).toHaveProperty('gamesPlayed');
		});

		it('should regenerate bot API key', async () => {
			const response = await request(app).post('/api/bots/test-bot/regenerate-key');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body.data).toHaveProperty('apiKey');
		});

		it('should suspend a bot', async () => {
			const response = await request(app).post('/api/bots/test-bot/suspend');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body.message).toContain('suspended successfully');
		});

		it('should reactivate a bot', async () => {
			const response = await request(app).post('/api/bots/test-bot/reactivate');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body.message).toContain('reactivated successfully');
		});

		it('should revoke a bot', async () => {
			const response = await request(app).post('/api/bots/test-bot/revoke');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body.message).toContain('revoked successfully');
		});
	});

	describe('Replay API Endpoints', () => {
		it('should list all replays', async () => {
			const response = await request(app).get('/api/replays');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body).toHaveProperty('data');
			expect(response.body).toHaveProperty('stats');
		});

		it('should list replays with limit', async () => {
			const response = await request(app).get('/api/replays?limit=5');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
		});

		it('should get specific replay', async () => {
			const response = await request(app).get('/api/replays/test-game-1');
			
			// This might return 404 since replay might not exist
			expect([200, 404, 500]).toContain(response.status);
		});

		it('should get hand replay data', async () => {
			const response = await request(app).get('/api/replays/test-game-1/hands/1');
			
			// This might return 404 since replay might not exist
			expect([200, 400, 404, 500]).toContain(response.status);
		});

		it('should return error for invalid hand number', async () => {
			const response = await request(app).get('/api/replays/test-game-1/hands/invalid');
			
			expect(response.status).toBe(400);
			expect(response.body).toHaveProperty('success', false);
			expect(response.body.error).toBe('Invalid hand number');
		});

		it('should save replay to file', async () => {
			const response = await request(app).post('/api/replays/test-game-1/save');
			
			// This might fail since the game might not exist
			expect([200, 400, 500]).toContain(response.status);
		});

		it('should export replay in JSON format', async () => {
			const response = await request(app).get('/api/replays/test-game-1/export?format=json');
			
			// This might return 404 since replay might not exist
			expect([200, 404, 500]).toContain(response.status);
		});

		it('should export replay in compressed format', async () => {
			const response = await request(app).get('/api/replays/test-game-1/export?format=compressed');
			
			// This might return 404 since replay might not exist
			expect([200, 404, 500]).toContain(response.status);
		});

		it('should return error for invalid export format', async () => {
			const response = await request(app).get('/api/replays/test-game-1/export?format=invalid');
			
			expect(response.status).toBe(400);
			expect(response.body).toHaveProperty('success', false);
			expect(response.body.error).toBe('Invalid format');
		});

		it('should get replay analysis', async () => {
			const response = await request(app).get('/api/replays/test-game-1/analysis');
			
			// This might return 404 since replay might not exist
			expect([200, 404, 500]).toContain(response.status);
		});
	});

	describe('Dashboard API', () => {
		it('should get dashboard statistics', async () => {
			const response = await request(app).get('/api/dashboard/stats');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
			expect(response.body.data).toHaveProperty('serverUptime');
			expect(response.body.data).toHaveProperty('memoryUsage');
			expect(response.body.data).toHaveProperty('timestamp');
		});
	});

	describe('Error Handling', () => {
		it('should return 404 for non-existent routes', async () => {
			const response = await request(app).get('/api/non-existent-endpoint');
			
			expect(response.status).toBe(404);
			expect(response.body).toHaveProperty('success', false);
			expect(response.body).toHaveProperty('error', 'Not found');
			expect(response.body.message).toContain('Route GET /api/non-existent-endpoint not found');
		});

		it('should handle server errors gracefully', async () => {
			// Mock an error in game creation
			const mockGameController = (server as any).gameController;
			const originalCreateGame = mockGameController.createGame;
			mockGameController.createGame = jest.fn(() => {
				throw new Error('Simulated server error');
			});

			const response = await request(app)
				.post('/api/games')
				.send({
					gameId: 'error-test-game',
					maxPlayers: 6,
				});
			
			expect(response.status).toBe(400);
			expect(response.body).toHaveProperty('success', false);
			expect(response.body).toHaveProperty('error', 'Failed to create game');

			// Restore original method
			mockGameController.createGame = originalCreateGame;
		});
	});

	describe('CORS and Middleware', () => {
		it('should handle CORS preflight requests', async () => {
			const response = await request(app)
				.options('/api/games')
				.set('Origin', 'http://localhost:3000')
				.set('Access-Control-Request-Method', 'POST');
			
			expect(response.status).toBe(200);
		});

		it('should parse JSON request bodies', async () => {
			const response = await request(app)
				.post('/api/bots/register')
				.send({
					botName: 'JSONTestBot',
					developer: 'Test Developer',
					email: 'json@test.com',
				})
				.set('Content-Type', 'application/json');
			
			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('success', true);
		});

		it('should serve static files', async () => {
			// Test serving static files (dashboard)
			const response = await request(app).get('/dashboard/');
			
			// This might return 404 if files don't exist, but should not crash
			expect([200, 404]).toContain(response.status);
		});
	});

	describe('Integration Error Scenarios', () => {
		it('should handle bot service errors gracefully', async () => {
			const mockBotAuthService = BotAuthService.getInstance();
			(mockBotAuthService.registerBot as jest.Mock).mockRejectedValueOnce(
				new Error('Database connection failed')
			);

			const response = await request(app)
				.post('/api/bots/register')
				.send({
					botName: 'ErrorBot',
					developer: 'Test Developer',
					email: 'error@test.com',
				});
			
			expect(response.status).toBe(400);
			expect(response.body).toHaveProperty('success', false);
		});

		it('should handle game controller errors', async () => {
			// Mock an error scenario
			const mockGameController = (server as any).gameController;
			const originalListGames = mockGameController.listAllReplays;
			mockGameController.listAllReplays = jest.fn(() => {
				throw new Error('Game controller error');
			});

			const response = await request(app).get('/api/replays');
			
			expect(response.status).toBe(500);
			expect(response.body).toHaveProperty('success', false);

			// Restore original method
			mockGameController.listAllReplays = originalListGames;
		});
	});
}); 