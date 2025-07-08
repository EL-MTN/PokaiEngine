import { ActionValidator } from '@core/betting/ActionValidator';
import { GameState } from '@core/game/GameState';
import { Player } from '@core/game/Player';
import { Action, ActionType, GamePhase } from '@types';

// Helper to create a predictable game state.
const createTestGameState = (playerCount: number, initialChipStacks: number[]) => {
	const gameState = new GameState('test-game', 5, 10);
	for (let i = 0; i < playerCount; i++) {
		const player = new Player(`p${i}`, `Player ${i}`, initialChipStacks[i]);
		gameState.addPlayer(player);
	}
	// This setup ensures that on the first hand:
	// p0 is the Dealer
	// p1 is the Small Blind
	// p2 is the Big Blind (and so on)
	gameState.dealerPosition = playerCount - 1;
	gameState.startNewHand();
	return gameState;
};

describe('ActionValidator', () => {
	describe('Heads-Up (2 Players)', () => {
		let gameState: GameState;

		beforeEach(() => {
			// p0 is Dealer/SB, p1 is BB.
			gameState = createTestGameState(2, [1000, 1000]);
			ActionValidator.processBlindPosting(gameState);
			// Pre-flop action starts with p0.
		});

		it('Pre-flop: SB (p0) should have call/raise/fold options', () => {
			const actions = ActionValidator.getPossibleActions(gameState, 'p0');
			const types = actions.map((a) => a.type);
			expect(types).toEqual(
				expect.arrayContaining([
					ActionType.Call,
					ActionType.Raise,
					ActionType.Fold,
					ActionType.AllIn,
				])
			);
		});

		it('Pre-flop: SB (p0) calls, BB (p1) should have check/raise options', () => {
			ActionValidator.processAction(gameState, {
				type: ActionType.Call,
				playerId: 'p0',
				amount: 5,
				timestamp: Date.now(),
			});
			const actions = ActionValidator.getPossibleActions(gameState, 'p1');
			const types = actions.map((a) => a.type);
			expect(types).toEqual(
				expect.arrayContaining([ActionType.Check, ActionType.Raise, ActionType.AllIn])
			);
		});

		it('Post-flop: SB (p0) acts first and should have check/bet options', () => {
			ActionValidator.processAction(gameState, {
				type: ActionType.Call,
				playerId: 'p0',
				amount: 5,
				timestamp: Date.now(),
			});
			ActionValidator.processAction(gameState, {
				type: ActionType.Check,
				playerId: 'p1',
				timestamp: Date.now(),
			});
			gameState.advancePhase(); // To Flop

			// Post-flop action should start with the SB (p0) in heads-up.
			const actions = ActionValidator.getPossibleActions(gameState, 'p0');
			const types = actions.map((a) => a.type);
			expect(types).toEqual(
				expect.arrayContaining([ActionType.Check, ActionType.Bet, ActionType.AllIn])
			);
		});
	});

	describe('Multi-Way (6 Players)', () => {
		let gameState: GameState;

		beforeEach(() => {
			// p0: BTN, p1: SB, p2: BB, p3: UTG, p4: MP, p5: CO
			gameState = createTestGameState(6, [1000, 1000, 1000, 1000, 1000, 1000]);
			ActionValidator.processBlindPosting(gameState);
			// Pre-flop action starts with UTG (p3).
		});

		it('Pre-flop: UTG (p3) should have call/raise/fold options', () => {
			const actions = ActionValidator.getPossibleActions(gameState, 'p3');
			const types = actions.map((a) => a.type);
			expect(types).toEqual(
				expect.arrayContaining([
					ActionType.Call,
					ActionType.Raise,
					ActionType.Fold,
					ActionType.AllIn,
				])
			);
		});

		it('Post-flop: SB (p1) acts first', () => {
			// Simulate calls around to the BB pre-flop
			['p3', 'p4', 'p5', 'p0'].forEach((pid) => {
				ActionValidator.processAction(gameState, {
					type: ActionType.Call,
					playerId: pid,
					amount: 10,
					timestamp: Date.now(),
				});
			});
			ActionValidator.processAction(gameState, {
				type: ActionType.Call,
				playerId: 'p1',
				amount: 5,
				timestamp: Date.now(),
			});
			ActionValidator.processAction(gameState, {
				type: ActionType.Check,
				playerId: 'p2',
				timestamp: Date.now(),
			});
			gameState.advancePhase(); // To Flop

			// Post-flop action starts left of dealer, which is SB (p1).
			const actions = ActionValidator.getPossibleActions(gameState, 'p1');
			const types = actions.map((a) => a.type);
			expect(types).toEqual(
				expect.arrayContaining([ActionType.Check, ActionType.Bet, ActionType.AllIn])
			);
		});
	});

	describe('Action Validation Logic', () => {
		let gameState: GameState;

		beforeEach(() => {
			gameState = createTestGameState(2, [100, 100]);
			ActionValidator.processBlindPosting(gameState);
		});

		it('should throw error for action from wrong player', () => {
			const action: Action = { type: ActionType.Fold, playerId: 'p1', timestamp: Date.now() };
			expect(() => ActionValidator.validateAction(gameState, action)).toThrow(
				"Not player's turn to act"
			);
		});

		it('should throw error for invalid bet size (less than BB)', () => {
			gameState.advancePhase(); // To Flop
			const betAction: Action = {
				type: ActionType.Bet,
				playerId: 'p0',
				amount: 5,
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, betAction)).toThrow(
				'Bet must be at least 10'
			);
		});

		it('should throw error for invalid raise size (less than min raise)', () => {
			const raiseAction: Action = {
				type: ActionType.Raise,
				playerId: 'p0',
				amount: 15,
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, raiseAction)).toThrow(
				'Raise must be at least 20'
			);
		});

		it('should validate a correct all-in call (short stack)', () => {
			const player = gameState.getPlayer('p0');
			if (!player) throw new Error('Player not found');
			player.chipStack = 3; // Less than the 5 needed to call the BB
			const allInAction: Action = {
				type: ActionType.AllIn,
				playerId: 'p0',
				timestamp: Date.now(),
			};
			const isValid = ActionValidator.validateAction(gameState, allInAction);
			expect(isValid).toBe(true);
		});
	});

	describe('Out-of-Order Action Scenarios', () => {
		let gameState: GameState;

		beforeEach(() => {
			gameState = createTestGameState(3, [1000, 1000, 1000]);
			ActionValidator.processBlindPosting(gameState);
			// p0: BTN, p1: SB, p2: BB. Action starts with p0.
		});

		it('should throw an error if a player who is not to act tries to act', () => {
			const action: Action = { type: ActionType.Fold, playerId: 'p1', timestamp: Date.now() };
			expect(() => ActionValidator.validateAction(gameState, action)).toThrow(
				"Not player's turn to act"
			);
		});

		it('should throw an error if a player who has already acted tries to act again', () => {
			const callAction: Action = {
				type: ActionType.Call,
				playerId: 'p0',
				amount: 10,
				timestamp: Date.now(),
			};
			ActionValidator.processAction(gameState, callAction);
			// Action is now on p1. p0 tries to act again.
			const secondAction: Action = {
				type: ActionType.Fold,
				playerId: 'p0',
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, secondAction)).toThrow(
				"Not player's turn to act"
			);
		});
	});

	describe('Multiple All-In Scenarios', () => {
		let gameState: GameState;

		it('should correctly handle a 3-way all-in pre-flop', () => {
			// p0 (BTN) has 100, p1 (SB) has 50, p2 (BB) has 200
			gameState = createTestGameState(3, [100, 50, 200]);
			ActionValidator.processBlindPosting(gameState);

			// p0 goes all-in for 100
			const p0_allIn: Action = {
				type: ActionType.AllIn,
				playerId: 'p0',
				timestamp: Date.now(),
			};
			ActionValidator.processAction(gameState, p0_allIn);

			// p1 calls all-in for 50
			const p1_allIn: Action = {
				type: ActionType.AllIn,
				playerId: 'p1',
				timestamp: Date.now(),
			};
			ActionValidator.processAction(gameState, p1_allIn);

			// p2 calls the 100 bet
			const p2_call: Action = {
				type: ActionType.Call,
				playerId: 'p2',
				amount: 90,
				timestamp: Date.now(),
			};
			ActionValidator.processAction(gameState, p2_call);

			// Check pot structure
			gameState.createSidePots();
			const pots = gameState.pots;

			// Main pot: 50 (p1) + 50 (p0) + 50 (p2) = 150
			expect(pots[0].amount).toBe(150);
			expect(pots[0].eligiblePlayers).toEqual(expect.arrayContaining(['p1', 'p0', 'p2']));

			// Side pot 1: 50 (p0) + 50 (p2) = 100
			expect(pots[1].amount).toBe(100);
			expect(pots[1].eligiblePlayers).toEqual(expect.arrayContaining(['p0', 'p2']));
		});
	});

	describe('Full Game Simulation', () => {
		it('should correctly handle a full hand from pre-flop to river', () => {
			// p0: BTN, p1: SB, p2: BB
			const gameState = createTestGameState(3, [1000, 1000, 1000]);
			ActionValidator.processBlindPosting(gameState);

			// Pre-flop
			// p0 calls
			ActionValidator.processAction(gameState, {
				type: ActionType.Call,
				playerId: 'p0',
				amount: 10,
				timestamp: Date.now(),
			});
			// p1 calls
			ActionValidator.processAction(gameState, {
				type: ActionType.Call,
				playerId: 'p1',
				amount: 5,
				timestamp: Date.now(),
			});
			// p2 checks
			ActionValidator.processAction(gameState, {
				type: ActionType.Check,
				playerId: 'p2',
				timestamp: Date.now(),
			});

			expect(gameState.isBettingRoundComplete()).toBe(true);
			gameState.advancePhase(); // To Flop
			expect(gameState.currentPhase).toBe(GamePhase.Flop);

			// Flop
			// p1 checks
			ActionValidator.processAction(gameState, {
				type: ActionType.Check,
				playerId: 'p1',
				timestamp: Date.now(),
			});
			// p2 checks
			ActionValidator.processAction(gameState, {
				type: ActionType.Check,
				playerId: 'p2',
				timestamp: Date.now(),
			});
			// p0 bets
			ActionValidator.processAction(gameState, {
				type: ActionType.Bet,
				playerId: 'p0',
				amount: 20,
				timestamp: Date.now(),
			});
			// p1 folds
			ActionValidator.processAction(gameState, {
				type: ActionType.Fold,
				playerId: 'p1',
				timestamp: Date.now(),
			});
			// p2 calls
			ActionValidator.processAction(gameState, {
				type: ActionType.Call,
				playerId: 'p2',
				amount: 20,
				timestamp: Date.now(),
			});

			expect(gameState.isBettingRoundComplete()).toBe(true);
			gameState.advancePhase(); // To Turn
			expect(gameState.currentPhase).toBe(GamePhase.Turn);

			// Turn
			// p2 checks
			ActionValidator.processAction(gameState, {
				type: ActionType.Check,
				playerId: 'p2',
				timestamp: Date.now(),
			});
			// p0 checks
			ActionValidator.processAction(gameState, {
				type: ActionType.Check,
				playerId: 'p0',
				timestamp: Date.now(),
			});

			expect(gameState.isBettingRoundComplete()).toBe(true);
			gameState.advancePhase(); // To River
			expect(gameState.currentPhase).toBe(GamePhase.River);

			// River
			// p2 bets
			ActionValidator.processAction(gameState, {
				type: ActionType.Bet,
				playerId: 'p2',
				amount: 50,
				timestamp: Date.now(),
			});
			// p0 calls
			ActionValidator.processAction(gameState, {
				type: ActionType.Call,
				playerId: 'p0',
				amount: 50,
				timestamp: Date.now(),
			});

			expect(gameState.isBettingRoundComplete()).toBe(true);
			gameState.advancePhase(); // To Showdown
			expect(gameState.currentPhase).toBe(GamePhase.Showdown);
		});
	});

	describe('Advanced Betting Scenarios', () => {
		let gameState: GameState;

		beforeEach(() => {
			gameState = createTestGameState(4, [1000, 1000, 1000, 1000]);
			// p0: BTN, p1: SB, p2: BB, p3: UTG
			ActionValidator.processBlindPosting(gameState);
		});

		it('should calculate minimum re-raise amount correctly', () => {
			// p3 (UTG) raises to 30
			ActionValidator.processAction(gameState, {
				type: ActionType.Raise,
				playerId: 'p3',
				amount: 30,
				timestamp: Date.now(),
			});
			// p0 (BTN) re-raises to 60. The initial raise was 20 (30-10), so the min re-raise is another 20, making the total 50.
			// Let's say p0 makes it 60.
			ActionValidator.processAction(gameState, {
				type: ActionType.Raise,
				playerId: 'p0',
				amount: 60,
				timestamp: Date.now(),
			});
			// Action is on p1 (SB). The current bet is 60. The last raise was 30 (60-30). So min re-raise is to 90.
			const actions = ActionValidator.getPossibleActions(gameState, 'p1');
			const raiseAction = actions.find((a) => a.type === ActionType.Raise);
			expect(raiseAction?.minAmount).toBe(90);
		});

		it('should re-open the action for a player who has already called', () => {
			// p3 calls BB
			ActionValidator.processAction(gameState, {
				type: ActionType.Call,
				playerId: 'p3',
				amount: 10,
				timestamp: Date.now(),
			});
			// p0 raises to 40
			ActionValidator.processAction(gameState, {
				type: ActionType.Raise,
				playerId: 'p0',
				amount: 40,
				timestamp: Date.now(),
			});
			// Action is now on p1 (SB), who folds.
			ActionValidator.processAction(gameState, {
				type: ActionType.Fold,
				playerId: 'p1',
				timestamp: Date.now(),
			});
			// p2 (BB) folds.
			ActionValidator.processAction(gameState, {
				type: ActionType.Fold,
				playerId: 'p2',
				timestamp: Date.now(),
			});
			// Action should now be back on p3.
			expect(gameState.currentPlayerToAct).toBe('p3');
			const actions = ActionValidator.getPossibleActions(gameState, 'p3');
			const types = actions.map((a) => a.type);
			expect(types).toEqual(
				expect.arrayContaining([ActionType.Call, ActionType.Raise, ActionType.Fold])
			);
		});

		it('should not re-open action on an incomplete all-in raise', () => {
			// p3 raises to 30
			ActionValidator.processAction(gameState, {
				type: ActionType.Raise,
				playerId: 'p3',
				amount: 30,
				timestamp: Date.now(),
			});
			// p0 calls
			ActionValidator.processAction(gameState, {
				type: ActionType.Call,
				playerId: 'p0',
				amount: 30,
				timestamp: Date.now(),
			});
			// p1 goes all-in for 40. This is not a full raise (min raise would be to 50).
			const p1 = gameState.getPlayer('p1');
			if (p1) p1.chipStack = 35; // 5 for SB + 35 = 40 total
			ActionValidator.processAction(gameState, {
				type: ActionType.AllIn,
				playerId: 'p1',
				timestamp: Date.now(),
			});
			// p2 folds
			ActionValidator.processAction(gameState, {
				type: ActionType.Fold,
				playerId: 'p2',
				timestamp: Date.now(),
			});
			// Action is on p3. p3 should only be able to call or fold, not re-raise.
			const actions = ActionValidator.getPossibleActions(gameState, 'p3');
			const types = actions.map((a) => a.type);
			expect(types).not.toContain(ActionType.Raise);
			expect(types).toEqual(expect.arrayContaining([ActionType.Call, ActionType.Fold]));
		});
	});

	describe('Helper Methods', () => {
		let gameState: GameState;

		beforeEach(() => {
			gameState = createTestGameState(3, [1000, 1000, 1000]);
			ActionValidator.processBlindPosting(gameState);
		});

		it('should calculate correct call amount when no bet exists', () => {
			gameState.advancePhase(); // To Flop - no betting yet
			const callAmount = ActionValidator.getCallAmount(gameState, 'p1');
			expect(callAmount).toBe(0);
		});

		it('should calculate correct call amount when bet exists', () => {
			const callAmount = ActionValidator.getCallAmount(gameState, 'p0');
			expect(callAmount).toBe(10); // Need to call BB of 10
		});

		it('should calculate correct call amount for player who has already bet', () => {
			const callAmount = ActionValidator.getCallAmount(gameState, 'p2');
			expect(callAmount).toBe(0); // BB has already posted 10
		});

		it('should return 0 call amount for non-existent player', () => {
			const callAmount = ActionValidator.getCallAmount(gameState, 'invalid');
			expect(callAmount).toBe(0);
		});

		it('should calculate correct minimum raise amount', () => {
			const minRaise = ActionValidator.getMinRaiseAmount(gameState, 'p0');
			expect(minRaise).toBe(20); // Current bet (10) + minimum raise (10)
		});

		it('should calculate correct maximum raise amount', () => {
			const maxRaise = ActionValidator.getMaxRaiseAmount(gameState, 'p0');
			expect(maxRaise).toBe(1000); // Player's chip stack + current bet (0)
		});

		it('should return 0 for min/max raise for non-existent player', () => {
			const minRaise = ActionValidator.getMinRaiseAmount(gameState, 'invalid');
			const maxRaise = ActionValidator.getMaxRaiseAmount(gameState, 'invalid');
			expect(minRaise).toBe(0);
			expect(maxRaise).toBe(0);
		});
	});

	describe('Force Actions', () => {
		let gameState: GameState;

		beforeEach(() => {
			gameState = createTestGameState(2, [1000, 1000]);
			ActionValidator.processBlindPosting(gameState);
		});

		it('should return check when no bet to call', () => {
			gameState.advancePhase(); // To Flop
			const forceAction = ActionValidator.getForceAction(gameState, 'p0');
			expect(forceAction.type).toBe(ActionType.Check);
			expect(forceAction.playerId).toBe('p0');
		});

		it('should return fold when bet exists', () => {
			const forceAction = ActionValidator.getForceAction(gameState, 'p0');
			expect(forceAction.type).toBe(ActionType.Fold);
			expect(forceAction.playerId).toBe('p0');
		});

		it('should throw error for non-existent player', () => {
			expect(() => ActionValidator.getForceAction(gameState, 'invalid')).toThrow(
				'Player not found'
			);
		});
	});

	describe('Blind Posting Edge Cases', () => {
		it('should handle short stack posting small blind', () => {
			const gameState = createTestGameState(2, [3, 1000]); // p0 has only 3 chips
			ActionValidator.processBlindPosting(gameState);

			const p0 = gameState.getPlayer('p0');
			expect(p0?.currentBet).toBe(3); // Should post all 3 chips as SB
			expect(p0?.chipStack).toBe(0); // Should be all-in
		});

		it('should handle short stack posting big blind', () => {
			const gameState = createTestGameState(2, [1000, 7]); // p1 has only 7 chips
			ActionValidator.processBlindPosting(gameState);

			const p1 = gameState.getPlayer('p1');
			expect(p1?.currentBet).toBe(7); // Should post all 7 chips as BB
			expect(p1?.chipStack).toBe(0); // Should be all-in
		});

		it('should handle both players with short stacks', () => {
			const gameState = createTestGameState(2, [3, 7]);
			ActionValidator.processBlindPosting(gameState);

			const p0 = gameState.getPlayer('p0');
			const p1 = gameState.getPlayer('p1');
			expect(p0?.currentBet).toBe(3);
			expect(p1?.currentBet).toBe(7);
			expect(p0?.chipStack).toBe(0);
			expect(p1?.chipStack).toBe(0);
		});
	});

	describe('Action Validation Edge Cases', () => {
		let gameState: GameState;

		beforeEach(() => {
			gameState = createTestGameState(3, [1000, 1000, 1000]);
			ActionValidator.processBlindPosting(gameState);
		});

		it('should reject call with incorrect amount', () => {
			const callAction: Action = {
				type: ActionType.Call,
				playerId: 'p0',
				amount: 15, // Incorrect amount, should be 10
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, callAction)).toThrow(
				'Call amount must be 10'
			);
		});

		it('should reject check when bet exists', () => {
			const checkAction: Action = {
				type: ActionType.Check,
				playerId: 'p0',
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, checkAction)).toThrow(
				'Cannot check when there is a bet to call'
			);
		});

		it('should reject call when no bet exists', () => {
			gameState.advancePhase(); // To Flop - no betting
			const callAction: Action = {
				type: ActionType.Call,
				playerId: 'p1',
				amount: 10,
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, callAction)).toThrow(
				'Cannot call when there is no bet'
			);
		});

		it('should reject bet when bet already exists', () => {
			gameState.advancePhase(); // To Flop
			// p1 bets first
			ActionValidator.processAction(gameState, {
				type: ActionType.Bet,
				playerId: 'p1',
				amount: 20,
				timestamp: Date.now(),
			});
			// p2 tries to bet instead of call/raise
			const betAction: Action = {
				type: ActionType.Bet,
				playerId: 'p2',
				amount: 30,
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, betAction)).toThrow(
				'Cannot bet when there is already a bet'
			);
		});

		it('should reject raise when no bet exists', () => {
			gameState.advancePhase(); // To Flop
			const raiseAction: Action = {
				type: ActionType.Raise,
				playerId: 'p1',
				amount: 30,
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, raiseAction)).toThrow(
				'Cannot raise when there is no bet'
			);
		});

		it('should reject bet without amount', () => {
			gameState.advancePhase(); // To Flop
			const betAction: Action = {
				type: ActionType.Bet,
				playerId: 'p1',
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, betAction)).toThrow(
				'Bet amount is required'
			);
		});

		it('should reject raise without amount', () => {
			const raiseAction: Action = {
				type: ActionType.Raise,
				playerId: 'p0',
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, raiseAction)).toThrow(
				'Raise amount is required'
			);
		});

		it('should reject bet exceeding chip stack', () => {
			gameState.advancePhase(); // To Flop
			const betAction: Action = {
				type: ActionType.Bet,
				playerId: 'p1',
				amount: 1500, // Exceeds 1000 chip stack
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, betAction)).toThrow(
				'Not enough chips to bet'
			);
		});

		it('should reject call exceeding chip stack', () => {
			const player = gameState.getPlayer('p0');
			if (player) player.chipStack = 5; // Less than required call of 10

			const callAction: Action = {
				type: ActionType.Call,
				playerId: 'p0',
				amount: 10,
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, callAction)).toThrow(
				'Not enough chips to call'
			);
		});
	});

	describe('Player State Edge Cases', () => {
		let gameState: GameState;

		beforeEach(() => {
			gameState = createTestGameState(3, [1000, 1000, 1000]);
			ActionValidator.processBlindPosting(gameState);
		});

		it('should reject action from non-existent player', () => {
			const action: Action = {
				type: ActionType.Fold,
				playerId: 'invalid',
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, action)).toThrow(
				'Player not found'
			);
		});

		it('should reject action from folded player', () => {
			// p0 folds
			ActionValidator.processAction(gameState, {
				type: ActionType.Fold,
				playerId: 'p0',
				timestamp: Date.now(),
			});

			// p0 tries to act again - will fail because it's not their turn anymore
			const action: Action = {
				type: ActionType.Call,
				playerId: 'p0',
				amount: 10,
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, action)).toThrow(
				"Not player's turn to act"
			);
		});

		it('should reject all-in when player has no chips', () => {
			const player = gameState.getPlayer('p0');
			if (player) player.chipStack = 0;

			const allInAction: Action = {
				type: ActionType.AllIn,
				playerId: 'p0',
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, allInAction)).toThrow(
				'Player cannot act'
			);
		});

		it('should reject all-in when player is already all-in', () => {
			const player = gameState.getPlayer('p0');
			if (player) {
				player.isAllIn = true;
			}

			const allInAction: Action = {
				type: ActionType.AllIn,
				playerId: 'p0',
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, allInAction)).toThrow(
				'Player cannot act'
			);
		});

		it('should allow double all-in attempts (validates in context)', () => {
			// Test a player going all-in twice in different contexts
			// First all-in (valid)
			ActionValidator.processAction(gameState, {
				type: ActionType.AllIn,
				playerId: 'p0',
				timestamp: Date.now(),
			});

			// Player should now be all-in and unable to act
			const player = gameState.getPlayer('p0');
			expect(player?.isAllIn).toBe(true);
			expect(player?.canAct()).toBe(false);
		});
	});

	describe('Invalid Action Types', () => {
		let gameState: GameState;

		beforeEach(() => {
			gameState = createTestGameState(2, [1000, 1000]);
			ActionValidator.processBlindPosting(gameState);
		});

		it('should throw error for invalid action type', () => {
			const invalidAction = {
				type: 'invalid_action' as ActionType,
				playerId: 'p0',
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.validateAction(gameState, invalidAction)).toThrow(
				'Invalid action type'
			);
		});
	});

	describe('getPossibleActions Edge Cases', () => {
		let gameState: GameState;

		beforeEach(() => {
			gameState = createTestGameState(3, [1000, 1000, 1000]);
			ActionValidator.processBlindPosting(gameState);
		});

		it('should return empty array for non-existent player', () => {
			const actions = ActionValidator.getPossibleActions(gameState, 'invalid');
			expect(actions).toEqual([]);
		});

		it('should return empty array for folded player', () => {
			// Fold p0
			ActionValidator.processAction(gameState, {
				type: ActionType.Fold,
				playerId: 'p0',
				timestamp: Date.now(),
			});

			const actions = ActionValidator.getPossibleActions(gameState, 'p0');
			expect(actions).toEqual([]);
		});

		it('should return empty array for player with 0 chips who cannot act', () => {
			const player = gameState.getPlayer('p0');
			if (player) {
				player.chipStack = 0;
				player.isAllIn = true;
			}

			const actions = ActionValidator.getPossibleActions(gameState, 'p0');
			expect(actions).toEqual([]);
		});

		it('should not include fold option when check is available', () => {
			gameState.advancePhase(); // To Flop - no betting
			const actions = ActionValidator.getPossibleActions(gameState, 'p1');
			const types = actions.map((a) => a.type);
			expect(types).not.toContain(ActionType.Fold);
			expect(types).toContain(ActionType.Check);
		});

		it('should not include all-in option for player already all-in', () => {
			const player = gameState.getPlayer('p0');
			if (player) {
				player.isAllIn = true;
			}

			const actions = ActionValidator.getPossibleActions(gameState, 'p0');
			const types = actions.map((a) => a.type);
			expect(types).not.toContain(ActionType.AllIn);
		});

		it('should not include all-in option for player with 0 chips', () => {
			const player = gameState.getPlayer('p0');
			if (player) {
				player.chipStack = 0;
			}

			const actions = ActionValidator.getPossibleActions(gameState, 'p0');
			const types = actions.map((a) => a.type);
			expect(types).not.toContain(ActionType.AllIn);
		});

		it('should include correct amounts for call action', () => {
			const actions = ActionValidator.getPossibleActions(gameState, 'p0');
			const callAction = actions.find((a) => a.type === ActionType.Call);
			expect(callAction?.minAmount).toBe(10);
			expect(callAction?.maxAmount).toBe(10);
		});

		it('should include correct amounts for raise action', () => {
			const actions = ActionValidator.getPossibleActions(gameState, 'p0');
			const raiseAction = actions.find((a) => a.type === ActionType.Raise);
			expect(raiseAction?.minAmount).toBe(20); // Min raise to 20
			expect(raiseAction?.maxAmount).toBe(1000); // Max stack
		});

		it('should include correct amounts for bet action post-flop', () => {
			gameState.advancePhase(); // To Flop
			const actions = ActionValidator.getPossibleActions(gameState, 'p1');
			const betAction = actions.find((a) => a.type === ActionType.Bet);
			expect(betAction?.minAmount).toBe(10); // Big blind amount
			expect(betAction?.maxAmount).toBe(995); // Player's chip stack (1000 - 5 SB already posted)
		});
	});

	describe('Process Action Edge Cases', () => {
		let gameState: GameState;

		beforeEach(() => {
			gameState = createTestGameState(2, [1000, 1000]);
			ActionValidator.processBlindPosting(gameState);
		});

		it('should throw error when processing action for non-existent player', () => {
			const action: Action = {
				type: ActionType.Fold,
				playerId: 'invalid',
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.processAction(gameState, action)).toThrow(
				'Player not found'
			);
		});

		it('should throw error when processing bet without amount', () => {
			gameState.advancePhase(); // To Flop
			const betAction: Action = {
				type: ActionType.Bet,
				playerId: 'p0',
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.processAction(gameState, betAction)).toThrow(
				'Bet amount is required'
			);
		});

		it('should throw error when processing raise without amount', () => {
			const raiseAction: Action = {
				type: ActionType.Raise,
				playerId: 'p0',
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.processAction(gameState, raiseAction)).toThrow(
				'Raise amount is required'
			);
		});

		it('should throw error for invalid action type in processAction', () => {
			const invalidAction = {
				type: 'invalid' as ActionType,
				playerId: 'p0',
				timestamp: Date.now(),
			};
			expect(() => ActionValidator.processAction(gameState, invalidAction)).toThrow(
				'Invalid action type'
			);
		});

		it('should correctly track last aggressor on bet', () => {
			gameState.advancePhase(); // To Flop
			ActionValidator.processAction(gameState, {
				type: ActionType.Bet,
				playerId: 'p0',
				amount: 50,
				timestamp: Date.now(),
			});

			expect(gameState.lastAggressor).toBe('p0');
		});

		it('should correctly track last aggressor on raise', () => {
			ActionValidator.processAction(gameState, {
				type: ActionType.Raise,
				playerId: 'p0',
				amount: 30,
				timestamp: Date.now(),
			});

			expect(gameState.lastAggressor).toBe('p0');
		});

		it('should correctly track last aggressor on aggressive all-in', () => {
			ActionValidator.processAction(gameState, {
				type: ActionType.AllIn,
				playerId: 'p0',
				timestamp: Date.now(),
			});

			expect(gameState.lastAggressor).toBe('p0');
		});
	});
});
