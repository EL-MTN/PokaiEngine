import request from 'supertest';

import PokaiExpressServer from '@/services/server';

describe('Dashboard API', () => {
	let server: PokaiExpressServer;
	let app: any;

	beforeAll(async () => {
		server = new PokaiExpressServer(0); // Use port 0 for testing
		// Get the express app for testing
		app = (server as any).app;
	});

	afterAll(async () => {
		if (server) {
			await server.shutdown();
		}
	});

	describe('Dashboard Stats API', () => {
		it('should return dashboard stats', async () => {
			const response = await request(app)
				.get('/api/dashboard/stats')
				.expect(200);

			expect(response.body.success).toBe(true);
			expect(response.body.data).toHaveProperty('serverUptime');
			expect(response.body.data).toHaveProperty('memoryUsage');
			expect(response.body.data).toHaveProperty('totalConnections');
			expect(response.body.data).toHaveProperty('activeConnections');
			expect(response.body.data).toHaveProperty('timestamp');
		});
	});

	describe('Game Management API', () => {
		const testGameId = 'dashboard-test-game';

		beforeEach(async () => {
			// Clean up any existing test game
			try {
				await request(app).delete(`/api/games/${testGameId}`);
			} catch {
				// Ignore errors if game doesn't exist
			}
		});

		afterEach(async () => {
			// Clean up test game
			try {
				await request(app).delete(`/api/games/${testGameId}`);
			} catch {
				// Ignore errors if game doesn't exist
			}
		});

		it('should create a new game via dashboard', async () => {
			const gameConfig = {
				gameId: testGameId,
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				handStartDelay: 2000,
				isTournament: false,
				startSettings: {
					condition: 'manual',
				},
			};

			const response = await request(app)
				.post('/api/games')
				.send(gameConfig)
				.expect(201);

			expect(response.body.success).toBe(true);
			expect(response.body.data.id).toBe(testGameId);
			expect(response.body.data.maxPlayers).toBe(6);
		});

		it('should get game state via dashboard API', async () => {
			// First create a game
			const gameConfig = {
				gameId: testGameId,
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				handStartDelay: 2000,
				isTournament: false,
				startSettings: {
					condition: 'manual',
				},
			};

			await request(app).post('/api/games').send(gameConfig).expect(201);

			// Then get its state
			const response = await request(app)
				.get(`/api/games/${testGameId}/state`)
				.expect(200);

			expect(response.body.success).toBe(true);
			expect(response.body.data.gameId).toBe(testGameId);
			expect(response.body.data).toHaveProperty('currentPhase');
			expect(response.body.data).toHaveProperty('potSize');
			expect(response.body.data).toHaveProperty('players');
			expect(response.body.data).toHaveProperty('status');
		});

		it('should start a game via dashboard API', async () => {
			// First create a game
			const gameConfig = {
				gameId: testGameId,
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				handStartDelay: 2000,
				isTournament: false,
				startSettings: {
					condition: 'manual',
				},
			};

			await request(app).post('/api/games').send(gameConfig).expect(201);

			// Add some players to the game first
			const gameController = (server as any).gameController;
			gameController.addPlayerToGame(testGameId, 'player1', 'Player 1', 1000);
			gameController.addPlayerToGame(testGameId, 'player2', 'Player 2', 1000);

			// Then start it
			const response = await request(app)
				.post(`/api/games/${testGameId}/start`)
				.expect(200);

			expect(response.body.success).toBe(true);
			expect(response.body.message).toContain('started successfully');
		});

		it('should delete a game via dashboard API', async () => {
			// First create a game
			const gameConfig = {
				gameId: testGameId,
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				handStartDelay: 2000,
				isTournament: false,
			};

			await request(app).post('/api/games').send(gameConfig).expect(201);

			// Then delete it
			const response = await request(app)
				.delete(`/api/games/${testGameId}`)
				.expect(200);

			expect(response.body.success).toBe(true);
			expect(response.body.message).toContain('deleted successfully');

			// Verify it's deleted by trying to get it
			await request(app).get(`/api/games/${testGameId}`).expect(404);
		});

		it('should handle errors when starting non-existent game', async () => {
			const response = await request(app)
				.post('/api/games/non-existent-game/start')
				.expect(400);

			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe('Failed to start game');
		});

		it('should handle errors when deleting non-existent game', async () => {
			const response = await request(app)
				.delete('/api/games/non-existent-game')
				.expect(400);

			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe('Failed to delete game');
		});

		it('should handle errors when getting state of non-existent game', async () => {
			const response = await request(app)
				.get('/api/games/non-existent-game/state')
				.expect(404);

			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe('Game not found');
		});
	});

	describe('Dashboard Static Files', () => {
		it('should serve dashboard HTML file', async () => {
			const response = await request(app).get('/dashboard/').expect(200);

			expect(response.text).toContain('Pokai Admin Dashboard');
		});

		it('should serve dashboard CSS file', async () => {
			const response = await request(app)
				.get('/dashboard/dashboard.css')
				.expect(200);

			expect(response.headers['content-type']).toMatch(/text\/css/);
		});

		it('should serve dashboard JS file', async () => {
			const response = await request(app)
				.get('/dashboard/dashboard.js')
				.expect(200);

			expect(response.headers['content-type']).toMatch(/javascript/);
		});
	});

	describe('Game List Integration', () => {
		it('should list games with dashboard-relevant information', async () => {
			// Create a few test games
			const games = [
				{
					gameId: 'dashboard-list-test-1',
					maxPlayers: 4,
					smallBlindAmount: 5,
					bigBlindAmount: 10,
					turnTimeLimit: 20,
					handStartDelay: 1000,
					isTournament: false,
				},
				{
					gameId: 'dashboard-list-test-2',
					maxPlayers: 8,
					smallBlindAmount: 25,
					bigBlindAmount: 50,
					turnTimeLimit: 45,
					handStartDelay: 3000,
					isTournament: true,
				},
			];

			// Create the games
			for (const game of games) {
				await request(app).post('/api/games').send(game).expect(201);
			}

			try {
				// Get the games list
				const response = await request(app).get('/api/games').expect(200);

				expect(response.body.success).toBe(true);
				expect(Array.isArray(response.body.data)).toBe(true);

				const gameIds = response.body.data.map((game: any) => game.id);
				expect(gameIds).toContain('dashboard-list-test-1');
				expect(gameIds).toContain('dashboard-list-test-2');

				// Check that games have required dashboard properties
				response.body.data.forEach((game: any) => {
					expect(game).toHaveProperty('id');
					expect(game).toHaveProperty('maxPlayers');
					expect(game).toHaveProperty('smallBlind');
					expect(game).toHaveProperty('bigBlind');
					expect(game).toHaveProperty('playerCount');
					expect(typeof game.playerCount).toBe('number');
				});
			} finally {
				// Clean up test games
				for (const game of games) {
					try {
						await request(app).delete(`/api/games/${game.gameId}`);
					} catch {
						// Ignore cleanup errors
					}
				}
			}
		});
	});

	describe('Dashboard Error Handling', () => {
		it('should handle invalid game creation data', async () => {
			const invalidGameConfig = {
				// Missing required gameId
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
			};

			const response = await request(app)
				.post('/api/games')
				.send(invalidGameConfig)
				.expect(400);

			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe('gameId is required');
		});

		it('should handle duplicate game creation', async () => {
			const gameConfig = {
				gameId: 'duplicate-test',
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				handStartDelay: 2000,
				isTournament: false,
			};

			// Create first game
			await request(app).post('/api/games').send(gameConfig).expect(201);

			try {
				// Try to create duplicate
				const response = await request(app)
					.post('/api/games')
					.send(gameConfig)
					.expect(400);

				expect(response.body.success).toBe(false);
				expect(response.body.error).toBe('Failed to create game');
			} finally {
				// Clean up
				try {
					await request(app).delete('/api/games/duplicate-test');
				} catch {
					// Ignore cleanup errors
				}
			}
		});
	});
});
