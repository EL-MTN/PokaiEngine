import { GameEngine } from '../../engine/GameEngine';
import { ActionType, GameConfig, GamePhase } from '../../types';

describe('Integration Tests - Real Game Scenarios', () => {
	let gameEngine: GameEngine;
	const config: GameConfig = {
		maxPlayers: 10,
		smallBlindAmount: 50,
		bigBlindAmount: 100,
		turnTimeLimit: 30,
		isTournament: false,
	};

	beforeEach(() => {
		gameEngine = new GameEngine('integration-test', config);
	});

	describe('Heads-Up Game Scenarios', () => {
		test('should handle complete heads-up hand lifecycle', () => {
			// Add two players
			gameEngine.addPlayer('alice', 'Alice', 2000);
			gameEngine.addPlayer('bob', 'Bob', 2000);

			// Start hand
			gameEngine.startHand();
			let gameState = gameEngine.getGameState();

			// Verify initial state
			expect(gameState.currentPhase).toBe(GamePhase.PreFlop);
			expect(gameState.players.length).toBe(2);
			expect(gameState.currentPlayerToAct).toBeTruthy();

			// Store initial chip counts (after blinds are posted)
			const aliceAfterBlinds = gameState.getPlayer('alice')!.chipStack;
			const bobAfterBlinds = gameState.getPlayer('bob')!.chipStack;
			const initialPot = gameState.getPotManager().getTotalPotAmount();

			// Pre-flop: Alice (SB) calls, Bob (BB) checks
			const currentPlayer = gameState.currentPlayerToAct!;
			gameEngine.processAction({
				type: ActionType.Call,
				amount: 50,
				playerId: currentPlayer,
				timestamp: Date.now(),
			});

			gameState = gameEngine.getGameState();
			const nextPlayer = gameState.currentPlayerToAct!;
			gameEngine.processAction({
				type: ActionType.Check,
				playerId: nextPlayer,
				timestamp: Date.now(),
			});

			// Should advance to flop
			gameState = gameEngine.getGameState();
			expect(gameState.currentPhase).toBe(GamePhase.Flop);
			expect(gameState.communityCards.length).toBe(3);

			// Verify chip conservation throughout the hand
			const alice = gameState.getPlayer('alice')!;
			const bob = gameState.getPlayer('bob')!;
			const potAmount = gameState.getPotManager().getTotalPotAmount();
			const totalAfter = alice.chipStack + bob.chipStack + potAmount;
			const totalBefore = aliceAfterBlinds + bobAfterBlinds + initialPot;
			expect(totalAfter).toBe(totalBefore); // Chip conservation
		});

		test('should handle pre-flop all-in scenario', () => {
			gameEngine.addPlayer('shortstack', 'Short Stack', 300);
			gameEngine.addPlayer('bigstack', 'Big Stack', 5000);

			gameEngine.startHand();
			let gameState = gameEngine.getGameState();

			// Short stack goes all-in pre-flop
			const shortStackPlayer = gameState.getPlayer('shortstack')!;
			const remainingChips = shortStackPlayer.chipStack;
			expect(remainingChips).toBeGreaterThan(0); // Should have some chips left after posting blinds

			// All-in for remaining chips
			let shortStackWentAllIn = false;
			while (
				gameState.currentPlayerToAct &&
				!shortStackWentAllIn &&
				gameEngine.isGameRunning()
			) {
				const currentPlayer = gameState.currentPlayerToAct;
				if (currentPlayer === 'shortstack') {
					const chips = gameState.getPlayer('shortstack')!.chipStack;
					gameEngine.processAction({
						type: ActionType.AllIn,
						amount: chips,
						playerId: 'shortstack',
						timestamp: Date.now(),
					});
					shortStackWentAllIn = true;
				} else {
					// Other player folds to get to shortstack
					gameEngine.processAction({
						type: ActionType.Fold,
						playerId: currentPlayer,
						timestamp: Date.now(),
					});
				}
				gameState = gameEngine.getGameState();
			}

			const shortStackAfter = gameState.getPlayer('shortstack')!;
			if (shortStackWentAllIn) {
				expect(shortStackAfter.isAllIn).toBe(true);
				expect(shortStackAfter.chipStack).toBe(0);
			}
		});
	});

	describe('Multi-Player Tournament Scenarios', () => {
		test('should handle 6-player pre-flop action', () => {
			// Add 6 players with varying stack sizes
			const players = [
				{ id: 'player1', name: 'Alice', chips: 2000 },
				{ id: 'player2', name: 'Bob', chips: 1500 },
				{ id: 'player3', name: 'Charlie', chips: 3000 },
				{ id: 'player4', name: 'Diana', chips: 800 },
				{ id: 'player5', name: 'Eve', chips: 2500 },
				{ id: 'player6', name: 'Frank', chips: 1200 },
			];

			players.forEach((p) => gameEngine.addPlayer(p.id, p.name, p.chips));
			gameEngine.startHand();

			let gameState = gameEngine.getGameState();
			expect(gameState.players.length).toBe(6);
			expect(gameState.currentPhase).toBe(GamePhase.PreFlop);

			// Simulate some pre-flop action
			const activePlayers = gameState.getActivePlayers().filter((p) => !p.isFolded);
			expect(activePlayers.length).toBe(6);

			// First player folds
			const firstToAct = gameState.currentPlayerToAct!;
			gameEngine.processAction({
				type: ActionType.Fold,
				playerId: firstToAct,
				timestamp: Date.now(),
			});

			gameState = gameEngine.getGameState();
			const foldedPlayer = gameState.getPlayer(firstToAct)!;
			expect(foldedPlayer.isFolded).toBe(true);

			// Verify game continues with next player
			expect(gameState.currentPlayerToAct).toBeTruthy();
			expect(gameState.currentPlayerToAct).not.toBe(firstToAct);
		});

		test('should handle bubble scenario with short stacks', () => {
			// 4 players, simulating tournament bubble pressure
			const players = [
				{ id: 'chipleader', name: 'Chip Leader', chips: 8000 },
				{ id: 'comfortable', name: 'Comfortable', chips: 4000 },
				{ id: 'shortstack1', name: 'Short Stack 1', chips: 500 },
				{ id: 'shortstack2', name: 'Short Stack 2', chips: 600 },
			];

			players.forEach((p) => gameEngine.addPlayer(p.id, p.name, p.chips));
			gameEngine.startHand();

			let gameState = gameEngine.getGameState();

			// Verify tournament pressure scenario is set up
			const totalPlayerChips = gameState.players.reduce((sum, p) => sum + p.chipStack, 0);
			const potChips = gameState.getPotManager().getTotalPotAmount();
			const totalChips = totalPlayerChips + potChips;
			expect(totalChips).toBe(13100); // Chip conservation including blinds in pot

			// Short stacks should be under severe pressure with blinds
			const shortStack1 = gameState.getPlayer('shortstack1')!;
			const shortStack2 = gameState.getPlayer('shortstack2')!;

			// With 50/100 blinds, short stacks only have 5-6 big blinds
			expect(shortStack1.chipStack / config.bigBlindAmount).toBeLessThan(6);
			expect(shortStack2.chipStack / config.bigBlindAmount).toBeLessThan(7);
		});
	});

	describe('All-In and Side Pot Scenarios', () => {
		test('should create side pots with different stack sizes', () => {
			// Setup players with different stack sizes for side pot scenario
			gameEngine.addPlayer('short1', 'Short Stack 1', 200);
			gameEngine.addPlayer('short2', 'Short Stack 2', 300);
			gameEngine.addPlayer('big1', 'Big Stack 1', 2000);
			gameEngine.addPlayer('big2', 'Big Stack 2', 2000);

			gameEngine.startHand();
			let gameState = gameEngine.getGameState();

			// Get initial pot amount (blinds)
			const initialPot = gameState.getPotManager().getTotalPotAmount();
			expect(initialPot).toBe(150); // 50 + 100 blinds

			// Short stack 1 goes all-in for remaining chips
			const short1Player = gameState.getPlayer('short1')!;
			const short1RemainingChips = short1Player.chipStack;

			gameEngine.processAction({
				type: ActionType.AllIn,
				amount: short1RemainingChips,
				playerId: 'short1',
				timestamp: Date.now(),
			});

			gameState = gameEngine.getGameState();
			const short1After = gameState.getPlayer('short1')!;
			expect(short1After.isAllIn).toBe(true);
			expect(short1After.chipStack).toBe(0);

			// Verify pot increased
			const potAfterAllIn = gameState.getPotManager().getTotalPotAmount();
			expect(potAfterAllIn).toBeGreaterThan(initialPot);
		});

		test('should handle multiple all-ins correctly', () => {
			// 3 players all go all-in with different stack sizes
			const players = [
				{ id: 'p1', name: 'Player 1', chips: 1000 },
				{ id: 'p2', name: 'Player 2', chips: 1500 },
				{ id: 'p3', name: 'Player 3', chips: 800 },
			];

			players.forEach((p) => gameEngine.addPlayer(p.id, p.name, p.chips));
			gameEngine.startHand();

			let gameState = gameEngine.getGameState();

			// Everyone goes all-in in turn order
			let allInCount = 0;
			while (gameState.currentPlayerToAct && allInCount < 3) {
				const currentPlayer = gameState.currentPlayerToAct;
				const playerChips = gameState.getPlayer(currentPlayer)!.chipStack;

				gameEngine.processAction({
					type: ActionType.AllIn,
					amount: playerChips,
					playerId: currentPlayer,
					timestamp: Date.now(),
				});

				gameState = gameEngine.getGameState();
				allInCount++;
			}

			gameState = gameEngine.getGameState();

			// Verify all players are all-in or folded
			const allInPlayers = gameState.players.filter((p) => p.isAllIn);
			const activePlayers = gameState.players.filter((p) => !p.isFolded);
			expect(allInPlayers.length).toBeGreaterThan(0);

			// Game should progress appropriately when players are all-in
			expect(gameState.currentPhase).toBeDefined();
			expect(allInPlayers.length).toBeGreaterThan(0);

			// If most players are all-in, the game should be progressing
			if (allInPlayers.length >= 2) {
				expect(
					[
						GamePhase.Flop,
						GamePhase.Turn,
						GamePhase.River,
						GamePhase.Showdown,
						GamePhase.HandComplete,
					].includes(gameState.currentPhase)
				).toBe(true);
			}
		});
	});

	describe('Player Behavior Patterns', () => {
		test('should handle tight vs aggressive play styles', () => {
			gameEngine.addPlayer('aggressive', 'Aggressive Player', 2000);
			gameEngine.addPlayer('tight', 'Tight Player', 2000);
			gameEngine.addPlayer('calling', 'Calling Station', 2000);

			gameEngine.startHand();
			let gameState = gameEngine.getGameState();

			// Simulate aggressive player making a big raise
			let currentPlayer = gameState.currentPlayerToAct!;
			if (currentPlayer === 'aggressive') {
				gameEngine.processAction({
					type: ActionType.Raise,
					amount: 500,
					playerId: 'aggressive',
					timestamp: Date.now(),
				});
			} else {
				// Skip to next player
				gameEngine.processAction({
					type: ActionType.Fold,
					playerId: currentPlayer,
					timestamp: Date.now(),
				});
			}

			gameState = gameEngine.getGameState();

			// Verify some action took place
			const aggressivePlayer = gameState.getPlayer('aggressive');
			expect(aggressivePlayer?.currentBet).toBeGreaterThan(0);
		});

		test('should handle sequence of folds', () => {
			// 5 players, everyone folds to big blind
			for (let i = 1; i <= 5; i++) {
				gameEngine.addPlayer(`player${i}`, `Player ${i}`, 1000);
			}

			gameEngine.startHand();
			let gameState = gameEngine.getGameState();

			// Fold until only big blind remains
			let foldCount = 0;
			while (gameState.currentPlayerToAct && foldCount < 3) {
				const currentPlayer = gameState.currentPlayerToAct;
				gameEngine.processAction({
					type: ActionType.Fold,
					playerId: currentPlayer,
					timestamp: Date.now(),
				});

				gameState = gameEngine.getGameState();
				foldCount++;
			}

			// Should have folded players
			const foldedPlayers = gameState.players.filter((p) => p.isFolded);
			expect(foldedPlayers.length).toBeGreaterThan(0);
		});
	});

	describe('Game State Consistency', () => {
		test('should maintain chip conservation throughout hand', () => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);
			gameEngine.addPlayer('player2', 'Player 2', 1500);
			gameEngine.addPlayer('player3', 'Player 3', 2000);

			// Record initial total chips
			const initialTotal = 1000 + 1500 + 2000;

			gameEngine.startHand();
			let gameState = gameEngine.getGameState();

			// Calculate total chips in play (player stacks + pot)
			const playerChips = gameState.players.reduce((sum, p) => sum + p.chipStack, 0);
			const potChips = gameState.getPotManager().getTotalPotAmount();
			const totalChips = playerChips + potChips;

			// Total chips should be conserved
			expect(totalChips).toBe(initialTotal);
		});

		test('should track hand progression correctly', () => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);
			gameEngine.addPlayer('player2', 'Player 2', 1000);

			expect(gameEngine.getGameStats().totalHands).toBe(0);

			gameEngine.startHand();
			expect(gameEngine.getGameStats().totalHands).toBe(1);

			let gameState = gameEngine.getGameState();
			expect(gameState.handNumber).toBe(1);
			expect(gameState.currentPhase).toBe(GamePhase.PreFlop);
		});

		test('should handle game statistics correctly', () => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);
			gameEngine.addPlayer('player2', 'Player 2', 1000);
			gameEngine.addPlayer('player3', 'Player 3', 1000);

			const stats = gameEngine.getGameStats();
			expect(stats.activePlayers).toBe(3);
			expect(stats.currentPot).toBe(0);

			gameEngine.startHand();
			const statsAfterStart = gameEngine.getGameStats();
			expect(statsAfterStart.currentPot).toBeGreaterThan(0); // Blinds posted
		});
	});

	describe('Error Handling in Game Flow', () => {
		test('should reject actions from non-existent players', () => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);
			gameEngine.addPlayer('player2', 'Player 2', 1000);
			gameEngine.startHand();

			expect(() => {
				gameEngine.processAction({
					type: ActionType.Fold,
					playerId: 'nonexistent',
					timestamp: Date.now(),
				});
			}).toThrow();
		});

		test("should reject actions when it's not player's turn", () => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);
			gameEngine.addPlayer('player2', 'Player 2', 1000);
			gameEngine.addPlayer('player3', 'Player 3', 1000);
			gameEngine.startHand();

			let gameState = gameEngine.getGameState();
			const currentPlayer = gameState.currentPlayerToAct!;
			const wrongPlayer = gameState.players.find((p) => p.id !== currentPlayer)!.id;

			expect(() => {
				gameEngine.processAction({
					type: ActionType.Fold,
					playerId: wrongPlayer,
					timestamp: Date.now(),
				});
			}).toThrow();
		});

		test('should handle insufficient chips for bet', () => {
			gameEngine.addPlayer('poorplayer', 'Poor Player', 50); // Less than big blind
			gameEngine.addPlayer('richplayer', 'Rich Player', 2000);
			gameEngine.startHand();

			let gameState = gameEngine.getGameState();
			const poorPlayer = gameState.getPlayer('poorplayer')!;

			// Poor player should be automatically all-in after posting blinds
			expect(poorPlayer.chipStack).toBe(0);
			expect(poorPlayer.isAllIn).toBe(true);
		});
	});
});
