import { GameController } from '@/application/engine/GameController';
import { Action, ActionType, GameConfig } from '@/domain/types';
import {
	Socket,
	SocketHandler,
	SocketIOServer,
} from '@/infrastructure/communication/SocketHandler';

// Mock BotAuthService at the module level BEFORE any imports
const mockBotAuthService = {
	validateBot: jest.fn().mockResolvedValue(true),
	getBot: jest.fn().mockResolvedValue({
		botName: 'TestBot',
		botId: 'test-bot',
		status: 'active',
	}),
};

jest.mock('@/application/services/BotAuthService', () => ({
	BotAuthService: {
		getInstance: () => mockBotAuthService,
	},
}));

// Mock logger dependencies
jest.mock('@/infrastructure/logging/Logger', () => ({
	communicationLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
	},
	authLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
	},
	replayLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
	},
	gameLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
	},
}));

// Simple Mock Socket for coverage testing
class CoverageMockSocket implements Socket {
	public handlers: Record<string, ((data: any) => void)[]> = {};
	public outgoing: Array<{ event: string; data: any }> = [];
	public rooms: Set<string> = new Set();
	public connected: boolean = true;

	constructor(public id: string) {}

	emit(event: string, data: any): void {
		if (this.connected) {
			this.outgoing.push({ event, data });
		}
	}

	on(event: string, callback: (...args: any[]) => void): void {
		if (!this.handlers[event]) this.handlers[event] = [];
		this.handlers[event].push(callback);
	}

	trigger(event: string, data: any): void {
		if (this.handlers[event]) {
			this.handlers[event].forEach((handler) => handler(data));
		}
	}

	join(room: string): void {
		this.rooms.add(room);
	}

	leave(room: string): void {
		this.rooms.delete(room);
	}

	disconnect(): void {
		this.connected = false;
		this.trigger('disconnect', {});
	}
}

class CoverageMockServer implements SocketIOServer {
	private sockets: Map<string, CoverageMockSocket> = new Map();
	private handlers: Record<string, ((socket: Socket) => void)[]> = {};

	on(event: string, callback: (socket: Socket) => void): void {
		if (!this.handlers[event]) this.handlers[event] = [];
		this.handlers[event].push(callback);
	}

	connect(socketId: string): CoverageMockSocket {
		const socket = new CoverageMockSocket(socketId);
		this.sockets.set(socketId, socket);

		if (this.handlers['connection']) {
			this.handlers['connection'].forEach((handler) => handler(socket));
		}

		return socket;
	}

	to(): any {
		return { emit: jest.fn() };
	}

	emit(): void {
		// Mock implementation
	}
}

describe('SocketHandler Coverage Tests', () => {
	let server: CoverageMockServer;
	let gameController: GameController;
	let socketHandler: SocketHandler;

	const gameId = 'coverage-test-game';
	const gameConfig: GameConfig = {
		maxPlayers: 6,
		smallBlindAmount: 10,
		bigBlindAmount: 20,
		turnTimeLimit: 30,
		isTournament: false,
	};

	beforeEach(() => {
		jest.clearAllMocks();

		// Set environment variable for spectator admin key
		process.env.SPECTATOR_ADMIN_KEY = 'admin123';

		server = new CoverageMockServer();
		gameController = new GameController();
		socketHandler = new SocketHandler(server, gameController);

		gameController.createGame(gameId, gameConfig);
	});

	describe('Authentication Edge Cases', () => {
		it('should handle authentication service failure', async () => {
			const socket = server.connect('auth-fail-bot');

			mockBotAuthService.validateBot.mockRejectedValueOnce(
				new Error('Service down'),
			);

			socket.trigger('authenticate', {
				botId: 'test-bot',
				apiKey: 'test-key',
			});

			await new Promise((resolve) => setTimeout(resolve, 50));

			const errorMsg = socket.outgoing.find((e) => e.event === 'authError');
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.message).toBe('Authentication failed');
		});

		it('should handle missing bot in database', async () => {
			const socket = server.connect('missing-bot');

			mockBotAuthService.validateBot.mockResolvedValueOnce(true);
			mockBotAuthService.getBot.mockResolvedValueOnce(null);

			socket.trigger('authenticate', {
				botId: 'missing-bot',
				apiKey: 'valid-key',
			});

			await new Promise((resolve) => setTimeout(resolve, 50));

			const errorMsg = socket.outgoing.find((e) => e.event === 'authError');
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.message).toBe('Bot not found');
		});

		it('should bypass auth when SKIP_BOT_AUTH is set', async () => {
			process.env.SKIP_BOT_AUTH = 'true';

			const socket = server.connect('bypass-bot');

			socket.trigger('identify', {
				botName: 'BypassBot',
				gameId,
				chipStack: 1000,
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			const successMsg = socket.outgoing.find(
				(e) => e.event === 'identificationSuccess',
			);
			expect(successMsg).toBeDefined();

			delete process.env.SKIP_BOT_AUTH;
		});
	});

	describe('Spectator Functionality', () => {
		beforeEach(() => {
			process.env.SPECTATOR_ADMIN_KEY = 'test-admin-key';
		});

		afterEach(() => {
			delete process.env.SPECTATOR_ADMIN_KEY;
		});

		it('should authenticate spectator with valid admin key', async () => {
			const spectator = server.connect('spectator1');

			spectator.trigger('spectatorAuth', { adminKey: 'test-admin-key' });

			const successMsg = spectator.outgoing.find(
				(e) => e.event === 'spectatorAuthSuccess',
			);
			expect(successMsg).toBeDefined();
		});

		it('should reject spectator with invalid admin key', async () => {
			const spectator = server.connect('spectator1');

			spectator.trigger('spectatorAuth', { adminKey: 'wrong-key' });

			const errorMsg = spectator.outgoing.find(
				(e) => e.event === 'spectatorAuthError',
			);
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toBe('Invalid admin key');
		});

		it('should handle spectator joining non-existent game', async () => {
			const spectator = server.connect('spectator1');

			spectator.trigger('spectatorAuth', { adminKey: 'test-admin-key' });
			await new Promise((resolve) => setTimeout(resolve, 10));

			spectator.trigger('spectate', { gameId: 'non-existent' });
			await new Promise((resolve) => setTimeout(resolve, 10));

			const errorMsg = spectator.outgoing.find(
				(e) => e.event === 'spectateError',
			);
			expect(errorMsg).toBeDefined();
		});
	});

	describe('Error Handling Coverage', () => {
		it('should handle action with wrong player ID', async () => {
			const socket = server.connect('test-bot');

			// Authenticate and join game
			socket.trigger('authenticate', { botId: 'test-bot', apiKey: 'test-key' });
			await new Promise((resolve) => setTimeout(resolve, 10));

			socket.trigger('identify', {
				botName: 'TestBot',
				gameId,
				chipStack: 1000,
			});

			// Try action with wrong player ID
			const action: Action = {
				type: ActionType.Check,
				playerId: 'wrong-player',
				timestamp: Date.now(),
			};

			socket.trigger('action', { action });

			const errorMsg = socket.outgoing.find((e) => e.event === 'actionError');
			expect(errorMsg).toBeDefined();
		});

		it('should handle possible actions request for bot not in game', async () => {
			const socket = server.connect('test-bot');

			socket.trigger('authenticate', { botId: 'test-bot', apiKey: 'test-key' });
			await new Promise((resolve) => setTimeout(resolve, 10));

			socket.trigger('requestPossibleActions', {});

			const errorMsg = socket.outgoing.find(
				(e) => e.event === 'possibleActionsError',
			);
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toBe('Not in a game');
		});

		it('should handle leave game for bot not in game', async () => {
			const socket = server.connect('test-bot');

			socket.trigger('authenticate', { botId: 'test-bot', apiKey: 'test-key' });
			await new Promise((resolve) => setTimeout(resolve, 10));

			socket.trigger('leaveGame', {});

			const errorMsg = socket.outgoing.find(
				(e) => e.event === 'leaveGameError',
			);
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toBe('Bot is not in a game');
		});

		it('should handle unseat request for bot not in game', async () => {
			const socket = server.connect('test-bot');

			socket.trigger('authenticate', { botId: 'test-bot', apiKey: 'test-key' });
			await new Promise((resolve) => setTimeout(resolve, 10));

			socket.trigger('unseat', {});

			const errorMsg = socket.outgoing.find((e) => e.event === 'unseatError');
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toBe('Bot is not in a game');
		});
	});

	describe('Connection Management', () => {
		it('should handle disconnection properly', async () => {
			const socket = server.connect('test-bot');

			socket.trigger('authenticate', { botId: 'test-bot', apiKey: 'test-key' });
			await new Promise((resolve) => setTimeout(resolve, 10));

			socket.trigger('identify', {
				botName: 'TestBot',
				gameId,
				chipStack: 1000,
			});

			// Disconnect
			socket.disconnect();

			expect(socket.connected).toBe(false);
		});

		it('should clean up inactive connections', async () => {
			const socket = server.connect('test-bot');

			socket.trigger('authenticate', { botId: 'test-bot', apiKey: 'test-key' });
			await new Promise((resolve) => setTimeout(resolve, 10));

			socket.trigger('identify', {
				botName: 'TestBot',
				gameId,
				chipStack: 1000,
			});

			// Mock old lastAction timestamp
			const connections = (socketHandler as any).connections;
			const connection = connections.get(socket.id);
			if (connection) {
				connection.lastAction = Date.now() - 6 * 60 * 1000; // 6 minutes ago
			}

			// Call cleanup
			socketHandler.cleanupInactiveConnections();

			// Connection should be removed
			expect(connections.has(socket.id)).toBe(false);
		});

		it('should handle unsubscribe errors gracefully', async () => {
			const socket = server.connect('test-bot');

			// Mock unsubscribeFromGame to throw error
			jest
				.spyOn(gameController, 'unsubscribeFromGame')
				.mockImplementation(() => {
					throw new Error('Unsubscribe failed');
				});

			socket.trigger('authenticate', { botId: 'test-bot', apiKey: 'test-key' });
			await new Promise((resolve) => setTimeout(resolve, 10));

			socket.trigger('identify', {
				botName: 'TestBot',
				gameId,
				chipStack: 1000,
			});
			socket.trigger('leaveGame', {});

			// Should still succeed despite unsubscribe error
			const leftGameMsg = socket.outgoing.find((e) => e.event === 'leftGame');
			expect(leftGameMsg).toBeDefined();
		});
	});

	describe('Game Events and Broadcasting', () => {
		it('should handle game state requests', async () => {
			const socket = server.connect('test-bot');

			socket.trigger('authenticate', { botId: 'test-bot', apiKey: 'test-key' });
			await new Promise((resolve) => setTimeout(resolve, 10));

			socket.trigger('identify', {
				botName: 'TestBot',
				gameId,
				chipStack: 1000,
			});
			socket.trigger('requestGameState', {});

			const gameStateMsg = socket.outgoing.find((e) => e.event === 'gameState');
			expect(gameStateMsg).toBeDefined();
		});

		it('should send games list on request', async () => {
			const socket = server.connect('test-bot');

			socket.trigger('listGames', {});

			const gamesListMsg = socket.outgoing.find((e) => e.event === 'gamesList');
			expect(gamesListMsg).toBeDefined();
		});

		it('should handle ping/pong', async () => {
			const socket = server.connect('test-bot');

			socket.trigger('ping', {});

			const pongMsg = socket.outgoing.find((e) => e.event === 'pong');
			expect(pongMsg).toBeDefined();
			expect(pongMsg?.data.timestamp).toBeDefined();
		});
	});

	describe('Force Action and Timeout Handling', () => {
		it('should handle force action errors gracefully', async () => {
			// Mock forcePlayerAction to throw error
			jest.spyOn(gameController, 'forcePlayerAction').mockImplementation(() => {
				throw new Error('Force action failed');
			});

			const socket = server.connect('test-bot');

			socket.trigger('authenticate', { botId: 'test-bot', apiKey: 'test-key' });
			await new Promise((resolve) => setTimeout(resolve, 10));

			socket.trigger('identify', {
				botName: 'TestBot',
				gameId,
				chipStack: 1000,
			});

			// Simulate timeout by calling handleTurnTimeout directly
			const connection = (socketHandler as any).connections.get(socket.id);
			if (connection) {
				(socketHandler as any).handleTurnTimeout(connection);
			}

			const errorEvents = socket.outgoing.filter(
				(e) => e.event === 'forceActionError',
			);
			expect(errorEvents.length).toBeGreaterThan(0);
		});
	});

	describe('Reconnection Scenarios', () => {
		it('should handle reconnection event', async () => {
			const socket = server.connect('test-bot');

			socket.trigger('authenticate', { botId: 'test-bot', apiKey: 'test-key' });
			await new Promise((resolve) => setTimeout(resolve, 10));

			socket.trigger('identify', {
				botName: 'TestBot',
				gameId,
				chipStack: 1000,
			});

			// Clear previous messages
			socket.outgoing = [];

			// Trigger reconnection
			socket.trigger('reconnect', {});

			// Should receive updated game state
			await new Promise((resolve) => setTimeout(resolve, 50));
			const gameState = socket.outgoing.find((e) => e.event === 'gameState');
			expect(gameState).toBeDefined();
		});
	});
});
