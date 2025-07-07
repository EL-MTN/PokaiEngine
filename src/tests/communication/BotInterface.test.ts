import { BotInterface } from '../../communication/BotInterface';
import { GameController, GameInfo } from '../../engine/GameController';
import { ActionType, GamePhase, BotGameState, PossibleAction, GameEvent, Suit, Rank } from '../../types';

describe('BotInterface - Bot API Tests', () => {
	let botInterface: BotInterface;
	let mockGameController: jest.Mocked<GameController>;

	beforeEach(() => {
		mockGameController = {
			getBotGameState: jest.fn(),
			getPossibleActions: jest.fn(),
			processAction: jest.fn(),
			addPlayerToGame: jest.fn(),
			removePlayerFromGame: jest.fn(),
			canPlayerJoinGame: jest.fn(),
			findAvailableGames: jest.fn(),
			getGameInfo: jest.fn(),
			listGames: jest.fn(),
			subscribeToGame: jest.fn(),
			unsubscribeFromGame: jest.fn(),
		} as any;

		botInterface = new BotInterface(mockGameController);
	});

	describe('Game State Management', () => {
		test('should get game state for a bot', () => {
			const mockGameState: BotGameState = {
				playerId: 'bot-123',
				currentPhase: GamePhase.PreFlop,
				timeRemaining: 30,
				minimumRaise: 100,
				players: [
					{
						id: 'bot-123',
						name: 'TestBot',
						chipStack: 1000,
						currentBet: 0,
						isActive: true,
						hasActed: false,
						isFolded: false,
						isAllIn: false,
						totalBetThisHand: 0,
					},
					{
						id: 'bot-456',
						name: 'OpponentBot',
						chipStack: 1500,
						currentBet: 100,
						isActive: true,
						hasActed: true,
						isFolded: false,
						isAllIn: false,
						totalBetThisHand: 100,
					}
				],
				communityCards: [],
				potSize: 150,
				playerCards: [
					{ suit: Suit.Hearts, rank: Rank.Ace },
					{ suit: Suit.Spades, rank: Rank.King }
				],
				possibleActions: [
					{ type: ActionType.Call, description: 'Call 100' },
					{ type: ActionType.Raise, minAmount: 200, maxAmount: 1000, description: 'Raise to 200-1000' },
					{ type: ActionType.Fold, description: 'Fold' }
				],
				currentPlayerToAct: 'bot-123',
			};

			mockGameController.getBotGameState.mockReturnValue(mockGameState);

			const result = botInterface.getGameState('game-1', 'bot-123');

			expect(mockGameController.getBotGameState).toHaveBeenCalledWith('game-1', 'bot-123');
			expect(result).toEqual(mockGameState);
		});

		test('should get possible actions for a bot', () => {
			const mockActions: PossibleAction[] = [
				{ type: ActionType.Call, description: 'Call 100' },
				{ type: ActionType.Raise, minAmount: 200, maxAmount: 1000, description: 'Raise to 200-1000' },
				{ type: ActionType.Fold, description: 'Fold' }
			];

			mockGameController.getPossibleActions.mockReturnValue(mockActions);

			const result = botInterface.getPossibleActions('game-1', 'bot-123');

			expect(mockGameController.getPossibleActions).toHaveBeenCalledWith('game-1', 'bot-123');
			expect(result).toEqual(mockActions);
		});
	});

	describe('Action Submission', () => {
		test('should submit valid bot action', () => {
			const action = {
				type: ActionType.Call,
				amount: 100,
				playerId: 'bot-123',
				timestamp: Date.now(),
			};

			botInterface.submitAction('game-1', action);

			expect(mockGameController.processAction).toHaveBeenCalledWith('game-1', action);
		});

		test('should handle action submission errors', () => {
			const action = {
				type: ActionType.Call,
				amount: 100,
				playerId: 'bot-123',
				timestamp: Date.now(),
			};

			mockGameController.processAction.mockImplementation(() => {
				throw new Error('Invalid action');
			});

			expect(() => {
				botInterface.submitAction('game-1', action);
			}).toThrow('Invalid action');
		});
	});

	describe('Game Joining and Leaving', () => {
		test('should join bot to a game', () => {
			botInterface.joinGame('game-1', 'bot-123', 'TestBot', 1000);

			expect(mockGameController.addPlayerToGame).toHaveBeenCalledWith(
				'game-1',
				'bot-123',
				'TestBot',
				1000
			);
		});

		test('should handle join game errors', () => {
			mockGameController.addPlayerToGame.mockImplementation(() => {
				throw new Error('Game is full');
			});

			expect(() => {
				botInterface.joinGame('game-1', 'bot-123', 'TestBot', 1000);
			}).toThrow('Game is full');
		});

		test('should remove bot from a game', () => {
			botInterface.leaveGame('game-1', 'bot-123');

			expect(mockGameController.removePlayerFromGame).toHaveBeenCalledWith('game-1', 'bot-123');
		});

		test('should check if bot can join a game', () => {
			mockGameController.canPlayerJoinGame.mockReturnValue(true);

			const result = botInterface.canJoinGame('game-1', 'bot-123');

			expect(mockGameController.canPlayerJoinGame).toHaveBeenCalledWith('game-1', 'bot-123');
			expect(result).toBe(true);
		});

		test('should return false when bot cannot join game', () => {
			mockGameController.canPlayerJoinGame.mockReturnValue(false);

			const result = botInterface.canJoinGame('game-1', 'bot-123');

			expect(result).toBe(false);
		});
	});

	describe('Game Discovery', () => {
		test('should find available games', () => {
			const mockGames: GameInfo[] = [
				{ id: 'game-1', playerCount: 2, maxPlayers: 6, isRunning: true, currentHand: 1, smallBlind: 50, bigBlind: 100 },
				{ id: 'game-2', playerCount: 4, maxPlayers: 10, isRunning: true, currentHand: 2, smallBlind: 25, bigBlind: 50 }
			];

			mockGameController.findAvailableGames.mockReturnValue(mockGames);

			const result = botInterface.findAvailableGames();

			expect(mockGameController.findAvailableGames).toHaveBeenCalledWith(undefined);
			expect(result).toEqual(mockGames);
		});

		test('should find available games with max player filter', () => {
			const mockGames: GameInfo[] = [
				{ id: 'game-1', playerCount: 2, maxPlayers: 6, isRunning: true, currentHand: 1, smallBlind: 50, bigBlind: 100 }
			];

			mockGameController.findAvailableGames.mockReturnValue(mockGames);

			const result = botInterface.findAvailableGames(6);

			expect(mockGameController.findAvailableGames).toHaveBeenCalledWith(6);
			expect(result).toEqual(mockGames);
		});

		test('should get game information', () => {
			const mockGameInfo: GameInfo = {
				id: 'game-1',
				playerCount: 3,
				maxPlayers: 6,
				isRunning: true,
				currentHand: 1,
				smallBlind: 50,
				bigBlind: 100,
			};

			mockGameController.getGameInfo.mockReturnValue(mockGameInfo);

			const result = botInterface.getGameInfo('game-1');

			expect(mockGameController.getGameInfo).toHaveBeenCalledWith('game-1');
			expect(result).toEqual(mockGameInfo);
		});

		test('should list all games', () => {
			const mockGameList: GameInfo[] = [
				{ id: 'game-1', playerCount: 2, maxPlayers: 6, isRunning: false, currentHand: 0, smallBlind: 50, bigBlind: 100 },
				{ id: 'game-2', playerCount: 6, maxPlayers: 6, isRunning: true, currentHand: 5, smallBlind: 50, bigBlind: 100 },
				{ id: 'game-3', playerCount: 1, maxPlayers: 6, isRunning: false, currentHand: 0, smallBlind: 50, bigBlind: 100 }
			];

			mockGameController.listGames.mockReturnValue(mockGameList);

			const result = botInterface.listGames();

			expect(mockGameController.listGames).toHaveBeenCalled();
			expect(result).toEqual(mockGameList);
		});
	});

	describe('Event Subscription', () => {
		test('should subscribe to game events', () => {
			const eventCallback = jest.fn();

			botInterface.subscribeToGameEvents('game-1', eventCallback);

			expect(mockGameController.subscribeToGame).toHaveBeenCalledWith('game-1', eventCallback);
		});

		test('should unsubscribe from game events', () => {
			const eventCallback = jest.fn();

			botInterface.unsubscribeFromGameEvents('game-1', eventCallback);

			expect(mockGameController.unsubscribeFromGame).toHaveBeenCalledWith('game-1', eventCallback);
		});

		test('should handle event subscription with game events', () => {
			const eventCallback = jest.fn();
			let subscribedCallback: ((event: GameEvent) => void) | undefined;

			mockGameController.subscribeToGame.mockImplementation((gameId, callback) => {
				subscribedCallback = callback;
			});

			botInterface.subscribeToGameEvents('game-1', eventCallback);

			// Simulate a game event
			const mockEvent: GameEvent = {
				type: 'hand_started',
				timestamp: Date.now(),
				handNumber: 1,
			};

			if (subscribedCallback) {
				subscribedCallback(mockEvent);
			}

			expect(eventCallback).toHaveBeenCalledWith(mockEvent);
		});
	});

	describe('Error Handling and Edge Cases', () => {
		test('should handle game controller errors gracefully', () => {
			mockGameController.getBotGameState.mockImplementation(() => {
				throw new Error('Game not found');
			});

			expect(() => {
				botInterface.getGameState('non-existent-game', 'bot-123');
			}).toThrow('Game not found');
		});

		test('should handle empty game list', () => {
			mockGameController.listGames.mockReturnValue([]);

			const result = botInterface.listGames();

			expect(result).toEqual([]);
		});

		test('should handle null game info', () => {
			mockGameController.getGameInfo.mockReturnValue(undefined);

			const result = botInterface.getGameInfo('non-existent-game');

			expect(result).toBeUndefined();
		});

		test('should handle no available games', () => {
			mockGameController.findAvailableGames.mockReturnValue([]);

			const result = botInterface.findAvailableGames();

			expect(result).toEqual([]);
		});

		test('should handle invalid action submission', () => {
			const invalidAction = {
				type: 'INVALID_ACTION' as any,
				amount: -100,
				playerId: '',
				timestamp: Date.now(),
			};

			mockGameController.processAction.mockImplementation(() => {
				throw new Error('Invalid action type');
			});

			expect(() => {
				botInterface.submitAction('game-1', invalidAction);
			}).toThrow('Invalid action type');
		});
	});

	describe('Integration Scenarios', () => {
		test('should handle complete bot workflow', () => {
			// 1. Check if can join game
			mockGameController.canPlayerJoinGame.mockReturnValue(true);
			const canJoin = botInterface.canJoinGame('game-1', 'bot-123');
			expect(canJoin).toBe(true);

			// 2. Join game
			botInterface.joinGame('game-1', 'bot-123', 'TestBot', 1000);
			expect(mockGameController.addPlayerToGame).toHaveBeenCalled();

			// 3. Get initial game state
			mockGameController.getBotGameState.mockReturnValue({
				playerId: 'bot-123',
				currentPhase: GamePhase.PreFlop,
				players: [],
				communityCards: [],
				potSize: 0,
				playerCards: [
					{ suit: Suit.Hearts, rank: Rank.Ace },
					{ suit: Suit.Spades, rank: Rank.King }
				],
				possibleActions: [],
				currentPlayerToAct: 'bot-123',
				timeRemaining: 30,
				minimumRaise: 100,
			});

			const gameState = botInterface.getGameState('game-1', 'bot-123');
			expect(gameState.currentPlayerToAct).toBe('bot-123');

			// 4. Get possible actions
			mockGameController.getPossibleActions.mockReturnValue([
				{ type: ActionType.Call, description: 'Call 100' },
				{ type: ActionType.Fold, description: 'Fold' }
			]);

			const actions = botInterface.getPossibleActions('game-1', 'bot-123');
			expect(actions).toHaveLength(2);

			// 5. Submit action
			const action = {
				type: ActionType.Call,
				amount: 100,
				playerId: 'bot-123',
				timestamp: Date.now(),
			};

			botInterface.submitAction('game-1', action);
			expect(mockGameController.processAction).toHaveBeenCalledWith('game-1', action);

			// 6. Subscribe to events
			const eventCallback = jest.fn();
			botInterface.subscribeToGameEvents('game-1', eventCallback);
			expect(mockGameController.subscribeToGame).toHaveBeenCalled();

			// 7. Leave game
			botInterface.leaveGame('game-1', 'bot-123');
			expect(mockGameController.removePlayerFromGame).toHaveBeenCalled();
		});

		test('should handle multiple bots in same game', () => {
			const bot1Id = 'bot-123';
			const bot2Id = 'bot-456';

			// Both bots join the same game
			botInterface.joinGame('game-1', bot1Id, 'Bot1', 1000);
			botInterface.joinGame('game-1', bot2Id, 'Bot2', 1500);

			expect(mockGameController.addPlayerToGame).toHaveBeenCalledTimes(2);

			// Both bots get different game states (from their perspective)
			mockGameController.getBotGameState
				.mockReturnValueOnce({
					playerId: bot1Id,
					currentPhase: GamePhase.PreFlop,
					players: [],
					communityCards: [],
					potSize: 0,
					playerCards: [
						{ suit: Suit.Hearts, rank: Rank.Ace },
						{ suit: Suit.Spades, rank: Rank.King }
					],
					possibleActions: [],
					currentPlayerToAct: bot1Id,
					timeRemaining: 30,
					minimumRaise: 100,
				})
				.mockReturnValueOnce({
					playerId: bot2Id,
					currentPhase: GamePhase.PreFlop,
					players: [],
					communityCards: [],
					potSize: 0,
					playerCards: [
						{ suit: Suit.Diamonds, rank: Rank.Queen },
						{ suit: Suit.Clubs, rank: Rank.Jack }
					],
					possibleActions: [],
					currentPlayerToAct: bot1Id,
					timeRemaining: 30,
					minimumRaise: 100,
				});

			const bot1State = botInterface.getGameState('game-1', bot1Id);
			const bot2State = botInterface.getGameState('game-1', bot2Id);

			// Each bot sees their own cards
			expect(bot1State.playerCards?.[0].rank).toBe(Rank.Ace);
			expect(bot2State.playerCards?.[0].rank).toBe(Rank.Queen);

			// Both see the same current player to act
			expect(bot1State.currentPlayerToAct).toBe(bot1Id);
			expect(bot2State.currentPlayerToAct).toBe(bot1Id);
		});
	});
});