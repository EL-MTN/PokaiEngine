import { GameState } from '../../core/game/GameState';
import { Player } from '../../core/game/Player';
import { ActionValidator } from '../../core/betting/ActionValidator';
import { ActionType, GamePhase } from '../../types';

describe('Game Flow Fixes', () => {
	let gameState: GameState;
	let player1: Player;
	let player2: Player;
	let player3: Player;

	beforeEach(() => {
		gameState = new GameState('test-game', 10, 20);
		player1 = new Player('player1', 'Player 1', 1000);
		player2 = new Player('player2', 'Player 2', 1000);
		player3 = new Player('player3', 'Player 3', 1000);

		gameState.addPlayer(player1);
		gameState.addPlayer(player2);
		gameState.addPlayer(player3);
	});

	describe('Last Aggressor Tracking', () => {
		test('should track last aggressor when player bets', () => {
			gameState.startNewHand();
			gameState.currentPhase = GamePhase.Flop;
			gameState.resetLastAggressorForNewRound();
			player1.resetForNewRound();
			player2.resetForNewRound();
			player3.resetForNewRound();
			gameState.currentPlayerToAct = 'player1';

			const betAction = {
				type: ActionType.Bet,
				amount: 50,
				playerId: 'player1',
				timestamp: Date.now(),
			};

			ActionValidator.processAction(gameState, betAction);

			expect(gameState.lastAggressor).toBe('player1');
			expect(gameState.lastAggressorPerRound.get(GamePhase.Flop)).toBe('player1');
		});

		test('should track last aggressor when player raises', () => {
			gameState.startNewHand();
			gameState.currentPhase = GamePhase.Flop;
			player1.resetForNewRound();
			player2.resetForNewRound();
			player3.resetForNewRound();
			
			// Player 1 bets
			player1.bet(50);
			gameState.currentPlayerToAct = 'player2';

			const raiseAction = {
				type: ActionType.Raise,
				amount: 100,
				playerId: 'player2',
				timestamp: Date.now(),
			};

			ActionValidator.processAction(gameState, raiseAction);

			expect(gameState.lastAggressor).toBe('player2');
			expect(gameState.lastAggressorPerRound.get(GamePhase.Flop)).toBe('player2');
		});

		test('should reset last aggressor when advancing phases', () => {
			gameState.startNewHand();
			gameState.currentPhase = GamePhase.Flop;
			gameState.lastAggressor = 'player1';

			gameState.advancePhase();

			expect(gameState.lastAggressor).toBeUndefined();
		});

		test('should track last aggressor for aggressive all-in', () => {
			gameState.startNewHand();
			gameState.currentPhase = GamePhase.Turn;
			player1.resetForNewRound();
			player2.resetForNewRound();
			player3.resetForNewRound();
			
			// Set up scenario where all-in is a raise
			player1.bet(100);
			player2.chipStack = 200; // Set up for all-in that's a raise
			gameState.currentPlayerToAct = 'player2';

			const allInAction = {
				type: ActionType.AllIn,
				playerId: 'player2',
				timestamp: Date.now(),
			};

			ActionValidator.processAction(gameState, allInAction);

			expect(gameState.lastAggressor).toBe('player2');
			expect(gameState.lastAggressorPerRound.get(GamePhase.Turn)).toBe('player2');
		});
	});

	describe('Showdown Order', () => {
		test('should order showdown with last aggressor first', () => {
			gameState.startNewHand();
			gameState.currentPhase = GamePhase.River;
			
			// Set up last aggressor on river
			gameState.lastAggressorPerRound.set(GamePhase.River, 'player2');
			
			// All players are in showdown
			const showdownOrder = gameState.getShowdownOrder();

			expect(showdownOrder[0]).toBe('player2'); // Last aggressor shows first
			expect(showdownOrder).toContain('player1');
			expect(showdownOrder).toContain('player3');
			expect(showdownOrder.length).toBe(3);
		});

		test('should order showdown from left of dealer when no river aggressor', () => {
			gameState.startNewHand();
			gameState.currentPhase = GamePhase.Showdown;
			gameState.dealerPosition = 0; // Player 1 is dealer
			
			// No last aggressor on river
			const showdownOrder = gameState.getShowdownOrder();

			// Should start from left of dealer (player2, then player3, then player1)
			expect(showdownOrder[0]).toBe('player2'); // Left of dealer
			expect(showdownOrder[1]).toBe('player3');
			expect(showdownOrder[2]).toBe('player1');
		});

		test('should handle showdown order with folded players', () => {
			gameState.startNewHand();
			gameState.currentPhase = GamePhase.River;
			
			// Player 1 folds
			player1.fold();
			
			// Player 3 is last aggressor
			gameState.lastAggressorPerRound.set(GamePhase.River, 'player3');
			
			const showdownOrder = gameState.getShowdownOrder();

			expect(showdownOrder).toEqual(['player3', 'player2']); // Only non-folded players
			expect(showdownOrder).not.toContain('player1');
		});

		test('should handle single player showdown', () => {
			gameState.startNewHand();
			gameState.currentPhase = GamePhase.Showdown;
			
			// Players 2 and 3 fold
			player2.fold();
			player3.fold();
			
			const showdownOrder = gameState.getShowdownOrder();

			expect(showdownOrder).toEqual(['player1']);
		});
	});

	describe('Dealer Button Movement', () => {
		test('should move dealer button to next position', () => {
			gameState.dealerPosition = 0;
			gameState.moveDealer();

			expect(gameState.dealerPosition).toBe(1);
		});

		test('should wrap dealer button around', () => {
			gameState.dealerPosition = 2; // Last position
			gameState.moveDealer();

			expect(gameState.dealerPosition).toBe(0); // Wraps to first position
		});

		test('should move dealer button based on total players not active players', () => {
			// Start with all players active
			gameState.dealerPosition = 0;
			
			// Deactivate player 2 (simulate sitting out)
			player2.isActive = false;
			
			// Move dealer button
			gameState.moveDealer();

			// Should move to position 1 (player2's seat) even though player2 is inactive
			expect(gameState.dealerPosition).toBe(1);
		});

		test('should handle dealer movement across multiple hands', () => {
			const initialDealer = gameState.dealerPosition;
			
			// Simulate multiple hands
			for (let hand = 0; hand < 5; hand++) {
				gameState.startNewHand();
			}
			
			// After 5 hands with 3 players, button should have moved 5 positions
			const expectedPosition = (initialDealer + 5) % 3;
			expect(gameState.dealerPosition).toBe(expectedPosition);
		});

		test('should not skip positions when players become inactive', () => {
			// Record initial positions
			const positions: number[] = [];
			
			for (let i = 0; i < 6; i++) {
				positions.push(gameState.dealerPosition);
				
				// Make player 2 inactive on hand 3
				if (i === 2) {
					player2.isActive = false;
				}
				
				gameState.moveDealer();
			}
			
			// Verify button moved through all positions sequentially
			// Should be [0, 1, 2, 0, 1, 2] (no skipping position 1 even when player2 is inactive)
			expect(positions).toEqual([0, 1, 2, 0, 1, 2]);
		});
	});

	describe('Integration Tests', () => {
		test('should correctly track aggressor and determine showdown order in complete scenario', () => {
			gameState.startNewHand();
			
			// Simulate preflop action
			gameState.currentPhase = GamePhase.PreFlop;
			// Skip to river for this test
			gameState.currentPhase = GamePhase.River;
			player1.resetForNewRound();
			player2.resetForNewRound();
			player3.resetForNewRound();
			gameState.resetLastAggressorForNewRound();
			gameState.currentPlayerToAct = 'player1';

			// Player 1 bets on river
			const betAction = {
				type: ActionType.Bet,
				amount: 100,
				playerId: 'player1',
				timestamp: Date.now(),
			};
			ActionValidator.processAction(gameState, betAction);

			// Player 2 raises on river
			gameState.currentPlayerToAct = 'player2';
			const raiseAction = {
				type: ActionType.Raise,
				amount: 200,
				playerId: 'player2',
				timestamp: Date.now(),
			};
			ActionValidator.processAction(gameState, raiseAction);

			// Move to showdown
			gameState.currentPhase = GamePhase.Showdown;
			
			const showdownOrder = gameState.getShowdownOrder();
			
			// Player 2 was last aggressor, should show first
			expect(showdownOrder[0]).toBe('player2');
			expect(gameState.lastAggressorPerRound.get(GamePhase.River)).toBe('player2');
		});
	});
});