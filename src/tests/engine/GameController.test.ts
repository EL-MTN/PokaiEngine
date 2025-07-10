import { GameController } from '@engine/GameController';
import { GameEngine } from '@engine/GameEngine';
import { GameConfig, ActionType } from '@types';

// Mock the GameEngine class
jest.mock('@engine/GameEngine');

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
				'Game with ID game1 already exists'
			);
		});

		it('should remove a game', () => {
			const config = createConfig();
			gameController.createGame('game1', config);
			gameController.removeGame('game1');
			expect(gameController.getGame('game1')).toBeUndefined();
		});

		it('should throw an error if removing a non-existent game', () => {
			expect(() => gameController.removeGame('non-existent-game')).toThrow(
				'Game with ID non-existent-game not found'
			);
		});

		it('should get all games', () => {
			const config = createConfig();
			gameController.createGame('game1', config);
			gameController.createGame('game2', config);
			const games = gameController.getAllGames();
			expect(games).toHaveLength(2);
		});

		it('should handle removing a game with players', () => {
			const config = createConfig();
			const game = setupMockGame('game1', config);
			(game.getGameState as jest.Mock).mockReturnValue({
				players: [{ id: 'p1' }, { id: 'p2' }],
			} as any);

			gameController.addPlayerToGame('game1', 'p1', 'Alice', 1000);
			gameController.addPlayerToGame('game1', 'p2', 'Bob', 1000);

			expect(gameController.getPlayerGameId('p1')).toBe('game1');
			expect(gameController.getPlayerGameId('p2')).toBe('game1');

			gameController.removeGame('game1');

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
				gameController.addPlayerToGame('non-existent-game', 'p1', 'Alice', 1000)
			).toThrow('Game with ID non-existent-game not found');
		});

		it('should throw an error if adding a player who is already in a game', () => {
			setupMockGame('game1', createConfig());
			gameController.addPlayerToGame('game1', 'p1', 'Alice', 1000);
			setupMockGame('game2', createConfig());
			expect(() => gameController.addPlayerToGame('game2', 'p1', 'Bob', 1000)).toThrow(
				'Player p1 is already in a game'
			);
		});

		it('should remove a player from a game', () => {
			const game = setupMockGame('game1', createConfig());
			gameController.addPlayerToGame('game1', 'p1', 'Alice', 1000);
			gameController.removePlayerFromGame('game1', 'p1');
			expect(game.removePlayer).toHaveBeenCalledWith('p1');
			expect(gameController.getPlayerGameId('p1')).toBeUndefined();
		});

		it('should throw an error if removing a player from a non-existent game', () => {
			expect(() => gameController.removePlayerFromGame('non-existent-game', 'p1')).toThrow(
				'Game with ID non-existent-game not found'
			);
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

			const event = { type: 'hand_started', handNumber: 1, timestamp: Date.now() };
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

			const event = { type: 'hand_started', handNumber: 1, timestamp: Date.now() };
			const gameOnEventCallback = (game.onEvent as jest.Mock).mock.calls[0][0];
			gameOnEventCallback(event);
			expect(callback).not.toHaveBeenCalled();
		});

		it('should handle errors in callbacks gracefully', () => {
			const game = gameController.createGame('game1', createConfig());
			const errorCallback = jest.fn().mockImplementation(() => {
				throw new Error('Callback error');
			});
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
			gameController.subscribeToGame('game1', errorCallback);

			const event = { type: 'hand_started', handNumber: 1, timestamp: Date.now() };
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
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

			gameController.subscribeToGame('game1', errorCallback);
			gameController.subscribeToGame('game1', goodCallback);

			const event = { type: 'hand_started', handNumber: 1, timestamp: Date.now() };
			const gameOnEventCallback = (game.onEvent as jest.Mock).mock.calls[0][0];
			gameOnEventCallback(event);
			expect(errorCallback).toHaveBeenCalledWith(event);
			expect(goodCallback).toHaveBeenCalledWith(event);
			consoleErrorSpy.mockRestore();
		});

		it('should not throw when unsubscribing a non-existent callback', () => {
			gameController.createGame('game1', createConfig());
			const callback = jest.fn();
			expect(() => gameController.unsubscribeFromGame('game1', callback)).not.toThrow();
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

		it('should handle removing a game when other games have players', () => {
			const game1 = setupMockGame('game1', createConfig());
			gameController.addPlayerToGame('game1', 'p1', 'Alice', 1000);

			const game2 = setupMockGame('game2', createConfig());
			gameController.addPlayerToGame('game2', 'p2', 'Bob', 1000);

			gameController.removeGame('game1');

			expect(gameController.getPlayerGameId('p1')).toBeUndefined();
			expect(gameController.getPlayerGameId('p2')).toBe('game2');
		});
	});
});
