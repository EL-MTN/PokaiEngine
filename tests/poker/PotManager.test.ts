import { Player } from '@/engine/poker/Player';
import { PotManager } from '@/engine/poker/PotManager';

describe('PotManager', () => {
	describe('Constructor and Reset', () => {
		it('should initialize with empty main pot', () => {
			const potManager = new PotManager();
			const pots = potManager.getPots();

			expect(pots).toHaveLength(1);
			expect(pots[0].amount).toBe(0);
			expect(pots[0].eligiblePlayers).toEqual([]);
			expect(pots[0].isMainPot).toBe(true);
			expect(potManager.getTotalPotAmount()).toBe(0);
		});

		it('should reset to initial state', () => {
			const potManager = new PotManager();

			// Add some bets and side pots
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 200);

			// Reset should clear everything
			potManager.reset();
			const pots = potManager.getPots();

			expect(pots).toHaveLength(1);
			expect(pots[0].amount).toBe(0);
			expect(pots[0].eligiblePlayers).toEqual([]);
			expect(pots[0].isMainPot).toBe(true);
		});
	});

	describe('Adding Bets', () => {
		let potManager: PotManager;

		beforeEach(() => {
			potManager = new PotManager();
		});

		it('should add a single bet correctly', () => {
			potManager.addBet('p1', 100);

			const pots = potManager.getPots();
			expect(pots[0].amount).toBe(100);
			expect(pots[0].eligiblePlayers).toContain('p1');
			expect(potManager.getTotalPotAmount()).toBe(100);
		});

		it('should add multiple bets from same player', () => {
			potManager.addBet('p1', 50);
			potManager.addBet('p1', 75);

			const pots = potManager.getPots();
			expect(pots[0].amount).toBe(125);
			expect(pots[0].eligiblePlayers).toEqual(['p1']); // Should not duplicate
		});

		it('should add bets from multiple players', () => {
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 150);
			potManager.addBet('p3', 200);

			const pots = potManager.getPots();
			expect(pots[0].amount).toBe(450);
			expect(pots[0].eligiblePlayers).toContain('p1');
			expect(pots[0].eligiblePlayers).toContain('p2');
			expect(pots[0].eligiblePlayers).toContain('p3');
		});

		it('should handle zero amount bets', () => {
			potManager.addBet('p1', 0);

			const pots = potManager.getPots();
			expect(pots[0].amount).toBe(0);
			expect(pots[0].eligiblePlayers).toContain('p1');
		});
	});

	describe('Basic Pot Retrieval', () => {
		let potManager: PotManager;

		beforeEach(() => {
			potManager = new PotManager();
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 150);
		});

		it('should get all pots', () => {
			const pots = potManager.getPots();
			expect(pots).toHaveLength(1);
			expect(pots[0].amount).toBe(250);
		});

		it('should get main pot', () => {
			const mainPot = potManager.getMainPot();
			expect(mainPot.isMainPot).toBe(true);
			expect(mainPot.amount).toBe(250);
		});

		it('should get side pots', () => {
			const sidePots = potManager.getSidePots();
			expect(sidePots).toHaveLength(0); // No side pots yet
		});

		it('should get pot count', () => {
			expect(potManager.getPotCount()).toBe(1);
		});

		it('should get total pot amount', () => {
			expect(potManager.getTotalPotAmount()).toBe(250);
		});
	});

	describe('Player Eligibility', () => {
		let potManager: PotManager;

		beforeEach(() => {
			potManager = new PotManager();
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 150);
		});

		it('should check player eligibility for pot', () => {
			expect(potManager.isPlayerEligibleForPot('p1', 0)).toBe(true);
			expect(potManager.isPlayerEligibleForPot('p2', 0)).toBe(true);
			expect(potManager.isPlayerEligibleForPot('p3', 0)).toBe(false);
		});

		it('should return false for invalid pot index', () => {
			expect(potManager.isPlayerEligibleForPot('p1', 5)).toBe(false);
		});

		it('should get eligible pot indices for player', () => {
			const p1Indices = potManager.getEligiblePotIndices('p1');
			const p2Indices = potManager.getEligiblePotIndices('p2');
			const p3Indices = potManager.getEligiblePotIndices('p3');

			expect(p1Indices).toEqual([0]);
			expect(p2Indices).toEqual([0]);
			expect(p3Indices).toEqual([]);
		});
	});

	describe('Side Pot Creation', () => {
		let potManager: PotManager;
		let players: Player[];

		beforeEach(() => {
			potManager = new PotManager();
			players = [
				new Player('p1', 'Alice', 1000),
				new Player('p2', 'Bob', 1000),
				new Player('p3', 'Charlie', 1000),
			];
		});

		it('should handle single player (no side pots needed)', () => {
			players[0].bet(100);
			players[1].fold();
			players[2].fold();

			potManager.addBet('p1', 100);
			potManager.createSidePots(players);

			expect(potManager.getPotCount()).toBe(1);
			expect(potManager.getMainPot().amount).toBe(100);
			expect(potManager.getMainPot().eligiblePlayers).toEqual(['p1']);
		});

		it('should handle equal bets (no side pots needed)', () => {
			players[0].bet(100);
			players[1].bet(100);
			players[2].bet(100);

			potManager.addBet('p1', 100);
			potManager.addBet('p2', 100);
			potManager.addBet('p3', 100);
			potManager.createSidePots(players);

			expect(potManager.getPotCount()).toBe(1);
			expect(potManager.getMainPot().amount).toBe(300);
			expect(potManager.getMainPot().eligiblePlayers).toHaveLength(3);
		});

		it('should create side pots for all-in scenario', () => {
			// Player 1 all-in for 50, Player 2 bets 100, Player 3 calls 100
			players[0].bet(50); // All-in
			players[1].bet(100);
			players[2].bet(100);

			potManager.addBet('p1', 50);
			potManager.addBet('p2', 100);
			potManager.addBet('p3', 100);
			potManager.createSidePots(players);

			const pots = potManager.getPots();
			expect(pots).toHaveLength(2);

			// Main pot: 50 * 3 = 150 (all three eligible)
			expect(pots[0].amount).toBe(150);
			expect(pots[0].eligiblePlayers).toHaveLength(3);
			expect(pots[0].isMainPot).toBe(true);

			// Side pot: 50 * 2 = 100 (only p2 and p3 eligible)
			expect(pots[1].amount).toBe(100);
			expect(pots[1].eligiblePlayers).toHaveLength(2);
			expect(pots[1].eligiblePlayers).toContain('p2');
			expect(pots[1].eligiblePlayers).toContain('p3');
			expect(pots[1].isMainPot).toBe(false);
		});

		it('should handle complex multiple all-in scenario', () => {
			// Add a fourth player for complexity
			const player4 = new Player('p4', 'David', 1000);
			players.push(player4);

			// p1: 25 (all-in), p2: 75 (all-in), p3: 150, p4: 150
			players[0].bet(25);
			players[1].bet(75);
			players[2].bet(150);
			players[3].bet(150);

			potManager.addBet('p1', 25);
			potManager.addBet('p2', 75);
			potManager.addBet('p3', 150);
			potManager.addBet('p4', 150);
			potManager.createSidePots(players);

			const pots = potManager.getPots();
			expect(pots).toHaveLength(3);

			// Main pot: 25 * 4 = 100 (all four eligible)
			expect(pots[0].amount).toBe(100);
			expect(pots[0].eligiblePlayers).toHaveLength(4);

			// Side pot 1: 50 * 3 = 150 (p2, p3, p4 eligible)
			expect(pots[1].amount).toBe(150);
			expect(pots[1].eligiblePlayers).toHaveLength(3);
			expect(pots[1].eligiblePlayers).not.toContain('p1');

			// Side pot 2: 75 * 2 = 150 (p3, p4 eligible)
			expect(pots[2].amount).toBe(150);
			expect(pots[2].eligiblePlayers).toHaveLength(2);
			expect(pots[2].eligiblePlayers).toContain('p3');
			expect(pots[2].eligiblePlayers).toContain('p4');
		});

		it('should exclude folded players from eligibility but keep their money', () => {
			players[0].bet(100);
			players[1].bet(100);
			players[2].bet(100);
			players[1].fold(); // Player 2 folds after betting

			potManager.addBet('p1', 100);
			potManager.addBet('p2', 100);
			potManager.addBet('p3', 100);
			potManager.createSidePots(players);

			const mainPot = potManager.getMainPot();
			expect(mainPot.amount).toBe(300); // All money stays in pot
			expect(mainPot.eligiblePlayers).toHaveLength(2); // Only p1 and p3 eligible
			expect(mainPot.eligiblePlayers).toContain('p1');
			expect(mainPot.eligiblePlayers).toContain('p3');
			expect(mainPot.eligiblePlayers).not.toContain('p2');
		});

		it('should handle mixed folded and all-in players', () => {
			players[0].bet(50); // All-in
			players[1].bet(100);
			players[2].bet(100);
			players[1].fold(); // Folds after betting

			potManager.addBet('p1', 50);
			potManager.addBet('p2', 100);
			potManager.addBet('p3', 100);
			potManager.createSidePots(players);

			const pots = potManager.getPots();
			expect(pots).toHaveLength(2);

			// Main pot: 50 * 3 = 150, but only p1 and p3 eligible
			expect(pots[0].amount).toBe(150);
			expect(pots[0].eligiblePlayers).toHaveLength(2);
			expect(pots[0].eligiblePlayers).toContain('p1');
			expect(pots[0].eligiblePlayers).toContain('p3');

			// Side pot: 50 * 2 = 100, but only p3 eligible (p2 folded)
			expect(pots[1].amount).toBe(100);
			expect(pots[1].eligiblePlayers).toEqual(['p3']);
		});
	});

	describe('Basic Pot Distribution', () => {
		let potManager: PotManager;

		beforeEach(() => {
			potManager = new PotManager();
		});

		it('should distribute single pot to single winner', () => {
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 100);

			const distributions = potManager.distributePots([
				{ playerId: 'p1', potIndices: [0] },
			]);

			expect(distributions).toHaveLength(1);
			expect(distributions[0].playerId).toBe('p1');
			expect(distributions[0].amount).toBe(200);
			expect(distributions[0].potIndex).toBe(0);
		});

		it('should split pot evenly between multiple winners', () => {
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 100);
			potManager.addBet('p3', 100);

			const distributions = potManager.distributePots([
				{ playerId: 'p1', potIndices: [0] },
				{ playerId: 'p2', potIndices: [0] },
			]);

			expect(distributions).toHaveLength(2);
			expect(distributions[0].amount).toBe(150); // 300 / 2
			expect(distributions[1].amount).toBe(150);
		});

		it('should handle odd chips in split pots', () => {
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 101); // Creates odd total

			const distributions = potManager.distributePots([
				{ playerId: 'p1', potIndices: [0] },
				{ playerId: 'p2', potIndices: [0] },
			]);

			expect(distributions).toHaveLength(2);
			// 201 / 2 = 100 remainder 1, first winner gets extra chip
			expect(distributions[0].amount).toBe(101);
			expect(distributions[1].amount).toBe(100);
		});

		it('should handle multiple pots with different winners', () => {
			const players = [
				new Player('p1', 'Alice', 1000),
				new Player('p2', 'Bob', 1000),
				new Player('p3', 'Charlie', 1000),
			];

			// Create side pot scenario
			players[0].bet(50);
			players[1].bet(100);
			players[2].bet(100);

			potManager.addBet('p1', 50);
			potManager.addBet('p2', 100);
			potManager.addBet('p3', 100);
			potManager.createSidePots(players);

			const distributions = potManager.distributePots([
				{ playerId: 'p1', potIndices: [0] }, // Wins main pot
				{ playerId: 'p2', potIndices: [1] }, // Wins side pot
			]);

			expect(distributions).toHaveLength(2);
			expect(distributions.find((d) => d.playerId === 'p1')?.amount).toBe(150); // Main pot
			expect(distributions.find((d) => d.playerId === 'p2')?.amount).toBe(100); // Side pot
		});

		it('should handle no eligible winners gracefully', () => {
			potManager.addBet('p1', 100);

			const distributions = potManager.distributePots([]);
			expect(distributions).toHaveLength(0);
		});
	});

	describe('Position-Based Pot Distribution', () => {
		let potManager: PotManager;

		beforeEach(() => {
			potManager = new PotManager();
		});

		it('should distribute with position-based odd chip allocation', () => {
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 101); // Creates odd total

			const distributions = potManager.distributePotsWithPosition([
				{ playerId: 'p1', potIndices: [0], position: 5 }, // Better position
				{ playerId: 'p2', potIndices: [0], position: 8 }, // Worse position
			]);

			expect(distributions).toHaveLength(2);
			// Player in worse position (higher number) gets odd chip first
			const p1Distribution = distributions.find((d) => d.playerId === 'p1');
			const p2Distribution = distributions.find((d) => d.playerId === 'p2');

			expect(p2Distribution?.amount).toBe(101); // Worse position gets odd chip
			expect(p1Distribution?.amount).toBe(100);
		});

		it('should handle multiple winners with different positions', () => {
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 100);
			potManager.addBet('p3', 102); // Creates 2 odd chips

			const distributions = potManager.distributePotsWithPosition([
				{ playerId: 'p1', potIndices: [0], position: 2 },
				{ playerId: 'p2', potIndices: [0], position: 5 },
				{ playerId: 'p3', potIndices: [0], position: 8 },
			]);

			expect(distributions).toHaveLength(3);
			// Total: 302, divided by 3 = 100 remainder 2
			// Worse positions get odd chips first
			const sortedByPosition = distributions.sort((a, b) => {
				const posA = a.playerId === 'p1' ? 2 : a.playerId === 'p2' ? 5 : 8;
				const posB = b.playerId === 'p1' ? 2 : b.playerId === 'p2' ? 5 : 8;
				return posB - posA; // Descending (worse first)
			});

			expect(sortedByPosition[0].amount).toBe(101); // Worst position
			expect(sortedByPosition[1].amount).toBe(101); // Second worst
			expect(sortedByPosition[2].amount).toBe(100); // Best position
		});
	});

	describe('Simulation Methods', () => {
		let potManager: PotManager;

		beforeEach(() => {
			potManager = new PotManager();
		});

		it('should simulate basic distribution', () => {
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 100);

			const result = potManager.simulateDistribution([
				{ playerId: 'p1', handStrength: 1000 }, // Higher hand
				{ playerId: 'p2', handStrength: 800 },
			]);

			expect(result.distributions).toHaveLength(1);
			expect(result.distributions[0].playerId).toBe('p1');
			expect(result.distributions[0].amount).toBe(200);
			expect(result.totalDistributed).toBe(200);
		});

		it('should simulate tied hands', () => {
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 100);

			const result = potManager.simulateDistribution([
				{ playerId: 'p1', handStrength: 1000 },
				{ playerId: 'p2', handStrength: 1000 }, // Same strength
			]);

			expect(result.distributions).toHaveLength(2);
			expect(result.distributions[0].amount).toBe(100);
			expect(result.distributions[1].amount).toBe(100);
			expect(result.totalDistributed).toBe(200);
		});

		it('should simulate with position-based odd chips', () => {
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 101); // Odd total

			const result = potManager.simulateDistributionWithPosition([
				{ playerId: 'p1', handStrength: 1000, position: 2 },
				{ playerId: 'p2', handStrength: 1000, position: 5 }, // Worse position
			]);

			expect(result.distributions).toHaveLength(2);
			expect(result.totalDistributed).toBe(201);

			// Player in worse position should get odd chip
			const p2Distribution = result.distributions.find(
				(d) => d.playerId === 'p2',
			);
			expect(p2Distribution?.amount).toBe(101);
		});

		it('should handle complex side pot simulation', () => {
			const players = [
				new Player('p1', 'Alice', 1000),
				new Player('p2', 'Bob', 1000),
				new Player('p3', 'Charlie', 1000),
			];

			// Create side pots
			players[0].bet(50);
			players[1].bet(100);
			players[2].bet(100);

			potManager.addBet('p1', 50);
			potManager.addBet('p2', 100);
			potManager.addBet('p3', 100);
			potManager.createSidePots(players);

			const result = potManager.simulateDistribution([
				{ playerId: 'p1', handStrength: 1000 }, // Best hand
				{ playerId: 'p2', handStrength: 800 },
				{ playerId: 'p3', handStrength: 600 },
			]);

			// p1 should win both main pot and be eligible for main pot only
			// p2 should win side pot as p1 is not eligible
			expect(result.totalDistributed).toBe(250);
			expect(result.distributions.length).toBeGreaterThan(0);
		});

		it('should throw error if pot cannot be distributed to anyone', () => {
			potManager.addBet('p1', 100);

			// Simulate with no eligible winners and no remaining players
			expect(() => {
				potManager.simulateDistribution(
					[
						{ playerId: 'p2', handStrength: 1000 }, // Not eligible for pot
					],
					[],
				); // No remaining players
			}).toThrow('has no eligible recipients');
		});

		it('should distribute to remaining eligible players when no winners match', () => {
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 100);

			// Simulate with no eligible winners in the winners array, but remaining players available
			const result = potManager.simulateDistribution(
				[
					{ playerId: 'p3', handStrength: 1000 }, // Not eligible for pot
				],
				['p1', 'p2'],
			); // But p1 and p2 are still in the game

			// Should distribute to p1 and p2 (both eligible for main pot)
			expect(result.distributions).toHaveLength(2);
			expect(result.distributions[0].amount).toBe(100);
			expect(result.distributions[1].amount).toBe(100);
			expect(result.totalDistributed).toBe(200);
		});
	});

	describe('Detailed Information', () => {
		let potManager: PotManager;

		beforeEach(() => {
			potManager = new PotManager();
		});

		it('should provide detailed pot information', () => {
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 150);

			const info = potManager.getDetailedPotInfo();

			expect(info.totalAmount).toBe(250);
			expect(info.potCount).toBe(1);
			expect(info.pots).toHaveLength(1);
			expect(info.pots[0].index).toBe(0);
			expect(info.pots[0].amount).toBe(250);
			expect(info.pots[0].eligiblePlayers).toContain('p1');
			expect(info.pots[0].eligiblePlayers).toContain('p2');
			expect(info.pots[0].isMainPot).toBe(true);
		});

		it('should provide detailed info for side pots', () => {
			const players = [
				new Player('p1', 'Alice', 1000),
				new Player('p2', 'Bob', 1000),
				new Player('p3', 'Charlie', 1000),
			];

			players[0].bet(50);
			players[1].bet(100);
			players[2].bet(100);

			potManager.addBet('p1', 50);
			potManager.addBet('p2', 100);
			potManager.addBet('p3', 100);
			potManager.createSidePots(players);

			const info = potManager.getDetailedPotInfo();

			expect(info.totalAmount).toBe(250);
			expect(info.potCount).toBe(2);
			expect(info.pots).toHaveLength(2);
			expect(info.pots[0].isMainPot).toBe(true);
			expect(info.pots[1].isMainPot).toBe(false);
		});
	});

	describe('Edge Cases and Error Handling', () => {
		let potManager: PotManager;

		beforeEach(() => {
			potManager = new PotManager();
		});

		it('should handle empty player list for side pot creation', () => {
			potManager.addBet('p1', 100);
			potManager.createSidePots([]);

			// Should rebuild main pot with no eligible players
			const mainPot = potManager.getMainPot();
			expect(mainPot.amount).toBe(100);
			expect(mainPot.eligiblePlayers).toEqual([]);
		});

		it('should handle all players folded', () => {
			const players = [
				new Player('p1', 'Alice', 1000),
				new Player('p2', 'Bob', 1000),
			];

			players[0].bet(100);
			players[1].bet(100);
			players[0].fold();
			players[1].fold();

			potManager.addBet('p1', 100);
			potManager.addBet('p2', 100);
			potManager.createSidePots(players);

			const mainPot = potManager.getMainPot();
			expect(mainPot.amount).toBe(200); // Money stays
			expect(mainPot.eligiblePlayers).toEqual([]); // No eligible winners
		});

		it('should handle zero bet amounts in side pot creation', () => {
			const players = [
				new Player('p1', 'Alice', 1000),
				new Player('p2', 'Bob', 1000),
			];

			// No bets made
			potManager.createSidePots(players);

			expect(potManager.getPotCount()).toBe(1);
			expect(potManager.getTotalPotAmount()).toBe(0);
		});

		it('should handle single eligible player', () => {
			const players = [
				new Player('p1', 'Alice', 1000),
				new Player('p2', 'Bob', 1000),
			];

			players[0].bet(100);
			players[1].fold();

			potManager.addBet('p1', 100);
			potManager.createSidePots(players);

			expect(potManager.getPotCount()).toBe(1);
			expect(potManager.getMainPot().eligiblePlayers).toEqual(['p1']);
		});

		it('should handle large number of players and complex side pots', () => {
			const players: Player[] = [];
			const betAmounts = [25, 50, 75, 100, 125, 150];

			for (let i = 0; i < 6; i++) {
				const player = new Player(`p${i + 1}`, `Player ${i + 1}`, 1000);
				player.bet(betAmounts[i]);
				players.push(player);
				potManager.addBet(`p${i + 1}`, betAmounts[i]);
			}

			potManager.createSidePots(players);

			expect(potManager.getPotCount()).toBe(6); // Should create multiple side pots
			expect(potManager.getTotalPotAmount()).toBe(525); // Sum of all bets
		});
	});

	describe('Integration with Player States', () => {
		let potManager: PotManager;

		beforeEach(() => {
			potManager = new PotManager();
		});

		it('should respect player eligibility states', () => {
			const players = [
				new Player('p1', 'Alice', 1000),
				new Player('p2', 'Bob', 1000),
				new Player('p3', 'Charlie', 1000),
			];

			// Set up various player states
			players[0].bet(100); // Normal bet
			players[1].bet(100); // Normal bet, then fold
			players[2].bet(50); // All-in

			players[1].fold(); // Fold after betting

			potManager.addBet('p1', 100);
			potManager.addBet('p2', 100);
			potManager.addBet('p3', 50);
			potManager.createSidePots(players);

			const pots = potManager.getPots();

			// This setup should create side pots due to different bet amounts
			expect(pots.length).toBeGreaterThan(1);

			// Verify main pot eligibility excludes folded players
			expect(pots[0].eligiblePlayers).toContain('p1');
			expect(pots[0].eligiblePlayers).not.toContain('p2'); // Folded
			expect(pots[0].eligiblePlayers).toContain('p3');

			// Verify side pot eligibility
			expect(pots[1].eligiblePlayers).toContain('p1');
			expect(pots[1].eligiblePlayers).not.toContain('p2'); // Folded
			expect(pots[1].eligiblePlayers).not.toContain('p3'); // Not enough bet
		});
	});
});
