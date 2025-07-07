import { Deck } from '../../core/cards/Deck';
import { Card } from '../../core/cards/Card';
import { Suit, Rank } from '../../types';

describe('Deck', () => {
	describe('Constructor', () => {
		test('should create a standard 52-card deck', () => {
			const deck = new Deck();
			expect(deck.remainingCards()).toBe(52);
		});

		test('should contain all 52 unique cards', () => {
			const deck = new Deck();
			const cards = deck.getRemainingCards();
			expect(cards.length).toBe(52);

			// Check all suits and ranks are present
			const suits = [Suit.Hearts, Suit.Diamonds, Suit.Clubs, Suit.Spades];
			const ranks = [
				Rank.Two,
				Rank.Three,
				Rank.Four,
				Rank.Five,
				Rank.Six,
				Rank.Seven,
				Rank.Eight,
				Rank.Nine,
				Rank.Ten,
				Rank.Jack,
				Rank.Queen,
				Rank.King,
				Rank.Ace,
			];

			suits.forEach((suit) => {
				ranks.forEach((rank) => {
					const expectedCard = new Card(suit, rank);
					const foundCard = cards.find(
						(card) => card.suit === suit && card.rank === rank
					);
					expect(foundCard).toBeDefined();
					expect(foundCard!.toString()).toBe(expectedCard.toString());
				});
			});
		});
	});

	describe('Shuffling', () => {
		test('should shuffle the deck', () => {
			const deck1 = new Deck();
			const deck2 = new Deck();

			const originalOrder = deck1.getRemainingCards().map((card) => card.toString());
			deck2.shuffle();
			const shuffledOrder = deck2.getRemainingCards().map((card) => card.toString());

			// Very unlikely that shuffled deck is in same order
			expect(shuffledOrder).not.toEqual(originalOrder);
		});

		test('should maintain 52 cards after shuffle', () => {
			const deck = new Deck();
			deck.shuffle();
			expect(deck.remainingCards()).toBe(52);
		});

		test('should contain same cards after shuffle', () => {
			const deck = new Deck();
			const originalCards = deck
				.getRemainingCards()
				.map((card) => card.toString())
				.sort();
			deck.shuffle();
			const shuffledCards = deck
				.getRemainingCards()
				.map((card) => card.toString())
				.sort();

			expect(shuffledCards).toEqual(originalCards);
		});
	});

	describe('Dealing Cards', () => {
		test('should deal a single card', () => {
			const deck = new Deck();
			const card = deck.dealCard();

			expect(card).toBeInstanceOf(Card);
			expect(deck.remainingCards()).toBe(51);
		});

		test('should deal different cards', () => {
			const deck = new Deck();
			deck.shuffle();
			const card1 = deck.dealCard();
			const card2 = deck.dealCard();

			expect(card1.toString()).not.toBe(card2.toString());
			expect(deck.remainingCards()).toBe(50);
		});

		test('should throw error when dealing from empty deck', () => {
			const deck = new Deck();
			// Deal all cards
			for (let i = 0; i < 52; i++) {
				deck.dealCard();
			}

			expect(() => deck.dealCard()).toThrow('Cannot deal from empty deck');
		});
	});

	describe('Dealing Hole Cards', () => {
		test('should deal 2 hole cards per player', () => {
			const deck = new Deck();
			deck.shuffle();
			const playerCount = 3;
			const holeCards = deck.dealHoleCards(playerCount);

			expect(holeCards).toHaveLength(3);
			expect(holeCards[0]).toHaveLength(2);
			expect(holeCards[1]).toHaveLength(2);
			expect(holeCards[2]).toHaveLength(2);
			expect(deck.remainingCards()).toBe(46); // 52 - 6 cards
		});

		test('should deal unique cards to each player', () => {
			const deck = new Deck();
			deck.shuffle();
			const playerCount = 2;
			const holeCards = deck.dealHoleCards(playerCount);

			const allDealtCards = [...holeCards[0], ...holeCards[1]].map((card) => card.toString());

			const uniqueCards = [...new Set(allDealtCards)];
			expect(uniqueCards).toHaveLength(4);
		});

		test('should handle single player', () => {
			const deck = new Deck();
			const holeCards = deck.dealHoleCards(1);

			expect(holeCards[0]).toHaveLength(2);
			expect(deck.remainingCards()).toBe(50);
		});

		test('should handle maximum players', () => {
			const deck = new Deck();
			const playerCount = 10;
			const holeCards = deck.dealHoleCards(playerCount);

			expect(holeCards).toHaveLength(10);
			expect(deck.remainingCards()).toBe(32); // 52 - 20 cards
		});
	});

	describe('Community Cards', () => {
		test('should deal flop (3 cards)', () => {
			const deck = new Deck();
			deck.shuffle();
			const flop = deck.dealFlop();

			expect(flop).toHaveLength(3);
			expect(deck.remainingCards()).toBe(48); // 52 - 3 cards - 1 burned card = 48
		});

		test('should deal turn (1 card)', () => {
			const deck = new Deck();
			deck.shuffle();
			deck.dealFlop(); // Deal flop first
			const turn = deck.dealTurn();

			expect(turn).toBeInstanceOf(Card);
			expect(deck.remainingCards()).toBe(46); // 52 - 6 cards (includes 2 burned cards)
		});

		test('should deal river (1 card)', () => {
			const deck = new Deck();
			deck.shuffle();
			deck.dealFlop(); // Deal flop first (3 cards + 1 burned)
			deck.dealTurn(); // Deal turn first (1 card + 1 burned)
			const river = deck.dealRiver(); // Deal river (1 card + 1 burned)

			expect(river).toBeInstanceOf(Card);
			expect(deck.remainingCards()).toBe(44); // 52 - 5 cards - 3 burned cards = 44
		});

		test('should deal unique community cards', () => {
			const deck = new Deck();
			deck.shuffle();
			const flop = deck.dealFlop();
			const turn = deck.dealTurn();
			const river = deck.dealRiver();

			const allCommunityCards = [...flop, turn, river].map((card) => card.toString());
			const uniqueCards = [...new Set(allCommunityCards)];
			expect(uniqueCards).toHaveLength(5);
		});
	});

	describe('Complete Game Simulation', () => {
		test('should handle a complete game with 6 players', () => {
			const deck = new Deck();
			deck.shuffle();
			const playerCount = 6;

			// Deal hole cards
			const holeCards = deck.dealHoleCards(playerCount);
			expect(deck.remainingCards()).toBe(40); // 52 - 12 cards

			// Deal flop
			const flop = deck.dealFlop();
			expect(deck.remainingCards()).toBe(36); // 40 - 3 cards - 1 burned = 36

			// Deal turn
			const turn = deck.dealTurn();
			expect(deck.remainingCards()).toBe(34); // 36 - 1 card - 1 burned = 34

			// Deal river
			const river = deck.dealRiver();
			expect(deck.remainingCards()).toBe(32); // 34 - 1 card - 1 burned = 32

			// Verify all cards are unique
			const allDealtCards = [...holeCards.flat(), ...flop, turn, river].map((card) =>
				card.toString()
			);

			const uniqueCards = [...new Set(allDealtCards)];
			expect(uniqueCards).toHaveLength(17); // 12 hole + 5 community
		});
	});

	describe('Reset', () => {
		test('should reset deck to original state', () => {
			const deck = new Deck();
			deck.shuffle();
			deck.dealCard();
			deck.dealCard();
			deck.dealCard();

			expect(deck.remainingCards()).toBe(49);

			deck.reset();
			expect(deck.remainingCards()).toBe(52);
		});

		test('should allow dealing after reset', () => {
			const deck = new Deck();
			// Deal all cards
			for (let i = 0; i < 52; i++) {
				deck.dealCard();
			}

			expect(deck.remainingCards()).toBe(0);
			deck.reset();
			expect(deck.remainingCards()).toBe(52);

			const card = deck.dealCard();
			expect(card).toBeInstanceOf(Card);
		});
	});

	describe('Error Handling', () => {
		test('should handle zero players for hole cards', () => {
			const deck = new Deck();
			const holeCards = deck.dealHoleCards(0);

			expect(holeCards).toEqual([]);
			expect(deck.remainingCards()).toBe(52);
		});

		test('should throw error for dealing community cards from empty deck', () => {
			const deck = new Deck();
			// Deal all cards
			for (let i = 0; i < 52; i++) {
				deck.dealCard();
			}

			expect(() => deck.dealFlop()).toThrow('Cannot burn card from empty deck');
			expect(() => deck.dealTurn()).toThrow('Cannot burn card from empty deck');
			expect(() => deck.dealRiver()).toThrow('Cannot burn card from empty deck');
		});
	});
});
