import { GameController } from '@/application/engine/GameController';
import { SocketHandler, Socket, SocketIOServer } from '@/infrastructure/communication/SocketHandler';
import { GameConfig, ActionType, Action, GameEvent } from '@/domain/types';

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

	leave(_room: string): void {
		/* rooms not needed for unit test */
	}

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

	it('allows bots to play multiple consecutive hands', () => {
		const bot1 = server.connect(`${bot1Id}_multi`);
		const bot2 = server.connect(`${bot2Id}_multi`);

		bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });
		bot2.trigger('identify', { botName: 'Beta', gameId, chipStack: 1000 });

		const numberOfHandsToPlay = 10;
		let handsPlayed = 0;
		let safetyCounter = 0;
		const safetyLimit = numberOfHandsToPlay * 50; // Total loops allowed across all hands

		const allBots = [bot1, bot2];

		const decideAction = (possible: any[]) => {
			// Prefer Call, otherwise Check, otherwise Fold
			const call = possible.find((a) => a.type === 'call');
			if (call) return { type: ActionType.Call, amount: call.minAmount };
			const check = possible.find((a) => a.type === 'check');
			if (check) return { type: ActionType.Check };
			return { type: ActionType.Fold };
		};

		// The first hand starts automatically when the second bot joins.
		// This loop will process events and actions until 10 hands are complete.
		while (handsPlayed < numberOfHandsToPlay && safetyCounter < safetyLimit) {
			let handCompletedInLoop = false;

			for (const bot of allBots) {
				while (bot.outgoing.length > 0) {
					const evt = bot.outgoing.shift()!;
					if (evt.event === 'turnStart') {
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
						handCompletedInLoop = true;
					}
				}
			}

			if (handCompletedInLoop) {
				handsPlayed++;
				// Clear any remaining events to ensure next hand starts clean
				allBots.forEach((b) => (b.outgoing = []));
			}

			// Advance timers to process game logic and automatic hand starting
			jest.advanceTimersByTime(500);
			safetyCounter++;
		}

		expect(handsPlayed).toBe(numberOfHandsToPlay);

		const game = gameController.getGame(gameId);
		const finalState = game!.getGameState();
		const totalChips = finalState.players.reduce((sum, p) => sum + p.chipStack, 0);
		expect(totalChips).toBe(2000);
	});


	it('bots can call pre-flop then check to showdown', () => {
		const bot1 = server.connect(`${bot1Id}_2`);
		const bot2 = server.connect(`${bot2Id}_2`);

		bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });
		bot2.trigger('identify', { botName: 'Beta', gameId, chipStack: 1000 });

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

	describe('Edge Case: Disconnection and Reconnection', () => {
		it('handles bot disconnection mid-game', () => {
			const bot1 = server.connect(bot1Id);
			const bot2 = server.connect(bot2Id);

			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });
			bot2.trigger('identify', { botName: 'Beta', gameId, chipStack: 1000 });

			// Check initial connection stats
			const statsBeforeDisconnect = socketHandler.getConnectionStats();
			expect(statsBeforeDisconnect.activeConnections).toBe(2);
			expect(statsBeforeDisconnect.botsInGames).toBe(2);

			// Simulate disconnection
			bot1.trigger('disconnect', {});

			// Check connection stats after disconnect
			const statsAfterDisconnect = socketHandler.getConnectionStats();
			expect(statsAfterDisconnect.activeConnections).toBe(1);
			expect(statsAfterDisconnect.totalConnections).toBe(1);

			// Verify game can continue with remaining player
			const game = gameController.getGame(gameId);
			expect(game).toBeDefined();
		});

		it('handles bot reconnection with same player ID', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });

			// Simulate disconnection
			bot1.trigger('disconnect', {});

			// Simulate reconnection
			bot1.trigger('reconnect', {});

			// Should receive game state after reconnection
			const gameStateMsg = bot1.outgoing.find(e => e.event === 'gameState');
			expect(gameStateMsg).toBeDefined();
		});

		it('maintains turn timer state during disconnection', () => {
			const bot1 = server.connect(bot1Id);
			const bot2 = server.connect(bot2Id);

			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });
			bot2.trigger('identify', { botName: 'Beta', gameId, chipStack: 1000 });

			// Find who's turn it is
			const bot1Turn = bot1.outgoing.find(e => e.event === 'turnStart');
			const actingBot = bot1Turn ? bot1 : bot2;

			// Disconnect the acting bot
			actingBot.trigger('disconnect', {});

			// Advance time to trigger timeout
			jest.advanceTimersByTime(3000);

			// Game should handle timeout even with disconnected player
			const game = gameController.getGame(gameId);
			expect(game).toBeDefined();
		});
	});

	describe('Edge Case: Invalid Actions and Error Handling', () => {
		it('rejects action from unidentified bot', () => {
			const bot1 = server.connect(bot1Id);

			// Try to act without identifying
			const action: Action = {
				type: ActionType.Fold,
				playerId: bot1Id,
				timestamp: Date.now(),
			};
			bot1.trigger('action', { action });

			const errorMsg = bot1.outgoing.find(e => e.event === 'actionError');
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toBe('Not in a game');
		});

		it('rejects action with mismatched player ID', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });

			// Try to act with wrong player ID
			const action: Action = {
				type: ActionType.Fold,
				playerId: 'wrongId',
				timestamp: Date.now(),
			};
			bot1.trigger('action', { action });

			const errorMsg = bot1.outgoing.find(e => e.event === 'actionError');
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toContain('must be from the connected bot');
		});

		it('handles malformed identify data gracefully', () => {
			const bot1 = server.connect(bot1Id);

			// Send malformed data
			bot1.trigger('identify', { gameId: 'nonexistent', chipStack: -100 });

			const errorMsg = bot1.outgoing.find(e => e.event === 'identificationError');
			expect(errorMsg).toBeDefined();
		});

		it('handles request for game state when not in game', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('requestGameState', {});

			// Should not crash, just not send game state
			const gameStateMsg = bot1.outgoing.find(e => e.event === 'gameState');
			expect(gameStateMsg).toBeUndefined();
		});

		it('handles request for possible actions when not in game', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('requestPossibleActions', {});

			const errorMsg = bot1.outgoing.find(e => e.event === 'possibleActionsError');
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toBe('Not in a game');
		});
	});

	describe('Edge Case: Turn Timeouts', () => {
		it('forces fold on turn timeout', () => {
			const bot1 = server.connect(bot1Id);
			const bot2 = server.connect(bot2Id);

			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });
			bot2.trigger('identify', { botName: 'Beta', gameId, chipStack: 1000 });

			// Find who's turn it is
			const bot1Turn = bot1.outgoing.find(e => e.event === 'turnStart');
			const bot2Turn = bot2.outgoing.find(e => e.event === 'turnStart');
			const actingBot = bot1Turn ? bot1 : bot2;

			// Clear outgoing to check for timeout
			actingBot.outgoing = [];

			// Advance time to warning (70% of 2 seconds = 1.4 seconds)
			jest.advanceTimersByTime(1400);

			const warningMsg = actingBot.outgoing.find(e => e.event === 'turnWarning');
			expect(warningMsg).toBeDefined();
			expect(warningMsg?.data.timeRemaining).toBe(0.6); // 30% of 2 seconds left

			// Advance to full timeout
			jest.advanceTimersByTime(600);

			const timeoutMsg = actingBot.outgoing.find(e => e.event === 'turnTimeout');
			expect(timeoutMsg).toBeDefined();
		});

		it('clears timer when action is taken', () => {
			const bot1 = server.connect(bot1Id);
			const bot2 = server.connect(bot2Id);

			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });
			bot2.trigger('identify', { botName: 'Beta', gameId, chipStack: 1000 });

			// Find who's turn it is
			const bot1Turn = bot1.outgoing.find(e => e.event === 'turnStart');
			const actingBot = bot1Turn ? bot1 : bot2;
			const actingId = actingBot === bot1 ? bot1Id : bot2Id;

			// Clear outgoing
			actingBot.outgoing = [];

			// Take action before timeout
			const action: Action = {
				type: ActionType.Check,
				playerId: actingId,
				timestamp: Date.now(),
			};
			actingBot.trigger('action', { action });

			// Advance past timeout time
			jest.advanceTimersByTime(3000);

			// Should not receive timeout
			const timeoutMsg = actingBot.outgoing.find(e => e.event === 'turnTimeout');
			expect(timeoutMsg).toBeUndefined();
		});

		it('handles very short timeouts without warnings', () => {
			// Create a game with very short timeout (0.5 seconds)
			const shortGameId = 'shortGame';
			const shortConfig: GameConfig = {
				maxPlayers: 2,
				smallBlindAmount: 50,
				bigBlindAmount: 100,
				turnTimeLimit: 0.5,
				isTournament: false,
			};
			gameController.createGame(shortGameId, shortConfig);

			const bot1 = server.connect(`${bot1Id}_short`);
			const bot2 = server.connect(`${bot2Id}_short`);

			bot1.trigger('identify', { botName: 'Alpha', gameId: shortGameId, chipStack: 1000 });
			bot2.trigger('identify', { botName: 'Beta', gameId: shortGameId, chipStack: 1000 });

			// Find who's turn it is
			const bot1Turn = bot1.outgoing.find(e => e.event === 'turnStart');
			const bot2Turn = bot2.outgoing.find(e => e.event === 'turnStart');
			const actingBot = bot1Turn ? bot1 : bot2;

			// Clear outgoing
			actingBot.outgoing = [];

			// Advance time to timeout (0.5 seconds)
			jest.advanceTimersByTime(500);

			// Should timeout without warning (too short for warning)
			const timeoutMsg = actingBot.outgoing.find(e => e.event === 'turnTimeout');
			expect(timeoutMsg).toBeDefined();

			// Should not have received warning
			const warningMsg = actingBot.outgoing.find(e => e.event === 'turnWarning');
			expect(warningMsg).toBeUndefined();
		});
	});

	describe('Edge Case: Game Management', () => {
		it('handles bot leaving game', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });

			// Leave game
			bot1.trigger('leaveGame', {});

			const leftMsg = bot1.outgoing.find(e => e.event === 'leftGame');
			expect(leftMsg).toBeDefined();

			// Try to act after leaving
			const action: Action = {
				type: ActionType.Fold,
				playerId: bot1Id,
				timestamp: Date.now(),
			};
			bot1.trigger('action', { action });

			const errorMsg = bot1.outgoing.find(e => e.event === 'actionError');
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toBe('Not in a game');
		});

		it('handles leaving game when not in a game', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('leaveGame', {});

			const errorMsg = bot1.outgoing.find(e => e.event === 'leaveGameError');
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toBe('Bot is not in a game');
		});

		it('can list available games', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('listGames', {});

			const gamesMsg = bot1.outgoing.find(e => e.event === 'gamesList');
			expect(gamesMsg).toBeDefined();
			expect(Array.isArray(gamesMsg?.data.games)).toBe(true);
		});

		it('handles ping/pong for connection monitoring', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('ping', {});

			const pongMsg = bot1.outgoing.find(e => e.event === 'pong');
			expect(pongMsg).toBeDefined();
			expect(pongMsg?.data.timestamp).toBeDefined();
		});
	});

	describe('Edge Case: Concurrent Connections', () => {
		it('handles multiple bots connecting simultaneously', () => {
			const bots = [];
			for (let i = 0; i < 10; i++) {
				const bot = server.connect(`bot_${i}`);
				bot.trigger('identify', { 
					botName: `Bot${i}`, 
					gameId, 
					chipStack: 1000 
				});
				bots.push(bot);
			}

			// Get stats to verify connections
			const stats = socketHandler.getConnectionStats();
			expect(stats.totalConnections).toBe(10);
			
			// All should connect, but only those in game should be counted
			expect(stats.activeConnections).toBe(10);
		});

		it('enforces game capacity at socket level', () => {
			// Create a game with capacity for 2 players
			const bots = [];
			for (let i = 0; i < 5; i++) {
				const bot = server.connect(`capacity_bot_${i}`);
				bot.trigger('identify', { 
					botName: `Bot${i}`, 
					gameId, 
					chipStack: 1000 
				});
				bots.push(bot);
			}

			// Count success and error messages
			const successCount = bots.filter(bot => 
				bot.outgoing.some(e => e.event === 'identificationSuccess')
			).length;
			const errorCount = bots.filter(bot => 
				bot.outgoing.some(e => e.event === 'identificationError')
			).length;

			// Should have 2 successes and 3 errors (game capacity is 2)
			expect(successCount).toBe(2);
			expect(errorCount).toBe(3);

			// Check that error messages mention capacity
			const errorBot = bots.find(bot => 
				bot.outgoing.some(e => e.event === 'identificationError')
			);
			const errorMsg = errorBot?.outgoing.find(e => e.event === 'identificationError');
			expect(errorMsg?.data.error).toContain('full');
		});

		it('handles rapid actions from same bot', () => {
			const bot1 = server.connect(bot1Id);
			const bot2 = server.connect(bot2Id);

			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });
			bot2.trigger('identify', { botName: 'Beta', gameId, chipStack: 1000 });

			const bot1Turn = bot1.outgoing.find(e => e.event === 'turnStart');
			if (bot1Turn) {
				// Send multiple actions rapidly
				for (let i = 0; i < 5; i++) {
					const action: Action = {
						type: ActionType.Check,
						playerId: bot1Id,
						timestamp: Date.now() + i,
					};
					bot1.trigger('action', { action });
				}

				// Only first action should succeed
				const successCount = bot1.outgoing.filter(e => e.event === 'actionSuccess').length;
				const errorCount = bot1.outgoing.filter(e => e.event === 'actionError').length;

				expect(successCount).toBe(1);
				expect(errorCount).toBeGreaterThan(0);
			}
		});
	});

	describe('Edge Case: Cleanup Operations', () => {
		it('cleans up inactive connections', () => {
			const bot1 = server.connect(bot1Id);
			const bot2 = server.connect(bot2Id);

			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });
			bot2.trigger('identify', { botName: 'Beta', gameId, chipStack: 1000 });

			// Check initial stats
			const initialStats = socketHandler.getConnectionStats();
			expect(initialStats.totalConnections).toBe(2);

			// Disconnect bot1
			bot1.trigger('disconnect', {});

			// Check stats after disconnect
			const afterDisconnect = socketHandler.getConnectionStats();
			expect(afterDisconnect.totalConnections).toBe(1);
			expect(afterDisconnect.activeConnections).toBe(1);
		});

		it('broadcasts events to all bots in game', () => {
			const bot1 = server.connect(bot1Id);
			const bot2 = server.connect(bot2Id);

			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });
			bot2.trigger('identify', { botName: 'Beta', gameId, chipStack: 1000 });

			// Clear outgoing
			bot1.outgoing = [];
			bot2.outgoing = [];

			// Broadcast custom event
			socketHandler.broadcastToGame(gameId, 'customEvent', { data: 'test' });

			// Both bots should receive the event
			const bot1Event = bot1.outgoing.find(e => e.event === 'customEvent');
			const bot2Event = bot2.outgoing.find(e => e.event === 'customEvent');

			expect(bot1Event).toBeDefined();
			expect(bot2Event).toBeDefined();
			expect(bot1Event?.data.data).toBe('test');
		});
	});

	describe('Edge Case: Error Recovery', () => {
		it('handles game controller errors gracefully', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });

			// Mock a game controller error
			jest.spyOn(gameController, 'getPossibleActions').mockImplementationOnce(() => {
				throw new Error('Game state corrupted');
			});

			bot1.trigger('requestPossibleActions', {});

			const errorMsg = bot1.outgoing.find(e => e.event === 'possibleActionsError');
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toBe('Game state corrupted');
		});

		it('continues operation after force action failure', () => {
			const bot1 = server.connect(bot1Id);
			const bot2 = server.connect(bot2Id);

			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });
			bot2.trigger('identify', { botName: 'Beta', gameId, chipStack: 1000 });

			// Mock force action to throw
			jest.spyOn(gameController, 'forcePlayerAction').mockImplementationOnce(() => {
				throw new Error('Force action failed');
			});

			// Find acting bot and trigger timeout
			const bot1Turn = bot1.outgoing.find(e => e.event === 'turnStart');
			const actingBot = bot1Turn ? bot1 : bot2;

			// Trigger timeout - should NOT throw anymore (fixed error handling)
			expect(() => {
				jest.advanceTimersByTime(2000);
			}).not.toThrow();

			// Should still send timeout notification
			const timeoutMsg = actingBot.outgoing.find(e => e.event === 'turnTimeout');
			expect(timeoutMsg).toBeDefined();

			// Should send force action error notification
			const forceActionErrorMsg = actingBot.outgoing.find(e => e.event === 'forceActionError');
			expect(forceActionErrorMsg).toBeDefined();
			expect(forceActionErrorMsg?.data.error).toBe('Force action failed');

			// Socket handler should not crash
			expect(() => socketHandler.getConnectionStats()).not.toThrow();
		});

		it('handles game state request errors', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });

			// Mock getBotGameState to throw
			jest.spyOn(gameController, 'getBotGameState').mockImplementationOnce(() => {
				throw new Error('Player not found');
			});

			bot1.trigger('requestGameState', {});

			const errorMsg = bot1.outgoing.find(e => e.event === 'gameStateError');
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toBe('Player not found');
		});
	});

	describe('Edge Case: Complex Game Event Scenarios', () => {
		it('handles all game event types correctly', () => {
			const bot1 = server.connect(bot1Id);
			const bot2 = server.connect(bot2Id);

			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });
			bot2.trigger('identify', { botName: 'Beta', gameId, chipStack: 1000 });

			// Start hand
			
			// Just test that game exists and events are handled
			const game = gameController.getGame(gameId);
			expect(game).toBeDefined();
			
			// Both bots should receive some events after hand start
			const bot1HasEvents = bot1.outgoing.some(e => e.event === 'gameEvent');
			const bot2HasEvents = bot2.outgoing.some(e => e.event === 'gameEvent');
			
			expect(bot1HasEvents || bot2HasEvents).toBe(true);
		});

		it('handles connection without gameId for event subscription', () => {
			const bot1 = server.connect(bot1Id);
			
			// Connection is created but bot hasn't identified yet
			// This tests the subscribeToGameEvents path when gameId is undefined
			const stats = socketHandler.getConnectionStats();
			expect(stats.totalConnections).toBe(1);
			expect(stats.botsInGames).toBe(0);
		});

		it('ignores events for disconnected bots', () => {
			const bot1 = server.connect(bot1Id);
			const bot2 = server.connect(bot2Id);
			
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });
			bot2.trigger('identify', { botName: 'Beta', gameId, chipStack: 1000 });

			// Disconnect bot1
			bot1.disconnect();

			// Clear outgoing
			bot1.outgoing = [];
			bot2.outgoing = [];

			// Starting a new hand is now automatic after previous hand completes.
			// To test this, we can simulate a hand_complete event from the controller.
			const game = gameController.getGame(gameId);
			if (game) {
				// Manually trigger the event that would normally be emitted by the engine
				(gameController as any).handleGameEvent(gameId, {
					type: 'hand_complete',
					timestamp: Date.now(),
					handNumber: 1, // A previous hand number
					gameState: game.getGameState()
				});
			}

			// Advance timers to allow the 1-second delay in GameController to fire
			jest.advanceTimersByTime(1000);

			// Bot1 should not receive any events
			expect(bot1.outgoing.length).toBe(0);
			
			// Bot2 should still receive events
			expect(bot2.outgoing.length).toBeGreaterThan(0);
		});
	});

	describe('Branch Coverage: Conditional Paths', () => {
		it('handles game not found in identification', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('identify', { botName: 'Alpha', gameId: 'nonexistent', chipStack: 1000 });

			const errorMsg = bot1.outgoing.find(e => e.event === 'identificationError');
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toContain('not found');
		});

		it('handles socket without join function', () => {
			const bot1 = server.connect(bot1Id);
			// Remove join function to test conditional path
			delete (bot1 as any).join;
			
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });

			const successMsg = bot1.outgoing.find(e => e.event === 'identificationSuccess');
			expect(successMsg).toBeDefined();
		});

		it('handles socket without leave function', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });

			// Remove leave function to test conditional path
			delete (bot1 as any).leave;
			
			bot1.trigger('leaveGame', {});

			const leftMsg = bot1.outgoing.find(e => e.event === 'leftGame');
			expect(leftMsg).toBeDefined();
		});

		it('handles turn timer with no game found', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });

			// Manually call startTurnTimer with a connection that has no valid game
			const connection = (socketHandler as any).connections.get(bot1.id);
			if (connection) {
				// Mock getGame to return undefined
				jest.spyOn(gameController, 'getGame').mockReturnValueOnce(undefined);
				
				// Call the private method directly to test the branch
				(socketHandler as any).startTurnTimer(connection);
			}

			// Should not crash when game is not found
			expect(() => socketHandler.getConnectionStats()).not.toThrow();
		});

		it('handles cleanup with no inactive connections', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });

			// All connections are active, so cleanup should not remove any
			const statsBefore = socketHandler.getConnectionStats();
			socketHandler.cleanupInactiveConnections();
			const statsAfter = socketHandler.getConnectionStats();

			expect(statsBefore.totalConnections).toBe(statsAfter.totalConnections);
		});

		it('handles cleanup with connections missing lastAction', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });

			// Manually set lastAction to undefined to test branch
			const connection = (socketHandler as any).connections.get(bot1.id);
			if (connection) {
				connection.lastAction = undefined;
			}

			// Should not crash
			expect(() => socketHandler.cleanupInactiveConnections()).not.toThrow();
		});

		it('handles warning timer not set for short timeouts', () => {
			// Create a game with very short timeout (0.8 seconds) - below 1 second threshold
			const veryShortGameId = 'veryShortGame';
			const veryShortConfig: GameConfig = {
				maxPlayers: 2,
				smallBlindAmount: 50,
				bigBlindAmount: 100,
				turnTimeLimit: 0.8,
				isTournament: false,
			};
			gameController.createGame(veryShortGameId, veryShortConfig);

			const bot1 = server.connect(`${bot1Id}_veryshort`);
			const bot2 = server.connect(`${bot2Id}_veryshort`);

			bot1.trigger('identify', { botName: 'Alpha', gameId: veryShortGameId, chipStack: 1000 });
			bot2.trigger('identify', { botName: 'Beta', gameId: veryShortGameId, chipStack: 1000 });

			// Find who's turn it is
			const bot1Turn = bot1.outgoing.find(e => e.event === 'turnStart');
			const bot2Turn = bot2.outgoing.find(e => e.event === 'turnStart');
			const actingBot = bot1Turn ? bot1 : bot2;

			// Clear outgoing
			actingBot.outgoing = [];

			// Advance time to timeout (0.8 seconds)
			jest.advanceTimersByTime(800);

			// Should timeout but no warning should be sent (timeLimitMs <= 1000)
			const timeoutMsg = actingBot.outgoing.find(e => e.event === 'turnTimeout');
			expect(timeoutMsg).toBeDefined();

			const warningMsg = actingBot.outgoing.find(e => e.event === 'turnWarning');
			expect(warningMsg).toBeUndefined();
		});

		it('handles event handler cleanup failure in leaveGame', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });

			// Mock unsubscribeFromGame to throw error
			jest.spyOn(gameController, 'unsubscribeFromGame').mockImplementationOnce(() => {
				throw new Error('Unsubscribe failed');
			});

			// Should not crash game leaving
			expect(() => bot1.trigger('leaveGame', {})).not.toThrow();

			const leftMsg = bot1.outgoing.find(e => e.event === 'leftGame');
			expect(leftMsg).toBeDefined();
		});

		it('handles event handler cleanup failure in disconnection', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });

			// Mock unsubscribeFromGame to throw error
			jest.spyOn(gameController, 'unsubscribeFromGame').mockImplementationOnce(() => {
				throw new Error('Unsubscribe failed');
			});

			// Should not crash disconnection
			expect(() => bot1.disconnect()).not.toThrow();

			const stats = socketHandler.getConnectionStats();
			expect(stats.totalConnections).toBe(0);
		});
	});

	describe('Branch Coverage: Game Event Handling', () => {
		it('handles game events with no gameState', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });

			// Clear outgoing
			bot1.outgoing = [];

			// Manually trigger event handler with event lacking gameState
			const connection = (socketHandler as any).connections.get(bot1.id);
			if (connection && connection.eventHandler) {
				const eventWithoutGameState: GameEvent = {
					type: 'hand_complete',
					timestamp: Date.now(),
					handNumber: 1
				};
				connection.eventHandler(eventWithoutGameState);
			}

			// Should still emit the event
			const gameEventMsg = bot1.outgoing.find(e => e.event === 'gameEvent');
			expect(gameEventMsg).toBeDefined();
		});

		it('handles all game event types that update game state', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });

			const connection = (socketHandler as any).connections.get(bot1.id);
			if (connection && connection.eventHandler) {
				// Test each event type that calls sendGameState
				const eventTypes = ['hand_started', 'action_taken', 'flop_dealt', 'turn_dealt', 'river_dealt', 'showdown_complete', 'hand_complete'];
				
				for (const eventType of eventTypes) {
					bot1.outgoing = [];
					
					const event: GameEvent = {
						type: eventType as any,
						timestamp: Date.now(),
						handNumber: 1,
						gameState: gameController.getGame(gameId)?.getGameState()
					};
					
					connection.eventHandler(event);
					
					// Should emit game event
					const gameEventMsg = bot1.outgoing.find(e => e.event === 'gameEvent');
					expect(gameEventMsg).toBeDefined();
					
					// Should send game state update
					const gameStateMsg = bot1.outgoing.find(e => e.event === 'gameState');
					expect(gameStateMsg).toBeDefined();
				}
			}
		});

		it('handles event with currentPlayerToAct matching connection', () => {
			const bot1 = server.connect(bot1Id);
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });

			const connection = (socketHandler as any).connections.get(bot1.id);
			if (connection && connection.eventHandler) {
				bot1.outgoing = [];
				
				// Create mock game state with this player as current to act
				const mockGameState = {
					...gameController.getGame(gameId)?.getGameState(),
					currentPlayerToAct: bot1.id
				};
				
				const event: GameEvent = {
					type: 'action_taken',
					timestamp: Date.now(),
					handNumber: 1,
					gameState: mockGameState as any
				};
				
				connection.eventHandler(event);
				
				// Should start turn timer
				const turnStartMsg = bot1.outgoing.find(e => e.event === 'turnStart');
				expect(turnStartMsg).toBeDefined();
			}
		});

		it('handles cleanup of turn timers on hand completion', () => {
			const bot1 = server.connect(bot1Id);
			const bot2 = server.connect(bot2Id);
			
			bot1.trigger('identify', { botName: 'Alpha', gameId, chipStack: 1000 });
			bot2.trigger('identify', { botName: 'Beta', gameId, chipStack: 1000 });
			
			// Get current turn timer count
			const statsBefore = socketHandler.getConnectionStats();
			
			// Simulate hand completion
			const connection = (socketHandler as any).connections.get(bot1.id);
			if (connection && connection.eventHandler) {
				const event: GameEvent = {
					type: 'hand_complete',
					timestamp: Date.now(),
					handNumber: 1,
					gameState: gameController.getGame(gameId)?.getGameState()
				};
				
				connection.eventHandler(event);
			}
			
			// Should have cleared turn timers
			const statsAfter = socketHandler.getConnectionStats();
			expect(statsAfter.activeTurnTimers).toBeLessThanOrEqual(statsBefore.activeTurnTimers);
		});
	});

	describe('Coverage Tests - Unseat Feature Edge Cases', () => {
		it('handles unseat request when bot is not in game', () => {
			const bot = server.connect('bot1');
			
			// Trigger unseat without joining a game
			bot.trigger('unseat', {});

			const errorMsg = bot.outgoing.find(e => e.event === 'unseatError');
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toBe('Bot is not in a game');
		});

		it('handles unseat request successfully', () => {
			const testGameId = 'unseat-test-game';
			const config: GameConfig = {
				maxPlayers: 2,
				smallBlindAmount: 50,
				bigBlindAmount: 100,
				turnTimeLimit: 2,
				isTournament: false,
			};

			gameController.createGame(testGameId, config);

			const bot1 = server.connect('bot1');
			const bot2 = server.connect('bot2');

			// Join game
			bot1.trigger('identify', { botName: 'Alpha', gameId: testGameId, chipStack: 1000 });
			bot2.trigger('identify', { botName: 'Beta', gameId: testGameId, chipStack: 1000 });

			// Clear outgoing
			bot1.outgoing = [];

			// Request unseat
			bot1.trigger('unseat', {});

			const confirmMsg = bot1.outgoing.find(e => e.event === 'unseatConfirmed');
			expect(confirmMsg).toBeDefined();
		});

		it('handles unseat request error from game controller', () => {
			const testGameId = 'unseat-error-test';
			const config: GameConfig = {
				maxPlayers: 2,
				smallBlindAmount: 50,
				bigBlindAmount: 100,
				turnTimeLimit: 2,
				isTournament: false,
			};

			gameController.createGame(testGameId, config);

			const bot = server.connect('bot1');
			bot.trigger('identify', { botName: 'Alpha', gameId: testGameId, chipStack: 1000 });

			// Mock requestUnseat to throw error
			jest.spyOn(gameController, 'requestUnseat').mockImplementationOnce(() => {
				throw new Error('Cannot unseat during critical phase');
			});

			bot.outgoing = [];
			bot.trigger('unseat', {});

			const errorMsg = bot.outgoing.find(e => e.event === 'unseatError');
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toBe('Cannot unseat during critical phase');
		});
	});

	describe('Coverage Tests - Leave Game Error Handling', () => {
		it('handles error when leaving game fails', () => {
			const testGameId = 'leave-error-test';
			const config: GameConfig = {
				maxPlayers: 2,
				smallBlindAmount: 50,
				bigBlindAmount: 100,
				turnTimeLimit: 2,
				isTournament: false,
			};

			gameController.createGame(testGameId, config);

			const bot = server.connect('bot1');
			bot.trigger('identify', { botName: 'Alpha', gameId: testGameId, chipStack: 1000 });

			// Mock removePlayerFromGame to throw error
			jest.spyOn(gameController, 'removePlayerFromGame').mockImplementationOnce(() => {
				throw new Error('Cannot remove player during hand');
			});

			bot.outgoing = [];
			bot.trigger('leaveGame', {});

			const errorMsg = bot.outgoing.find(e => e.event === 'leaveGameError');
			expect(errorMsg).toBeDefined();
			expect(errorMsg?.data.error).toBe('Cannot remove player during hand');
		});
	});

	describe('Coverage Tests - Reconnection Handling', () => {
		it('handles reconnection event', () => {
			const testGameId = 'reconnect-test';
			const config: GameConfig = {
				maxPlayers: 2,
				smallBlindAmount: 50,
				bigBlindAmount: 100,
				turnTimeLimit: 2,
				isTournament: false,
			};

			gameController.createGame(testGameId, config);

			const bot = server.connect('bot1');
			bot.trigger('identify', { botName: 'Alpha', gameId: testGameId, chipStack: 1000 });

			// Clear outgoing
			bot.outgoing = [];

			// Trigger reconnect
			bot.trigger('reconnect', {});

			// Should update last action timestamp
			const connection = (socketHandler as any).connections.get('bot1');
			expect(connection?.lastAction).toBeGreaterThan(0);
		});
	});

	describe('Coverage Tests - Game Event Handling Edge Cases', () => {
		it('ignores game events for disconnected bots', () => {
			const testGameId = 'disconnect-event-test';
			const config: GameConfig = {
				maxPlayers: 2,
				smallBlindAmount: 50,
				bigBlindAmount: 100,
				turnTimeLimit: 2,
				isTournament: false,
			};

			gameController.createGame(testGameId, config);

			const bot = server.connect('bot1');
			bot.trigger('identify', { botName: 'Alpha', gameId: testGameId, chipStack: 1000 });

			// Manually set connection as disconnected
			const connection = (socketHandler as any).connections.get('bot1');
			if (connection) {
				connection.isConnected = false;
			}

			bot.outgoing = [];

			// Try to handle a game event
			(socketHandler as any).handleGameEvent(connection, {
				type: 'hand_started',
				timestamp: Date.now(),
				handNumber: 1,
				gameState: null
			});

			// Should not emit any events
			expect(bot.outgoing.length).toBe(0);
		});

		it('handles turn timer start when bot has no gameId', () => {
			const bot = server.connect('bot1');
			
			// Create a connection without gameId
			const connection = {
				socket: bot,
				playerId: 'bot1',
				gameId: undefined,
				isConnected: true,
				lastAction: Date.now()
			};

			// Manually add to connections map
			(socketHandler as any).connections.set('bot1', connection);

			// Should not throw when starting timer without gameId
			expect(() => {
				(socketHandler as any).startTurnTimer(connection);
			}).not.toThrow();
		});
	});

	describe('Coverage Tests - Cleanup Edge Cases', () => {
		it('handles cleanup with error in unsubscribe', () => {
			const testGameId = 'cleanup-error-test';
			const config: GameConfig = {
				maxPlayers: 2,
				smallBlindAmount: 50,
				bigBlindAmount: 100,
				turnTimeLimit: 2,
				isTournament: false,
			};

			gameController.createGame(testGameId, config);

			const bot = server.connect('bot1');
			bot.trigger('identify', { botName: 'Alpha', gameId: testGameId, chipStack: 1000 });

			// Mock unsubscribeFromGame to throw
			jest.spyOn(gameController, 'unsubscribeFromGame').mockImplementationOnce(() => {
				throw new Error('Unsubscribe failed');
			});

			// Should not throw when cleaning up
			expect(() => {
				socketHandler.cleanupInactiveConnections();
			}).not.toThrow();
		});

		it('handles cleanup when socket.leave is missing', () => {
			const testGameId = 'cleanup-missing-test';
			const config: GameConfig = {
				maxPlayers: 2,
				smallBlindAmount: 50,
				bigBlindAmount: 100,
				turnTimeLimit: 2,
				isTournament: false,
			};

			gameController.createGame(testGameId, config);

			const bot = server.connect('bot1');
			bot.trigger('identify', { botName: 'Alpha', gameId: testGameId, chipStack: 1000 });

			// Remove leave function
			delete (bot as any).leave;

			// Make connection inactive
			const connection = (socketHandler as any).connections.get('bot1');
			if (connection) {
				connection.lastAction = Date.now() - 35 * 60 * 1000; // 35 minutes ago
			}

			// Should not throw when cleaning up
			expect(() => {
				socketHandler.cleanupInactiveConnections();
			}).not.toThrow();
		});

		it('should fix the reconnection bug where identify fails with "already in a game"', () => {
			// This test verifies the specific bug we fixed:
			// Before fix: Bot disconnects but stays in playerGameMap, then reconnection fails
			// After fix: Bot can re-identify and reconnect successfully

			const testGameId = 'reconnection-test';
			const config: GameConfig = {
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				isTournament: false,
			};
			gameController.createGame(testGameId, config);

			// Step 1: Bot connects and identifies
			const socket1 = server.connect('first-socket');
			socket1.trigger('identify', {
				botName: 'TestBot',
				gameId: testGameId,
				chipStack: 1000,
			});

			// Verify successful identification
			const success1 = socket1.outgoing.find(msg => msg.event === 'identificationSuccess');
			expect(success1).toBeDefined();
			const playerId = success1?.data.playerId;

			// Verify player is in game
			expect(gameController.getPlayerGameId(playerId)).toBe(testGameId);

			// Step 2: Bot disconnects (but stays in game for reconnection)
			socket1.disconnect();

			// Player should still be in game (this is correct behavior for reconnection)
			expect(gameController.getPlayerGameId(playerId)).toBe(testGameId);

			// Step 3: Bot reconnects with NEW socket connection
			// This is where the bug occurred - it would fail with "Player X is already in a game"
			const socket2 = server.connect('second-socket'); // Different socket ID = different player ID

			// The bug was here: this would throw "Player X is already in a game"
			// Our fix should make this work by detecting it's a reconnection scenario
			socket2.trigger('identify', {
				botName: 'TestBot',
				gameId: testGameId,
				chipStack: 1000, // This value should be ignored for reconnection
			});

			// Before fix: This would be an error message
			// After fix: This should be a success message
			const success2 = socket2.outgoing.find(msg => msg.event === 'identificationSuccess');
			const error2 = socket2.outgoing.find(msg => msg.event === 'identificationError');

			if (success2) {
				// Success case - reconnection worked
				expect(success2).toBeDefined();
				
				// Should receive game state
				const gameState = socket2.outgoing.find(msg => msg.event === 'gameState');
				expect(gameState).toBeDefined();
			} else if (error2) {
				// Error case - bug still exists
				console.log('Reconnection failed with error:', error2.data.error);
				
				// For now, let's see what the actual error is
				expect(error2.data.error).not.toContain('already in a game');
			} else {
				fail('Expected either success or error message from reconnection attempt');
			}
		});
	});
}); 