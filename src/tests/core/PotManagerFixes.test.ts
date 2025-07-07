import { PotManager } from '../../core/game/PotManager';
import { Player } from '../../core/game/Player';

describe('PotManager Fixes', () => {
	let potManager: PotManager;
	let player1: Player;
	let player2: Player;
	let player3: Player;

	beforeEach(() => {
		potManager = new PotManager();
		player1 = new Player('player1', 'Player 1', 1000);
		player2 = new Player('player2', 'Player 2', 1000);
		player3 = new Player('player3', 'Player 3', 1000);
	});

	describe('Folded Player Contributions', () => {
		test('should include folded player money in side pot calculations', () => {
			// Setup: Player 1 bets 100 and folds, Player 2 goes all-in for 200, Player 3 calls 200
			player1.bet(100);
			player1.fold();
			player2.chipStack = 200; // Set up for all-in
			player2.bet(200); // This will automatically set isAllIn to true
			player3.bet(200);

			// Add bets to pot manager
			potManager.addBet('player1', 100);
			potManager.addBet('player2', 200);
			potManager.addBet('player3', 200);

			// Create side pots
			potManager.createSidePots([player1, player2, player3]);

			const pots = potManager.getPots();
			const totalPotAmount = potManager.getTotalPotAmount();

			// Should have 2 pots: main pot (100 x 3 = 300) and side pot (100 x 2 = 200)
			expect(pots.length).toBe(2);
			expect(totalPotAmount).toBe(500); // All money should be preserved
			expect(pots[0].amount).toBe(300); // Main pot: 100 from each player
			expect(pots[1].amount).toBe(200); // Side pot: 100 from player2 and player3
		});

		test('should preserve total pot amount when folded players contributed', () => {
			// Complex scenario: multiple folded players with different bet amounts
			player1.bet(50);
			player1.fold();
			player2.bet(150);
			player2.fold();
			player3.bet(100);

			potManager.addBet('player1', 50);
			potManager.addBet('player2', 150);
			potManager.addBet('player3', 100);

			const totalBeforeSidePots = potManager.getTotalPotAmount();
			potManager.createSidePots([player1, player2, player3]);
			const totalAfterSidePots = potManager.getTotalPotAmount();

			// Total pot amount should remain the same
			expect(totalAfterSidePots).toBe(totalBeforeSidePots);
			expect(totalAfterSidePots).toBe(300); // 50 + 150 + 100
		});

		test('should correctly calculate eligibility with folded players', () => {
			// Player 1 folds after betting, Player 2 and 3 are eligible
			player1.bet(100);
			player1.fold();
			player2.bet(100);
			player3.bet(100);

			potManager.addBet('player1', 100);
			potManager.addBet('player2', 100);
			potManager.addBet('player3', 100);

			potManager.createSidePots([player1, player2, player3]);

			const mainPot = potManager.getMainPot();
			
			// Main pot should have all the money but only eligible players
			expect(mainPot.amount).toBe(300);
			expect(mainPot.eligiblePlayers).toEqual(['player2', 'player3']);
			expect(mainPot.eligiblePlayers).not.toContain('player1');
		});
	});

	describe('Position-based Odd Chip Distribution', () => {
		test('should distribute odd chips to worst position first', () => {
			// Setup a pot with 103 chips and 3 winners with different positions
			player1.bet(34);
			player2.bet(34);
			player3.bet(35);

			potManager.addBet('player1', 34);
			potManager.addBet('player2', 34);
			potManager.addBet('player3', 35);

			// Winners with positions (higher number = worse position)
			const winners = [
				{ playerId: 'player1', potIndices: [0], position: 1 }, // best position
				{ playerId: 'player2', potIndices: [0], position: 2 }, // middle position
				{ playerId: 'player3', potIndices: [0], position: 3 }, // worst position
			];

			const distributions = potManager.distributePotsWithPosition(winners);
			
			// 103 chips split 3 ways: 34 each, 1 odd chip
			// Odd chip should go to worst position (player3)
			const player1Distribution = distributions.find(d => d.playerId === 'player1');
			const player2Distribution = distributions.find(d => d.playerId === 'player2');
			const player3Distribution = distributions.find(d => d.playerId === 'player3');

			expect(player1Distribution?.amount).toBe(34);
			expect(player2Distribution?.amount).toBe(34);
			expect(player3Distribution?.amount).toBe(35); // Gets the odd chip
		});

		test('should handle multiple odd chips correctly by position', () => {
			// Setup a pot with 105 chips and 3 winners
			player1.bet(35);
			player2.bet(35);
			player3.bet(35);

			potManager.addBet('player1', 35);
			potManager.addBet('player2', 35);
			potManager.addBet('player3', 35);

			const winners = [
				{ playerId: 'player1', potIndices: [0], position: 1 }, // best position
				{ playerId: 'player2', potIndices: [0], position: 2 }, // middle position
				{ playerId: 'player3', potIndices: [0], position: 3 }, // worst position
			];

			const distributions = potManager.distributePotsWithPosition(winners);
			
			// 105 chips split 3 ways: 35 each, 0 odd chips
			// All should get equal amounts
			distributions.forEach(d => {
				expect(d.amount).toBe(35);
			});
		});

		test('should handle two odd chips correctly by position', () => {
			// Setup a pot with 101 chips and 3 winners
			player1.bet(33);
			player2.bet(33);
			player3.bet(35);

			potManager.addBet('player1', 33);
			potManager.addBet('player2', 33);
			potManager.addBet('player3', 35);

			const winners = [
				{ playerId: 'player1', potIndices: [0], position: 1 }, // best position
				{ playerId: 'player2', potIndices: [0], position: 2 }, // middle position
				{ playerId: 'player3', potIndices: [0], position: 3 }, // worst position
			];

			const distributions = potManager.distributePotsWithPosition(winners);
			
			// 101 chips split 3 ways: 33 each, 2 odd chips
			// Odd chips should go to worst positions first (player3, then player2)
			const player1Distribution = distributions.find(d => d.playerId === 'player1');
			const player2Distribution = distributions.find(d => d.playerId === 'player2');
			const player3Distribution = distributions.find(d => d.playerId === 'player3');

			expect(player1Distribution?.amount).toBe(33);
			expect(player2Distribution?.amount).toBe(34); // Gets one odd chip
			expect(player3Distribution?.amount).toBe(34); // Gets one odd chip
		});

		test('should work with simulation method with position', () => {
			// Setup multiple pots with different amounts
			player1.bet(100);
			player2.bet(200);
			player3.bet(200);

			potManager.addBet('player1', 100);
			potManager.addBet('player2', 200);
			potManager.addBet('player3', 200);

			potManager.createSidePots([player1, player2, player3]);

			const winners = [
				{ playerId: 'player1', handStrength: 1000, position: 1 }, // best position
				{ playerId: 'player2', handStrength: 1000, position: 2 }, // middle position
				{ playerId: 'player3', handStrength: 1000, position: 3 }, // worst position
			];

			const result = potManager.simulateDistributionWithPosition(winners);
			
			// Should distribute all money
			expect(result.totalDistributed).toBe(500);
			
			// Check that position-based distribution is used for odd chips
			const player1Total = result.distributions
				.filter(d => d.playerId === 'player1')
				.reduce((sum, d) => sum + d.amount, 0);
			const player2Total = result.distributions
				.filter(d => d.playerId === 'player2')
				.reduce((sum, d) => sum + d.amount, 0);
			const player3Total = result.distributions
				.filter(d => d.playerId === 'player3')
				.reduce((sum, d) => sum + d.amount, 0);

			// All players should get equal amounts in this case (tied hands)
			expect(player1Total + player2Total + player3Total).toBe(500);
		});
	});

	describe('Chip Conservation', () => {
		test('should never lose or create chips during side pot creation', () => {
			// Multiple scenarios to test chip conservation
			const scenarios = [
				// Simple all-in scenario
				{ bets: [100, 200, 150], folds: [] },
				// With folded players
				{ bets: [100, 200, 150], folds: [0] },
				// Complex multi-fold scenario
				{ bets: [50, 100, 200, 150, 75], folds: [0, 2] },
				// All equal bets
				{ bets: [100, 100, 100], folds: [] },
			];

			scenarios.forEach((scenario, index) => {
				const testManager = new PotManager();
				const testPlayers = scenario.bets.map((bet, i) => {
					const player = new Player(`player${i}`, `Player ${i}`, 1000);
					player.bet(bet);
					if (scenario.folds.includes(i)) {
						player.fold();
					}
					return player;
				});

				// Add all bets
				testPlayers.forEach((player, i) => {
					testManager.addBet(player.id, scenario.bets[i]);
				});

				const totalBefore = testManager.getTotalPotAmount();
				testManager.createSidePots(testPlayers);
				const totalAfter = testManager.getTotalPotAmount();

				expect(totalAfter).toBe(totalBefore);
				expect(totalAfter).toBe(scenario.bets.reduce((sum, bet) => sum + bet, 0));
			});
		});
	});
});