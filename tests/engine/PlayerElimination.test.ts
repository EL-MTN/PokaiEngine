import { GameController } from '@/engine/game/GameController';
import { ActionType, GameConfig } from '@/types';

describe('Player Elimination with 0 Chips', () => {
	let gameController: GameController;

	beforeEach(() => {
		gameController = new GameController();
	});

	it('should remove players with 0 chips after hand completion', () => {
		const gameId = 'test-elimination-1';
		const config: GameConfig = {
			maxPlayers: 6,
			smallBlindAmount: 10,
			bigBlindAmount: 20,
			turnTimeLimit: 30,
			isTournament: false,
			startSettings: {
				condition: 'manual', // Prevent auto-start
			},
		};
		const gameEngine = gameController.createGame(gameId, config);

		// Add more players so we have enough after elimination
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);
		gameController.addPlayerToGame(gameId, 'p3', 'Player 3', 1000);

		// Verify all players exist
		let gameState = gameEngine.getGameState();
		expect(gameState.players.length).toBe(3);

		// Start the game manually
		gameController.startGame(gameId);
		expect(gameEngine.isGameRunning()).toBe(true);

		// Get current game state and manually set a player to 0 chips to simulate elimination
		gameState = gameEngine.getGameState();
		const p2 = gameState.getPlayer('p2');
		if (p2) {
			p2.chipStack = 0; // Simulate elimination
		}

		// Test that GameController.startHand() removes players with 0 chips
		// This is the actual elimination logic that runs between hands
		gameController.startHand(gameId);

		// After startHand, p2 should be removed but p1 and p3 should remain
		const finalGameState = gameEngine.getGameState();
		expect(finalGameState.players.find((p) => p.id === 'p2')).toBeUndefined();
		expect(finalGameState.players.find((p) => p.id === 'p1')).toBeDefined();
		expect(finalGameState.players.find((p) => p.id === 'p3')).toBeDefined();
		expect(finalGameState.players.length).toBe(2);
	});

	it('should remove multiple busted players in one hand', () => {
		const gameId = 'test-elimination-2';
		const config: GameConfig = {
			maxPlayers: 6,
			smallBlindAmount: 10,
			bigBlindAmount: 20,
			turnTimeLimit: 30,
			isTournament: false,
			startSettings: {
				condition: 'manual',
			},
		};
		const gameEngine = gameController.createGame(gameId, config);

		// Add more players so we have enough after elimination
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);
		gameController.addPlayerToGame(gameId, 'p3', 'Player 3', 1000);
		gameController.addPlayerToGame(gameId, 'p4', 'Player 4', 1000);

		// Initial state
		let gameState = gameEngine.getGameState();
		expect(gameState.players.length).toBe(4);

		// Start the game
		gameController.startGame(gameId);

		// Simulate multiple players going bust
		gameState = gameEngine.getGameState();
		const p1 = gameState.getPlayer('p1');
		const p2 = gameState.getPlayer('p2');
		if (p1) p1.chipStack = 0;
		if (p2) p2.chipStack = 0;

		// Start new hand to trigger elimination
		gameController.startHand(gameId);

		// Check that both busted players were removed, but 2 players remain
		const finalGameState = gameEngine.getGameState();
		expect(finalGameState.players.find((p) => p.id === 'p1')).toBeUndefined();
		expect(finalGameState.players.find((p) => p.id === 'p2')).toBeUndefined();
		expect(finalGameState.players.find((p) => p.id === 'p3')).toBeDefined();
		expect(finalGameState.players.find((p) => p.id === 'p4')).toBeDefined();
		expect(finalGameState.players.length).toBe(2);
	});

	it('should handle player elimination in GameController startHand', () => {
		// Use manual start to control when hands begin
		const config: GameConfig = {
			maxPlayers: 6,
			smallBlindAmount: 10,
			bigBlindAmount: 20,
			turnTimeLimit: 30,
			isTournament: false,
			startSettings: {
				condition: 'manual',
			},
		};

		const manualGameId = 'manual-elimination';
		const manualGame = gameController.createGame(manualGameId, config);

		// Add players - now we can't add players with 0 chips, so test different scenario
		gameController.addPlayerToGame(manualGameId, 'p1', 'Player 1', 100);
		gameController.addPlayerToGame(manualGameId, 'p2', 'Player 2', 100);
		gameController.addPlayerToGame(manualGameId, 'p3', 'Player 3', 100);

		// Before starting, we have 3 players
		expect(manualGame.getGameState().players.length).toBe(3);

		// Manually set one player's chips to 0 after they've been added (simulate elimination)
		const gameState = manualGame.getGameState();
		const p1 = gameState.getPlayer('p1');
		if (p1) {
			p1.chipStack = 0;
		}

		// Start the game - GameController.startHand should remove p1
		gameController.startGame(manualGameId);

		// p1 should have been removed before hand started
		const finalGameState = manualGame.getGameState();
		expect(finalGameState.players.length).toBe(2);
		expect(finalGameState.players.find((p) => p.id === 'p1')).toBeUndefined();
		expect(finalGameState.players.find((p) => p.id === 'p2')).toBeDefined();
		expect(finalGameState.players.find((p) => p.id === 'p3')).toBeDefined();
	});

	it('should not start a new hand if all remaining players bust', () => {
		jest.useFakeTimers();

		const gameId = 'test-elimination-3';
		const config: GameConfig = {
			maxPlayers: 6,
			smallBlindAmount: 10,
			bigBlindAmount: 20,
			turnTimeLimit: 30,
			isTournament: false,
			startSettings: {
				condition: 'manual', // Prevent auto-start to control the scenario
			},
		};
		const gameEngine = gameController.createGame(gameId, config);

		// Add 2 players
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 100);
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 100);

		// Start the game manually
		gameController.startGame(gameId);

		// Complete a hand first
		let gameState = gameEngine.getGameState();
		while (gameEngine.isGameRunning()) {
			const actor = gameState.currentPlayerToAct;
			if (actor) {
				gameEngine.processAction({
					type: ActionType.Fold,
					playerId: actor,
					timestamp: Date.now(),
				});
			}
			gameState = gameEngine.getGameState();
		}

		// Manually set all players to 0 chips to simulate all players busting
		gameState = gameEngine.getGameState();
		gameState.players.forEach((player) => {
			player.chipStack = 0;
		});

		// Try to start a new hand - this should fail due to no players with chips
		expect(() => {
			gameController.startHand(gameId);
		}).toThrow();

		// Game should not be running when no players have chips
		expect(gameEngine.isGameRunning()).toBe(false);

		jest.useRealTimers();
	});

	it('should maintain game integrity when winner has all chips', () => {
		const gameId = 'test-elimination-4';
		const config: GameConfig = {
			maxPlayers: 6,
			smallBlindAmount: 10,
			bigBlindAmount: 20,
			turnTimeLimit: 30,
			isTournament: false,
			startSettings: {
				condition: 'manual', // Prevent auto-start
			},
		};
		const gameEngine = gameController.createGame(gameId, config);

		// Add more players so we have enough after elimination
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 100);
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 100);
		gameController.addPlayerToGame(gameId, 'p3', 'Player 3', 100);
		gameController.addPlayerToGame(gameId, 'p4', 'Player 4', 100);

		// Verify all players exist before starting
		let gameState = gameEngine.getGameState();
		expect(gameState.players.length).toBe(4);

		// Manually start the game
		gameController.startGame(gameId);

		// Check that blinds were posted and game started
		gameState = gameEngine.getGameState();
		const totalChipsAfterBlinds = gameState.players.reduce(
			(sum, p) => sum + p.chipStack,
			0,
		);

		// Simulate two players going bust (leaving 2 players with chips)
		const p1 = gameState.getPlayer('p1');
		const p2 = gameState.getPlayer('p2');
		const p3 = gameState.getPlayer('p3');
		const p4 = gameState.getPlayer('p4');

		if (p1 && p2 && p3 && p4) {
			// Set two players to 0 chips
			p1.chipStack = 0;
			p2.chipStack = 0;
			// Redistribute their chips to remaining players
			const redistributedChips =
				(totalChipsAfterBlinds - p3.chipStack - p4.chipStack) / 2;
			p3.chipStack += redistributedChips;
			p4.chipStack += redistributedChips;
		}

		// Start new hand to trigger elimination
		gameController.startHand(gameId);

		// After elimination, verify the busted players were removed
		const finalGameState = gameEngine.getGameState();

		// Losers with 0 chips should have been removed, winners remain
		const playersWithChips = finalGameState.players.filter(
			(p) => p.chipStack > 0,
		);
		const playersWithNoChips = finalGameState.players.filter(
			(p) => p.chipStack === 0,
		);

		expect(playersWithNoChips.length).toBe(0); // All 0-chip players removed
		expect(playersWithChips.length).toBe(2); // Two winners remain
		expect(finalGameState.players.find((p) => p.id === 'p1')).toBeUndefined();
		expect(finalGameState.players.find((p) => p.id === 'p2')).toBeUndefined();
		expect(finalGameState.players.find((p) => p.id === 'p3')).toBeDefined();
		expect(finalGameState.players.find((p) => p.id === 'p4')).toBeDefined();
	});
});
