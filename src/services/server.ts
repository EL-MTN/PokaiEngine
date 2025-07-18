import { createServer } from 'http';
import * as path from 'path';

import express, { Express, Request, Response } from 'express';
import { Server } from 'socket.io';

import { GameController } from '@/engine/game/GameController';
import { BotAuthService } from '@/services/auth/BotAuthService';
import { GameLogger } from '@/services/logging/GameLogger';
import { serverLogger } from '@/services/logging/Logger';
import { BotInterface } from '@/socket/BotInterface';
import { SocketHandler } from '@/socket/SocketHandler';
import { GameConfig } from '@/types';

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
			res.header(
				'Access-Control-Allow-Methods',
				'GET, POST, PUT, DELETE, OPTIONS',
			);
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

		// Serve the web UI static files
		const webUiPath = path.join(__dirname, '..', '..', 'examples', 'web-ui');
		this.app.use(express.static(webUiPath));

		// Serve the admin dashboard static files
		const dashboardPath = path.join(__dirname, '../dashboard/');
		this.app.use('/dashboard', express.static(dashboardPath));

		// Serve replay files statically
		// Replays are saved in the project root's replays directory
		const replaysPath = path.join(__dirname, '../../../replays');
		this.app.use('/replays', express.static(replaysPath));

		// Request logging
		this.app.use((req, res, next) => {
			serverLogger.http(`${req.method} ${req.path}`);
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
					dashboard: '/dashboard',
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
					handStartDelay = 2000,
					isTournament = false,
					startSettings,
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
					handStartDelay,
					isTournament,
					startSettings,
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
				const maxPlayers = req.query.maxPlayers
					? parseInt(req.query.maxPlayers as string)
					: undefined;
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

		// Player API routes
		this.app.get(
			'/api/games/:gameId/can-join/:playerId',
			(req: Request, res: Response) => {
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
			},
		);

		this.app.get(
			'/api/games/:gameId/players/:playerId/state',
			(req: Request, res: Response) => {
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
			},
		);

		this.app.get(
			'/api/games/:gameId/players/:playerId/actions',
			(req: Request, res: Response) => {
				try {
					const { gameId, playerId } = req.params;
					const possibleActions = this.botInterface.getPossibleActions(
						gameId,
						playerId,
					);
					res.json({ success: true, data: possibleActions });
				} catch (error) {
					res.status(400).json({
						success: false,
						error: 'Failed to get possible actions',
						message: error instanceof Error ? error.message : 'Unknown error',
					});
				}
			},
		);

		// Dashboard API routes
		this.app.post('/api/games/:gameId/start', (req: Request, res: Response) => {
			try {
				const gameId = req.params.gameId;
				this.gameController.startGame(gameId);
				res.json({
					success: true,
					message: `Game ${gameId} started successfully`,
				});
			} catch (error) {
				res.status(400).json({
					success: false,
					error: 'Failed to start game',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		this.app.delete(
			'/api/games/:gameId',
			async (req: Request, res: Response) => {
				try {
					const gameId = req.params.gameId;
					await this.gameController.removeGame(gameId);
					res.json({
						success: true,
						message: `Game ${gameId} deleted successfully`,
					});
				} catch (error) {
					res.status(400).json({
						success: false,
						error: 'Failed to delete game',
						message: error instanceof Error ? error.message : 'Unknown error',
					});
				}
			},
		);

		this.app.get('/api/games/:gameId/state', (req: Request, res: Response) => {
			try {
				const gameId = req.params.gameId;
				const game = this.gameController.getGame(gameId);

				if (!game) {
					res.status(404).json({
						success: false,
						error: 'Game not found',
					});
					return;
				}

				const gameState = game.getGameState();
				const totalPot = gameState.pots.reduce(
					(sum, pot) => sum + pot.amount,
					0,
				);
				res.json({
					success: true,
					data: {
						gameId,
						currentPhase: gameState.currentPhase,
						potSize: totalPot,
						players: gameState.players.map((player) => ({
							id: player.id,
							name: player.name,
							chipStack: player.chipStack,
							position: player.position,
							isActive: player.isActive,
							isFolded: player.isFolded,
							hasActed: player.hasActed,
						})),
						communityCards: gameState.communityCards,
						currentPlayerToAct: gameState.currentPlayerToAct,
						handNumber: gameState.handNumber,
						status: game.isGameRunning() ? 'running' : 'waiting',
					},
				});
			} catch (error) {
				res.status(500).json({
					success: false,
					error: 'Failed to get game state',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		this.app.get('/api/dashboard/stats', (req: Request, res: Response) => {
			try {
				const stats = this.gameController.getOverallStats();
				const socketStats = this.socketHandler.getConnectionStats();

				res.json({
					success: true,
					data: {
						...stats,
						...socketStats,
						serverUptime: process.uptime(),
						memoryUsage: process.memoryUsage(),
						timestamp: new Date().toISOString(),
					},
				});
			} catch (error) {
				res.status(500).json({
					success: false,
					error: 'Failed to get dashboard stats',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		// Bot Management API routes
		this.app.post('/api/bots/register', async (req: Request, res: Response) => {
			try {
				const { botName, developer, email } = req.body;

				if (!botName || !developer || !email) {
					return res.status(400).json({
						success: false,
						message: 'Missing required fields: botName, developer, email',
					});
				}

				const botAuthService = BotAuthService.getInstance();
				const credentials = await botAuthService.registerBot({
					botName,
					developer,
					email,
				});

				res.json({
					success: true,
					data: credentials,
				});
			} catch (error: any) {
				res.status(400).json({
					success: false,
					message: error.message || 'Failed to register bot',
				});
			}
		});

		this.app.get('/api/bots', async (req: Request, res: Response) => {
			try {
				const { status, developer } = req.query;
				const botAuthService = BotAuthService.getInstance();

				const filter: any = {};
				if (status) filter.status = status as string;
				if (developer) filter.developer = developer as string;

				const bots = await botAuthService.listBots(filter);

				res.json({
					success: true,
					data: bots,
				});
			} catch (error: any) {
				res.status(500).json({
					success: false,
					message: error.message || 'Failed to list bots',
				});
			}
		});

		this.app.get('/api/bots/:botId', async (req: Request, res: Response) => {
			try {
				const { botId } = req.params;
				const botAuthService = BotAuthService.getInstance();

				const bot = await botAuthService.getBot(botId);
				if (!bot) {
					return res.status(404).json({
						success: false,
						message: 'Bot not found',
					});
				}

				res.json({
					success: true,
					data: bot,
				});
			} catch (error: any) {
				res.status(500).json({
					success: false,
					message: error.message || 'Failed to get bot',
				});
			}
		});

		this.app.get(
			'/api/bots/:botId/stats',
			async (req: Request, res: Response) => {
				try {
					const { botId } = req.params;
					const botAuthService = BotAuthService.getInstance();

					const stats = await botAuthService.getBotStats(botId);
					if (!stats) {
						return res.status(404).json({
							success: false,
							message: 'Bot not found',
						});
					}

					res.json({
						success: true,
						data: stats,
					});
				} catch (error: any) {
					res.status(500).json({
						success: false,
						message: error.message || 'Failed to get bot stats',
					});
				}
			},
		);

		this.app.post(
			'/api/bots/:botId/regenerate-key',
			async (req: Request, res: Response) => {
				try {
					const { botId } = req.params;
					const botAuthService = BotAuthService.getInstance();

					const newApiKey = await botAuthService.regenerateApiKey(botId);

					res.json({
						success: true,
						data: { apiKey: newApiKey },
					});
				} catch (error: any) {
					res.status(400).json({
						success: false,
						message: error.message || 'Failed to regenerate API key',
					});
				}
			},
		);

		this.app.post(
			'/api/bots/:botId/suspend',
			async (req: Request, res: Response) => {
				try {
					const { botId } = req.params;
					const botAuthService = BotAuthService.getInstance();

					await botAuthService.suspendBot(botId);

					res.json({
						success: true,
						message: 'Bot suspended successfully',
					});
				} catch (error: any) {
					res.status(400).json({
						success: false,
						message: error.message || 'Failed to suspend bot',
					});
				}
			},
		);

		this.app.post(
			'/api/bots/:botId/reactivate',
			async (req: Request, res: Response) => {
				try {
					const { botId } = req.params;
					const botAuthService = BotAuthService.getInstance();

					await botAuthService.reactivateBot(botId);

					res.json({
						success: true,
						message: 'Bot reactivated successfully',
					});
				} catch (error: any) {
					res.status(400).json({
						success: false,
						message: error.message || 'Failed to reactivate bot',
					});
				}
			},
		);

		this.app.post(
			'/api/bots/:botId/revoke',
			async (req: Request, res: Response) => {
				try {
					const { botId } = req.params;
					const botAuthService = BotAuthService.getInstance();

					await botAuthService.revokeBot(botId);

					res.json({
						success: true,
						message: 'Bot revoked successfully',
					});
				} catch (error: any) {
					res.status(400).json({
						success: false,
						message: error.message || 'Failed to revoke bot',
					});
				}
			},
		);

		// Replay API routes
		this.app.get('/api/replays', async (req: Request, res: Response) => {
			try {
				const limit = parseInt(req.query.limit as string) || 50;
				const allReplays = await this.gameController.listAllReplays(limit);

				// Combine and format replays from both sources
				const combinedReplays = [
					// MongoDB replays (prioritized as they're more recent and detailed)
					...allReplays.mongoReplays.map((replay) => ({
						gameId: replay.gameId,
						filename: `${replay.gameId}_mongo.json`,
						path: `mongo://${replay.gameId}`,
						source: 'mongodb',
						createdAt: replay.createdAt || Date.now(),
						gameType: replay.gameType || 'unknown',
						totalHands: replay.totalHands || 0,
						actualPlayers: replay.actualPlayers || 0,
						gameDuration: replay.gameDuration || 0,
					})),
					// File replays
					...allReplays.fileReplays.map((replay) => ({
						gameId: replay.filename.split('_')[0] || 'unknown',
						filename: replay.filename,
						path: replay.path,
						source: 'file',
						createdAt: Date.now(), // Will be updated when file is read
					})),
				];

				// Sort by creation time (newest first)
				combinedReplays.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

				res.json({
					success: true,
					data: combinedReplays,
					stats: {
						totalReplays: combinedReplays.length,
						mongoReplays: allReplays.mongoReplays.length,
						fileReplays: allReplays.fileReplays.length,
					},
				});
			} catch (error) {
				res.status(500).json({
					success: false,
					error: 'Failed to list replays',
					message: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		});

		this.app.get(
			'/api/replays/:gameId',
			async (req: Request, res: Response) => {
				try {
					const gameId = req.params.gameId;
					const replayData =
						await this.gameController.getReplayFromAnySource(gameId);

					if (!replayData) {
						res.status(404).json({
							success: false,
							error: 'Replay not found',
							message: `No replay data found for game ${gameId}`,
						});
						return;
					}

					res.json({
						success: true,
						data: replayData,
					});
				} catch (error) {
					res.status(500).json({
						success: false,
						error: 'Failed to get replay data',
						message: error instanceof Error ? error.message : 'Unknown error',
					});
				}
			},
		);

		this.app.get(
			'/api/replays/:gameId/hands/:handNumber',
			(req: Request, res: Response) => {
				try {
					const gameId = req.params.gameId;
					const handNumber = parseInt(req.params.handNumber);

					if (isNaN(handNumber)) {
						res.status(400).json({
							success: false,
							error: 'Invalid hand number',
							message: 'Hand number must be a valid integer',
						});
						return;
					}

					const handReplay = this.gameController.getHandReplayData(
						gameId,
						handNumber,
					);

					if (!handReplay) {
						res.status(404).json({
							success: false,
							error: 'Hand replay not found',
							message: `No replay data found for hand ${handNumber} in game ${gameId}`,
						});
						return;
					}

					res.json({
						success: true,
						data: handReplay,
					});
				} catch (error) {
					res.status(500).json({
						success: false,
						error: 'Failed to get hand replay data',
						message: error instanceof Error ? error.message : 'Unknown error',
					});
				}
			},
		);

		this.app.post(
			'/api/replays/:gameId/save',
			async (req: Request, res: Response) => {
				try {
					const gameId = req.params.gameId;
					const result = await this.gameController.saveReplayToFile(gameId);

					if (result.fileSuccess || result.mongoSuccess) {
						res.json({
							success: true,
							message: `Replay for game ${gameId} saved successfully`,
							details: {
								fileSuccess: result.fileSuccess,
								mongoSuccess: result.mongoSuccess,
								filePath: result.filePath,
							},
						});
					} else {
						res.status(400).json({
							success: false,
							error: 'Failed to save replay',
							message:
								result.error || `Could not save replay for game ${gameId}`,
						});
					}
				} catch (error) {
					res.status(500).json({
						success: false,
						error: 'Failed to save replay',
						message: error instanceof Error ? error.message : 'Unknown error',
					});
				}
			},
		);

		this.app.get(
			'/api/replays/:gameId/export',
			(req: Request, res: Response) => {
				try {
					const gameId = req.params.gameId;
					const format = (req.query.format as string) || 'json';

					if (!['json', 'compressed'].includes(format)) {
						res.status(400).json({
							success: false,
							error: 'Invalid format',
							message: 'Format must be json or compressed',
						});
						return;
					}

					const exportData = this.gameController.exportReplay(
						gameId,
						format as 'json' | 'compressed',
					);

					if (!exportData) {
						res.status(404).json({
							success: false,
							error: 'Replay not found',
							message: `No replay data found for game ${gameId}`,
						});
						return;
					}

					// Set appropriate content type and filename
					const filename = `${gameId}_replay.${
						format === 'json' ? 'json' : 'gz'
					}`;

					if (format === 'json') {
						res.setHeader('Content-Type', 'application/json');
						res.setHeader(
							'Content-Disposition',
							`attachment; filename="${filename}"`,
						);
						res.send(exportData);
					} else {
						res.setHeader('Content-Type', 'application/gzip');
						res.setHeader(
							'Content-Disposition',
							`attachment; filename="${filename}"`,
						);
						res.send(exportData);
					}
				} catch (error) {
					res.status(500).json({
						success: false,
						error: 'Failed to export replay',
						message: error instanceof Error ? error.message : 'Unknown error',
					});
				}
			},
		);

		this.app.get(
			'/api/replays/:gameId/analysis',
			(req: Request, res: Response) => {
				try {
					const gameId = req.params.gameId;
					const replaySystem = this.gameController.getReplaySystem();
					const replayData = this.gameController.getReplayData(gameId);

					if (!replayData) {
						res.status(404).json({
							success: false,
							error: 'Replay not found',
							message: `No replay data found for game ${gameId}`,
						});
						return;
					}

					// Load replay into replay system for analysis
					const loaded = replaySystem.loadReplay(replayData);
					if (!loaded) {
						res.status(500).json({
							success: false,
							error: 'Failed to load replay for analysis',
						});
						return;
					}

					const analysis = replaySystem.analyzeReplay();

					res.json({
						success: true,
						data: analysis,
					});
				} catch (error) {
					res.status(500).json({
						success: false,
						error: 'Failed to analyze replay',
						message: error instanceof Error ? error.message : 'Unknown error',
					});
				}
			},
		);

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
					'GET /api/games/:gameId/can-join/:playerId':
						'Check if player can join',
					'GET /api/games/:gameId/players/:playerId/state':
						'Get player game state',
					'GET /api/games/:gameId/players/:playerId/actions':
						'Get possible actions',
					'GET /api/replays': 'List all available replay files',
					'GET /api/replays/:gameId': 'Get complete replay data for a game',
					'GET /api/replays/:gameId/hands/:handNumber':
						'Get replay data for specific hand',
					'POST /api/replays/:gameId/save': 'Save replay to file',
					'GET /api/replays/:gameId/export': 'Export replay in various formats',
					'GET /api/replays/:gameId/analysis': 'Get detailed replay analysis',
				},
				websocket: {
					connection: `ws://localhost:${this.port}`,
					events: {
						identify:
							'Join game: { botName: string, gameId: string, chipStack: number }',
						action:
							'Submit action: { type: ActionType, amount?: number, playerId: string, timestamp: number }',
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
			serverLogger.info(
				`🚀 Pokai Poker Engine (Express) started on port ${this.port}`,
			);
			serverLogger.info(`📊 Health: http://localhost:${this.port}/health`);
			serverLogger.info(`📈 Stats: http://localhost:${this.port}/stats`);
			serverLogger.info(`🎮 WebSocket: ws://localhost:${this.port}`);
			serverLogger.info(`📚 API Docs: http://localhost:${this.port}/docs`);
			serverLogger.info(
				`🎛️  Admin Dashboard: http://localhost:${this.port}/dashboard`,
			);
			serverLogger.info(`\n🃏 Ready for bot connections!`);
		});
	}

	async shutdown(): Promise<void> {
		serverLogger.info('🔄 Shutting down server...');
		this.io.close();
		this.httpServer.close();
		serverLogger.info('✅ Server shutdown complete');
	}
}

// Start server if run directly
if (require.main === module) {
	const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
	const server = new PokaiExpressServer(port);

	server.start();
}

export default PokaiExpressServer;

// Export main classes for use as a library
export { GameController } from '@/engine/game/GameController';
export { GameEngine } from '@/engine/game/GameEngine';
export { SocketHandler } from '@/socket/SocketHandler';
export { BotInterface } from '@/socket/BotInterface';
export { GameLogger } from '@/services/logging/GameLogger';
export { ReplaySystem } from '@/services/logging/ReplaySystem';

// Export core classes
export { Card } from '@/engine/poker/Card';
export { Deck } from '@/engine/poker/Deck';
export { HandEvaluator } from '@/engine/poker/HandEvaluator';
export { Player } from '@/engine/poker/Player';
export { GameState } from '@/engine/game/GameState';
export { PotManager } from '@/engine/poker/PotManager';
export { ActionValidator } from '@/engine/poker/ActionValidator';

// Export all types
export * from '@/types';
