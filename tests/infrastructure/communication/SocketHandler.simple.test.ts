import { GameController } from '@/application/engine/GameController';
import { SocketHandler } from '@/infrastructure/communication/SocketHandler';
import { GameConfig, ActionType, Action } from '@/domain/types';

// Mock Socket type
class MockSocket {
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

	join(_room: string): void {}
	leave(_room: string): void {}

	disconnect(): void {
		this.trigger('disconnect', {});
	}
}

// Mock server
class MockSocketServer {
	private connectCallbacks: ((socket: any) => void)[] = [];
	public sockets: MockSocket[] = [];

	on(event: string, callback: (socket: any) => void): void {
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

// Mock BotAuthService
const mockBotAuthService = {
	validateBot: jest.fn().mockResolvedValue(true),
	getBot: jest.fn().mockImplementation((botId: string) => ({
		botName: `Bot_${botId}`,
		botId,
		status: 'active',
	})),
};

jest.mock('@/application/services/BotAuthService', () => ({
	BotAuthService: {
		getInstance: () => mockBotAuthService,
	},
}));

describe('SocketHandler Basic Tests', () => {
	let server: MockSocketServer;
	let gameController: GameController;
	let socketHandler: SocketHandler;

	beforeEach(() => {
		jest.clearAllMocks();

		server = new MockSocketServer();
		gameController = new GameController();
		socketHandler = new SocketHandler(server as any, gameController);

		// Create a test game
		const config: GameConfig = {
			maxPlayers: 2,
			smallBlindAmount: 50,
			bigBlindAmount: 100,
			turnTimeLimit: 2,
			isTournament: false,
		};
		gameController.createGame('test-game', config);
	});

	it('should require authentication on connection', () => {
		const socket = server.connect('test-socket');

		// Should emit authRequired
		const authRequired = socket.outgoing.find(
			(e) => e.event === 'authRequired',
		);
		expect(authRequired).toBeDefined();
	});

	it('should reject actions without authentication', () => {
		const socket = server.connect('test-socket');

		// Try to join game without auth
		socket.trigger('identify', {
			botName: 'TestBot',
			gameId: 'test-game',
			chipStack: 1000,
		});

		// Should receive error
		const error = socket.outgoing.find((e) => e.event === 'error');
		expect(error).toBeDefined();
		expect(error?.data.code).toBe('AUTH_REQUIRED');
	});

	it('should allow actions after authentication', async () => {
		const socket = server.connect('test-socket');

		// Authenticate
		socket.trigger('authenticate', {
			botId: 'test-bot-id',
			apiKey: 'test-api-key',
		});

		// Wait for async auth
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Should be authenticated
		const authEvent = socket.outgoing.find((e) => e.event === 'authenticated');
		expect(authEvent).toBeDefined();

		// Clear outgoing
		socket.outgoing = [];

		// Now try to join game
		socket.trigger('identify', {
			botName: 'TestBot',
			gameId: 'test-game',
			chipStack: 1000,
		});

		// Should succeed
		const success = socket.outgoing.find(
			(e) => e.event === 'identificationSuccess',
		);
		const error = socket.outgoing.find((e) => e.event === 'error');

		expect(success).toBeDefined();
		expect(error).toBeUndefined();
	});

	it('should track connection stats', async () => {
		const socket1 = server.connect('socket1');
		const socket2 = server.connect('socket2');

		// Initial stats
		let stats = socketHandler.getConnectionStats();
		expect(stats.activeConnections).toBe(2);
		expect(stats.botsInGames).toBe(0);

		// Authenticate and join game
		socket1.trigger('authenticate', {
			botId: 'bot1',
			apiKey: 'key1',
		});

		await new Promise((resolve) => setTimeout(resolve, 50));

		socket1.trigger('identify', {
			botName: 'Bot1',
			gameId: 'test-game',
			chipStack: 1000,
		});

		// Check stats
		stats = socketHandler.getConnectionStats();
		expect(stats.botsInGames).toBe(1);

		// Disconnect
		socket1.disconnect();

		// Check final stats
		stats = socketHandler.getConnectionStats();
		expect(stats.activeConnections).toBe(1);
		expect(stats.botsInGames).toBe(0);
	});
});
