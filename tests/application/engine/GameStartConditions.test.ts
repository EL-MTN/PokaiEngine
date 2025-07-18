import { GameController } from '@/engine/game/GameController';
import { GameConfig, StartSettings } from '@/types';

describe('Game Start Conditions', () => {
	let gameController: GameController;

	beforeEach(() => {
		gameController = new GameController();
	});

	describe('Backward Compatibility (no startSettings)', () => {
		it('should auto-start with 2 players when no startSettings provided', () => {
			const config: GameConfig = {
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				isTournament: false,
			};

			const gameId = 'legacy-game';
			const game = gameController.createGame(gameId, config);

			// Add first player - game should not start
			gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
			expect(game.isGameRunning()).toBe(false);

			// Add second player - game should auto-start
			gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);
			expect(game.isGameRunning()).toBe(true);
		});
	});

	describe('Manual Start Condition', () => {
		it('should not auto-start with manual condition', () => {
			const startSettings: StartSettings = {
				condition: 'manual',
			};

			const config: GameConfig = {
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				isTournament: false,
				startSettings,
			};

			const gameId = 'manual-game';
			const game = gameController.createGame(gameId, config);

			// Add multiple players
			gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
			gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);
			gameController.addPlayerToGame(gameId, 'p3', 'Player 3', 1000);

			// Game should not start
			expect(game.isGameRunning()).toBe(false);
		});

		it('should start when manually triggered', () => {
			const startSettings: StartSettings = {
				condition: 'manual',
			};

			const config: GameConfig = {
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				isTournament: false,
				startSettings,
			};

			const gameId = 'manual-game-2';
			const game = gameController.createGame(gameId, config);

			// Add players
			gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
			gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);

			// Manually start the game
			gameController.startGame(gameId);
			expect(game.isGameRunning()).toBe(true);
		});

		it('should enforce creator permissions when creatorId is set', () => {
			const startSettings: StartSettings = {
				condition: 'manual',
				creatorId: 'creator-123',
			};

			const config: GameConfig = {
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				isTournament: false,
				startSettings,
			};

			const gameId = 'manual-game-3';
			const game = gameController.createGame(gameId, config);

			// Add players
			gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
			gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);

			// Non-creator should not be able to start
			expect(() => {
				gameController.startGame(gameId, 'someone-else');
			}).toThrow('Only the game creator can start game manual-game-3');

			// Creator should be able to start
			gameController.startGame(gameId, 'creator-123');
			expect(game.isGameRunning()).toBe(true);
		});

		it('should require at least 2 players for manual start', () => {
			const startSettings: StartSettings = {
				condition: 'manual',
			};

			const config: GameConfig = {
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				isTournament: false,
				startSettings,
			};

			const gameId = 'manual-game-4';
			gameController.createGame(gameId, config);

			// Add only one player
			gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);

			// Should not be able to start with only 1 player
			expect(() => {
				gameController.startGame(gameId);
			}).toThrow('Need at least 2 players to start game manual-game-4');
		});
	});

	describe('Min Players Start Condition', () => {
		it('should auto-start when minimum players reached', () => {
			const startSettings: StartSettings = {
				condition: 'minPlayers',
				minPlayers: 4,
			};

			const config: GameConfig = {
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				isTournament: false,
				startSettings,
			};

			const gameId = 'min-players-game';
			const game = gameController.createGame(gameId, config);

			// Add 3 players - should not start
			gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
			gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);
			gameController.addPlayerToGame(gameId, 'p3', 'Player 3', 1000);
			expect(game.isGameRunning()).toBe(false);

			// Add 4th player - should auto-start
			gameController.addPlayerToGame(gameId, 'p4', 'Player 4', 1000);
			expect(game.isGameRunning()).toBe(true);
		});

		it('should default to 2 players if minPlayers not specified', () => {
			const startSettings: StartSettings = {
				condition: 'minPlayers',
				// minPlayers not specified
			};

			const config: GameConfig = {
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				isTournament: false,
				startSettings,
			};

			const gameId = 'min-players-default';
			const game = gameController.createGame(gameId, config);

			// Add first player - should not start
			gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
			expect(game.isGameRunning()).toBe(false);

			// Add second player - should auto-start (default minPlayers = 2)
			gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);
			expect(game.isGameRunning()).toBe(true);
		});
	});

	describe('Scheduled Start Condition', () => {
		it('should not auto-start with scheduled condition', () => {
			const futureTime = new Date();
			futureTime.setHours(futureTime.getHours() + 1);

			const startSettings: StartSettings = {
				condition: 'scheduled',
				scheduledStartTime: futureTime,
			};

			const config: GameConfig = {
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				isTournament: false,
				startSettings,
			};

			const gameId = 'scheduled-game';
			const game = gameController.createGame(gameId, config);

			// Add multiple players
			gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
			gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);
			gameController.addPlayerToGame(gameId, 'p3', 'Player 3', 1000);

			// Game should not auto-start
			expect(game.isGameRunning()).toBe(false);
		});
	});

	describe('Edge Cases', () => {
		it('should not allow starting an already running game', () => {
			const config: GameConfig = {
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				isTournament: false,
				// No startSettings - will auto-start
			};

			const gameId = 'edge-case-1';
			const game = gameController.createGame(gameId, config);

			// Add players to trigger auto-start
			gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
			gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);

			// Game should be running
			expect(game.isGameRunning()).toBe(true);

			// Try to manually start again
			expect(() => {
				gameController.startGame(gameId);
			}).toThrow('Game edge-case-1 is already running');
		});

		it('should handle startGame on non-existent game', () => {
			expect(() => {
				gameController.startGame('non-existent-game');
			}).toThrow('Game with ID non-existent-game not found');
		});
	});

	describe('Tournament Games', () => {
		it('should work with tournament games and manual start', () => {
			const startSettings: StartSettings = {
				condition: 'manual',
			};

			const config: GameConfig = {
				maxPlayers: 9,
				smallBlindAmount: 25,
				bigBlindAmount: 50,
				turnTimeLimit: 30,
				isTournament: true,
				startSettings,
				tournamentSettings: {
					blindLevels: [
						{ level: 1, smallBlind: 25, bigBlind: 50, duration: 10 },
						{ level: 2, smallBlind: 50, bigBlind: 100, duration: 10 },
					],
					startingStack: 10000,
					maxPlayers: 9,
					currentBlindLevel: 0,
				},
			};

			const gameId = 'tournament-game';
			const game = gameController.createGame(gameId, config);

			// Add players
			for (let i = 1; i <= 6; i++) {
				gameController.addPlayerToGame(gameId, `p${i}`, `Player ${i}`, 10000);
			}

			// Should not auto-start
			expect(game.isGameRunning()).toBe(false);

			// Manual start
			gameController.startGame(gameId);
			expect(game.isGameRunning()).toBe(true);
		});
	});
});
