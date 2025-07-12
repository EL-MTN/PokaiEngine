import request from 'supertest';
import express from 'express';
import { GameController } from '@/application/engine/GameController';
import { BotInterface } from '@/infrastructure/communication/BotInterface';
import { GameConfig } from '@/domain/types';

/**
 * Test the Express API endpoints using the existing infrastructure
 */
describe('Express API Integration', () => {
	let app: express.Express;
	let gameController: GameController;
	let botInterface: BotInterface;

	beforeEach(() => {
		// Set up Express app with basic middleware
		app = express();
		app.use(express.json());
		app.use((req, res, next) => {
			res.header('Access-Control-Allow-Origin', '*');
			next();
		});

		// Initialize fresh game components for each test
		gameController = new GameController();
		botInterface = new BotInterface(gameController);

		// Set up routes
		setupRoutes();
	});

	function setupRoutes() {
		// Health check
		app.get('/health', (req, res) => {
			res.json({
				status: 'healthy',
				timestamp: new Date().toISOString(),
				uptime: process.uptime(),
			});
		});

		// Server stats
		app.get('/stats', (req, res) => {
			const stats = gameController.getOverallStats();
			res.json({
				...stats,
				timestamp: new Date().toISOString(),
			});
		});

		// List all games
		app.get('/api/games', (req, res) => {
			try {
				const games = botInterface.listGames();
				res.json({ success: true, data: games });
			} catch (error) {
				res.status(500).json({
					success: false,
					error: 'Failed to retrieve games',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		// Create a new game
		app.post('/api/games', (req, res) => {
			try {
				const {
					gameId,
					maxPlayers = 9,
					smallBlindAmount = 10,
					bigBlindAmount = 20,
					turnTimeLimit = 30,
					isTournament = false,
				} = req.body;

				if (!gameId) {
					res.status(400).json({
						success: false,
						error: 'gameId is required',
					});
					return;
				}

				const gameConfig: GameConfig = {
					maxPlayers,
					smallBlindAmount,
					bigBlindAmount,
					turnTimeLimit,
					isTournament,
				};

				gameController.createGame(gameId, gameConfig);
				const gameInfo = botInterface.getGameInfo(gameId);

				res.status(201).json({
					success: true,
					data: gameInfo,
					message: 'Game created successfully',
				});
			} catch (error) {
				res.status(400).json({
					success: false,
					error: 'Failed to create game',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		// Find available games - must come before /:gameId route
		app.get('/api/games/available', (req, res) => {
			try {
				const maxPlayers = req.query.maxPlayers ? parseInt(req.query.maxPlayers as string) : undefined;
				const availableGames = botInterface.findAvailableGames(maxPlayers);
				res.json({ success: true, data: availableGames });
			} catch (error) {
				res.status(500).json({
					success: false,
					error: 'Failed to find available games',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		// Get game info
		app.get('/api/games/:gameId', (req, res) => {
			try {
				const gameId = req.params.gameId;
				const gameInfo = botInterface.getGameInfo(gameId);
				
				if (!gameInfo) {
					res.status(404).json({
						success: false,
						error: 'Game not found',
					});
					return;
				}

				res.json({ success: true, data: gameInfo });
			} catch (error) {
				res.status(500).json({
					success: false,
					error: 'Failed to retrieve game info',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		// Check if player can join game
		app.get('/api/games/:gameId/can-join/:playerId', (req, res) => {
			try {
				const { gameId, playerId } = req.params;
				const canJoin = botInterface.canJoinGame(gameId, playerId);
				res.json({ success: true, data: { canJoin } });
			} catch (error) {
				res.status(500).json({
					success: false,
					error: 'Failed to check join eligibility',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		// Get player game state
		app.get('/api/games/:gameId/players/:playerId/state', (req, res) => {
			try {
				const { gameId, playerId } = req.params;
				const gameState = botInterface.getGameState(gameId, playerId);
				res.json({ success: true, data: gameState });
			} catch (error) {
				res.status(400).json({
					success: false,
					error: 'Failed to get game state',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		// Get possible actions
		app.get('/api/games/:gameId/players/:playerId/actions', (req, res) => {
			try {
				const { gameId, playerId } = req.params;
				const possibleActions = botInterface.getPossibleActions(gameId, playerId);
				res.json({ success: true, data: possibleActions });
			} catch (error) {
				res.status(400).json({
					success: false,
					error: 'Failed to get possible actions',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		// Start a hand
		app.post('/api/games/:gameId/start', (req, res) => {
			try {
				const gameId = req.params.gameId;
				gameController.startHand(gameId);
				res.json({ success: true, message: 'Hand started successfully' });
			} catch (error) {
				res.status(400).json({
					success: false,
					error: 'Failed to start hand',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		// API documentation
		app.get('/docs', (req, res) => {
			res.json({
				name: 'Pokai Poker Engine API',
				version: '1.0.0',
				description: 'REST API for bot developers',
				endpoints: {
					'GET /health': 'Health check',
					'GET /stats': 'Server statistics',
					'GET /api/games': 'List all games',
					'POST /api/games': 'Create new game',
					'GET /api/games/available': 'Find available games',
					'GET /api/games/:gameId': 'Get game info',
					'GET /api/games/:gameId/can-join/:playerId': 'Check if player can join',
					'GET /api/games/:gameId/players/:playerId/state': 'Get player game state',
					'GET /api/games/:gameId/players/:playerId/actions': 'Get possible actions',
					'POST /api/games/:gameId/start': 'Start a hand',
				},
			});
		});
	}

	describe('Health and Info Routes', () => {
		it('should return health status', async () => {
			const response = await request(app)
				.get('/health')
				.expect(200);

			expect(response.body).toMatchObject({
				status: 'healthy',
				timestamp: expect.any(String),
				uptime: expect.any(Number),
			});
		});

		it('should return server stats', async () => {
			const response = await request(app)
				.get('/stats')
				.expect(200);

			expect(response.body).toMatchObject({
				totalGames: expect.any(Number),
				activeGames: expect.any(Number),
				totalPlayers: expect.any(Number),
				averagePlayersPerGame: expect.any(Number),
				timestamp: expect.any(String),
			});
		});

		it('should return API documentation', async () => {
			const response = await request(app)
				.get('/docs')
				.expect(200);

			expect(response.body).toMatchObject({
				name: 'Pokai Poker Engine API',
				version: '1.0.0',
				description: expect.any(String),
				endpoints: expect.any(Object),
			});
		});
	});

	describe('Game Management Routes', () => {
		it('should list all games', async () => {
			const response = await request(app)
				.get('/api/games')
				.expect(200);

			expect(response.body).toMatchObject({
				success: true,
				data: expect.any(Array),
			});
		});

		it('should create a new game', async () => {
			const gameData = {
				gameId: 'test-game',
				maxPlayers: 4,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
			};

			const response = await request(app)
				.post('/api/games')
				.send(gameData)
				.expect(201);

			expect(response.body).toMatchObject({
				success: true,
				data: expect.objectContaining({
					id: 'test-game',
					maxPlayers: 4,
				}),
				message: 'Game created successfully',
			});
		});

		it('should return error for missing gameId', async () => {
			const response = await request(app)
				.post('/api/games')
				.send({})
				.expect(400);

			expect(response.body).toMatchObject({
				success: false,
				error: 'gameId is required',
			});
		});

		it('should get specific game info', async () => {
			// Create a game first
			await request(app)
				.post('/api/games')
				.send({ gameId: 'test-game-2', maxPlayers: 2 });

			const response = await request(app)
				.get('/api/games/test-game-2')
				.expect(200);

			expect(response.body).toMatchObject({
				success: true,
				data: expect.objectContaining({
					id: 'test-game-2',
					maxPlayers: 2,
				}),
			});
		});

		it('should return 404 for non-existent game', async () => {
			const response = await request(app)
				.get('/api/games/non-existent-game')
				.expect(404);

			expect(response.body).toMatchObject({
				success: false,
				error: 'Game not found',
			});
		});

		it('should find available games', async () => {
			const response = await request(app)
				.get('/api/games/available')
				.expect(200);

			expect(response.body).toMatchObject({
				success: true,
				data: expect.any(Array),
			});
		});

		it('should start a hand with players', async () => {
			// Create a game
			await request(app)
				.post('/api/games')
				.send({ gameId: 'start-test-game', maxPlayers: 2 });

			// Add players
			gameController.addPlayerToGame('start-test-game', 'player1', 'Bot1', 1000);
			gameController.addPlayerToGame('start-test-game', 'player2', 'Bot2', 1000);

			const response = await request(app)
				.post('/api/games/start-test-game/start')
				.expect(200);

			expect(response.body).toMatchObject({
				success: true,
				message: 'Hand started successfully',
			});
		});
	});

	describe('Player Routes', () => {
		let currentGameId: string;

		beforeEach(async () => {
			// Create a unique test game for each test
			currentGameId = `player-test-game-${Date.now()}-${Math.random()}`;
			await request(app)
				.post('/api/games')
				.send({ gameId: currentGameId, maxPlayers: 4 });
		});

		it('should check if player can join game', async () => {
			const response = await request(app)
				.get(`/api/games/${currentGameId}/can-join/player1`)
				.expect(200);

			expect(response.body).toMatchObject({
				success: true,
				data: { canJoin: true },
			});
		});

		it('should get game state for player', async () => {
			// Add player to game
			gameController.addPlayerToGame(currentGameId, 'player1', 'Bot1', 1000);

			const response = await request(app)
				.get(`/api/games/${currentGameId}/players/player1/state`)
				.expect(200);

			expect(response.body).toMatchObject({
				success: true,
				data: expect.objectContaining({
					playerId: 'player1',
					players: expect.any(Array),
				}),
			});
		});

		it('should get possible actions for player', async () => {
			// Add player to game
			gameController.addPlayerToGame(currentGameId, 'player2', 'Bot2', 1000);

			const response = await request(app)
				.get(`/api/games/${currentGameId}/players/player2/actions`)
				.expect(200);

			expect(response.body).toMatchObject({
				success: true,
				data: expect.any(Array),
			});
		});
	});

	describe('Error Handling', () => {
		it('should handle invalid game routes', async () => {
			const response = await request(app)
				.post('/api/games/invalid-game/start')
				.expect(400);

			expect(response.body).toMatchObject({
				success: false,
				error: 'Failed to start hand',
				message: expect.any(String),
			});
		});

		it('should handle invalid player routes', async () => {
			const response = await request(app)
				.get('/api/games/invalid-game/players/invalid-player/state')
				.expect(400);

			expect(response.body).toMatchObject({
				success: false,
				error: 'Failed to get game state',
				message: expect.any(String),
			});
		});
	});
});