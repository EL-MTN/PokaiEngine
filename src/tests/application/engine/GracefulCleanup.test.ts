import { GameController } from '@/application/engine/GameController';
import { GameConfig } from '@/domain/types';

describe('Graceful Game Cleanup', () => {
	let gameController: GameController;

	beforeEach(() => {
		jest.useFakeTimers();
		gameController = new GameController();
	});

	afterEach(async () => {
		jest.runOnlyPendingTimers();
		jest.useRealTimers();
		gameController.destroy();
	});

	const createTestConfig = (): GameConfig => ({
		maxPlayers: 6,
		smallBlindAmount: 10,
		bigBlindAmount: 20,
		turnTimeLimit: 30,
		isTournament: false,
	});

	it('should delete empty games after 5 seconds', async () => {
		const gameId = 'test-game-1';
		const config = createTestConfig();
		
		// Create game and add a player
		gameController.createGame(gameId, config);
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
		
		// Verify game exists
		expect(gameController.getGame(gameId)).toBeDefined();
		
		// Remove the player
		gameController.removePlayerFromGame(gameId, 'p1');
		
		// Game should still exist immediately after
		expect(gameController.getGame(gameId)).toBeDefined();
		
		// Advance time by 4.9 seconds - game should still exist
		jest.advanceTimersByTime(4900);
		expect(gameController.getGame(gameId)).toBeDefined();
		
		// Advance time by 0.2 seconds (total 5.1 seconds) - game should be deleted
		jest.advanceTimersByTime(200);
		await jest.runAllTimersAsync();
		expect(gameController.getGame(gameId)).toBeUndefined();
	});

	it('should cancel cleanup if player joins within 5 seconds', () => {
		const gameId = 'test-game-2';
		const config = createTestConfig();
		
		// Create game and add a player
		gameController.createGame(gameId, config);
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
		
		// Remove the player
		gameController.removePlayerFromGame(gameId, 'p1');
		
		// Advance time by 3 seconds
		jest.advanceTimersByTime(3000);
		
		// Add a new player
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);
		
		// Advance time by 3 more seconds (total 6 seconds)
		jest.advanceTimersByTime(3000);
		
		// Game should still exist because cleanup was cancelled
		expect(gameController.getGame(gameId)).toBeDefined();
		expect(gameController.getGameInfo(gameId)?.playerCount).toBe(1);
	});

	it('should handle multiple players leaving at different times', async () => {
		const gameId = 'test-game-3';
		const config = createTestConfig();
		
		// Create game and add only one player (to avoid auto-start)
		gameController.createGame(gameId, config);
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
		
		// Remove the player
		gameController.removePlayerFromGame(gameId, 'p1');
		
		// Game should be scheduled for cleanup
		expect(gameController.getGame(gameId)).toBeDefined();
		
		// Add another player within cleanup window
		jest.advanceTimersByTime(2000);
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);
		
		// Game should still exist after original cleanup time
		jest.advanceTimersByTime(4000);
		expect(gameController.getGame(gameId)).toBeDefined();
		
		// Remove the player again
		gameController.removePlayerFromGame(gameId, 'p2');
		
		// Game should be scheduled for cleanup again
		expect(gameController.getGame(gameId)).toBeDefined();
		
		// After 5 seconds from last removal, game should be deleted
		jest.advanceTimersByTime(5100);
		await jest.runAllTimersAsync();
		expect(gameController.getGame(gameId)).toBeUndefined();
	});

	it('should reset cleanup timer if all players leave then rejoin', async () => {
		const gameId = 'test-game-4';
		const config = createTestConfig();
		
		// Create game and add a player
		gameController.createGame(gameId, config);
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
		
		// Remove the player
		gameController.removePlayerFromGame(gameId, 'p1');
		
		// Wait 3 seconds
		jest.advanceTimersByTime(3000);
		
		// Add player back
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
		
		// Remove player again
		gameController.removePlayerFromGame(gameId, 'p1');
		
		// Wait 4 seconds from second removal
		jest.advanceTimersByTime(4000);
		
		// Game should still exist (only 4 seconds since last removal)
		expect(gameController.getGame(gameId)).toBeDefined();
		
		// Wait 2 more seconds (total 6 seconds from second removal)
		jest.advanceTimersByTime(2000);
		await jest.runAllTimersAsync();
		
		// Game should now be deleted
		expect(gameController.getGame(gameId)).toBeUndefined();
	});

	it('should not interfere with running games', () => {
		const gameId = 'test-game-5';
		const config = createTestConfig();
		
		// Create game and add players to start a hand
		gameController.createGame(gameId, config);
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);
		
		// Game should auto-start
		const game = gameController.getGame(gameId);
		expect(game?.isGameRunning()).toBe(true);
		
		// Remove a player during the game
		gameController.removePlayerFromGame(gameId, 'p1');
		
		// Advance time
		jest.advanceTimersByTime(10000);
		
		// Game should still exist (has 1 player)
		expect(gameController.getGame(gameId)).toBeDefined();
	});

	it('should handle removeGame being called during cleanup timer', async () => {
		const gameId = 'test-game-6';
		const config = createTestConfig();
		
		// Create game and add/remove player to trigger cleanup
		gameController.createGame(gameId, config);
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
		gameController.removePlayerFromGame(gameId, 'p1');
		
		// Wait 3 seconds
		jest.advanceTimersByTime(3000);
		
		// Manually remove game
		await gameController.removeGame(gameId);
		
		// Advance time past cleanup timer
		jest.advanceTimersByTime(3000);
		
		// Should not throw any errors
		expect(gameController.getGame(gameId)).toBeUndefined();
	}, 10000); // Increase timeout to 10 seconds
});