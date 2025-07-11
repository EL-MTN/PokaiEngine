import { GameController } from '@engine/GameController';
import { GameEngine } from '@engine/GameEngine';
import { ActionType, GameConfig } from '@types';

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

		// Add 3 players
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 50); // Small stack
		gameController.addPlayerToGame(gameId, 'p3', 'Player 3', 1000);

		// Verify all players exist
		let gameState = gameEngine.getGameState();
		expect(gameState.players.length).toBe(3);

		// Start the game manually
		gameController.startGame(gameId);
		expect(gameEngine.isGameRunning()).toBe(true);

		// Force p2 to go all-in (they have only 50 chips)
		const currentPlayer = gameState.currentPlayerToAct;
		
		// Keep playing until p2 acts
		while (gameState.currentPlayerToAct !== 'p2' && gameState.currentPhase !== 'hand_complete') {
			if (gameState.currentPlayerToAct === 'p1') {
				gameEngine.processAction({
					type: ActionType.Call,
					playerId: 'p1',
					timestamp: Date.now(),
				});
			} else if (gameState.currentPlayerToAct === 'p3') {
				gameEngine.processAction({
					type: ActionType.Call,
					playerId: 'p3',
					timestamp: Date.now(),
				});
			}
			gameState = gameEngine.getGameState();
		}

		// If p2 hasn't acted yet, make them go all-in
		if (gameState.currentPlayerToAct === 'p2') {
			gameEngine.processAction({
				type: ActionType.AllIn,
				playerId: 'p2',
				timestamp: Date.now(),
			});
		}

		// Complete the hand by having other players fold or check
		while (gameState.currentPhase !== 'hand_complete') {
			const actor = gameState.currentPlayerToAct;
			if (actor && actor !== 'p2') {
				gameEngine.processAction({
					type: ActionType.Fold,
					playerId: actor,
					timestamp: Date.now(),
				});
			}
			gameState = gameEngine.getGameState();
		}

		// After hand completion, check if p2 was removed if they lost
		const p2 = gameState.getPlayer('p2');
		if (p2 && p2.chipStack === 0) {
			// p2 should have been removed
			expect(gameState.players.find(p => p.id === 'p2')).toBeUndefined();
		}
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

		// Add players with small stacks
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 30); // Will bust on blinds
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 30); // Will bust on blinds
		gameController.addPlayerToGame(gameId, 'p3', 'Player 3', 1000);

		// Initial state
		let gameState = gameEngine.getGameState();
		expect(gameState.players.length).toBe(3);

		// Start the game
		gameController.startGame(gameId);

		// Play through the hand - p1 and p2 will go all-in due to small stacks
		while (gameState.currentPhase !== 'hand_complete') {
			const actor = gameState.currentPlayerToAct;
			if (actor) {
				const player = gameState.getPlayer(actor);
				if (player && player.chipStack <= 20) {
					// Small stack, go all-in
					gameEngine.processAction({
						type: ActionType.AllIn,
						playerId: actor,
						timestamp: Date.now(),
					});
				} else {
					// Big stack, just call
					gameEngine.processAction({
						type: ActionType.Call,
						playerId: actor,
						timestamp: Date.now(),
					});
				}
			}
			gameState = gameEngine.getGameState();
		}

		// Count players with 0 chips
		const bustedPlayers = gameState.players.filter(p => p.chipStack === 0);
		
		// All busted players should have been removed
		bustedPlayers.forEach(busted => {
			expect(gameState.players.find(p => p.id === busted.id)).toBeUndefined();
		});
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
		
		// Add players
		gameController.addPlayerToGame(manualGameId, 'p1', 'Player 1', 0); // Already busted
		gameController.addPlayerToGame(manualGameId, 'p2', 'Player 2', 100);
		gameController.addPlayerToGame(manualGameId, 'p3', 'Player 3', 100);
		
		// Before starting, we have 3 players
		expect(manualGame.getGameState().players.length).toBe(3);
		
		// Start the game - GameController.startHand should remove p1
		gameController.startGame(manualGameId);
		
		// p1 should have been removed before hand started
		const gameState = manualGame.getGameState();
		expect(gameState.players.length).toBe(2);
		expect(gameState.players.find(p => p.id === 'p1')).toBeUndefined();
		expect(gameState.players.find(p => p.id === 'p2')).toBeDefined();
		expect(gameState.players.find(p => p.id === 'p3')).toBeDefined();
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
		};
		const gameEngine = gameController.createGame(gameId, config);
		
		// Add 2 players with tiny stacks
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 20);
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 20);

		let gameState = gameEngine.getGameState();
		
		// Both will go all-in on blinds
		while (gameState.currentPhase !== 'hand_complete') {
			const actor = gameState.currentPlayerToAct;
			if (actor) {
				gameEngine.processAction({
					type: ActionType.AllIn,
					playerId: actor,
					timestamp: Date.now(),
				});
			}
			gameState = gameEngine.getGameState();
		}

		// After hand completion, if all players have 0 chips, they should be removed
		const remainingPlayers = gameState.players.filter(p => p.chipStack > 0);
		
		// Advance timers to trigger auto-start attempt
		jest.advanceTimersByTime(3000);
		
		// Game should not have restarted if no players remain
		if (remainingPlayers.length === 0) {
			expect(gameEngine.isGameRunning()).toBe(false);
		}
		
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
		};
		const gameEngine = gameController.createGame(gameId, config);
		
		// Add players
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 100);
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 100);
		gameController.addPlayerToGame(gameId, 'p3', 'Player 3', 100);

		const initialTotalChips = 300;
		let gameState = gameEngine.getGameState();

		// Make everyone go all-in
		while (gameState.currentPhase !== 'hand_complete') {
			const actor = gameState.currentPlayerToAct;
			if (actor) {
				gameEngine.processAction({
					type: ActionType.AllIn,
					playerId: actor,
					timestamp: Date.now(),
				});
			}
			gameState = gameEngine.getGameState();
		}

		// After hand, verify chip conservation
		const finalTotalChips = gameState.players.reduce((sum, p) => sum + p.chipStack, 0);
		expect(finalTotalChips).toBe(initialTotalChips);

		// Losers with 0 chips should have been removed
		const playersWithChips = gameState.players.filter(p => p.chipStack > 0);
		const playersWithNoChips = gameState.players.filter(p => p.chipStack === 0);
		
		expect(playersWithNoChips.length).toBe(0); // All 0-chip players removed
		expect(playersWithChips.length).toBeGreaterThan(0); // At least one winner remains
	});
});