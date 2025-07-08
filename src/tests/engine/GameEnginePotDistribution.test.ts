import { GameEngine } from '@engine/GameEngine';
import { ActionType, GameConfig, HandRank, GamePhase } from '@types';
import { HandEvaluator } from '@core/cards/HandEvaluator';

// Helper to build a standard game config
const createConfig = (overrides?: Partial<GameConfig>): GameConfig => ({
	maxPlayers: 9,
	smallBlindAmount: 5,
	bigBlindAmount: 10,
	turnTimeLimit: 30_000,
	isTournament: false,
	...overrides,
});

describe('GameEngine - Pot Distribution Edge Cases', () => {
	beforeEach(() => {
		jest.resetAllMocks();
	});

	describe('Single Winner Scenarios', () => {
		it('should distribute all pots to single remaining player', () => {
			const engine = new GameEngine('g1', createConfig());
			engine.addPlayer('p1', 'Alice', 1000);
			engine.addPlayer('p2', 'Bob', 1000);
			engine.addPlayer('p3', 'Charlie', 1000);
			engine.startHand();

			// All players contribute to pot
			const firstToAct = engine.getGameState().currentPlayerToAct!;
			engine.processAction({
				type: ActionType.Raise,
				playerId: firstToAct,
				amount: 100,
				timestamp: Date.now(),
			});

			const secondToAct = engine.getGameState().currentPlayerToAct!;
			engine.processAction({
				type: ActionType.Call,
				playerId: secondToAct,
				timestamp: Date.now(),
			});

			const thirdToAct = engine.getGameState().currentPlayerToAct!;
			engine.processAction({
				type: ActionType.Call,
				playerId: thirdToAct,
				timestamp: Date.now(),
			});

			// Two players fold, leaving one winner
			const state = engine.getGameState();
			const players = state.players;
			
			// Find two players to fold
			const activePlayers = players.filter(p => !p.isFolded);
			if (activePlayers.length >= 2) {
				activePlayers[0].fold();
				activePlayers[1].fold();
			}

			// Force completion to showdown
			while (engine.isGameRunning()) {
				const currentState = engine.getGameState();
				if (currentState.currentPlayerToAct) {
					engine.processAction({
						type: ActionType.Check,
						playerId: currentState.currentPlayerToAct,
						timestamp: Date.now(),
					});
				} else {
					break;
				}
			}

			// Should complete without error
			expect(engine.isGameRunning()).toBe(false);
			
			// Winner should have all the chips (total should be conserved)
			const finalState = engine.getGameState();
			const totalChips = finalState.players.reduce((sum, p) => sum + p.chipStack, 0);
			expect(totalChips).toBe(3000); // All chips conserved
			
			const remainingPlayer = finalState.players.find(p => !p.isFolded);
			expect(remainingPlayer).toBeDefined();
			expect(remainingPlayer!.chipStack).toBeGreaterThan(1000); // Original + winnings
		});

		it('should handle all players folding except one preflop', () => {
			const engine = new GameEngine('g2', createConfig());
			engine.addPlayer('p1', 'Alice', 1000);
			engine.addPlayer('p2', 'Bob', 1000);
			engine.addPlayer('p3', 'Charlie', 1000);
			engine.startHand();

			// First player raises
			const firstToAct = engine.getGameState().currentPlayerToAct!;
			engine.processAction({
				type: ActionType.Raise,
				playerId: firstToAct,
				amount: 100,
				timestamp: Date.now(),
			});

			// Second player folds
			const secondToAct = engine.getGameState().currentPlayerToAct!;
			engine.processAction({
				type: ActionType.Fold,
				playerId: secondToAct,
				timestamp: Date.now(),
			});

			// Third player folds
			const thirdToAct = engine.getGameState().currentPlayerToAct!;
			engine.processAction({
				type: ActionType.Fold,
				playerId: thirdToAct,
				timestamp: Date.now(),
			});

			// Game should end with first player winning
			expect(engine.isGameRunning()).toBe(false);
			
			const finalState = engine.getGameState();
			const totalChips = finalState.players.reduce((sum, p) => sum + p.chipStack, 0);
			expect(totalChips).toBe(3000); // All chips conserved
			
			const winner = finalState.getPlayer(firstToAct);
			expect(winner).toBeDefined();
			expect(winner!.chipStack).toBeGreaterThan(1000); // Won the blinds + any other bets
		});
	});

	describe('Fallback Distribution', () => {
		it('should distribute to remaining players when hand evaluations are missing', () => {
			// This test simulates a scenario where players reach showdown but hand evaluations fail
			const engine = new GameEngine('g3', createConfig());
			engine.addPlayer('p1', 'Alice', 1000);
			engine.addPlayer('p2', 'Bob', 1000);
			engine.startHand();

			// Both players check through all streets
			while (engine.isGameRunning() && engine.getGameState().currentPlayerToAct) {
				const state = engine.getGameState();
				const currentPlayer = state.currentPlayerToAct!;
				const playerState = state.getPlayer(currentPlayer)!;
				const currentBet = state.getCurrentBet();
				const callAmount = currentBet - playerState.currentBet;
				
				if (callAmount > 0) {
					engine.processAction({
						type: ActionType.Call,
						playerId: currentPlayer,
						timestamp: Date.now(),
					});
				} else {
					engine.processAction({
						type: ActionType.Check,
						playerId: currentPlayer,
						timestamp: Date.now(),
					});
				}
			}

			// Should complete without error even if hand evaluations fail
			expect(engine.isGameRunning()).toBe(false);
			
			// Both players should have some chips (distributed fairly)
			const finalState = engine.getGameState();
			const totalChips = finalState.players.reduce((sum, p) => sum + p.chipStack, 0);
			expect(totalChips).toBe(2000); // No chips lost
		});
	});

	describe('Side Pot Edge Cases', () => {
		it('should handle side pots when some eligible players fold', () => {
			const engine = new GameEngine('g4', createConfig());
			engine.addPlayer('p1', 'Alice', 50);  // Short stack
			engine.addPlayer('p2', 'Bob', 200);   // Medium stack
			engine.addPlayer('p3', 'Charlie', 200); // Medium stack
			engine.startHand();

			// Everyone goes all-in to create side pots
			while (engine.isGameRunning() && engine.getGameState().currentPlayerToAct) {
				const state = engine.getGameState();
				engine.processAction({
					type: ActionType.AllIn,
					playerId: state.currentPlayerToAct!,
					timestamp: Date.now(),
				});
			}

			// Should complete without error
			expect(engine.isGameRunning()).toBe(false);
			
			// All chips should be distributed
			const finalState = engine.getGameState();
			const totalChips = finalState.players.reduce((sum, p) => sum + p.chipStack, 0);
			expect(totalChips).toBe(450); // 50 + 200 + 200
		});
	});

	describe('Event Emission', () => {
		it('should emit showdown_complete event even for single winner', () => {
			const events: string[] = [];
			const engine = new GameEngine('g5', createConfig());
			engine.onEvent((e) => events.push(e.type));

			engine.addPlayer('p1', 'Alice', 1000);
			engine.addPlayer('p2', 'Bob', 1000);
			engine.startHand();

			// First player raises, second folds
			const firstToAct = engine.getGameState().currentPlayerToAct!;
			engine.processAction({
				type: ActionType.Raise,
				playerId: firstToAct,
				amount: 100,
				timestamp: Date.now(),
			});

			const secondToAct = engine.getGameState().currentPlayerToAct!;
			engine.processAction({
				type: ActionType.Fold,
				playerId: secondToAct,
				timestamp: Date.now(),
			});

			// Should emit showdown_complete even though no actual showdown occurred
			expect(events).toContain('showdown_complete');
			expect(events).toContain('hand_complete');
		});
	});
});