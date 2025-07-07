import { Server } from 'socket.io';
import { createServer } from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import { GameController } from './engine/GameController';
import { SocketHandler } from './communication/SocketHandler';
import { GameLogger } from './logging/GameLogger';
import { GameConfig } from './types';

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
	start(): void {
		this.httpServer.listen(this.port, () => {
			console.log(`🚀 Pokai Poker Engine started on port ${this.port}`);
			console.log(`📊 Health check: http://localhost:${this.port}/health`);
			console.log(`📈 Stats: http://localhost:${this.port}/stats`);
			console.log(`🎮 WebSocket: ws://localhost:${this.port}`);
			console.log(`\n🃏 Ready for bot connections!`);
		});
	}

	/**
	 * Gracefully shuts down the server
	 */
	async shutdown(): Promise<void> {
		console.log('🔄 Shutting down server...');

		// Close all socket connections
		this.io.close();

		// Close HTTP server
		this.httpServer.close();

		console.log('✅ Server shutdown complete');
	}
}

// Export main classes for use as a library
export { GameController } from './engine/GameController';
export { GameEngine } from './engine/GameEngine';
export { SocketHandler } from './communication/SocketHandler';
export { BotInterface } from './communication/BotInterface';
export { GameLogger } from './logging/GameLogger';
export { ReplaySystem } from './logging/ReplaySystem';

// Export core classes
export { Card } from './core/cards/Card';
export { Deck } from './core/cards/Deck';
export { HandEvaluator } from './core/cards/HandEvaluator';
export { Player } from './core/game/Player';
export { GameState } from './core/game/GameState';
export { PotManager } from './core/game/PotManager';
export { ActionValidator } from './core/betting/ActionValidator';

// Export all types
export * from './types';

// Start server if this file is run directly
if (require.main === module) {
	const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
	const server = new PokaiServer(port);

	// Handle graceful shutdown
	process.on('SIGINT', async () => {
		console.log('\n🛑 Received SIGINT, shutting down gracefully...');
		await server.shutdown();
		process.exit(0);
	});

	process.on('SIGTERM', async () => {
		console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
		await server.shutdown();
		process.exit(0);
	});

	server.start();
}

export default PokaiServer;
