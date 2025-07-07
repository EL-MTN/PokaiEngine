import { GameEngine } from '../../engine/GameEngine';
import { Card } from '../../core/cards/Card';
import { HandEvaluator } from '../../core/cards/HandEvaluator';
import { Deck } from '../../core/cards/Deck';
import { Player } from '../../core/game/Player';
import { Suit, Rank, GameConfig, HandRank } from '../../types';

describe('Stress Tests & Critical Edge Cases', () => {
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
		gameEngine = new GameEngine('stress-test-game', config);
	});

	describe('Identical Hand Scenarios', () => {
		test('should handle multiple royal flushes correctly', () => {
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

			expect(eval1.rank).toBe(HandRank.RoyalFlush);
			expect(eval2.rank).toBe(HandRank.RoyalFlush);
			expect(HandEvaluator.compareHands(eval1, eval2)).toBe(0); // Tie
		});

		test('should handle 5-kicker high card comparisons', () => {
			const hand1 = {
				holeCards: [new Card(Suit.Hearts, Rank.Ace), new Card(Suit.Diamonds, Rank.King)],
				communityCards: [
					new Card(Suit.Clubs, Rank.Queen),
					new Card(Suit.Spades, Rank.Jack),
					new Card(Suit.Hearts, Rank.Nine),
				],
			};

			const hand2 = {
				holeCards: [new Card(Suit.Spades, Rank.Ace), new Card(Suit.Clubs, Rank.King)],
				communityCards: [
					new Card(Suit.Hearts, Rank.Queen),
					new Card(Suit.Diamonds, Rank.Jack),
					new Card(Suit.Spades, Rank.Eight),
				],
			};

			const eval1 = HandEvaluator.evaluateHand(hand1.holeCards, hand1.communityCards);
			const eval2 = HandEvaluator.evaluateHand(hand2.holeCards, hand2.communityCards);

			expect(eval1.rank).toBe(HandRank.HighCard);
			expect(eval2.rank).toBe(HandRank.HighCard);
			expect(HandEvaluator.compareHands(eval1, eval2)).toBe(1); // Hand1 wins with 9 vs 8
		});
	});

	describe('Deck Integrity Edge Cases', () => {
		test('should prevent dealing from empty deck', () => {
			const deck = new Deck();

			// Deal all 52 cards
			for (let i = 0; i < 52; i++) {
				deck.dealCard();
			}

			expect(() => {
				deck.dealCard();
			}).toThrow('Cannot deal from empty deck');
		});

		test('should handle maximum player scenario (within limits)', () => {
			// Test with actual max players (10) since that's the real limit
			for (let i = 1; i <= 10; i++) {
				gameEngine.addPlayer(`player${i}`, `Player ${i}`, 1000);
			}

			const state = gameEngine.getGameState();
			expect(state.players.length).toBe(10);

			// Verify adding 11th player fails (test before starting hand)
			expect(() => {
				gameEngine.addPlayer('player11', 'Player 11', 1000);
			}).toThrow('Maximum number of players (10) reached');

			// Should be able to start hand with 10 players
			expect(() => {
				gameEngine.startHand();
			}).not.toThrow();
		});

		test('should validate deck contains exactly 52 unique cards', () => {
			const deck = new Deck();
			expect(deck.validate()).toBe(true);

			// Deal some cards
			deck.dealCard();
			deck.dealFlop();
			deck.dealTurn();
			deck.dealRiver();

			expect(deck.validate()).toBe(true);
		});
	});

	describe('Mathematical Edge Cases', () => {
		test('should handle very large chip stacks', () => {
			const maxInt = 2147483647;
			gameEngine.addPlayer('whale', 'High Roller', maxInt);

			const state = gameEngine.getGameState();
			const whale = state.players.find((p) => p.id === 'whale');
			expect(whale?.chipStack).toBe(maxInt);
		});

		test('should handle minimum chip scenarios', () => {
			gameEngine.addPlayer('player1', 'Poor Player', 1);
			gameEngine.addPlayer('player2', 'Rich Player', 10000);

			expect(() => {
				gameEngine.startHand();
			}).not.toThrow();

			const state = gameEngine.getGameState();
			const poorPlayer = state.players.find((p) => p.id === 'player1');
			// Poor player will be forced all-in when posting blinds
			expect(poorPlayer?.chipStack).toBe(0);
			expect(poorPlayer?.isAllIn).toBe(true);
		});

		test('should handle zero chip player', () => {
			gameEngine.addPlayer('broke', 'Broke Player', 0);
			gameEngine.addPlayer('player2', 'Player 2', 1000);

			const state = gameEngine.getGameState();
			const brokePlayer = state.players.find((p) => p.id === 'broke');
			expect(brokePlayer?.chipStack).toBe(0);
		});
	});

	describe('Ace Wraparound Prevention', () => {
		test('should NOT allow ace wraparound in straights', () => {
			const invalidWraparound = [
				new Card(Suit.Hearts, Rank.Queen),
				new Card(Suit.Diamonds, Rank.King),
				new Card(Suit.Clubs, Rank.Ace),
				new Card(Suit.Spades, Rank.Two),
				new Card(Suit.Hearts, Rank.Three),
			];

			const evaluation = HandEvaluator.evaluateFiveCardHand(invalidWraparound);
			expect(evaluation.rank).not.toBe(HandRank.Straight);
			expect(evaluation.rank).toBe(HandRank.HighCard);
		});

		test('should allow valid ace-low straight', () => {
			const validWheel = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Diamonds, Rank.Two),
				new Card(Suit.Clubs, Rank.Three),
				new Card(Suit.Spades, Rank.Four),
				new Card(Suit.Hearts, Rank.Five),
			];

			const evaluation = HandEvaluator.evaluateFiveCardHand(validWheel);
			expect(evaluation.rank).toBe(HandRank.Straight);
		});

		test('should correctly rank ace-low vs regular straights', () => {
			const wheel = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Diamonds, Rank.Two),
				new Card(Suit.Clubs, Rank.Three),
				new Card(Suit.Spades, Rank.Four),
				new Card(Suit.Hearts, Rank.Five),
			];

			const sixHigh = [
				new Card(Suit.Hearts, Rank.Two),
				new Card(Suit.Diamonds, Rank.Three),
				new Card(Suit.Clubs, Rank.Four),
				new Card(Suit.Spades, Rank.Five),
				new Card(Suit.Hearts, Rank.Six),
			];

			const wheelEval = HandEvaluator.evaluateFiveCardHand(wheel);
			const sixHighEval = HandEvaluator.evaluateFiveCardHand(sixHigh);

			expect(wheelEval.rank).toBe(HandRank.Straight);
			expect(sixHighEval.rank).toBe(HandRank.Straight);
			expect(HandEvaluator.compareHands(wheelEval, sixHighEval)).toBe(-1); // Wheel loses
		});
	});

	describe('Performance Stress Tests', () => {
		test('should handle many hand evaluations efficiently', () => {
			const startTime = Date.now();

			// Evaluate 1000 random hands
			for (let i = 0; i < 1000; i++) {
				const deck = new Deck();
				deck.shuffle();

				const holeCards = deck.dealCards(2);
				const communityCards = deck.dealCards(5);

				const evaluation = HandEvaluator.evaluateHand(holeCards, communityCards);
				expect(evaluation).toBeDefined();
			}

			const endTime = Date.now();
			const executionTime = endTime - startTime;

			// Should complete within reasonable time (5 seconds)
			expect(executionTime).toBeLessThan(5000);
		});

		test('should handle large number of combinations', () => {
			// Test with 9 cards (max theoretical)
			const nineCards = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Diamonds, Rank.King),
				new Card(Suit.Clubs, Rank.Queen),
				new Card(Suit.Spades, Rank.Jack),
				new Card(Suit.Hearts, Rank.Ten),
				new Card(Suit.Diamonds, Rank.Nine),
				new Card(Suit.Clubs, Rank.Eight),
				new Card(Suit.Spades, Rank.Seven),
				new Card(Suit.Hearts, Rank.Six),
			];

			const evaluation = HandEvaluator.evaluateHand(
				nineCards.slice(0, 2),
				nineCards.slice(2)
			);
			expect(evaluation.rank).toBe(HandRank.Straight);
		});
	});

	describe('Player State Edge Cases', () => {
		test('should handle duplicate player ID prevention', () => {
			gameEngine.addPlayer('duplicate', 'Player 1', 1000);

			expect(() => {
				gameEngine.addPlayer('duplicate', 'Player 2', 1000);
			}).toThrow();
		});

		test('should handle non-existent player removal', () => {
			expect(() => {
				gameEngine.removePlayer('non-existent');
			}).toThrow('Player not found');
		});

		test('should handle invalid player state', () => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);

			const state = gameEngine.getGameState();
			const player = state.players[0];

			// Verify valid initial state
			expect(player.isActive).toBe(true);
			expect(player.isFolded).toBe(false);
			expect(player.isAllIn).toBe(false);
			expect(player.currentBet).toBe(0);
		});
	});

	describe('Card Representation Edge Cases', () => {
		test('should handle all valid card string representations', () => {
			const validCards = [
				'AH',
				'KS',
				'QD',
				'JC',
				'TH', // Face cards
				'9S',
				'8D',
				'7C',
				'6H',
				'5S', // Number cards
				'4D',
				'3C',
				'2H',
				'AS', // Low cards
			];

			validCards.forEach((cardStr) => {
				expect(() => {
					const card = Card.fromString(cardStr);
					expect(card.toString()).toBe(cardStr);
				}).not.toThrow();
			});
		});

		test('should reject invalid card strings', () => {
			const invalidCards = [
				'1H', // No 1 card
				'XS', // Invalid rank
				'AX', // Invalid suit
				'A', // Too short
				'AHS', // Too long
				'', // Empty
			];

			invalidCards.forEach((cardStr) => {
				expect(() => {
					Card.fromString(cardStr);
				}).toThrow();
			});
		});
	});

	describe('Boundary Value Tests', () => {
		test('should handle hand evaluation with minimum cards', () => {
			const holeCards = [new Card(Suit.Hearts, Rank.Ace), new Card(Suit.Diamonds, Rank.King)];
			const communityCards = [
				new Card(Suit.Clubs, Rank.Queen),
				new Card(Suit.Spades, Rank.Jack),
				new Card(Suit.Hearts, Rank.Ten),
			];

			const evaluation = HandEvaluator.evaluateHand(holeCards, communityCards);
			expect(evaluation.rank).toBe(HandRank.Straight);
		});

		test('should reject insufficient cards for evaluation', () => {
			const holeCards = [new Card(Suit.Hearts, Rank.Ace)];
			const communityCards = [
				new Card(Suit.Clubs, Rank.Queen),
				new Card(Suit.Spades, Rank.Jack),
			];

			expect(() => {
				HandEvaluator.evaluateHand(holeCards, communityCards);
			}).toThrow('Need at least 5 cards to evaluate hand');
		});

		test('should handle exact 5-card evaluation', () => {
			const fiveCards = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Diamonds, Rank.King),
				new Card(Suit.Clubs, Rank.Queen),
				new Card(Suit.Spades, Rank.Jack),
				new Card(Suit.Hearts, Rank.Ten),
			];

			const evaluation = HandEvaluator.evaluateFiveCardHand(fiveCards);
			expect(evaluation.rank).toBe(HandRank.Straight);
		});
	});
});
