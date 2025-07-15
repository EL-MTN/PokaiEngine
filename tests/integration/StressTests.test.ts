import { GameController } from '@/application/engine/GameController';
import { ActionType, GameConfig } from '@/domain/types';
import {
	Socket,
	SocketHandler,
	SocketIOServer,
} from '@/infrastructure/communication/SocketHandler';

class MockSocket implements Socket {
	public handlers: Record<string, ((data: any) => void)[]> = {};
	public outgoing: Array<{ event: string; data: any }> = [];
	public id: string;

	constructor(id: string) {
		this.id = id;
	}

	emit(event: string, data: any): void {
		this.outgoing.push({ event, data });
	}

	on(event: string, callback: (...args: any[]) => void): void {
		if (!this.handlers[event]) this.handlers[event] = [];
		this.handlers[event].push(callback);
	}

	trigger(event: string, data: any): void {
		(this.handlers[event] || []).forEach((cb) => cb(data));
	}

	join(): void {}
	leave(): void {}

	disconnect(): void {
		this.trigger('disconnect', {});
	}
}

class MockSocketServer implements SocketIOServer {
	private connectCallbacks: ((socket: Socket) => void)[] = [];
	public sockets: MockSocket[] = [];

	on(event: string, callback: (socket: Socket) => void): void {
		if (event === 'connection') {
			this.connectCallbacks.push(callback);
		}
	}

	connect(id: string): MockSocket {
		const socket = new MockSocket(id);
		this.sockets.push(socket);
		this.connectCallbacks.forEach((cb) => cb(socket));
		return socket;
	}
}

describe('Stress Tests', () => {
	jest.setTimeout(10000);

	describe('Game Management', () => {
		let gameController: GameController;

		beforeEach(() => {
			gameController = new GameController();
		});

		afterEach(async () => {
			gameController.destroy();
		});

		it('handles multiple games efficiently', () => {
			const numberOfGames = 20;

			const config: GameConfig = {
				maxPlayers: 1, // Prevent auto-starting
				smallBlindAmount: 50,
				bigBlindAmount: 100,
				turnTimeLimit: 30,
				isTournament: false,
			};

			// Create games
			const gameIds: string[] = [];
			for (let i = 0; i < numberOfGames; i++) {
				const gameId = `stress-game-${i}`;
				gameController.createGame(gameId, config);
				gameIds.push(gameId);
			}

			// Add single player to each
			for (let i = 0; i < numberOfGames; i++) {
				gameController.addPlayerToGame(gameIds[i], `p${i}`, `Bot${i}`, 1000);
			}

			// Verify all games are created
			const activeGames = gameController.getAllGames();
			expect(activeGames).toHaveLength(numberOfGames);

			const stats = gameController.getOverallStats();
			expect(stats.totalGames).toBe(numberOfGames);
			expect(stats.totalPlayers).toBe(numberOfGames);
		});

		it('handles socket connections', () => {
			const server = new MockSocketServer();
			const socketHandler = new SocketHandler(server, gameController);

			const numberOfConnections = 20;

			// Connect sockets
			const sockets: MockSocket[] = [];
			for (let i = 0; i < numberOfConnections; i++) {
				const socket = server.connect(`bot-${i}`);
				sockets.push(socket);
			}

			// Verify connections
			const stats = socketHandler.getConnectionStats();
			expect(stats.totalConnections).toBe(numberOfConnections);

			// Disconnect all
			sockets.forEach((socket) => socket.disconnect());

			// Verify cleanup
			const finalStats = socketHandler.getConnectionStats();
			expect(finalStats.totalConnections).toBe(0);
		});

		it('handles rapid connect/disconnect cycles', () => {
			const server = new MockSocketServer();
			const socketHandler = new SocketHandler(server, gameController);

			const gameId = 'rapid-test';
			const config: GameConfig = {
				maxPlayers: 10,
				smallBlindAmount: 50,
				bigBlindAmount: 100,
				turnTimeLimit: 30,
				isTournament: false,
			};

			gameController.createGame(gameId, config);

			const cycles = 10;
			for (let i = 0; i < cycles; i++) {
				const socket = server.connect(`rapid-bot-${i}`);

				socket.trigger('identify', {
					botName: `RapidBot${i}`,
					gameId,
					chipStack: 1000,
				});

				socket.disconnect();
			}

			// Verify no memory leaks
			const stats = socketHandler.getConnectionStats();
			expect(stats.totalConnections).toBe(0);

			// Game should still be functional
			const game = gameController.getGame(gameId);
			expect(game).toBeDefined();
		});

		it('handles game with actions', () => {
			const gameId = 'action-test';

			const config: GameConfig = {
				maxPlayers: 2,
				smallBlindAmount: 50,
				bigBlindAmount: 100,
				turnTimeLimit: 30,
				isTournament: false,
			};

			gameController.createGame(gameId, config);

			// Add players (this will start the game)
			gameController.addPlayerToGame(gameId, 'p1', 'Bot1', 1000);
			gameController.addPlayerToGame(gameId, 'p2', 'Bot2', 1000);

			const game = gameController.getGame(gameId);
			expect(game).toBeDefined();

			// Game should have started with 2 players, so there should be a current player
			const gameState = game!.getGameState();
			const currentPlayer = gameState.currentPlayerToAct;
			expect(currentPlayer).toBeDefined();

			// Make a valid action with timestamp
			expect(() => {
				gameController.processAction(gameId, {
					type: ActionType.Call,
					playerId: currentPlayer!,
					timestamp: Date.now(),
				});
			}).not.toThrow();

			// Verify game is still functional
			expect(game).toBeDefined();
		});

		it('measures basic performance', () => {
			const startTime = Date.now();

			// Create many games quickly
			for (let i = 0; i < 50; i++) {
				const config: GameConfig = {
					maxPlayers: 1,
					smallBlindAmount: 50,
					bigBlindAmount: 100,
					turnTimeLimit: 30,
					isTournament: false,
				};

				gameController.createGame(`perf-game-${i}`, config);
				gameController.addPlayerToGame(
					`perf-game-${i}`,
					`p${i}`,
					`Bot${i}`,
					1000,
				);
			}

			const endTime = Date.now();
			const duration = endTime - startTime;

			// Should complete reasonably quickly (less than 1 second)
			expect(duration).toBeLessThan(1000);

			const stats = gameController.getOverallStats();
			expect(stats.totalGames).toBe(50);
		});
	});

	describe('Edge Cases', () => {
		let gameController: GameController;

		beforeEach(() => {
			gameController = new GameController();
		});

		afterEach(async () => {
			gameController.destroy();
		});

		it('handles tournament game creation stress', () => {
			// Create multiple tournament games
			for (let i = 0; i < 5; i++) {
				const game = gameController.createTournamentGame(
					`tournament-${i}`,
					1500,
					25,
					50,
					8,
					30,
				);

				expect(game).toBeDefined();
				expect(game.getConfig().isTournament).toBe(true);
			}

			const stats = gameController.getOverallStats();
			expect(stats.totalGames).toBe(5);
		});

		it('handles cleanup operations', async () => {
			// Create games with no players
			for (let i = 0; i < 5; i++) {
				gameController.createGame(`cleanup-game-${i}`, {
					maxPlayers: 1,
					smallBlindAmount: 50,
					bigBlindAmount: 100,
					turnTimeLimit: 30,
					isTournament: false,
				});
			}

			// Run cleanup (this should remove empty games)
			await gameController.cleanupInactiveGames();

			// Verify cleanup worked
			const finalStats = gameController.getOverallStats();
			expect(finalStats.totalGames).toBe(0);
		});

		it('handles large number of socket events', () => {
			const server = new MockSocketServer();
			const socketHandler = new SocketHandler(server, gameController);

			const gameId = 'event-test';
			gameController.createGame(gameId, {
				maxPlayers: 10,
				smallBlindAmount: 50,
				bigBlindAmount: 100,
				turnTimeLimit: 30,
				isTournament: false,
			});

			const socket = server.connect('event-bot');
			socket.trigger('identify', {
				botName: 'EventBot',
				gameId,
				chipStack: 1000,
			});

			// Trigger many events rapidly
			for (let i = 0; i < 20; i++) {
				socket.trigger('ping', {});
				socket.trigger('reconnect', {});
			}

			// Should handle all events without crashing
			const stats = socketHandler.getConnectionStats();
			expect(stats.totalConnections).toBe(1);
		});
	});
});
