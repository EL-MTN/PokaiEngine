import { GameController } from '@/engine/game/GameController';
import { BotAuthService } from '@/services/auth/BotAuthService';
import { SocketHandler } from '@/socket/SocketHandler';
import { ActionType, GameConfig } from '@/types';

import { MockSocket, MockSocketServer } from '../../utils/mocks';

// Mock BotAuthService to avoid MongoDB dependency
const mockBotAuthService = {
	validateBot: jest.fn().mockResolvedValue(true),
	getBot: jest.fn().mockImplementation((botId: string) => ({
		botName: `Bot_${botId}`,
		botId,
		status: 'active',
	})),
	registerBot: jest.fn().mockImplementation((data: any) => ({
		botId: data.botName.toLowerCase().replace(/\s+/g, '-'),
		apiKey: `api-key-${Date.now()}`,
		botName: data.botName,
	})),
	clearAllCache: jest.fn(),
};

jest.mock('@/services/auth/BotAuthService', () => ({
	BotAuthService: {
		getInstance: () => mockBotAuthService,
	},
}));

describe('SocketHandler Comprehensive Tests', () => {
	const gameId = 'game1';
	const bot1Id = 'botA';
	const bot2Id = 'botB';

	let server: MockSocketServer;
	let gameController: GameController;
	let socketHandler: SocketHandler;
	let botAuthService: BotAuthService;
	let bot1Credentials: any;
	let bot2Credentials: any;

	// Helper function to authenticate a bot
	async function authenticateBot(
		socket: MockSocket,
		credentials: any,
	): Promise<void> {
		socket.clearOutgoing();
		socket.trigger('auth.login', {
			botId: credentials.botId,
			apiKey: credentials.apiKey,
		});
		await new Promise((resolve) => setTimeout(resolve, 50));
	}

	// Helper function to create and authenticate a bot
	async function createAuthenticatedBot(
		socketId: string,
		credentials: any,
	): Promise<MockSocket> {
		const bot = server.connect(socketId);
		await authenticateBot(bot, credentials);
		return bot;
	}

	beforeEach(() => {
		jest.clearAllMocks();

		botAuthService = BotAuthService.getInstance();
		botAuthService.clearAllCache();

		// Register test bots
		bot1Credentials = botAuthService.registerBot({
			botName: 'TestBot1',
			developer: 'Test Dev',
			email: 'test1@example.com',
		});

		bot2Credentials = botAuthService.registerBot({
			botName: 'TestBot2',
			developer: 'Test Dev',
			email: 'test2@example.com',
		});

		server = new MockSocketServer();
		gameController = new GameController();
		socketHandler = new SocketHandler(server, gameController);

		const config: GameConfig = {
			maxPlayers: 2,
			smallBlindAmount: 50,
			bigBlindAmount: 100,
			turnTimeLimit: 30,
			isTournament: false,
		};

		gameController.createGame(gameId, config);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('Basic Bot Flow', () => {
		it('lets two bots join and receive game state', async () => {
			const bot1 = await createAuthenticatedBot(bot1Id, bot1Credentials);
			const bot2 = await createAuthenticatedBot(bot2Id, bot2Credentials);

			// Identify / join game
			bot1.trigger('game.join', { gameId, chipStack: 1000 });
			bot2.trigger('game.join', { gameId, chipStack: 1000 });

			// Both should receive identification success
			const bot1Success = bot1.outgoing.find(
				(e) => e.event === 'game.join.success',
			);
			const bot2Success = bot2.outgoing.find(
				(e) => e.event === 'game.join.success',
			);

			expect(bot1Success).toBeDefined();
			expect(bot2Success).toBeDefined();

			// At least one bot should receive turnStart
			const bot1TurnStart = bot1.outgoing.find((e) => e.event === 'turn.start');
			const bot2TurnStart = bot2.outgoing.find((e) => e.event === 'turn.start');

			expect(bot1TurnStart || bot2TurnStart).toBeTruthy();
		});

		it('allows bot to request possible actions and act', async () => {
			const bot1 = await createAuthenticatedBot(bot1Id, bot1Credentials);
			const bot2 = await createAuthenticatedBot(bot2Id, bot2Credentials);

			bot1.trigger('game.join', { gameId, chipStack: 1000 });
			bot2.trigger('game.join', { gameId, chipStack: 1000 });

			// Find which bot has turn
			const bot1Turn = bot1.outgoing.find((e) => e.event === 'turn.start');
			const actingBot = bot1Turn ? bot1 : bot2;

			// Request possible actions
			actingBot.trigger('state.actions', undefined);
			const possibleActionsMsg = actingBot.outgoing.find(
				(e) => e.event === 'state.actions.success',
			);
			expect(possibleActionsMsg).toBeDefined();

			const { possibleActions } = possibleActionsMsg!.data;
			expect(Array.isArray(possibleActions)).toBe(true);

			// Take action
			const checkAction = possibleActions.find((a: any) => a.type === 'check');
			const action = {
				type: checkAction ? ActionType.Check : ActionType.Fold,
				timestamp: Date.now(),
			};

			actingBot.trigger('action.submit', { action });

			// Should receive action success
			const actionAck = actingBot.outgoing.find(
				(e) => e.event === 'action.submit.success',
			);
			expect(actionAck).toBeDefined();
		});
	});

	describe('Error Handling', () => {
		it('rejects action from unidentified bot', async () => {
			const bot1 = await createAuthenticatedBot(bot1Id, bot1Credentials);

			// Try to act without identifying
			const action = {
				type: ActionType.Check,
				timestamp: Date.now(),
			};
			bot1.trigger('action.submit', { action });

			const errorMsg = bot1.outgoing.find(
				(e) => e.event === 'action.submit.error',
			);
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toBe('Not in a game');
		});

		it('rejects identification to non-existent game', async () => {
			const bot1 = await createAuthenticatedBot(bot1Id, bot1Credentials);
			bot1.trigger('game.join', {
				gameId: 'non-existent',
				chipStack: 1000,
			});

			const errorMsg = bot1.outgoing.find((e) => e.event === 'game.join.error');
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toContain('not found');
		});

		it('handles game at capacity', async () => {
			// Fill the game
			const bot1 = await createAuthenticatedBot(bot1Id, bot1Credentials);
			const bot2 = await createAuthenticatedBot(bot2Id, bot2Credentials);

			bot1.trigger('game.join', { gameId, chipStack: 1000 });
			bot2.trigger('game.join', { gameId, chipStack: 1000 });

			// Third bot should fail
			const bot3Creds = botAuthService.registerBot({
				botName: 'Bot3',
				developer: 'Test Dev',
				email: 'bot3@example.com',
			});
			const bot3 = await createAuthenticatedBot('bot3', bot3Creds);
			bot3.trigger('game.join', { gameId, chipStack: 1000 });

			const errorMsg = bot3.outgoing.find((e) => e.event === 'game.join.error');
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toContain('full');
		});
	});

	describe('Connection Management', () => {
		it('handles bot disconnection', async () => {
			const bot1 = await createAuthenticatedBot(bot1Id, bot1Credentials);
			const bot2 = await createAuthenticatedBot(bot2Id, bot2Credentials);

			bot1.trigger('game.join', { gameId, chipStack: 1000 });
			bot2.trigger('game.join', { gameId, chipStack: 1000 });

			// Check initial stats
			let stats = socketHandler.getConnectionStats();
			expect(stats.activeConnections).toBe(2);
			expect(stats.botsInGames).toBe(2);

			// Disconnect bot1
			bot1.disconnect();

			// Check stats after disconnect
			stats = socketHandler.getConnectionStats();
			expect(stats.activeConnections).toBe(1);
			expect(stats.botsInGames).toBe(1);
		});

		it('allows bot to leave game', async () => {
			const bot1 = await createAuthenticatedBot(bot1Id, bot1Credentials);
			bot1.trigger('game.join', { gameId, chipStack: 1000 });

			// Leave game
			bot1.trigger('game.leave', {});

			// Should receive confirmation
			const leftMsg = bot1.outgoing.find(
				(e) => e.event === 'game.leave.success',
			);
			expect(leftMsg).toBeDefined();

			// Stats should update
			const stats = socketHandler.getConnectionStats();
			expect(stats.botsInGames).toBe(0);
		});

		it('can list available games', async () => {
			const bot1 = await createAuthenticatedBot(bot1Id, bot1Credentials);
			bot1.trigger('game.list', {});

			const gamesMsg = bot1.outgoing.find(
				(e) => e.event === 'game.list.success',
			);
			expect(gamesMsg).toBeDefined();
			expect(Array.isArray(gamesMsg?.data.games)).toBe(true);
			expect(gamesMsg?.data.games.length).toBeGreaterThan(0);
		});

		it('handles ping/pong', async () => {
			const bot1 = await createAuthenticatedBot(bot1Id, bot1Credentials);
			bot1.trigger('system.ping', {});

			const pongMsg = bot1.outgoing.find(
				(e) => e.event === 'system.ping.success',
			);
			expect(pongMsg).toBeDefined();
		});
	});

	describe('Game Events', () => {
		it('broadcasts events to all bots in game', async () => {
			const bot1 = await createAuthenticatedBot(bot1Id, bot1Credentials);
			const bot2 = await createAuthenticatedBot(bot2Id, bot2Credentials);

			bot1.trigger('game.join', { gameId, chipStack: 1000 });
			bot2.trigger('game.join', { gameId, chipStack: 1000 });

			// Wait for game initialization
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Find which bot has the turn from initial state
			const bot1Turn = bot1.outgoing.find((e) => e.event === 'turn.start');
			const bot2Turn = bot2.outgoing.find((e) => e.event === 'turn.start');

			// Verify that one bot has the turn
			expect(bot1Turn || bot2Turn).toBeTruthy();

			const actingBot = bot1Turn ? bot1 : bot2;

			// Clear outgoing to track only new messages
			bot1.clearOutgoing();
			bot2.clearOutgoing();

			// Request possible actions and verify they exist
			actingBot.trigger('state.actions', undefined);
			await new Promise((resolve) => setTimeout(resolve, 50));

			const possibleActionsMsg = actingBot.outgoing.find(
				(e) => e.event === 'state.actions.success',
			);

			// Should have received possible actions
			expect(possibleActionsMsg).toBeDefined();
			expect(possibleActionsMsg!.data.possibleActions).toBeDefined();
			expect(possibleActionsMsg!.data.possibleActions.length).toBeGreaterThan(
				0,
			);

			const possibleAction = possibleActionsMsg!.data.possibleActions[0];
			const action = {
				type: possibleAction.type,
				timestamp: Date.now(),
			};

			// Clear outgoing messages before taking action
			bot1.clearOutgoing();
			bot2.clearOutgoing();

			// Take the action
			actingBot.trigger('action.submit', { action });

			// Wait for events to propagate
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Check for any game-related events (gameEvent, gameState, turnStart, etc.)
			const bot1GameEvents = bot1.outgoing.filter(
				(e) =>
					e.event === 'event.game' ||
					e.event === 'state.current.success' ||
					e.event === 'action.submit.success',
			);
			const bot2GameEvents = bot2.outgoing.filter(
				(e) => e.event === 'event.game' || e.event === 'state.current.success',
			);

			// At least the acting bot should receive actionSuccess, and both should receive some update
			expect(bot1GameEvents.length + bot2GameEvents.length).toBeGreaterThan(0);
		});
	});

	describe('Authentication', () => {
		it('should require authentication on connection', () => {
			const socket = server.connect('test-socket');

			// Should emit auth.required
			const authRequired = socket.outgoing.find(
				(e) => e.event === 'auth.required',
			);
			expect(authRequired).toBeDefined();
		});

		it('requires authentication before actions', async () => {
			const socket = server.connect('unauthenticated');

			// Should receive auth.required
			const authRequired = socket.outgoing.find(
				(e) => e.event === 'auth.required',
			);
			expect(authRequired).toBeDefined();

			// Add error handler to prevent unhandled errors
			socket.on('error', () => {
				// Expected error, do nothing
			});

			// Try to identify without auth
			socket.trigger('game.join', {
				gameId,
				chipStack: 1000,
			});

			// Wait for the error to be emitted
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Should receive error
			const error = socket.outgoing.find((e) => e.event === 'system.error');
			expect(error).toBeDefined();
			expect(error?.data.code).toBe('AUTH_REQUIRED');
		});

		it('rejects invalid authentication', async () => {
			mockBotAuthService.validateBot.mockResolvedValueOnce(false);

			const socket = server.connect('test');
			socket.trigger('auth.login', {
				botId: 'invalid',
				apiKey: 'invalid',
			});

			await new Promise((resolve) => setTimeout(resolve, 50));

			const error = socket.outgoing.find((e) => e.event === 'auth.login.error');
			expect(error).toBeDefined();
		});

		it('should allow actions after authentication', async () => {
			const socket = server.connect('test-socket');

			// Authenticate
			socket.trigger('auth.login', {
				botId: bot1Id,
				apiKey: bot1Credentials.apiKey,
			});

			// Wait for async auth
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Should be authenticated
			const authEvent = socket.outgoing.find(
				(e) => e.event === 'auth.login.success',
			);
			expect(authEvent).toBeDefined();

			// Clear outgoing
			socket.clearOutgoing();

			// Now try to join game
			socket.trigger('game.join', {
				gameId,
				chipStack: 1000,
			});

			// Should succeed
			const success = socket.outgoing.find(
				(e) => e.event === 'game.join.success',
			);
			const error = socket.outgoing.find((e) => e.event === 'system.error');

			expect(success).toBeDefined();
			expect(error).toBeUndefined();
		});
	});
});
