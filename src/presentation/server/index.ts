import { Server } from 'socket.io';
import { createServer } from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import { GameController } from '@/application/engine/GameController';
import { SocketHandler } from '@/infrastructure/communication/SocketHandler';
import { GameLogger } from '@/infrastructure/logging/GameLogger';
import { initializeDatabase } from '@/infrastructure/persistence/database/connection';
import { GameConfig } from '@/domain/types';
import { serverLogger } from '@/infrastructure/logging/Logger';

/**
 * Main entry point for the Pokai Poker Engine
 * Starts a Socket.io server and manages poker games
 */
class PokaiServer {
	private httpServer;
	private io: Server;
	private gameController: GameController;
	private socketHandler: SocketHandler;
	private gameLogger: GameLogger;
	private port: number;
	private isInitialized: boolean = false;

	constructor(port: number = 3000) {
		this.port = port;
		this.httpServer = createServer();
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

		this.setupRoutes();
	}

	/**
	 * Initialize database connection and services
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		try {
			serverLogger.info('Initializing database connection...');
			await initializeDatabase();
			serverLogger.info('Database connection established');
			this.isInitialized = true;
		} catch (error) {
			serverLogger.warn('Database initialization failed, continuing with basic logging only:', error);
			this.isInitialized = true; // Still allow server to start
		}
	}

	/**
	 * Sets up basic HTTP routes for health checks and stats
	 */
	private setupRoutes(): void {
		this.httpServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
			const url = req.url || '';

			// Enable CORS
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Content-Type', 'application/json');

			if (url === '/health') {
				res.writeHead(200);
				res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
			} else if (url === '/stats') {
				const stats = {
					activeGames: this.gameController.getAllGames().length,
					connectedClients: this.io.engine.clientsCount,
					totalGamesPlayed: this.gameLogger.getAllLogs().length,
					serverUptime: process.uptime(),
				};
				res.writeHead(200);
				res.end(JSON.stringify(stats));
			} else if (url === '/') {
				res.writeHead(200);
				res.end(
					JSON.stringify({
						name: 'Pokai Poker Engine',
						version: '1.0.0',
						description: "A robust Texas Hold'em poker engine for bot battles",
						endpoints: {
							health: '/health',
							stats: '/stats',
							websocket: 'ws://localhost:' + this.port,
						},
					})
				);
			} else {
				res.writeHead(404);
				res.end(JSON.stringify({ error: 'Not found' }));
			}
		});
	}

	/**
	 * Starts the server
	 */
	async start(): Promise<void> {
		// Initialize database first
		await this.initialize();

		this.httpServer.listen(this.port, () => {
			serverLogger.info(`🚀 Pokai Poker Engine started on port ${this.port}`);
			serverLogger.info(`📊 Health check: http://localhost:${this.port}/health`);
			serverLogger.info(`📈 Stats: http://localhost:${this.port}/stats`);
			serverLogger.info(`🎮 WebSocket: ws://localhost:${this.port}`);
			serverLogger.info(`📁 Replay storage: Enabled`);
			serverLogger.info(`\n🃏 Ready for bot connections!`);
		});
	}

	/**
	 * Gracefully shuts down the server
	 */
	async shutdown(): Promise<void> {
		serverLogger.info('🔄 Shutting down server...');

		// Close all socket connections
		this.io.close();

		// Close HTTP server
		this.httpServer.close();

		serverLogger.info('✅ Server shutdown complete');
	}
}

// Export main classes for use as a library
export { GameController } from '@/application/engine/GameController';
export { GameEngine } from '@/application/engine/GameEngine';
export { SocketHandler } from '@/infrastructure/communication/SocketHandler';
export { BotInterface } from '@/infrastructure/communication/BotInterface';
export { GameLogger } from '@/infrastructure/logging/GameLogger';
export { ReplaySystem } from '@/infrastructure/logging/ReplaySystem';

// Export core classes
export { Card } from '@/domain/poker/cards/Card';
export { Deck } from '@/domain/poker/cards/Deck';
export { HandEvaluator } from '@/domain/poker/cards/HandEvaluator';
export { Player } from '@/domain/poker/game/Player';
export { GameState } from '@/domain/poker/game/GameState';
export { PotManager } from '@/domain/poker/game/PotManager';
export { ActionValidator } from '@/domain/poker/betting/ActionValidator';

// Export all types
export * from '@/domain/types';

// Start server if this file is run directly
if (require.main === module) {
	const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
	const server = new PokaiServer(port);

	// Handle graceful shutdown
	process.on('SIGINT', async () => {
		serverLogger.info('\n🛑 Received SIGINT, shutting down gracefully...');
		await server.shutdown();
		process.exit(0);
	});

	process.on('SIGTERM', async () => {
		serverLogger.info('\n🛑 Received SIGTERM, shutting down gracefully...');
		await server.shutdown();
		process.exit(0);
	});

	// Start server with async initialization
	server.start().catch(error => {
		serverLogger.error('❌ Failed to start server:', error);
		process.exit(1);
	});
}

export default PokaiServer;
