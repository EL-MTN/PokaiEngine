import { GameController } from '@/engine/game/GameController';
import { BotInterface } from '@/socket/BotInterface';
import { Action, ActionType, GameConfig } from '@/types';

describe('BotInterface', () => {
	let gameController: GameController;
	let botInterface: BotInterface;
	let gameId: string;
	let playerId: string;
	let botName: string;
	let chipStack: number;

	beforeEach(() => {
		gameController = new GameController();
		botInterface = new BotInterface(gameController);
		gameId = 'test-game';
		playerId = 'test-player';
		botName = 'TestBot';
		chipStack = 1000;

		// Create a test game
		const gameConfig: GameConfig = {
			maxPlayers: 4,
			smallBlindAmount: 10,
			bigBlindAmount: 20,
			turnTimeLimit: 30,
			isTournament: false,
		};
		gameController.createGame(gameId, gameConfig);
	});

	describe('Constructor', () => {
		it('should create BotInterface with GameController', () => {
			expect(botInterface).toBeInstanceOf(BotInterface);
			expect(botInterface).toBeDefined();
		});
	});

	describe('joinGame', () => {
		it('should successfully join a game', () => {
			expect(() => {
				botInterface.joinGame(gameId, playerId, botName, chipStack);
			}).not.toThrow();

			// Verify player was added by checking game state
			const gameState = botInterface.getGameState(gameId, playerId);
			expect(gameState.players.some((p) => p.id === playerId)).toBe(true);
		});

		it('should throw error for non-existent game', () => {
			expect(() => {
				botInterface.joinGame(
					'non-existent-game',
					playerId,
					botName,
					chipStack,
				);
			}).toThrow();
		});

		it('should throw error for duplicate player', () => {
			botInterface.joinGame(gameId, playerId, botName, chipStack);

			expect(() => {
				botInterface.joinGame(gameId, playerId, botName, chipStack);
			}).toThrow();
		});

		it('should allow negative chip stack (validation handled by game engine)', () => {
			expect(() => {
				botInterface.joinGame(gameId, playerId, botName, -100);
			}).not.toThrow();
		});

		it('should allow empty bot name (validation handled by game engine)', () => {
			expect(() => {
				botInterface.joinGame(gameId, playerId, '', chipStack);
			}).not.toThrow();
		});
	});

	describe('leaveGame', () => {
		beforeEach(() => {
			botInterface.joinGame(gameId, playerId, botName, chipStack);
		});

		it('should successfully leave a game', () => {
			expect(() => {
				botInterface.leaveGame(gameId, playerId);
			}).not.toThrow();

			// Verify player was removed by checking if we can get their game state
			expect(() => {
				botInterface.getGameState(gameId, playerId);
			}).toThrow();
		});

		it('should throw error for non-existent game', () => {
			expect(() => {
				botInterface.leaveGame('non-existent-game', playerId);
			}).toThrow();
		});

		it('should throw error for non-existent player', () => {
			expect(() => {
				botInterface.leaveGame(gameId, 'non-existent-player');
			}).toThrow();
		});
	});

	describe('getGameState', () => {
		beforeEach(() => {
			botInterface.joinGame(gameId, playerId, botName, chipStack);
		});

		it('should return game state for valid player', () => {
			const gameState = botInterface.getGameState(gameId, playerId);

			expect(gameState).toBeDefined();
			expect(gameState.playerId).toBe(playerId);
			expect(gameState.players.some((p) => p.id === playerId)).toBe(true);
		});

		it('should throw error for non-existent game', () => {
			expect(() => {
				botInterface.getGameState('non-existent-game', playerId);
			}).toThrow();
		});

		it('should throw error for non-existent player', () => {
			expect(() => {
				botInterface.getGameState(gameId, 'non-existent-player');
			}).toThrow();
		});
	});

	describe('getPossibleActions', () => {
		beforeEach(() => {
			botInterface.joinGame(gameId, playerId, botName, chipStack);
			// Add second player to start a hand
			botInterface.joinGame(gameId, 'player2', 'Bot2', chipStack);
			gameController.startHand(gameId);
		});

		it('should return possible actions for active player', () => {
			const possibleActions = botInterface.getPossibleActions(gameId, playerId);

			expect(Array.isArray(possibleActions)).toBe(true);
			expect(possibleActions.length).toBeGreaterThan(0);
		});

		it('should throw error for non-existent game', () => {
			expect(() => {
				botInterface.getPossibleActions('non-existent-game', playerId);
			}).toThrow();
		});

		it('should return empty array for non-existent player', () => {
			const possibleActions = botInterface.getPossibleActions(
				gameId,
				'non-existent-player',
			);
			expect(Array.isArray(possibleActions)).toBe(true);
			expect(possibleActions.length).toBe(0);
		});
	});

	describe('submitAction', () => {
		beforeEach(() => {
			botInterface.joinGame(gameId, playerId, botName, chipStack);
			botInterface.joinGame(gameId, 'player2', 'Bot2', chipStack);
			gameController.startHand(gameId);
		});

		it('should submit valid action', () => {
			const action: Action = {
				type: ActionType.Fold,
				playerId: playerId,
				timestamp: Date.now(),
			};

			expect(() => {
				botInterface.submitAction(gameId, action);
			}).not.toThrow();
		});

		it('should throw error for invalid action', () => {
			const action: Action = {
				type: ActionType.Bet,
				playerId: playerId,
				amount: -100, // Invalid negative amount
				timestamp: Date.now(),
			};

			expect(() => {
				botInterface.submitAction(gameId, action);
			}).toThrow();
		});

		it('should throw error for non-existent game', () => {
			const action: Action = {
				type: ActionType.Fold,
				playerId: playerId,
				timestamp: Date.now(),
			};

			expect(() => {
				botInterface.submitAction('non-existent-game', action);
			}).toThrow();
		});

		it('should throw error for out of turn action', () => {
			const action: Action = {
				type: ActionType.Fold,
				playerId: 'player2', // Wrong player's turn
				timestamp: Date.now(),
			};

			expect(() => {
				botInterface.submitAction(gameId, action);
			}).toThrow();
		});
	});

	describe('canJoinGame', () => {
		it('should return true for valid game and player', () => {
			const canJoin = botInterface.canJoinGame(gameId, playerId);
			expect(canJoin).toBe(true);
		});

		it('should return false for non-existent game', () => {
			const canJoin = botInterface.canJoinGame('non-existent-game', playerId);
			expect(canJoin).toBe(false);
		});

		it('should return false for player already in game', () => {
			botInterface.joinGame(gameId, playerId, botName, chipStack);
			const canJoin = botInterface.canJoinGame(gameId, playerId);
			expect(canJoin).toBe(false);
		});

		it('should return false for full game', () => {
			// Temporarily disable auto-start to fill the game
			const startHandSpy = jest
				.spyOn(gameController, 'startHand')
				.mockImplementation(() => {});

			// Fill the game to capacity
			for (let i = 0; i < 4; i++) {
				botInterface.joinGame(gameId, `player${i}`, `Bot${i}`, chipStack);
			}

			const canJoin = botInterface.canJoinGame(gameId, 'new-player');
			expect(canJoin).toBe(false);

			// Restore original functionality
			startHandSpy.mockRestore();
		});
	});

	describe('findAvailableGames', () => {
		it('should return list of available games', () => {
			const availableGames = botInterface.findAvailableGames();
			expect(Array.isArray(availableGames)).toBe(true);
			expect(availableGames.length).toBeGreaterThan(0);
		});

		it('should filter games by max players', () => {
			// Create another game with different max players
			const gameConfig: GameConfig = {
				maxPlayers: 2,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				isTournament: false,
			};
			gameController.createGame('game2', gameConfig);

			const availableGames = botInterface.findAvailableGames(2);
			expect(availableGames.some((game) => game.id === 'game2')).toBe(true);
		});

		it('should return empty array when no games available', () => {
			// Temporarily disable auto-start to fill the game
			const startHandSpy = jest
				.spyOn(gameController, 'startHand')
				.mockImplementation(() => {});

			// Fill the existing game
			for (let i = 0; i < 4; i++) {
				botInterface.joinGame(gameId, `player${i}`, `Bot${i}`, chipStack);
			}
			const availableGames = botInterface.findAvailableGames();
			expect(availableGames.length).toBe(0);

			// Restore original functionality
			startHandSpy.mockRestore();
		});
	});

	describe('getGameInfo', () => {
		it('should return game information', () => {
			const gameInfo = botInterface.getGameInfo(gameId);
			expect(gameInfo).toBeDefined();
			expect(gameInfo?.id).toBe(gameId);
		});

		it('should return undefined for non-existent game', () => {
			const gameInfo = botInterface.getGameInfo('non-existent-game');
			expect(gameInfo).toBeUndefined();
		});
	});

	describe('listGames', () => {
		it('should return list of all games', () => {
			const games = botInterface.listGames();
			expect(Array.isArray(games)).toBe(true);
			expect(games.length).toBeGreaterThan(0);
			expect(games.some((game) => game.id === gameId)).toBe(true);
		});

		it('should return empty array when no games exist', () => {
			const emptyGameController = new GameController();
			const emptyBotInterface = new BotInterface(emptyGameController);

			const games = emptyBotInterface.listGames();
			expect(games.length).toBe(0);
		});
	});

	describe('subscribeToGameEvents', () => {
		it('should subscribe to game events', () => {
			const callback = jest.fn();

			expect(() => {
				botInterface.subscribeToGameEvents(gameId, callback);
			}).not.toThrow();
		});

		it('should receive game events after subscription', () => {
			const callback = jest.fn();
			botInterface.subscribeToGameEvents(gameId, callback);

			// Join players and start hand to trigger events
			botInterface.joinGame(gameId, playerId, botName, chipStack);
			botInterface.joinGame(gameId, 'player2', 'Bot2', chipStack);
			gameController.startHand(gameId);

			expect(callback).toHaveBeenCalled();
		});

		it('should throw error for non-existent game', () => {
			const callback = jest.fn();

			expect(() => {
				botInterface.subscribeToGameEvents('non-existent-game', callback);
			}).toThrow();
		});
	});

	describe('unsubscribeFromGameEvents', () => {
		it('should unsubscribe from game events', () => {
			const callback = jest.fn();
			botInterface.subscribeToGameEvents(gameId, callback);

			expect(() => {
				botInterface.unsubscribeFromGameEvents(gameId, callback);
			}).not.toThrow();
		});

		it('should not receive events after unsubscription', () => {
			const callback = jest.fn();
			botInterface.subscribeToGameEvents(gameId, callback);
			botInterface.unsubscribeFromGameEvents(gameId, callback);

			// Join players and start hand to trigger events
			botInterface.joinGame(gameId, playerId, botName, chipStack);
			botInterface.joinGame(gameId, 'player2', 'Bot2', chipStack);
			gameController.startHand(gameId);

			expect(callback).not.toHaveBeenCalled();
		});

		it('should handle non-existent game gracefully', () => {
			const callback = jest.fn();

			expect(() => {
				botInterface.unsubscribeFromGameEvents('non-existent-game', callback);
			}).not.toThrow();
		});
	});

	describe('Integration Tests', () => {
		it('should handle complete game flow', () => {
			// Join game
			botInterface.joinGame(gameId, playerId, botName, chipStack);
			botInterface.joinGame(gameId, 'player2', 'Bot2', chipStack);

			// Start hand
			gameController.startHand(gameId);

			// Get game state
			const gameState = botInterface.getGameState(gameId, playerId);
			expect(gameState.currentPhase).toBe('preflop');

			// Get possible actions
			const possibleActions = botInterface.getPossibleActions(gameId, playerId);
			expect(possibleActions.length).toBeGreaterThan(0);

			// Submit action
			const action: Action = {
				type: ActionType.Fold,
				playerId: playerId,
				timestamp: Date.now(),
			};
			botInterface.submitAction(gameId, action);

			// Verify action was processed
			const updatedGameState = botInterface.getGameState(gameId, playerId);
			expect(
				updatedGameState.players.find((p) => p.id === playerId)?.isFolded,
			).toBe(true);
		});

		it('should handle multiple games simultaneously', () => {
			// Create second game
			const gameConfig: GameConfig = {
				maxPlayers: 2,
				smallBlindAmount: 5,
				bigBlindAmount: 10,
				turnTimeLimit: 30,
				isTournament: false,
			};
			const gameId2 = 'game2';
			gameController.createGame(gameId2, gameConfig);

			// Join different games with different players (players can't be in multiple games)
			botInterface.joinGame(gameId, playerId, botName, chipStack);
			botInterface.joinGame(gameId2, 'player2', 'Bot2', chipStack);

			// Both games should be accessible to their respective players
			const gameState1 = botInterface.getGameState(gameId, playerId);
			const gameState2 = botInterface.getGameState(gameId2, 'player2');

			expect(gameState1.playerId).toBe(playerId);
			expect(gameState2.playerId).toBe('player2');
		});

		it('should handle event subscription across multiple games', () => {
			const callback1 = jest.fn();
			const callback2 = jest.fn();

			// Create second game
			const gameConfig: GameConfig = {
				maxPlayers: 2,
				smallBlindAmount: 5,
				bigBlindAmount: 10,
				turnTimeLimit: 30,
				isTournament: false,
			};
			const gameId2 = 'game2';
			gameController.createGame(gameId2, gameConfig);

			// Subscribe to events for both games
			botInterface.subscribeToGameEvents(gameId, callback1);
			botInterface.subscribeToGameEvents(gameId2, callback2);

			// Join and start game 1
			botInterface.joinGame(gameId, playerId, botName, chipStack);
			botInterface.joinGame(gameId, 'player2', 'Bot2', chipStack);
			gameController.startHand(gameId);

			// Only callback1 should be called
			expect(callback1).toHaveBeenCalled();
			expect(callback2).not.toHaveBeenCalled();
		});
	});

	describe('Error Handling', () => {
		it('should handle game controller errors gracefully', () => {
			// Mock game controller to throw error
			jest.spyOn(gameController, 'getBotGameState').mockImplementation(() => {
				throw new Error('Game controller error');
			});

			botInterface.joinGame(gameId, playerId, botName, chipStack);

			expect(() => {
				botInterface.getGameState(gameId, playerId);
			}).toThrow('Game controller error');
		});

		it('should handle concurrent operations', async () => {
			const gameId = 'concurrent-game';
			gameController.createGame(gameId, {
				maxPlayers: 10,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 1,
				isTournament: false,
			});

			// Prevent auto-start for this test
			const startHandSpy = jest
				.spyOn(gameController, 'startHand')
				.mockImplementation(() => {});

			const joinPromises = [];
			for (let i = 0; i < 10; i++) {
				joinPromises.push(
					botInterface.joinGame(
						gameId,
						`concurrent-player-${i}`,
						`Bot${i}`,
						1000,
					),
				);
			}

			const results = await Promise.allSettled(joinPromises);
			const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
			const rejected = results.filter((r) => r.status === 'rejected').length;

			expect(fulfilled).toBe(10);
			expect(rejected).toBe(0);

			startHandSpy.mockRestore();
		});
	});
});
