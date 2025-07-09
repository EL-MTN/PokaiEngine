import { GameController } from '@engine/GameController';
import { SocketHandler, Socket, SocketIOServer } from '@communication/SocketHandler';
import { GameConfig, ActionType, Action } from '@types';

/**
 * Lightweight in-memory Socket.IO mocks so we can drive the SocketHandler
 * without a real network layer.
 */
class MockSocket implements Socket {
	public handlers: Record<string, ((data: any) => void)[]> = {};
	public outgoing: Array<{ event: string; data: any }> = [];

	constructor(public id: string) {}

	emit(event: string, data: any): void {
		// Outgoing event from server → client, we just record it
		this.outgoing.push({ event, data });
	}

	on(event: string, callback: (...args: any[]) => void): void {
		if (!this.handlers[event]) this.handlers[event] = [];
		this.handlers[event].push(callback);
	}

	// Helper for tests – simulate a client → server message
	trigger(event: string, data: any): void {
		(this.handlers[event] || []).forEach((cb) => cb(data));
	}

	join(_room: string): void {
		/* rooms not needed for unit test */
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

describe('SocketHandler – two-bot flow', () => {
	jest.useFakeTimers();

	const gameId = 'game1';
	const bot1Id = 'botA';
	const bot2Id = 'botB';

	let server: MockSocketServer;
	let gameController: GameController;
	let socketHandler: SocketHandler;

	beforeEach(() => {
		server = new MockSocketServer();
		gameController = new GameController();
		socketHandler = new SocketHandler(server, gameController);

		const config: GameConfig = {
			maxPlayers: 2,
			smallBlindAmount: 50,
			bigBlindAmount: 100,
			turnTimeLimit: 2, // seconds
			isTournament: false,
		};

		gameController.createGame(gameId, config);
	});

	it('lets two bots join, receive turnStart and act', () => {
		// Connect sockets (bots)
		const bot1 = server.connect(bot1Id);
		const bot2 = server.connect(bot2Id);

		// Identify / join game
		bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });
		bot2.trigger('identify', { botName: 'Beta', gameId, chipStack: 1000 });

		// Start the first hand
		gameController.startHand(gameId);

		// The GameEngine posts blinds internally and then sets first player to act.
		// SocketHandler should emit `turnStart` to whichever bot is first.
		const bot1TurnStart = bot1.outgoing.find((e) => e.event === 'turnStart');
		const bot2TurnStart = bot2.outgoing.find((e) => e.event === 'turnStart');

		expect(bot1TurnStart || bot2TurnStart).toBeDefined();

		const actingBot = bot1TurnStart ? bot1 : bot2;
		const actingId = actingBot === bot1 ? bot1Id : bot2Id;

		// Acting bot requests possible actions
		actingBot.trigger('requestPossibleActions', undefined);
		const possibleActionsMsg = actingBot.outgoing.find((e) => e.event === 'possibleActions');
		expect(possibleActionsMsg).toBeDefined();
		const { possibleActions } = possibleActionsMsg!.data;
		expect(Array.isArray(possibleActions)).toBe(true);

		// Choose a safe action (if check available, else fold) and send
		const checkOrFold = possibleActions.find((a: any) => a.type === 'check')
			? { type: ActionType.Check }
			: { type: ActionType.Fold };

		const action: Action = {
			...checkOrFold,
			playerId: actingId,
			timestamp: Date.now(),
		};
		actingBot.trigger('action', { action });

		// Expect server to acknowledge actionSuccess
		const actionAck = actingBot.outgoing.find((e) => e.event === 'actionSuccess');
		expect(actionAck).toBeDefined();

		// Advance timers to process any pending warnings/timeout logic (should not trigger timeout)
		jest.advanceTimersByTime(3000);

		// No timeout events should have been emitted for the acting bot
		const timeoutEvent = actingBot.outgoing.find((e) => e.event === 'turnTimeout');
		expect(timeoutEvent).toBeUndefined();
	});

	it('bots can play a complete hand by folding until hand_complete', () => {
		const bot1 = server.connect(bot1Id);
		const bot2 = server.connect(bot2Id);

		bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });
		bot2.trigger('identify', { botName: 'Beta', gameId, chipStack: 1000 });

		gameController.startHand(gameId);

		let handComplete = false;
		let safetyCounter = 0;

		const allBots = [bot1, bot2];

		while (!handComplete && safetyCounter < 20) {
			for (const bot of allBots) {
				while (bot.outgoing.length > 0) {
					const evt = bot.outgoing.shift()!;
					if (evt.event === 'turnStart') {
						const action: Action = {
							type: ActionType.Fold,
							playerId: bot === bot1 ? bot1Id : bot2Id,
							timestamp: Date.now(),
						};
						bot.trigger('action', { action });
					}
					if (evt.event === 'gameEvent' && evt.data?.event?.type === 'hand_complete') {
						handComplete = true;
					}

					if (evt.event === 'hand_complete') {
						handComplete = true;
					}
				}
			}

			// Advance timers (simulate 1 second each loop)
			jest.advanceTimersByTime(1000);
			safetyCounter++;
		}

		expect(handComplete).toBe(true);
	});


	it('bots can call pre-flop then check to showdown', () => {
		const bot1 = server.connect(`${bot1Id}_2`);
		const bot2 = server.connect(`${bot2Id}_2`);

		bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });
		bot2.trigger('identify', { botName: 'Beta', gameId, chipStack: 1000 });

		gameController.startHand(gameId);

		let handComplete = false;
		let safetyCounter = 0;

		const allBots = [bot1, bot2];

		const decideAction = (possible: any[]) => {
			// Prefer Call, otherwise Check, otherwise Fold (should not happen)
			const call = possible.find((a) => a.type === 'call');
			if (call) return { type: ActionType.Call, amount: call.minAmount };
			const check = possible.find((a) => a.type === 'check');
			if (check) return { type: ActionType.Check };
			return { type: ActionType.Fold };
		};

		while (!handComplete && safetyCounter < 50) {
			for (const bot of allBots) {
				while (bot.outgoing.length > 0) {
					const evt = bot.outgoing.shift()!;

					if (evt.event === 'turnStart') {
						// ask for actions
						bot.trigger('requestPossibleActions', undefined);
					}

					if (evt.event === 'possibleActions') {
						const { possibleActions } = evt.data;
						const chosen = decideAction(possibleActions);
						const action: Action = {
							...chosen,
							playerId: bot.id,
							timestamp: Date.now(),
						};
						bot.trigger('action', { action });
					}

					if (evt.event === 'gameEvent' && evt.data?.event?.type === 'hand_complete') {
						handComplete = true;
					}
				}
			}

			jest.advanceTimersByTime(500); // half-second per loop
			safetyCounter++;
		}

		expect(handComplete).toBe(true);
	});
}); 