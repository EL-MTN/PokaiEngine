import { GameController } from '@/application/engine/GameController';
import { GameEngine } from '@/application/engine/GameEngine';
import { GameConfig, ActionType } from '@/domain/types';

// Mock the GameEngine class
jest.mock('@/application/engine/GameEngine');

const createConfig = (overrides: Partial<GameConfig> = {}): GameConfig => ({
	maxPlayers: 9,
	smallBlindAmount: 5,
	bigBlindAmount: 10,
	turnTimeLimit: 30000,
	isTournament: false,
	...overrides,
});

describe('GameController', () => {
	let gameController: GameController;
	let MockedGameEngine: jest.Mocked<typeof GameEngine>;

	beforeEach(() => {
		// Clear all instances and calls to constructor and all methods:
		(GameEngine as jest.Mock).mockClear();
		MockedGameEngine = GameEngine as jest.Mocked<typeof GameEngine>;
		gameController = new GameController();
	});

	afterEach(() => {
		// Clean up the controller to prevent timer leaks
		gameController.destroy();
	});

	// Helper to create a mocked game and add it to the controller
	const setupMockGame = (gameId: string, config: GameConfig) => {
		const game = new MockedGameEngine(gameId, config);
		(game.getGameState as jest.Mock).mockReturnValue({
			players: [],
			getActivePlayers: () => [],
			handNumber: 0,
			smallBlindAmount: config.smallBlindAmount,
			bigBlindAmount: config.bigBlindAmount,
		} as any);
		(game.getConfig as jest.Mock).mockReturnValue(config);
		(gameController['games'] as Map<string, GameEngine>).set(gameId, game);
		(gameController['eventCallbacks'] as Map<string, any[]>).set(gameId, []);
		return game;
	};

	describe('Game Management', () => {
		it('should create a new game', () => {
			const config = createConfig();
			const game = gameController.createGame('game1', config);
			expect(game).toBeInstanceOf(GameEngine);
			expect(gameController.getGame('game1')).toBe(game);
		});

		it('should throw an error if creating a game with an existing ID', () => {
			const config = createConfig();
			gameController.createGame('game1', config);
			expect(() => gameController.createGame('game1', config)).toThrow(
				'Game with ID game1 already exists',
			);
		});

		it('should remove a game', async () => {
			const config = createConfig();
			gameController.createGame('game1', config);
			await gameController.removeGame('game1');
			expect(gameController.getGame('game1')).toBeUndefined();
		});

		it('should throw an error if removing a non-existent game', async () => {
			await expect(
				gameController.removeGame('non-existent-game'),
			).rejects.toThrow('Game with ID non-existent-game not found');
		});

		it('should get all games', () => {
			const config = createConfig();
			gameController.createGame('game1', config);
			gameController.createGame('game2', config);
			const games = gameController.getAllGames();
			expect(games).toHaveLength(2);
		});

		it('should handle removing a game with players', async () => {
			const config = createConfig();
			const game = setupMockGame('game1', config);
			(game.getGameState as jest.Mock).mockReturnValue({
				players: [{ id: 'p1' }, { id: 'p2' }],
				getActivePlayers: () => [{ id: 'p1' }, { id: 'p2' }],
			} as any);

			gameController.addPlayerToGame('game1', 'p1', 'Alice', 1000);
			gameController.addPlayerToGame('game1', 'p2', 'Bob', 1000);

			expect(gameController.getPlayerGameId('p1')).toBe('game1');
			expect(gameController.getPlayerGameId('p2')).toBe('game1');

			await gameController.removeGame('game1');

			expect(gameController.getGame('game1')).toBeUndefined();
			expect(gameController.getPlayerGameId('p1')).toBeUndefined();
			expect(gameController.getPlayerGameId('p2')).toBeUndefined();
		});

		it('should return undefined for non-existent game info', () => {
			expect(gameController.getGameInfo('non-existent-game')).toBeUndefined();
		});

		it('should list all games with their info', () => {
			const config = createConfig();
			const game = setupMockGame('game1', config);

			// Mock the return value of getGameState
			const mockGameState = {
				getActivePlayers: () => [{ id: 'p1' }, { id: 'p2' }],
				players: [{ id: 'p1' }, { id: 'p2' }],
				handNumber: 1,
				smallBlindAmount: 5,
				bigBlindAmount: 10,
			};

			(game.getGameState as jest.Mock).mockReturnValue(mockGameState as any);
			(game.getConfig as jest.Mock).mockReturnValue(config);
			(game.isGameRunning as jest.Mock).mockReturnValue(true);

			const gameInfos = gameController.listGames();
			expect(gameInfos).toHaveLength(1);
			expect(gameInfos[0]).toEqual({
				id: 'game1',
				playerCount: 2,
				maxPlayers: 9,
				isRunning: true,
				currentHand: 1,
				smallBlind: 5,
				bigBlind: 10,
				isTournament: false,
				turnTimeLimit: 30000,
			});
		});

		it('should return false if game is full', () => {
			const config = createConfig({ maxPlayers: 1 });
			const game = setupMockGame('game1', config);
			(game.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => [{ id: 'p1' }],
				players: [{ id: 'p1' }],
			} as any);
			const canJoin = gameController.canPlayerJoinGame('game1', 'p2');
			expect(canJoin).toBe(false);
		});
	});

	describe('Player Management', () => {
		it('should add a player to a game', () => {
			const game = setupMockGame('game1', createConfig());
			gameController.addPlayerToGame('game1', 'p1', 'Alice', 1000);
			expect(game.addPlayer).toHaveBeenCalledWith('p1', 'Alice', 1000);
			expect(gameController.getPlayerGameId('p1')).toBe('game1');
		});

		it('should throw an error if adding a player to a non-existent game', () => {
			expect(() =>
				gameController.addPlayerToGame(
					'non-existent-game',
					'p1',
					'Alice',
					1000,
				),
			).toThrow('Game with ID non-existent-game not found');
		});

		it('should throw an error if adding a player who is already in a game', () => {
			setupMockGame('game1', createConfig());
			gameController.addPlayerToGame('game1', 'p1', 'Alice', 1000);
			setupMockGame('game2', createConfig());
			expect(() =>
				gameController.addPlayerToGame('game2', 'p1', 'Bob', 1000),
			).toThrow('Player p1 is already in a game');
		});

		it('should remove a player from a game', () => {
			const game = setupMockGame('game1', createConfig());
			gameController.addPlayerToGame('game1', 'p1', 'Alice', 1000);
			gameController.removePlayerFromGame('game1', 'p1');
			expect(game.removePlayer).toHaveBeenCalledWith('p1');
			expect(gameController.getPlayerGameId('p1')).toBeUndefined();
		});

		it('should throw an error if removing a player from a non-existent game', () => {
			expect(() =>
				gameController.removePlayerFromGame('non-existent-game', 'p1'),
			).toThrow('Game with ID non-existent-game not found');
		});

		it('should not throw an error when removing a non-existent player from a game', () => {
			setupMockGame('game1', createConfig());
			expect(() => {
				gameController.removePlayerFromGame('game1', 'non-existent-player');
			}).not.toThrow();
		});
	});

	describe('Game Actions', () => {
		it('should start a hand', () => {
			const game = setupMockGame('game1', createConfig());
			(game.getGameState as jest.Mock).mockReturnValue({
				players: [{ id: 'p1' }, { id: 'p2' }],
				getActivePlayers: () => [{ id: 'p1' }, { id: 'p2' }],
			} as any);
			gameController.startHand('game1');
			expect(game.startHand).toHaveBeenCalled();
		});

		it('should process a player action', () => {
			const game = setupMockGame('game1', createConfig());
			const action = {
				type: ActionType.Bet,
				playerId: 'p1',
				amount: 100,
				timestamp: Date.now(),
			};
			gameController.processAction('game1', action);
			expect(game.processAction).toHaveBeenCalledWith(action);
		});

		it('should force a player action', () => {
			const game = setupMockGame('game1', createConfig());
			gameController.forcePlayerAction('game1', 'p1');
			expect(game.forcePlayerAction).toHaveBeenCalledWith('p1');
		});

		it('should get possible actions for a player', () => {
			const game = setupMockGame('game1', createConfig());
			gameController.getPossibleActions('game1', 'p1');
			expect(game.getPossibleActions).toHaveBeenCalledWith('p1');
		});

		it('should get bot game state for a player', () => {
			const game = setupMockGame('game1', createConfig());
			gameController.getBotGameState('game1', 'p1');
			expect(game.getBotGameState).toHaveBeenCalledWith('p1');
		});
	});

	describe('Event Handling', () => {
		it('should subscribe to and receive game events', () => {
			const game = gameController.createGame('game1', createConfig());
			const callback = jest.fn();
			gameController.subscribeToGame('game1', callback);

			const event = {
				type: 'hand_started',
				handNumber: 1,
				timestamp: Date.now(),
			};
			const gameOnEventCallback = (game.onEvent as jest.Mock).mock.calls[0][0];
			expect(gameOnEventCallback).toBeDefined();
			gameOnEventCallback(event);
			expect(callback).toHaveBeenCalledWith(event);
		});

		it('should unsubscribe from game events', () => {
			const game = gameController.createGame('game1', createConfig());
			const callback = jest.fn();
			gameController.subscribeToGame('game1', callback);
			gameController.unsubscribeFromGame('game1', callback);

			const event = {
				type: 'hand_started',
				handNumber: 1,
				timestamp: Date.now(),
			};
			const gameOnEventCallback = (game.onEvent as jest.Mock).mock.calls[0][0];
			gameOnEventCallback(event);
			expect(callback).not.toHaveBeenCalled();
		});

		it('should handle errors in callbacks gracefully', () => {
			const game = gameController.createGame('game1', createConfig());
			const errorCallback = jest.fn().mockImplementation(() => {
				throw new Error('Callback error');
			});
			const consoleErrorSpy = jest
				.spyOn(console, 'error')
				.mockImplementation(() => {});
			gameController.subscribeToGame('game1', errorCallback);

			const event = {
				type: 'hand_started',
				handNumber: 1,
				timestamp: Date.now(),
			};
			const gameOnEventCallback = (game.onEvent as jest.Mock).mock.calls[0][0];
			gameOnEventCallback(event);
			expect(errorCallback).toHaveBeenCalledWith(event);
			consoleErrorSpy.mockRestore();
		});

		it('should not affect other subscribers if one fails', () => {
			const game = gameController.createGame('game1', createConfig());
			const errorCallback = jest.fn().mockImplementation(() => {
				throw new Error('Test error');
			});
			const goodCallback = jest.fn();
			const consoleErrorSpy = jest
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			gameController.subscribeToGame('game1', errorCallback);
			gameController.subscribeToGame('game1', goodCallback);

			const event = {
				type: 'hand_started',
				handNumber: 1,
				timestamp: Date.now(),
			};
			const gameOnEventCallback = (game.onEvent as jest.Mock).mock.calls[0][0];
			gameOnEventCallback(event);
			expect(errorCallback).toHaveBeenCalledWith(event);
			expect(goodCallback).toHaveBeenCalledWith(event);
			consoleErrorSpy.mockRestore();
		});

		it('should not throw when unsubscribing a non-existent callback', () => {
			gameController.createGame('game1', createConfig());
			const callback = jest.fn();
			expect(() =>
				gameController.unsubscribeFromGame('game1', callback),
			).not.toThrow();
		});
	});

	describe('Complex Scenarios', () => {
		it('should find available games correctly', () => {
			const fullConfig = createConfig({ maxPlayers: 2 });
			const availableConfig = createConfig({ maxPlayers: 3 });

			const game1 = setupMockGame('game1', fullConfig);
			(game1.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => [{ id: 'p1' }, { id: 'p2' }],
				players: [{ id: 'p1' }, { id: 'p2' }],
			} as any);

			const game2 = setupMockGame('game2', availableConfig);
			(game2.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => [{ id: 'p3' }],
				players: [{ id: 'p3' }],
			} as any);

			const availableGames = gameController.findAvailableGames();
			expect(availableGames).toHaveLength(1);
			expect(availableGames[0].id).toBe('game2');
		});

		it('should handle removing a game when other games have players', async () => {
			setupMockGame('game1', createConfig());
			gameController.addPlayerToGame('game1', 'p1', 'Alice', 1000);

			setupMockGame('game2', createConfig());
			gameController.addPlayerToGame('game2', 'p2', 'Bob', 1000);

			await gameController.removeGame('game1');

			expect(gameController.getPlayerGameId('p1')).toBeUndefined();
			expect(gameController.getPlayerGameId('p2')).toBe('game2');
		});
	});

	describe('Coverage Tests - Error handling for missing games', () => {
		it('throws error when forcing action on non-existent game', () => {
			expect(() => {
				gameController.forcePlayerAction('nonexistent', 'player1');
			}).toThrow('Game with ID nonexistent not found');
		});

		it('returns undefined when handling event for non-existent game', () => {
			// Access private method through any cast
			const handleGameEvent = (gameController as any).handleGameEvent.bind(
				gameController,
			);

			// Should not throw, just return early
			expect(() => {
				handleGameEvent('nonexistent', {
					type: 'hand_started',
					timestamp: Date.now(),
					handNumber: 1,
					gameState: null,
				});
			}).not.toThrow();
		});

		it('throws error when requesting unseat for non-existent game', () => {
			expect(() => {
				gameController.requestUnseat('nonexistent', 'player1');
			}).toThrow('Game with ID nonexistent not found');
		});
	});

	describe('Coverage Tests - Tournament game creation', () => {
		it('creates tournament game with proper configuration', () => {
			const gameId = 'tournament1';
			const game = gameController.createTournamentGame(
				gameId,
				1500, // starting stack
				25, // initial small blind
				50, // initial big blind
				8, // max players
				20, // turn time limit
			);

			expect(game).toBeDefined();
			expect(gameController.getGame(gameId)).toBe(game);
		});
	});

	describe('Coverage Tests - Overall stats calculation', () => {
		it('calculates stats correctly with active players', () => {
			// Create multiple games with different player counts
			const config1 = createConfig({ maxPlayers: 3 });
			const config2 = createConfig({ maxPlayers: 3 });

			const game1 = setupMockGame('game1', config1);
			(game1.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => [{ id: 'p1' }],
				players: [{ id: 'p1' }],
			} as any);

			const game2 = setupMockGame('game2', config2);
			(game2.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => [{ id: 'p2' }],
				players: [{ id: 'p2' }],
			} as any);

			const stats = gameController.getOverallStats();

			expect(stats.totalGames).toBe(2);
			expect(stats.totalPlayers).toBe(2);
			expect(stats.averagePlayersPerGame).toBe(1);
		});
	});

	describe('Coverage Tests - Find available games with maxPlayers filter', () => {
		it('filters out games that meet maxPlayers threshold', () => {
			// Create games with different player counts to test filtering
			const config1 = createConfig({ maxPlayers: 3 });
			const config2 = createConfig({ maxPlayers: 2 });

			const game1 = setupMockGame('game1', config1);
			(game1.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => [{ id: 'p1' }],
				players: [{ id: 'p1' }],
			} as any);

			const game2 = setupMockGame('game2', config2);
			(game2.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => [{ id: 'p2' }, { id: 'p3' }],
				players: [{ id: 'p2' }, { id: 'p3' }],
			} as any);

			const availableGames = gameController.findAvailableGames(2);

			// Should only return game1 since game2 is full (2 >= 2)
			expect(availableGames).toHaveLength(1);
			expect(availableGames[0].id).toBe('game1');
		});
	});

	describe('Coverage Tests - Cleanup inactive games', () => {
		it('removes games with no active players', async () => {
			const config = createConfig();

			// Create games
			const game1 = setupMockGame('game1', config);
			const game2 = setupMockGame('game2', config);
			const game3 = setupMockGame('game3', config);

			// Mock game states
			(game1.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => [],
				players: [{ id: 'p1', isActive: false }],
			} as any);

			(game2.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => [{ id: 'p2' }],
				players: [{ id: 'p2', isActive: true }],
			} as any);

			(game3.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => [],
				players: [],
			} as any);

			// Run cleanup
			await gameController.cleanupInactiveGames();

			// game1 and game3 should be removed, game2 should remain
			expect(gameController.getGame('game1')).toBeUndefined();
			expect(gameController.getGame('game2')).toBeDefined();
			expect(gameController.getGame('game3')).toBeUndefined();
		});
	});

	describe('Coverage Tests - Remove game cleanup', () => {
		it('properly cleans up when removing a game', async () => {
			const gameId = 'game1';
			const config = createConfig();

			const game = setupMockGame(gameId, config);
			(game.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => [{ id: 'player1' }],
				players: [{ id: 'player1' }],
			} as any);

			// Subscribe to game events
			const callback = jest.fn();
			gameController.subscribeToGame(gameId, callback);

			// Remove the game (this tests the cleanup path)
			await gameController.removeGame(gameId);

			// Verify cleanup
			expect(gameController.getGame(gameId)).toBeUndefined();
			expect((gameController as any).eventCallbacks.has(gameId)).toBe(false);
			expect((gameController as any).pendingUnseats.has(gameId)).toBe(false);
		});
	});
});
