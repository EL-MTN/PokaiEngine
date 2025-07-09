import express, { Express, Request, Response } from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { GameController } from './engine/GameController';
import { SocketHandler } from './communication/SocketHandler';
import { BotInterface } from './communication/BotInterface';
import { GameLogger } from './logging/GameLogger';
import { GameConfig } from './types';

/**
 * Enhanced Pokai Server with Express REST API support
 * Combines the original PokaiServer with Express routes for bot development
 */
export class PokaiExpressServer {
	private app: Express;
	private httpServer;
	private io: Server;
	private gameController: GameController;
	private socketHandler: SocketHandler;
	private botInterface: BotInterface;
	private gameLogger: GameLogger;
	private port: number;

	constructor(port: number = 3000) {
		this.port = port;
		this.app = express();
		this.httpServer = createServer(this.app);
		
		// Initialize Socket.IO with CORS
		this.io = new Server(this.httpServer, {
			cors: {
				origin: '*',
				methods: ['GET', 'POST'],
			},
		});

		// Initialize game components
		this.gameController = new GameController();
		this.gameLogger = new GameLogger();
		this.socketHandler = new SocketHandler(this.io, this.gameController);
		this.botInterface = new BotInterface(this.gameController);

		this.setupMiddleware();
		this.setupRoutes();
	}

	private setupMiddleware(): void {
		// Enable CORS for all routes
		this.app.use((req, res, next) => {
			res.header('Access-Control-Allow-Origin', '*');
			res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
			res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
			if (req.method === 'OPTIONS') {
				res.sendStatus(200);
				return;
			}
			next();
		});

		// Parse JSON bodies
		this.app.use(express.json());
		this.app.use(express.urlencoded({ extended: true }));

		// Request logging
		this.app.use((req, res, next) => {
			console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
			next();
		});
	}

	private setupRoutes(): void {
		// Server info
		this.app.get('/', (req: Request, res: Response) => {
			res.json({
				name: 'Pokai Poker Engine',
				version: '1.0.0',
				description: "A robust Texas Hold'em poker engine for bot battles",
				endpoints: {
					health: '/health',
					stats: '/stats',
					games: '/api/games',
					websocket: `ws://localhost:${this.port}`,
					docs: '/docs',
				},
			});
		});

		// Health check
		this.app.get('/health', (req: Request, res: Response) => {
			res.json({
				status: 'healthy',
				timestamp: new Date().toISOString(),
				uptime: process.uptime(),
			});
		});

		// Server statistics
		this.app.get('/stats', (req: Request, res: Response) => {
			const stats = this.gameController.getOverallStats();
			res.json({
				...stats,
				connectedClients: this.io.engine.clientsCount,
				totalGamesLogged: this.gameLogger.getAllLogs().length,
				serverUptime: process.uptime(),
				timestamp: new Date().toISOString(),
			});
		});

		// Game API routes
		this.app.get('/api/games', (req: Request, res: Response) => {
			try {
				const games = this.botInterface.listGames();
				res.json({ success: true, data: games });
			} catch (error) {
				res.status(500).json({
					success: false,
					error: 'Failed to retrieve games',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		this.app.post('/api/games', (req: Request, res: Response) => {
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

				this.gameController.createGame(gameId, gameConfig);
				const gameInfo = this.botInterface.getGameInfo(gameId);

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

		this.app.get('/api/games/available', (req: Request, res: Response) => {
			try {
				const maxPlayers = req.query.maxPlayers ? parseInt(req.query.maxPlayers as string) : undefined;
				const availableGames = this.botInterface.findAvailableGames(maxPlayers);
				res.json({ success: true, data: availableGames });
			} catch (error) {
				res.status(500).json({
					success: false,
					error: 'Failed to find available games',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		this.app.get('/api/games/:gameId', (req: Request, res: Response) => {
			try {
				const gameId = req.params.gameId;
				const gameInfo = this.botInterface.getGameInfo(gameId);
				
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

		this.app.post('/api/games/:gameId/start', (req: Request, res: Response) => {
			try {
				const gameId = req.params.gameId;
				this.gameController.startHand(gameId);
				res.json({ success: true, message: 'Hand started successfully' });
			} catch (error) {
				res.status(400).json({
					success: false,
					error: 'Failed to start hand',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		// Player API routes
		this.app.get('/api/games/:gameId/can-join/:playerId', (req: Request, res: Response) => {
			try {
				const { gameId, playerId } = req.params;
				const canJoin = this.botInterface.canJoinGame(gameId, playerId);
				res.json({ success: true, data: { canJoin } });
			} catch (error) {
				res.status(500).json({
					success: false,
					error: 'Failed to check join eligibility',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		this.app.get('/api/games/:gameId/players/:playerId/state', (req: Request, res: Response) => {
			try {
				const { gameId, playerId } = req.params;
				const gameState = this.botInterface.getGameState(gameId, playerId);
				res.json({ success: true, data: gameState });
			} catch (error) {
				res.status(400).json({
					success: false,
					error: 'Failed to get game state',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		this.app.get('/api/games/:gameId/players/:playerId/actions', (req: Request, res: Response) => {
			try {
				const { gameId, playerId } = req.params;
				const possibleActions = this.botInterface.getPossibleActions(gameId, playerId);
				res.json({ success: true, data: possibleActions });
			} catch (error) {
				res.status(400).json({
					success: false,
					error: 'Failed to get possible actions',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		// Documentation
		this.app.get('/docs', (req: Request, res: Response) => {
			res.json({
				name: 'Pokai Poker Engine API',
				version: '1.0.0',
				description: 'REST API and WebSocket interface for bot developers',
				endpoints: {
					'GET /': 'Server information',
					'GET /health': 'Health check',
					'GET /stats': 'Server statistics',
					'GET /api/games': 'List all games',
					'POST /api/games': 'Create new game',
					'GET /api/games/available': 'Find available games',
					'GET /api/games/:gameId': 'Get game info',
					'POST /api/games/:gameId/start': 'Start a hand',
					'GET /api/games/:gameId/can-join/:playerId': 'Check if player can join',
					'GET /api/games/:gameId/players/:playerId/state': 'Get player game state',
					'GET /api/games/:gameId/players/:playerId/actions': 'Get possible actions',
				},
				websocket: {
					connection: `ws://localhost:${this.port}`,
					events: {
						identify: 'Join game: { botName: string, gameId: string, chipStack: number }',
						action: 'Submit action: { type: ActionType, amount?: number, playerId: string, timestamp: number }',
						gameState: 'Receive game state updates',
						turnStart: 'Receive turn notifications',
						turnWarning: 'Receive timeout warnings',
					},
				},
			});
		});

		// 404 handler
		this.app.use((req: Request, res: Response) => {
			res.status(404).json({
				success: false,
				error: 'Not found',
				message: `Route ${req.method} ${req.path} not found`,
			});
		});
	}

	start(): void {
		this.httpServer.listen(this.port, () => {
			console.log(`🚀 Pokai Poker Engine (Express) started on port ${this.port}`);
			console.log(`📊 Health: http://localhost:${this.port}/health`);
			console.log(`📈 Stats: http://localhost:${this.port}/stats`);
			console.log(`🎮 WebSocket: ws://localhost:${this.port}`);
			console.log(`📚 API Docs: http://localhost:${this.port}/docs`);
			console.log(`\n🃏 Ready for bot connections!`);
		});
	}

	async shutdown(): Promise<void> {
		console.log('🔄 Shutting down server...');
		this.io.close();
		this.httpServer.close();
		console.log('✅ Server shutdown complete');
	}
}

// Start server if run directly
if (require.main === module) {
	const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
	const server = new PokaiExpressServer(port);

	process.on('SIGINT', async () => {
		console.log('\n🛑 Shutting down gracefully...');
		await server.shutdown();
		process.exit(0);
	});

	process.on('SIGTERM', async () => {
		console.log('\n🛑 Shutting down gracefully...');
		await server.shutdown();
		process.exit(0);
	});

	server.start();
}

export default PokaiExpressServer;