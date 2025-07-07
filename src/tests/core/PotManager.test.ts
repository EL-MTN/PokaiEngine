import { PotManager } from '../../core/game/PotManager';
import { Player } from '../../core/game/Player';
import { Card } from '../../core/cards/Card';
import { Rank, Suit } from '../../types';

describe('PotManager - Comprehensive Side Pot Tests', () => {
	let potManager: PotManager;
	let players: Player[];

	beforeEach(() => {
		potManager = new PotManager();
		players = [];
	});

	const createPlayer = (id: string, chipStack: number, isAllIn = false, isFolded = false): Player => {
		const player = new Player(id, `Player ${id}`, chipStack);
		if (isAllIn) {
			player.chipStack = 0;
			player.isAllIn = true;
		}
		if (isFolded) {
			player.fold(); // Use the fold method to properly set the player as folded
		}
		// Give each player some cards for testing
		player.holeCards = [
			new Card(Suit.Hearts, Rank.Ace),
			new Card(Suit.Diamonds, Rank.King)
		];
		return player;
	};

	describe('Basic Pot Management', () => {
		test('should initialize with empty main pot', () => {
			expect(potManager.getTotalPotAmount()).toBe(0);
			expect(potManager.getPotCount()).toBe(1);
			expect(potManager.getMainPot().amount).toBe(0);
			expect(potManager.getMainPot().isMainPot).toBe(true);
		});

		test('should add bets to main pot', () => {
			potManager.addBet('player1', 100);
			potManager.addBet('player2', 100);

			expect(potManager.getTotalPotAmount()).toBe(200);
			expect(potManager.getMainPot().amount).toBe(200);
			expect(potManager.getMainPot().eligiblePlayers).toContain('player1');
			expect(potManager.getMainPot().eligiblePlayers).toContain('player2');
		});

		test('should reset pot manager correctly', () => {
			potManager.addBet('player1', 100);
			potManager.addBet('player2', 100);
			
			potManager.reset();
			
			expect(potManager.getTotalPotAmount()).toBe(0);
			expect(potManager.getPotCount()).toBe(1);
			expect(potManager.getMainPot().eligiblePlayers).toHaveLength(0);
		});
	});

	describe('2-Player All-In Scenarios', () => {
		test('should handle equal stack all-in (no side pot)', () => {
			const player1 = createPlayer('p1', 0, true);
			const player2 = createPlayer('p2', 0, true);
			player1.totalBetThisHand = 1000;
			player2.totalBetThisHand = 1000;
			
			potManager.addBet('p1', 1000);
			potManager.addBet('p2', 1000);
			
			potManager.createSidePots([player1, player2]);
			
			expect(potManager.getPotCount()).toBe(1);
			expect(potManager.getTotalPotAmount()).toBe(2000);
			expect(potManager.getMainPot().amount).toBe(2000);
			expect(potManager.getMainPot().eligiblePlayers).toHaveLength(2);
		});

		test('should create side pot when one player has fewer chips', () => {
			const player1 = createPlayer('p1', 0, true);
			const player2 = createPlayer('p2', 500);
			player1.totalBetThisHand = 500;
			player2.totalBetThisHand = 1000;
			
			// Player 1 all-in with 500, player 2 calls with 1000
			potManager.addBet('p1', 500);
			potManager.addBet('p2', 1000);
			
			potManager.createSidePots([player1, player2]);
			
			expect(potManager.getPotCount()).toBe(2);
			expect(potManager.getTotalPotAmount()).toBe(1500);
			
			// Main pot: 500 from each player = 1000
			const mainPot = potManager.getPots()[0];
			expect(mainPot.amount).toBe(1000);
			expect(mainPot.eligiblePlayers).toContain('p1');
			expect(mainPot.eligiblePlayers).toContain('p2');
			
			// Side pot: extra 500 from player 2
			const sidePot = potManager.getPots()[1];
			expect(sidePot.amount).toBe(500);
			expect(sidePot.eligiblePlayers).toContain('p2');
			expect(sidePot.eligiblePlayers).not.toContain('p1');
		});

		test('should handle all-in with folded player', () => {
			const player1 = createPlayer('p1', 0, true);
			const player2 = createPlayer('p2', 1000);
			const player3 = createPlayer('p3', 0, false, true); // folded
			player1.totalBetThisHand = 500;
			player2.totalBetThisHand = 500;
			player3.totalBetThisHand = 100; // bet before folding
			
			// Verify player3 is actually folded
			expect(player3.isFolded).toBe(true);
			expect(player3.isEligibleForPot()).toBe(false);
			
			potManager.addBet('p1', 500);
			potManager.addBet('p2', 500);
			potManager.addBet('p3', 100);
			
			potManager.createSidePots([player1, player2, player3]);
			
			// Fixed: Correct poker behavior preserves folded player's money and creates proper side pots
			expect(potManager.getPotCount()).toBe(2); // Main pot + side pot due to different bet amounts
			expect(potManager.getTotalPotAmount()).toBe(1100); // All money stays in pot
			const pots = potManager.getPots();
			// All pots should preserve the money but only eligible players can win
			expect(pots.every(pot => !pot.eligiblePlayers.includes('p3'))).toBe(true); // Folded player can't win any pot
		});
	});

	describe('Multi-Player (3+) All-In Scenarios', () => {
		test('should handle 3-player cascading all-ins', () => {
			const player1 = createPlayer('p1', 0, true);
			const player2 = createPlayer('p2', 0, true);
			const player3 = createPlayer('p3', 0);
			player1.totalBetThisHand = 100;
			player2.totalBetThisHand = 300;
			player3.totalBetThisHand = 500;
			
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 300);
			potManager.addBet('p3', 500);
			
			potManager.createSidePots([player1, player2, player3]);
			
			expect(potManager.getPotCount()).toBe(3);
			expect(potManager.getTotalPotAmount()).toBe(900);
			
			const pots = potManager.getPots();
			
			// First pot: 100 from each = 300
			expect(pots[0].amount).toBe(300);
			expect(pots[0].eligiblePlayers).toHaveLength(3);
			
			// Second pot: 200 from p2 and p3 = 400
			expect(pots[1].amount).toBe(400);
			expect(pots[1].eligiblePlayers).toHaveLength(2);
			expect(pots[1].eligiblePlayers).toContain('p2');
			expect(pots[1].eligiblePlayers).toContain('p3');
			
			// Third pot: 200 from p3 only = 200
			expect(pots[2].amount).toBe(200);
			expect(pots[2].eligiblePlayers).toHaveLength(1);
			expect(pots[2].eligiblePlayers).toContain('p3');
		});

		test('should handle 5-player complex all-in scenario', () => {
			const players = [
				createPlayer('p1', 0, true),
				createPlayer('p2', 0, true),
				createPlayer('p3', 0, true),
				createPlayer('p4', 100),
				createPlayer('p5', 0, false, true), // folded
			];
			
			players[0].totalBetThisHand = 50;
			players[1].totalBetThisHand = 150;
			players[2].totalBetThisHand = 150;
			players[3].totalBetThisHand = 400;
			players[4].totalBetThisHand = 25; // folded after betting
			
			potManager.addBet('p1', 50);
			potManager.addBet('p2', 150);
			potManager.addBet('p3', 150);
			potManager.addBet('p4', 400);
			potManager.addBet('p5', 25);
			
			potManager.createSidePots(players);
			
			const pots = potManager.getPots();
			// Fixed: When createSidePots is called, it preserves all money including from folded players
			// The total from addBet calls was 775, and after createSidePots, all money is preserved
			expect(potManager.getTotalPotAmount()).toBe(775); // All money including folded players' bets
			
			// Verify pot structure (Fixed: now includes folded players' contributions)
			// Pot structure: p1:50, p2:150, p3:200, p4:350, p5:25(folded)
			// First pot: 25 from all 5 players = 125 (p5 not eligible)
			expect(pots[0].amount).toBe(125);
			expect(pots[0].eligiblePlayers).toHaveLength(4);
			expect(pots[0].eligiblePlayers).not.toContain('p5');
			
			// Second pot: (50-25) from p1,p2,p3,p4 = 100
			expect(pots[1].amount).toBe(100);
			expect(pots[1].eligiblePlayers).toHaveLength(4);
			expect(pots[1].eligiblePlayers).not.toContain('p5');
			
			// Third pot: (150-50) from p2,p3,p4 = 300  
			expect(pots[2].amount).toBe(300);
			expect(pots[2].eligiblePlayers).toHaveLength(3);
			expect(pots[2].eligiblePlayers).toContain('p4');
		});

		test('should handle all players all-in except one', () => {
			const players = [
				createPlayer('p1', 0, true),
				createPlayer('p2', 0, true),
				createPlayer('p3', 0, true),
				createPlayer('p4', 5000), // Big stack
			];
			
			players[0].totalBetThisHand = 100;
			players[1].totalBetThisHand = 250;
			players[2].totalBetThisHand = 400;
			players[3].totalBetThisHand = 400; // Calls largest all-in
			
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 250);
			potManager.addBet('p3', 400);
			potManager.addBet('p4', 400);
			
			potManager.createSidePots(players);
			
			const pots = potManager.getPots();
			expect(potManager.getPotCount()).toBe(3);
			expect(potManager.getTotalPotAmount()).toBe(1150);
			
			// All pots should include the big stack player
			pots.forEach(pot => {
				expect(pot.eligiblePlayers).toContain('p4');
			});
		});
	});

	describe('Pot Distribution with Ties', () => {
		test('should split pot evenly between two tied winners', () => {
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 100);
			
			const winners = [
				{ playerId: 'p1', potIndices: [0] },
				{ playerId: 'p2', potIndices: [0] }
			];
			
			const distributions = potManager.distributePots(winners);
			
			expect(distributions).toHaveLength(2);
			expect(distributions[0].amount).toBe(100);
			expect(distributions[1].amount).toBe(100);
			expect(distributions[0].amount + distributions[1].amount).toBe(200);
		});

		test('should handle odd chip distribution in ties', () => {
			potManager.addBet('p1', 101);
			potManager.addBet('p2', 101);
			potManager.addBet('p3', 101);
			
			const winners = [
				{ playerId: 'p1', potIndices: [0] },
				{ playerId: 'p2', potIndices: [0] }
			];
			
			const distributions = potManager.distributePots(winners);
			
			// 303 total, split between 2 = 151 + 152
			expect(distributions[0].amount).toBe(152); // First player gets extra chip
			expect(distributions[1].amount).toBe(151);
			expect(distributions[0].amount + distributions[1].amount).toBe(303);
		});

		test('should distribute multiple pots with different winners', () => {
			const player1 = createPlayer('p1', 0, true);
			const player2 = createPlayer('p2', 0, true);
			const player3 = createPlayer('p3', 1000);
			player1.totalBetThisHand = 100;
			player2.totalBetThisHand = 300;
			player3.totalBetThisHand = 300;
			
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 300);
			potManager.addBet('p3', 300);
			
			potManager.createSidePots([player1, player2, player3]);
			
			// P1 wins main pot, P2 and P3 tie for side pot
			const winners = [
				{ playerId: 'p1', potIndices: [0] },
				{ playerId: 'p2', potIndices: [1] },
				{ playerId: 'p3', potIndices: [1] }
			];
			
			const distributions = potManager.distributePots(winners);
			
			// P1 gets the main pot (300)
			const p1Distribution = distributions.find(d => d.playerId === 'p1');
			expect(p1Distribution?.amount).toBe(300);
			
			// P2 and P3 split the side pot (400 / 2 = 200 each)
			const p2Distribution = distributions.find(d => d.playerId === 'p2');
			const p3Distribution = distributions.find(d => d.playerId === 'p3');
			expect(p2Distribution?.amount).toBe(200);
			expect(p3Distribution?.amount).toBe(200);
		});
	});

	describe('Pot Eligibility and Player Actions', () => {
		test('should correctly determine pot eligibility', () => {
			const player1 = createPlayer('p1', 0, true);
			const player2 = createPlayer('p2', 0, true);
			const player3 = createPlayer('p3', 500);
			player1.totalBetThisHand = 100;
			player2.totalBetThisHand = 200;
			player3.totalBetThisHand = 300;
			
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 200);
			potManager.addBet('p3', 300);
			
			potManager.createSidePots([player1, player2, player3]);
			
			// Check eligibility
			expect(potManager.isPlayerEligibleForPot('p1', 0)).toBe(true);
			expect(potManager.isPlayerEligibleForPot('p1', 1)).toBe(false);
			expect(potManager.isPlayerEligibleForPot('p1', 2)).toBe(false);
			
			expect(potManager.isPlayerEligibleForPot('p2', 0)).toBe(true);
			expect(potManager.isPlayerEligibleForPot('p2', 1)).toBe(true);
			expect(potManager.isPlayerEligibleForPot('p2', 2)).toBe(false);
			
			expect(potManager.isPlayerEligibleForPot('p3', 0)).toBe(true);
			expect(potManager.isPlayerEligibleForPot('p3', 1)).toBe(true);
			expect(potManager.isPlayerEligibleForPot('p3', 2)).toBe(true);
		});

		test('should get eligible pot indices for players', () => {
			const player1 = createPlayer('p1', 0, true);
			const player2 = createPlayer('p2', 0, true);
			const player3 = createPlayer('p3', 500);
			player1.totalBetThisHand = 50;
			player2.totalBetThisHand = 150;
			player3.totalBetThisHand = 300;
			
			potManager.addBet('p1', 50);
			potManager.addBet('p2', 150);
			potManager.addBet('p3', 300);
			
			potManager.createSidePots([player1, player2, player3]);
			
			expect(potManager.getEligiblePotIndices('p1')).toEqual([0]);
			expect(potManager.getEligiblePotIndices('p2')).toEqual([0, 1]);
			expect(potManager.getEligiblePotIndices('p3')).toEqual([0, 1, 2]);
		});

		test('should simulate distribution correctly', () => {
			const player1 = createPlayer('p1', 0, true);
			const player2 = createPlayer('p2', 0, true);
			const player3 = createPlayer('p3', 1000);
			player1.totalBetThisHand = 100;
			player2.totalBetThisHand = 300;
			player3.totalBetThisHand = 300;
			
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 300);
			potManager.addBet('p3', 300);
			
			potManager.createSidePots([player1, player2, player3]);
			
			// Simulate with P3 having best hand, P2 second, P1 worst
			const winners = [
				{ playerId: 'p3', handStrength: 100 },
				{ playerId: 'p2', handStrength: 50 },
				{ playerId: 'p1', handStrength: 10 }
			];
			
			const { distributions, totalDistributed } = potManager.simulateDistribution(winners);
			
			expect(totalDistributed).toBe(700);
			
			// P3 should win both pots they're eligible for
			const p3Winnings = distributions
				.filter(d => d.playerId === 'p3')
				.reduce((sum, d) => sum + d.amount, 0);
			expect(p3Winnings).toBe(700); // Wins both pots (main pot 300 + side pot 400)
			
			// P2 and P1 get nothing (worse hands)
			const p2Winnings = distributions
				.filter(d => d.playerId === 'p2')
				.reduce((sum, d) => sum + d.amount, 0);
			expect(p2Winnings).toBe(0);
			
			const p1Winnings = distributions
				.filter(d => d.playerId === 'p1')
				.reduce((sum, d) => sum + d.amount, 0);
			expect(p1Winnings).toBe(0);
		});
	});

	describe('Edge Cases and Error Handling', () => {
		test('should handle zero bet amounts', () => {
			const player1 = createPlayer('p1', 1000);
			const player2 = createPlayer('p2', 1000);
			player1.totalBetThisHand = 0;
			player2.totalBetThisHand = 0;
			
			potManager.createSidePots([player1, player2]);
			
			expect(potManager.getPotCount()).toBe(1);
			expect(potManager.getTotalPotAmount()).toBe(0);
		});

		test('should handle single player scenario', () => {
			const player1 = createPlayer('p1', 1000);
			player1.totalBetThisHand = 100;
			
			potManager.addBet('p1', 100);
			potManager.createSidePots([player1]);
			
			expect(potManager.getPotCount()).toBe(1);
			expect(potManager.getTotalPotAmount()).toBe(100);
		});

		test('should provide detailed pot info', () => {
			const player1 = createPlayer('p1', 0, true);
			const player2 = createPlayer('p2', 500);
			player1.totalBetThisHand = 100;
			player2.totalBetThisHand = 200;
			
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 200);
			
			potManager.createSidePots([player1, player2]);
			
			const detailedInfo = potManager.getDetailedPotInfo();
			
			expect(detailedInfo.totalAmount).toBe(300);
			expect(detailedInfo.potCount).toBe(2);
			expect(detailedInfo.pots).toHaveLength(2);
			expect(detailedInfo.pots[0].isMainPot).toBe(true);
			expect(detailedInfo.pots[1].isMainPot).toBe(false);
		});

		test('should throw error when pot cannot be distributed', () => {
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 100);
			
			// Try to simulate distribution with no eligible winners
			const winners = [
				{ playerId: 'p3', handStrength: 100 } // p3 never bet
			];
			
			expect(() => {
				potManager.simulateDistribution(winners);
			}).toThrow('Pot 0 with amount 200 was not distributed');
		});
	});

	describe('Complex Real-World Scenarios', () => {
		test('should handle tournament bubble with multiple all-ins', () => {
			// Simulating a tournament bubble situation
			const players = [
				createPlayer('bigstack', 10000),
				createPlayer('medium1', 0, true),
				createPlayer('medium2', 0, true),
				createPlayer('shortstack', 0, true),
			];
			
			players[0].totalBetThisHand = 3000;
			players[1].totalBetThisHand = 2500;
			players[2].totalBetThisHand = 2000;
			players[3].totalBetThisHand = 500;
			
			potManager.addBet('bigstack', 3000);
			potManager.addBet('medium1', 2500);
			potManager.addBet('medium2', 2000);
			potManager.addBet('shortstack', 500);
			
			potManager.createSidePots(players);
			
			const pots = potManager.getPots();
			expect(pots).toHaveLength(4);
			
			// Verify chip conservation
			const totalInPots = potManager.getTotalPotAmount();
			expect(totalInPots).toBe(8000);
			
			// Short stack can only win first pot
			expect(potManager.getEligiblePotIndices('shortstack')).toEqual([0]);
			
			// Big stack eligible for all pots
			expect(potManager.getEligiblePotIndices('bigstack')).toEqual([0, 1, 2, 3]);
		});

		test('should handle pre-flop, flop, turn, river betting with all-ins', () => {
			const players = [
				createPlayer('p1', 500),
				createPlayer('p2', 1000),
				createPlayer('p3', 2000),
			];
			
			// Pre-flop betting
			potManager.addBet('p1', 100);
			potManager.addBet('p2', 100);
			potManager.addBet('p3', 100);
			
			// Flop - p1 goes all-in
			potManager.addBet('p1', 400); // All-in
			potManager.addBet('p2', 400);
			potManager.addBet('p3', 400);
			
			// Turn - p2 goes all-in
			potManager.addBet('p2', 500); // All-in
			potManager.addBet('p3', 500);
			
			// River - p3 bets more
			potManager.addBet('p3', 500);
			
			// Update player states
			players[0].totalBetThisHand = 500;
			players[0].chipStack = 0;
			players[0].isAllIn = true;
			
			players[1].totalBetThisHand = 1000;
			players[1].chipStack = 0;
			players[1].isAllIn = true;
			
			players[2].totalBetThisHand = 1500;
			players[2].chipStack = 500;
			
			potManager.createSidePots(players);
			
			const pots = potManager.getPots();
			expect(pots).toHaveLength(3);
			
			// Main pot: 500 * 3 = 1500
			expect(pots[0].amount).toBe(1500);
			expect(pots[0].eligiblePlayers).toHaveLength(3);
			
			// Side pot 1: 500 * 2 = 1000
			expect(pots[1].amount).toBe(1000);
			expect(pots[1].eligiblePlayers).toHaveLength(2);
			
			// Side pot 2: 500
			expect(pots[2].amount).toBe(500);
			expect(pots[2].eligiblePlayers).toHaveLength(1);
		});
	});
});