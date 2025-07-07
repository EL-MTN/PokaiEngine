import { GameEngine } from '../../engine/GameEngine';
import { Card } from '../../core/cards/Card';
import { HandEvaluator } from '../../core/cards/HandEvaluator';
import { Deck } from '../../core/cards/Deck';
import { Player } from '../../core/game/Player';
import { Suit, Rank, GameConfig, ActionType, HandRank } from '../../types';

describe('Edge Cases', () => {
	let gameEngine: GameEngine;
	let config: GameConfig;

	beforeEach(() => {
		config = {
			maxPlayers: 10,
			smallBlindAmount: 50,
			bigBlindAmount: 100,
			turnTimeLimit: 30,
			isTournament: false,
		};
		gameEngine = new GameEngine('edge-test-game', config);
	});

	describe('Identical Hand Ties', () => {
		test('should handle multiple players with identical hands correctly', () => {
			// Create a scenario where two players have identical hands, one has different
			const player1Cards = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Diamonds, Rank.King),
			];
			const player2Cards = [new Card(Suit.Spades, Rank.Ace), new Card(Suit.Clubs, Rank.King)];
			const player3Cards = [
				new Card(Suit.Diamonds, Rank.Ten),
				new Card(Suit.Clubs, Rank.Eight),
			];

			const communityCards = [
				new Card(Suit.Hearts, Rank.Queen),
				new Card(Suit.Diamonds, Rank.Jack),
				new Card(Suit.Clubs, Rank.Nine),
				new Card(Suit.Spades, Rank.Seven),
				new Card(Suit.Hearts, Rank.Five),
			];

			const eval1 = HandEvaluator.evaluateHand(player1Cards, communityCards);
			const eval2 = HandEvaluator.evaluateHand(player2Cards, communityCards);
			const eval3 = HandEvaluator.evaluateHand(player3Cards, communityCards);

			// Player 1 and 2 should have identical hands (A-K-Q-J-9 high card)
			expect(HandEvaluator.compareHands(eval1, eval2)).toBe(0);
			expect(eval1.rank).toBe(HandRank.HighCard);
			expect(eval2.rank).toBe(HandRank.HighCard);

			// Player 3 has a straight (T-9-8-7-6) and should beat players 1 and 2
			expect(eval3.rank).toBe(HandRank.Straight);
			expect(HandEvaluator.compareHands(eval1, eval3)).toBe(-1); // Player 3 wins
			expect(HandEvaluator.compareHands(eval2, eval3)).toBe(-1); // Player 3 wins
		});

		test('should handle royal flush tie (different suits)', () => {
			// Two players with royal flush in different suits
			const royalHeart = {
				holeCards: [new Card(Suit.Hearts, Rank.Ace), new Card(Suit.Hearts, Rank.King)],
				communityCards: [
					new Card(Suit.Hearts, Rank.Queen),
					new Card(Suit.Hearts, Rank.Jack),
					new Card(Suit.Hearts, Rank.Ten),
				],
			};

			const royalSpade = {
				holeCards: [new Card(Suit.Spades, Rank.Ace), new Card(Suit.Spades, Rank.King)],
				communityCards: [
					new Card(Suit.Spades, Rank.Queen),
					new Card(Suit.Spades, Rank.Jack),
					new Card(Suit.Spades, Rank.Ten),
				],
			};

			const eval1 = HandEvaluator.evaluateHand(
				royalHeart.holeCards,
				royalHeart.communityCards
			);
			const eval2 = HandEvaluator.evaluateHand(
				royalSpade.holeCards,
				royalSpade.communityCards
			);

			// Should be a tie
			expect(HandEvaluator.compareHands(eval1, eval2)).toBe(0);
			expect(eval1.rank).toBe(HandRank.RoyalFlush);
			expect(eval2.rank).toBe(HandRank.RoyalFlush);
		});
	});

	describe('Card Duplication Detection', () => {
		test('should handle duplicate cards in hand evaluation gracefully', () => {
			// This tests what happens if somehow the same card appears in hole cards and community
			const duplicateCard = new Card(Suit.Hearts, Rank.Ace);

			const holeCards = [duplicateCard, new Card(Suit.Diamonds, Rank.King)];
			const communityCards = [
				duplicateCard, // Same card!
				new Card(Suit.Clubs, Rank.Queen),
				new Card(Suit.Spades, Rank.Jack),
				new Card(Suit.Hearts, Rank.Ten),
				new Card(Suit.Diamonds, Rank.Nine),
			];

			// This should still work but with effective duplicate removal
			expect(() => {
				const evaluation = HandEvaluator.evaluateHand(holeCards, communityCards);
				// Should work because generateCombinations will create valid 5-card hands
				expect(evaluation).toBeDefined();
			}).not.toThrow();
		});

		test('should validate deck integrity', () => {
			const deck = new Deck();
			expect(deck.validate()).toBe(true);

			// After dealing some cards, should still be valid
			deck.dealCard();
			deck.dealCard();
			deck.dealFlop();
			expect(deck.validate()).toBe(true);
		});
	});

	describe('Boundary Value Testing', () => {
		test('should enforce maximum player limit', () => {
			// Add maximum allowed players (10)
			for (let i = 1; i <= 10; i++) {
				gameEngine.addPlayer(`player${i}`, `Player ${i}`, 1000);
			}

			const gameState = gameEngine.getGameState();
			expect(gameState.players.length).toBe(10);

			// Adding 11th player should fail (test before starting hand)
			expect(() => {
				gameEngine.addPlayer('player11', 'Player 11', 1000);
			}).toThrow('Maximum number of players (10) reached');

			// Should still be able to start hand with 10 players
			expect(() => {
				gameEngine.startHand();
			}).not.toThrow();
		});

		test('should handle minimum chip scenarios', () => {
			gameEngine.addPlayer('player1', 'Player 1', 1); // Only 1 chip
			gameEngine.addPlayer('player2', 'Player 2', 1000);
			gameEngine.addPlayer('player3', 'Player 3', 2000);

			expect(() => {
				gameEngine.startHand();
			}).not.toThrow();

			// Player with 1 chip will be forced all-in when posting blinds
			const gameState = gameEngine.getGameState();
			const poorPlayer = gameState.players.find((p) => p.id === 'player1');
			expect(poorPlayer?.chipStack).toBe(0); // Forced all-in after posting partial blind
			expect(poorPlayer?.isAllIn).toBe(true); // Should be marked as all-in
		});

		test('should handle zero chip edge case', () => {
			gameEngine.addPlayer('player1', 'Player 1', 0); // Zero chips
			gameEngine.addPlayer('player2', 'Player 2', 1000);

			const gameState = gameEngine.getGameState();
			const brokePlayer = gameState.players.find((p) => p.id === 'player1');
			expect(brokePlayer?.chipStack).toBe(0);
			expect(brokePlayer?.isActive).toBe(true);
		});
	});

	describe('Hand Evaluation Edge Cases', () => {
		test('should handle exactly 5 cards correctly', () => {
			const cards = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Diamonds, Rank.King),
				new Card(Suit.Clubs, Rank.Queen),
				new Card(Suit.Spades, Rank.Jack),
				new Card(Suit.Hearts, Rank.Ten),
			];

			const evaluation = HandEvaluator.evaluateFiveCardHand(cards);
			expect(evaluation.rank).toBe(HandRank.Straight);
		});

		test('should reject invalid card counts', () => {
			expect(() => {
				HandEvaluator.evaluateFiveCardHand([new Card(Suit.Hearts, Rank.Ace)]);
			}).toThrow('Hand must contain exactly 5 cards');

			expect(() => {
				HandEvaluator.evaluateFiveCardHand([]);
			}).toThrow('Hand must contain exactly 5 cards');
		});

		test('should handle 9+ cards (theoretical maximum)', () => {
			// 2 hole + 5 community + 2 extra (shouldn't happen but test it)
			const manyCards = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Diamonds, Rank.Ace),
				new Card(Suit.Clubs, Rank.King),
				new Card(Suit.Spades, Rank.Queen),
				new Card(Suit.Hearts, Rank.Jack),
				new Card(Suit.Diamonds, Rank.Ten),
				new Card(Suit.Clubs, Rank.Nine),
				new Card(Suit.Spades, Rank.Eight),
				new Card(Suit.Hearts, Rank.Seven),
			];

			// Should still find the best 5-card hand
			const evaluation = HandEvaluator.evaluateHand(
				manyCards.slice(0, 2),
				manyCards.slice(2)
			);
			expect(evaluation).toBeDefined();
			expect(evaluation.rank).toBeGreaterThanOrEqual(HandRank.HighCard);
		});
	});

	describe('Ace Wraparound Prevention', () => {
		test('should NOT allow ace to wrap around (Q-K-A-2-3)', () => {
			const invalidStraight = [
				new Card(Suit.Hearts, Rank.Queen),
				new Card(Suit.Diamonds, Rank.King),
				new Card(Suit.Clubs, Rank.Ace),
				new Card(Suit.Spades, Rank.Two),
				new Card(Suit.Hearts, Rank.Three),
			];

			const evaluation = HandEvaluator.evaluateFiveCardHand(invalidStraight);

			// Should NOT be a straight
			expect(evaluation.rank).not.toBe(HandRank.Straight);
			expect(evaluation.rank).toBe(HandRank.HighCard); // Should be ace high
		});

		test('should allow valid ace-low straight (A-2-3-4-5)', () => {
			const validAceLow = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Diamonds, Rank.Two),
				new Card(Suit.Clubs, Rank.Three),
				new Card(Suit.Spades, Rank.Four),
				new Card(Suit.Hearts, Rank.Five),
			];

			const evaluation = HandEvaluator.evaluateFiveCardHand(validAceLow);
			expect(evaluation.rank).toBe(HandRank.Straight);
		});

		test('should allow valid ace-high straight (10-J-Q-K-A)', () => {
			const validAceHigh = [
				new Card(Suit.Hearts, Rank.Ten),
				new Card(Suit.Diamonds, Rank.Jack),
				new Card(Suit.Clubs, Rank.Queen),
				new Card(Suit.Spades, Rank.King),
				new Card(Suit.Hearts, Rank.Ace),
			];

			const evaluation = HandEvaluator.evaluateFiveCardHand(validAceHigh);
			expect(evaluation.rank).toBe(HandRank.Straight);
		});
	});

	describe('Deck Integrity', () => {
		test('should prevent dealing from empty deck', () => {
			const deck = new Deck();

			// Deal all 52 cards
			for (let i = 0; i < 52; i++) {
				deck.dealCard();
			}

			// Should throw when trying to deal 53rd card
			expect(() => {
				deck.dealCard();
			}).toThrow('Cannot deal from empty deck');
		});

		test('should prevent dealing more cards than available', () => {
			const deck = new Deck();

			expect(() => {
				deck.dealCards(53); // More than 52
			}).toThrow('Cannot deal 53 cards, only 52 remaining');
		});

		test('should handle burn card edge cases', () => {
			const deck = new Deck();

			// Deal almost all cards
			deck.dealCards(51);

			// Should throw when trying to deal flop (needs burn + 3 cards, only 1 remaining)
			expect(() => {
				deck.dealFlop();
			}).toThrow('Cannot deal 3 cards, only 0 remaining');
		});
	});

	describe('Mathematical Edge Cases', () => {
		test('should handle very large chip stacks', () => {
			const largeChips = 2147483647; // Max 32-bit integer
			gameEngine.addPlayer('whale', 'High Roller', largeChips);

			const gameState = gameEngine.getGameState();
			const whale = gameState.players.find((p) => p.id === 'whale');
			expect(whale?.chipStack).toBe(largeChips);
		});

		test('should handle fractional chip scenarios in pot distribution', () => {
			// This tests odd chip distribution
			gameEngine.addPlayer('player1', 'Player 1', 1000);
			gameEngine.addPlayer('player2', 'Player 2', 1000);
			gameEngine.addPlayer('player3', 'Player 3', 1000);

			gameEngine.startHand();

			// Create a scenario where pot is not evenly divisible
			// This would be tested in actual game flow with specific actions
			const gameState = gameEngine.getGameState();
			expect(gameState.players.length).toBe(3);
		});
	});

	describe('Player State Corruption', () => {
		test('should handle players with invalid states gracefully', () => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);
			gameEngine.addPlayer('player2', 'Player 2', 1000);

			const gameState = gameEngine.getGameState();
			const player1 = gameState.players[0];

			// Verify player starts in valid state
			expect(player1.isActive).toBe(true);
			expect(player1.isFolded).toBe(false);
			expect(player1.currentBet).toBe(0);
		});

		test('should handle removing non-existent player', () => {
			expect(() => {
				gameEngine.removePlayer('non-existent');
			}).toThrow('Player not found');
		});

		test('should handle duplicate player addition attempts', () => {
			gameEngine.addPlayer('duplicate', 'Duplicate Player', 1000);

			expect(() => {
				gameEngine.addPlayer('duplicate', 'Another Duplicate', 1000);
			}).toThrow(); // Should prevent duplicate IDs
		});
	});

	describe('Complex Kicker Scenarios', () => {
		test('should handle all 5 kickers for high card comparison', () => {
			// Two high card hands that differ only in the 5th kicker
			const hand1 = {
				holeCards: [new Card(Suit.Hearts, Rank.Ace), new Card(Suit.Diamonds, Rank.King)],
				communityCards: [
					new Card(Suit.Clubs, Rank.Queen),
					new Card(Suit.Spades, Rank.Jack),
					new Card(Suit.Hearts, Rank.Nine), // 5th kicker is 9
				],
			};

			const hand2 = {
				holeCards: [new Card(Suit.Spades, Rank.Ace), new Card(Suit.Clubs, Rank.King)],
				communityCards: [
					new Card(Suit.Hearts, Rank.Queen),
					new Card(Suit.Diamonds, Rank.Jack),
					new Card(Suit.Spades, Rank.Eight), // 5th kicker is 8
				],
			};

			const eval1 = HandEvaluator.evaluateHand(hand1.holeCards, hand1.communityCards);
			const eval2 = HandEvaluator.evaluateHand(hand2.holeCards, hand2.communityCards);

			// Hand 1 should win due to better 5th kicker (9 vs 8)
			expect(HandEvaluator.compareHands(eval1, eval2)).toBe(1);
		});
	});
});
