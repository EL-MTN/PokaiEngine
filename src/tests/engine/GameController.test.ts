import { GameController } from '@engine/GameController';
import { GameEngine } from '@engine/GameEngine';
import { GameConfig, ActionType } from '@types';

// Mock the GameEngine class
jest.mock('@engine/GameEngine');

const createConfig = (): GameConfig => ({
	maxPlayers: 9,
	smallBlindAmount: 5,
	bigBlindAmount: 10,
	turnTimeLimit: 30000,
	isTournament: false,
});

describe('GameController', () => {
	let gameController: GameController;
	let mockGameEngine: jest.Mocked<GameEngine>;

	beforeEach(() => {
		// Clear all instances and calls to constructor and all methods:
		(GameEngine as jest.Mock).mockClear();
		gameController = new GameController();
		// We can instantiate the mock and then use it
		mockGameEngine = new GameEngine('game1', createConfig()) as jest.Mocked<GameEngine>;
	});

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
			gameController.createGame('game1', config);
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
			const game = gameController.createGame('game1', config);

			// Mock the return value of getGameState
			const mockGameState = {
				getActivePlayers: () => [{ id: 'p1' }, { id: 'p2' }],
				handNumber: 1,
				smallBlindAmount: 5,
				bigBlindAmount: 10,
			};

			(game.getGameState as jest.Mock).mockReturnValue(mockGameState);
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
	});

	describe('Player Management', () => {
		beforeEach(() => {
			const config = createConfig();
			// Make sure a game exists before each player management test
			gameController.createGame('game1', config);
			// Get the mocked instance created by the controller
			mockGameEngine = gameController.getGame('game1') as jest.Mocked<GameEngine>;
		});

		it('should add a player to a game', () => {
			gameController.addPlayerToGame('game1', 'p1', 'Alice', 1000);
			expect(mockGameEngine.addPlayer).toHaveBeenCalledWith('p1', 'Alice', 1000);
			expect(gameController.getPlayerGameId('p1')).toBe('game1');
		});

		it('should throw an error if adding a player to a non-existent game', () => {
			expect(() =>
				gameController.addPlayerToGame('non-existent-game', 'p1', 'Alice', 1000)
			).toThrow('Game with ID non-existent-game not found');
		});

		it('should throw an error if adding a player who is already in a game', () => {
			gameController.addPlayerToGame('game1', 'p1', 'Alice', 1000);
			gameController.createGame('game2', createConfig());
			expect(() => gameController.addPlayerToGame('game2', 'p1', 'Bob', 1000)).toThrow(
				'Player p1 is already in a game'
			);
		});

		it('should remove a player from a game', () => {
			gameController.addPlayerToGame('game1', 'p1', 'Alice', 1000);
			gameController.removePlayerFromGame('game1', 'p1');
			expect(mockGameEngine.removePlayer).toHaveBeenCalledWith('p1');
			expect(gameController.getPlayerGameId('p1')).toBeUndefined();
		});

		it('should throw an error if removing a player from a non-existent game', () => {
			expect(() => gameController.removePlayerFromGame('non-existent-game', 'p1')).toThrow(
				'Game with ID non-existent-game not found'
			);
		});

		it('should not throw an error when removing a non-existent player from a game', () => {
			expect(() => {
				gameController.removePlayerFromGame('game1', 'non-existent-player');
			}).not.toThrow();
		});
	});

	describe('Game Actions', () => {
		beforeEach(() => {
			const config = createConfig();
			gameController.createGame('game1', config);
			mockGameEngine = gameController.getGame('game1') as jest.Mocked<GameEngine>;
		});

		it('should start a hand', () => {
			gameController.startHand('game1');
			expect(mockGameEngine.startHand).toHaveBeenCalled();
		});

		it('should process a player action', () => {
			const action = {
				type: ActionType.Bet,
				playerId: 'p1',
				amount: 100,
				timestamp: Date.now(),
			};
			gameController.processAction('game1', action);
			expect(mockGameEngine.processAction).toHaveBeenCalledWith(action);
		});

		it('should force a player action', () => {
			gameController.forcePlayerAction('game1', 'p1');
			expect(mockGameEngine.forcePlayerAction).toHaveBeenCalledWith('p1');
		});

		it('should get possible actions for a player', () => {
			gameController.getPossibleActions('game1', 'p1');
			expect(mockGameEngine.getPossibleActions).toHaveBeenCalledWith('p1');
		});

		it('should get bot game state for a player', () => {
			gameController.getBotGameState('game1', 'p1');
			expect(mockGameEngine.getBotGameState).toHaveBeenCalledWith('p1');
		});
	});

	describe('Actions on Non-existent Games', () => {
		it('should throw an error when starting a hand in a non-existent game', () => {
			expect(() => gameController.startHand('non-existent-game')).toThrow(
				'Game with ID non-existent-game not found'
			);
		});

		it('should throw an error when processing an action in a non-existent game', () => {
			const action = {
				type: ActionType.Bet,
				playerId: 'p1',
				amount: 100,
				timestamp: Date.now(),
			};
			expect(() => gameController.processAction('non-existent-game', action)).toThrow(
				'Game with ID non-existent-game not found'
			);
		});

		it('should throw an error when forcing an action in a non-existent game', () => {
			expect(() => gameController.forcePlayerAction('non-existent-game', 'p1')).toThrow(
				'Game with ID non-existent-game not found'
			);
		});

		it('should throw an error when getting possible actions from a non-existent game', () => {
			expect(() => gameController.getPossibleActions('non-existent-game', 'p1')).toThrow(
				'Game with ID non-existent-game not found'
			);
		});

		it('should throw an error when getting bot game state from a non-existent game', () => {
			expect(() => gameController.getBotGameState('non-existent-game', 'p1')).toThrow(
				'Game with ID non-existent-game not found'
			);
		});
	});

	describe('Event Handling', () => {
		it('should subscribe to and receive game events', () => {
			const config = createConfig();
			const game = gameController.createGame('game1', config);
			const callback = jest.fn();
			gameController.subscribeToGame('game1', callback);

			// Manually trigger the event handler on the game engine mock
			const event = { type: 'hand_started', handNumber: 1, timestamp: Date.now() };
			const gameOnEventCallback = (game.onEvent as jest.Mock).mock.calls[0][0];
			gameOnEventCallback(event);

			expect(callback).toHaveBeenCalledWith(event);
		});

		it('should unsubscribe from game events', () => {
			const config = createConfig();
			const game = gameController.createGame('game1', config);
			const callback = jest.fn();
			gameController.subscribeToGame('game1', callback);
			gameController.unsubscribeFromGame('game1', callback);

			const event = { type: 'hand_started', handNumber: 1, timestamp: Date.now() };
			const gameOnEventCallback = (game.onEvent as jest.Mock).mock.calls[0][0];
			gameOnEventCallback(event);

			expect(callback).not.toHaveBeenCalled();
		});

		it('should handle errors in event callbacks gracefully', () => {
			const config = createConfig();
			const game = gameController.createGame('game1', config);
			const errorCallback = jest.fn(() => {
				throw new Error('Callback error');
			});
			gameController.subscribeToGame('game1', errorCallback);

			const event = { type: 'hand_started', handNumber: 1, timestamp: Date.now() };
			const gameOnEventCallback = (game.onEvent as jest.Mock).mock.calls[0][0];

			expect(() => gameOnEventCallback(event)).not.toThrow();
			expect(errorCallback).toHaveBeenCalledWith(event);
		});

		it('should not throw if an event is fired from a removed game', () => {
			const game = gameController.createGame('game1', createConfig());
			const onEventCallback = (game.onEvent as jest.Mock).mock.calls[0][0];
			gameController.removeGame('game1');
			const event = { type: 'hand_started', handNumber: 1, timestamp: Date.now() };
			expect(() => onEventCallback(event)).not.toThrow();
		});

		it('should throw an error when subscribing to a non-existent game', () => {
			const callback = jest.fn();
			expect(() => gameController.subscribeToGame('non-existent-game', callback)).toThrow(
				'Game with ID non-existent-game not found'
			);
		});

		it('should not throw when unsubscribing from a non-existent game', () => {
			const callback = jest.fn();
			expect(() =>
				gameController.unsubscribeFromGame('non-existent-game', callback)
			).not.toThrow();
		});

		it('should not throw if an event is fired from a removed game', () => {
			const game = gameController.createGame('game1', createConfig());
			const callback = jest.fn();
			gameController.subscribeToGame('game1', callback);
			gameController.unsubscribeFromGame('game1', () => {}); // Unsubscribe a different function
			const gameOnEventCallback = (game.onEvent as jest.Mock).mock.calls[0][0];
			gameOnEventCallback({});
			expect(callback).toHaveBeenCalled();
		});
	});

	describe('Game Creation Helpers', () => {
		it('should create a cash game with specified parameters', () => {
			gameController.createCashGame('cash-game-1', 10, 20, 5, 60);
			expect(GameEngine).toHaveBeenCalledWith('cash-game-1', {
				maxPlayers: 5,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 60,
				isTournament: false,
			});
		});

		it('should create a cash game with default parameters', () => {
			gameController.createCashGame('cash-game-2', 10, 20);
			expect(GameEngine).toHaveBeenCalledWith('cash-game-2', {
				maxPlayers: 9,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				isTournament: false,
			});
		});

		it('should create a tournament game with specified parameters', () => {
			gameController.createTournamentGame('tourney-1', 1500, 25, 50, 8, 45);
			const config = (GameEngine as jest.Mock).mock.calls[1][1];
			expect(config.isTournament).toBe(true);
			expect(config.tournamentSettings?.startingStack).toBe(1500);
			expect(config.maxPlayers).toBe(8);
		});

		it('should create a tournament game with default parameters', () => {
			gameController.createTournamentGame('tourney-2', 1500, 25, 50);
			const config = (GameEngine as jest.Mock).mock.calls[1][1];
			expect(config.isTournament).toBe(true);
			expect(config.tournamentSettings?.startingStack).toBe(1500);
			expect(config.maxPlayers).toBe(9);
			expect(config.turnTimeLimit).toBe(30);
		});
	});

	describe('Game Statistics and Discovery', () => {
		it('should get overall stats', () => {
			const config = createConfig();
			const game1 = gameController.createGame('game1', config);
			const game2 = gameController.createGame('game2', config);

			(game1.isGameRunning as jest.Mock).mockReturnValue(true);
			(game2.isGameRunning as jest.Mock).mockReturnValue(false);

			(game1.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => [{}, {}, {}],
			});
			(game2.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => [{}, {}],
			});

			const stats = gameController.getOverallStats();
			expect(stats).toEqual({
				totalGames: 2,
				activeGames: 1,
				totalPlayers: 5,
				averagePlayersPerGame: 2.5,
			});
		});

		it('should return zero stats when no games are present', () => {
			const stats = gameController.getOverallStats();
			expect(stats).toEqual({
				totalGames: 0,
				activeGames: 0,
				totalPlayers: 0,
				averagePlayersPerGame: 0,
			});
		});

		it('should find available games', () => {
			const config1 = { ...createConfig(), maxPlayers: 5 };
			const config2 = { ...createConfig(), maxPlayers: 9 };
			const config3 = { ...createConfig(), maxPlayers: 2 };
			const game1 = gameController.createGame('game1', config1);
			const game2 = gameController.createGame('game2', config2);
			const game3 = gameController.createGame('game3', config3); // Full game

			const mockGameState = {
				handNumber: 1,
				smallBlindAmount: 5,
				bigBlindAmount: 10,
			};

			(game1.getGameState as jest.Mock).mockReturnValue({
				...mockGameState,
				getActivePlayers: () => new Array(3),
			});
			(game1.getConfig as jest.Mock).mockReturnValue(config1);
			(game1.isGameRunning as jest.Mock).mockReturnValue(true);

			(game2.getGameState as jest.Mock).mockReturnValue({
				...mockGameState,
				getActivePlayers: () => new Array(8),
			});
			(game2.getConfig as jest.Mock).mockReturnValue(config2);
			(game2.isGameRunning as jest.Mock).mockReturnValue(true);

			(game3.getGameState as jest.Mock).mockReturnValue({
				...mockGameState,
				getActivePlayers: () => new Array(2),
			});
			(game3.getConfig as jest.Mock).mockReturnValue(config3);
			(game3.isGameRunning as jest.Mock).mockReturnValue(true);

			const availableGames = gameController.findAvailableGames();
			expect(availableGames).toHaveLength(2);
			expect(availableGames[0].id).toBe('game2'); // Sorted by player count
			expect(availableGames[1].id).toBe('game1');
		});

		it('should find available games with maxPlayers filter', () => {
			const config1 = { ...createConfig(), maxPlayers: 5 };
			const config2 = { ...createConfig(), maxPlayers: 9 };
			const game1 = gameController.createGame('game1', config1);
			const game2 = gameController.createGame('game2', config2);

			const mockGameState = {
				handNumber: 1,
				smallBlindAmount: 5,
				bigBlindAmount: 10,
			};

			(game1.getGameState as jest.Mock).mockReturnValue({
				...mockGameState,
				getActivePlayers: () => new Array(4),
			});
			(game1.getConfig as jest.Mock).mockReturnValue(config1);
			(game1.isGameRunning as jest.Mock).mockReturnValue(true);

			(game2.getGameState as jest.Mock).mockReturnValue({
				...mockGameState,
				getActivePlayers: () => new Array(8),
			});
			(game2.getConfig as jest.Mock).mockReturnValue(config2);
			(game2.isGameRunning as jest.Mock).mockReturnValue(true);

			let availableGames = gameController.findAvailableGames(5);
			expect(availableGames).toHaveLength(1);
			expect(availableGames[0].id).toBe('game1');

			availableGames = gameController.findAvailableGames(10);
			expect(availableGames).toHaveLength(2);
		});
	});

	describe('Player Joining Logic', () => {
		beforeEach(() => {
			gameController.createGame('game1', createConfig());
		});

		it('should return false if game does not exist', () => {
			expect(gameController.canPlayerJoinGame('non-existent-game', 'p1')).toBe(false);
		});

		it('should return false if player is already in a game', () => {
			gameController.addPlayerToGame('game1', 'p1', 'Alice', 1000);
			expect(gameController.canPlayerJoinGame('game1', 'p1')).toBe(false);
		});

		it('should return false if game is full', () => {
			const config = { ...createConfig(), maxPlayers: 1 };
			const game = gameController.createGame('full-game', config);
			(game.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => new Array(1),
			});
			(game.getConfig as jest.Mock).mockReturnValue(config);

			expect(gameController.canPlayerJoinGame('full-game', 'p2')).toBe(false);
		});

		it('should return true if player can join', () => {
			const game = gameController.getGame('game1') as jest.Mocked<GameEngine>;
			(game.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => [],
			});
			(game.getConfig as jest.Mock).mockReturnValue(createConfig());
			expect(gameController.canPlayerJoinGame('game1', 'p1')).toBe(true);
		});
	});

	describe('Game Maintenance', () => {
		it('should clean up inactive games', () => {
			const game1 = gameController.createGame('game1', createConfig());
			const game2 = gameController.createGame('game2', createConfig());

			(game1.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => [], // Inactive
			});
			(game2.getGameState as jest.Mock).mockReturnValue({
				getActivePlayers: () => [{}, {}], // Active
			});

			gameController.cleanupInactiveGames();

			expect(gameController.getGame('game1')).toBeUndefined();
			expect(gameController.getGame('game2')).toBeDefined();
		});
	});

	describe('Complex Scenarios', () => {
		it('should handle removing a game when other games have players', () => {
			gameController.createGame('game1', createConfig());
			const game2 = gameController.createGame('game2', createConfig());
			(game2.addPlayer as jest.Mock).mockImplementation(() => {});
			gameController.addPlayerToGame('game2', 'p1', 'Alice', 1000);

			expect(() => gameController.removeGame('game1')).not.toThrow();
			expect(gameController.getPlayerGameId('p1')).toBe('game2');
		});
	});
});
