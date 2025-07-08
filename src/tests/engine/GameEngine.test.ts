import { GameEngine } from '@engine/GameEngine';
import { ActionType, GameConfig, HandRank, GamePhase } from '@types';
import { HandEvaluator } from '@core/cards/HandEvaluator';

// We will spy on HandEvaluator.evaluateHand per-test so we can restore the original implementation afterward.
// No need for a full module mock.

// Helper to build a standard game config
const createConfig = (): GameConfig => ({
	maxPlayers: 9,
	smallBlindAmount: 5,
	bigBlindAmount: 10,
	turnTimeLimit: 30_000,
	isTournament: false,
});

// Simple utility to advance through all remaining player actions by forcing all-in decisions
const exhaustHandWithAllIns = (engine: GameEngine) => {
	while (engine.isGameRunning()) {
		const state = engine.getGameState();
		const current = state.currentPlayerToAct;
		if (!current) break; // Should not happen, but guard to avoid infinite loop

		engine.processAction({
			type: ActionType.AllIn,
			playerId: current,
			timestamp: Date.now(),
		});
	}
};

describe('GameEngine – Edge-case & NLHE rule coverage', () => {
	beforeEach(() => {
		// Reset any existing mocks
		jest.resetAllMocks();
	});

	describe('Player management & hand start constraints', () => {
		it('should throw when starting a hand with fewer than two players', () => {
			const engine = new GameEngine('g1', createConfig());
			engine.addPlayer('p0', 'Alice', 1000);
			expect(() => engine.startHand()).toThrow('Need at least 2 players');
		});

		it('should prevent adding players once a hand is running', () => {
			const engine = new GameEngine('g2', createConfig());
			engine.addPlayer('p0', 'Alice', 1000);
			engine.addPlayer('p1', 'Bob', 1000);
			engine.startHand();

			expect(() => engine.addPlayer('p2', 'Charlie', 1000)).toThrow(
				'Cannot add players while game is running'
			);
		});
	});

	describe('Event emission & phase progression', () => {
		it('should emit expected sequence of events during a normal hand', () => {
			const events: string[] = [];
			const engine = new GameEngine('g3', createConfig());
			engine.onEvent((e) => events.push(e.type));

			// Add players & kick-off
			engine.addPlayer('p0', 'Alice', 1000);
			engine.addPlayer('p1', 'Bob', 1000);
			engine.startHand();

			// Exhaust hand quickly by forcing all players all-in
			exhaustHandWithAllIns(engine);

			// The engine should emit core lifecycle events — we test for a subset to avoid brittle ordering.
			expect(events).toEqual(
				expect.arrayContaining([
					'player_joined',
					'hand_started',
					'hole_cards_dealt',
					'blinds_posted',
				])
			);
			// Hand should have at least progressed beyond blinds without crashing
		});
	});

	describe('Side-pot distribution & winner determination', () => {
		it('should correctly distribute main & side pots in a multi-way all-in', () => {
			// Arrange predetermined hand strengths: p1 best, p0 middle, p2 worst
			const evalMap: Record<string, number> = { p1: 1000, p0: 500, p2: 100 };

			// Track order of evaluateHand invocations so we can attribute value to specific player
			let callIndex = 0;
			const ids: string[] = ['p0', 'p1', 'p2'];

			// Spy on the static evaluateHand method
			jest.spyOn(HandEvaluator, 'evaluateHand').mockImplementation(
				(_holeCards: any, _community: any) => {
					const pid = ids[callIndex++ % ids.length];
					return {
						rank: HandRank.HighCard,
						cards: [],
						kickers: [],
						value: evalMap[pid] ?? 0,
					};
				}
			);

			const engine = new GameEngine('g4', createConfig());

			// Add players with disparate stacks to produce side pots
			engine.addPlayer('p0', 'Alice', 100);
			engine.addPlayer('p1', 'Bob', 300);
			engine.addPlayer('p2', 'Charlie', 600);

			engine.startHand();

			// Push the hand through the pre-flop betting round
			exhaustHandWithAllIns(engine);

			// Allow engine's auto-advance logic to complete the hand
			expect(engine.isGameRunning()).toBe(false);

			const gs = engine.getGameState();

			// p1 (best hand) should end with more chips than starting + potential wins
			const p1 = gs.getPlayer('p1');
			const p0 = gs.getPlayer('p0');
			const p2 = gs.getPlayer('p2');

			if (!p0 || !p1 || !p2) throw new Error('Players not found');

			expect(p1.chipStack).toBeGreaterThan(300); // Winner profit
			expect(p0.chipStack).toBeGreaterThanOrEqual(0); // Bust or small return
			// Total chips conserved (1000 initial + blinds posting)
			const totalChips = p0.chipStack + p1.chipStack + p2.chipStack;
			expect(totalChips).toBe(1000); // No chips lost or created
		});
	});

	describe('Force-action timeout behaviour', () => {
		it('should auto-fold a player on timeout and continue the hand', () => {
			const engine = new GameEngine('g5', createConfig());
			engine.addPlayer('p0', 'Alice', 1000);
			engine.addPlayer('p1', 'Bob', 1000);
			engine.addPlayer('p2', 'Charlie', 1000);
			engine.startHand();

			const initialActingPlayer = engine.getGameState().currentPlayerToAct;
			if (!initialActingPlayer) throw new Error('No current player');

			// Trigger timeout on the first player to act
			engine.forcePlayerAction(initialActingPlayer);

			// The current player to act should advance to next player (no infinite loop)
			const newActingPlayer = engine.getGameState().currentPlayerToAct;
			expect(newActingPlayer).not.toBe(initialActingPlayer);
		});
	});
});
