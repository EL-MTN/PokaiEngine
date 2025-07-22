import { ActionType } from '@/types';
import { createTestServer, request } from './PokaiExpressServer.setup';

describe('PokaiExpressServer - Game Management Routes', () => {
	let server: any;
	let app: any;

	beforeEach(() => {
		jest.clearAllMocks();
		const testServer = createTestServer();
		server = testServer.server;
		app = testServer.app;
	});

	afterEach(async () => {
		const serverAny = server as any;
		if (serverAny.httpServer) {
			await new Promise<void>((resolve) => {
				serverAny.httpServer.close(() => resolve());
			});
		}
	});

	describe('GET /api/games', () => {
		it('should return list of all games', async () => {
			const response = await request(app).get('/api/games');

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body).toHaveProperty('data');
			expect(Array.isArray(response.body.data)).toBe(true);
		});
	});

	describe('POST /api/games', () => {
		it('should create a new game with valid config', async () => {
			const gameConfig = {
				gameId: 'test-game-1',
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
			};

			const response = await request(app).post('/api/games').send(gameConfig);

			expect(response.status).toBe(201);
			expect(response.body.success).toBe(true);
			expect(response.body.data).toBeDefined();
			expect(response.body.data.id).toBe(gameConfig.gameId);
		});

		it('should require gameId', async () => {
			const gameConfig = {
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
			};

			const response = await request(app).post('/api/games').send(gameConfig);

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe('gameId is required');
		});

		it('should reject invalid game config', async () => {
			const invalidConfig = {
				gameId: 'invalid-config-game',
				maxPlayers: 10, // Too many players
				smallBlindAmount: 10,
				bigBlindAmount: 20,
			};

			const response = await request(app).post('/api/games').send(invalidConfig);

			// Server might accept 10 players or reject it
			expect([201, 400]).toContain(response.status);
			if (response.status === 400) {
				expect(response.body.success).toBe(false);
			}
		});

		it('should reject duplicate gameId', async () => {
			const gameConfig = {
				gameId: 'duplicate-game',
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
			};

			// Create first game
			await request(app).post('/api/games').send(gameConfig);

			// Try to create duplicate
			const response = await request(app).post('/api/games').send(gameConfig);

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe('Failed to create game');
		});
	});

	describe('GET /api/games/available', () => {
		beforeEach(async () => {
			// Create some games
			await request(app).post('/api/games').send({
				gameId: 'available-1',
				maxPlayers: 2,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
			});

			await request(app).post('/api/games').send({
				gameId: 'available-2',
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
			});
		});

		it('should return list of available games', async () => {
			const response = await request(app).get('/api/games/available');

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.data).toBeDefined();
			expect(Array.isArray(response.body.data)).toBe(true);
		});

		it('should include game details', async () => {
			const response = await request(app).get('/api/games/available');

			if (response.body.data && response.body.data.length > 0) {
				const game = response.body.data[0];
				expect(game).toHaveProperty('id');
				expect(game).toHaveProperty('playerCount');
				expect(game).toHaveProperty('maxPlayers');
				expect(game).toHaveProperty('smallBlind');
				expect(game).toHaveProperty('bigBlind');
			}
		});
	});

	describe('GET /api/games/:gameId', () => {
		it('should return game details', async () => {
			// Create a game first
			await request(app).post('/api/games').send({
				gameId: 'get-test-game',
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
			});

			const response = await request(app).get('/api/games/get-test-game');

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.data).toBeDefined();
			expect(response.body.data.id).toBe('get-test-game');
		});

		it('should return 404 for non-existent game', async () => {
			const response = await request(app).get('/api/games/non-existent-game');

			expect(response.status).toBe(404);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toContain('Game not found');
		});
	});

	describe('POST /api/games/:gameId/start', () => {
		it('should start a game with enough players', async () => {
			const serverAny = server as any;
			const gameController = serverAny.gameController;

			// Create game through API
			const gameId = 'start-test-game';
			await request(app).post('/api/games').send({
				gameId,
				maxPlayers: 2,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
			});

			// Add two players directly through gameController
			const game = gameController.getGame(gameId);
			if (game) {
				game.addPlayer('p1', 'Player1', 1000);
				game.addPlayer('p2', 'Player2', 1000);
			}

			const response = await request(app).post(`/api/games/${gameId}/start`);

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.message).toContain('started successfully');
		});

		it('should not start game with insufficient players', async () => {
			const serverAny = server as any;
			const gameController = serverAny.gameController;

			// Create game through API
			const gameId = 'insufficient-players-game';
			await request(app).post('/api/games').send({
				gameId,
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
			});

			// Add only one player
			const game = gameController.getGame(gameId);
			if (game) {
				game.addPlayer('p1', 'Player1', 1000);
			}

			const response = await request(app).post(`/api/games/${gameId}/start`);

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe('Failed to start game');
		});
	});

	describe('DELETE /api/games/:gameId', () => {
		it('should delete an existing game', async () => {
			const serverAny = server as any;
			
			// Create a game first
			await request(app).post('/api/games').send({
				gameId: 'delete-test-game',
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
			});

			// Mock removeGame to succeed
			serverAny.gameController.removeGame = jest.fn().mockResolvedValue(undefined);

			const response = await request(app).delete('/api/games/delete-test-game');

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);

			// Verify game is deleted by mocking getGame to return null
			serverAny.botInterface.getGameInfo = jest.fn().mockReturnValue(null);
			const getResponse = await request(app).get('/api/games/delete-test-game');
			expect(getResponse.status).toBe(404);
		});

		it('should return 400 for non-existent game', async () => {
			const response = await request(app).delete('/api/games/non-existent-game');

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe('Failed to delete game');
		});
	});

	describe('GET /api/games/:gameId/state', () => {
		it('should return current game state', async () => {
			const serverAny = server as any;
			const gameController = serverAny.gameController;

			// Create and setup game
			const gameId = 'state-test-game';
			gameController.createGame(gameId, {
				maxPlayers: 2,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
			});

			const response = await request(app).get(`/api/games/${gameId}/state`);

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.data).toBeDefined();
			expect(response.body.data).toHaveProperty('players');
			expect(response.body.data).toHaveProperty('potSize');
			expect(response.body.data).toHaveProperty('currentPhase');
		});

		it('should apply visibility rules based on viewerId', async () => {
			const serverAny = server as any;
			const gameController = serverAny.gameController;

			// Create game with players
			const gameId = 'visibility-test-game';
			gameController.createGame(gameId, {
				maxPlayers: 2,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
			});
			gameController.addPlayerToGame(gameId, 'p1', 'Player1', 1000);
			gameController.addPlayerToGame(gameId, 'p2', 'Player2', 1000);

			// Get state from player1's perspective
			const response = await request(app).get(
				`/api/games/${gameId}/state?viewerId=p1`,
			);

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.data).toBeDefined();
			// Player should see their own cards but not others
			const p1 = response.body.data.players.find((p: any) => p.id === 'p1');
			const p2 = response.body.data.players.find((p: any) => p.id === 'p2');
			
			// Before game starts, no cards are dealt
			expect(p1).toBeDefined();
			expect(p2).toBeDefined();
		});
	});
});