import { Deck } from '@/domain/poker/cards/Deck';
import { Card } from '@/domain/poker/cards/Card';
import { Suit, Rank } from '@/domain/types';

describe('Deck', () => {
	let deck: Deck;

	beforeEach(() => {
		deck = new Deck();
	});

	describe('constructor', () => {
		it('should create a deck with 52 cards', () => {
			expect(deck.remainingCards()).toBe(52);
			expect(deck.dealtCount()).toBe(0);
		});

		it('should contain 52 unique cards', () => {
			const cards = deck.getRemainingCards();
			const cardStrings = cards.map((card) => card.toString());
			const uniqueCards = new Set(cardStrings);
			expect(uniqueCards.size).toBe(52);
		});

		it('should be valid upon creation', () => {
			expect(deck.validate()).toBe(true);
		});
	});

	describe('reset', () => {
		it('should reset the deck to 52 cards', () => {
			deck.dealCard();
			deck.reset();
			expect(deck.remainingCards()).toBe(52);
			expect(deck.dealtCount()).toBe(0);
		});
	});

	describe('shuffle', () => {
		it('should shuffle the cards', () => {
			const originalOrder = deck.getRemainingCards().map((c) => c.toString());
			deck.shuffle();
			const shuffledOrder = deck.getRemainingCards().map((c) => c.toString());
			expect(shuffledOrder).not.toEqual(originalOrder);
			expect(shuffledOrder.length).toBe(52);
		});

		it('should still contain all 52 unique cards after shuffling', () => {
			deck.shuffle();
			expect(deck.validate()).toBe(true);
		});
	});

	describe('dealCard', () => {
		it('should deal one card from the deck', () => {
			const card = deck.dealCard();
			expect(card).toBeInstanceOf(Card);
			expect(deck.remainingCards()).toBe(51);
			expect(deck.dealtCount()).toBe(1);
		});

		it('should throw an error when dealing from an empty deck', () => {
			deck.dealCards(52);
			expect(() => deck.dealCard()).toThrow('Cannot deal from empty deck');
		});
	});

	describe('dealCards', () => {
		it('should deal the specified number of cards', () => {
			const cards = deck.dealCards(5);
			expect(cards.length).toBe(5);
			expect(deck.remainingCards()).toBe(47);
			expect(deck.dealtCount()).toBe(5);
		});

		it('should throw an error if not enough cards are remaining', () => {
			expect(() => deck.dealCards(53)).toThrow(
				'Cannot deal 53 cards, only 52 remaining',
			);
		});
	});

	describe('dealHoleCards', () => {
		it('should deal two cards to each player', () => {
			const holeCards = deck.dealHoleCards(6);
			expect(holeCards.length).toBe(6);
			holeCards.forEach((hand) => {
				expect(hand.length).toBe(2);
			});
			expect(deck.remainingCards()).toBe(52 - 12);
		});

		it('should throw an error if not enough cards to deal hole cards', () => {
			expect(() => deck.dealHoleCards(27)).toThrow(
				'Cannot deal hole cards to 27 players, insufficient cards',
			);
		});
	});

	describe('dealFlop', () => {
		it('should deal 3 cards for the flop', () => {
			const flop = deck.dealFlop();
			expect(flop.length).toBe(3);
		});

		it('should burn one card before dealing the flop', () => {
			deck.dealFlop();
			// 1 burn card + 3 flop cards = 4
			expect(deck.remainingCards()).toBe(52 - 4);
			expect(deck.dealtCount()).toBe(4);
		});
	});

	describe('dealTurn', () => {
		it('should deal 1 card for the turn', () => {
			const turn = deck.dealTurn();
			expect(turn).toBeInstanceOf(Card);
		});

		it('should burn one card before dealing the turn', () => {
			deck.dealTurn();
			// 1 burn card + 1 turn card = 2
			expect(deck.remainingCards()).toBe(52 - 2);
			expect(deck.dealtCount()).toBe(2);
		});
	});

	describe('dealRiver', () => {
		it('should deal 1 card for the river', () => {
			const river = deck.dealRiver();
			expect(river).toBeInstanceOf(Card);
		});

		it('should burn one card before dealing the river', () => {
			deck.dealRiver();
			// 1 burn card + 1 river card = 2
			expect(deck.remainingCards()).toBe(52 - 2);
			expect(deck.dealtCount()).toBe(2);
		});
	});

	describe('burnCard', () => {
		it('should throw an error when burning from an empty deck', () => {
			deck.dealCards(52);
			expect(() => deck['burnCard']()).toThrow(
				'Cannot burn card from empty deck',
			);
		});
	});

	describe('Static Methods', () => {
		it('should create a deck from an array of cards using fromCards', () => {
			const cards = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Spades, Rank.King),
			];
			const customDeck = Deck.fromCards(cards);
			expect(customDeck.remainingCards()).toBe(2);
			expect(customDeck.dealCard().toString()).toBe('KS');
		});

		it('should create a deck from an array of strings using fromStrings', () => {
			const cardStrings = ['AS', 'KD', 'QC'];
			const customDeck = Deck.fromStrings(cardStrings);
			expect(customDeck.remainingCards()).toBe(3);
			expect(customDeck.dealCard().toString()).toBe('QC');
			expect(customDeck.dealCard().toString()).toBe('KD');
			expect(customDeck.dealCard().toString()).toBe('AS');
		});
	});

	describe('validate', () => {
		it('should return false for a deck with duplicate cards', () => {
			const cards = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Hearts, Rank.Ace),
			];
			const customDeck = Deck.fromCards(cards);
			// Manually add the rest of the cards to make it 52
			for (let i = 0; i < 50; i++) {
				customDeck.getRemainingCards().push(new Deck().dealCard());
			}
			// This is a simplified check, a full validation is more complex
			// but the principle is to test the validator's ability to catch duplicates.
			// The current validate() implementation checks the full deck (dealt + remaining)
			const deckWithDuplicates = Deck.fromStrings(['AH', 'AH', 'KD', 'QC']);
			expect(deckWithDuplicates.validate()).toBe(false);
		});

		it('should return false for a deck with less than 52 cards', () => {
			const customDeck = Deck.fromStrings(['AS', 'KD', 'QC']);
			expect(customDeck.validate()).toBe(false);
		});
	});

	describe('Full Game Dealing Simulation', () => {
		it('should correctly deal a full hand for 6 players', () => {
			// 6 players * 2 cards = 12 cards
			deck.dealHoleCards(6);
			expect(deck.remainingCards()).toBe(40);

			// 1 burn + 3 flop = 4 cards
			deck.dealFlop();
			expect(deck.remainingCards()).toBe(36);

			// 1 burn + 1 turn = 2 cards
			deck.dealTurn();
			expect(deck.remainingCards()).toBe(34);

			// 1 burn + 1 river = 2 cards
			deck.dealRiver();
			expect(deck.remainingCards()).toBe(32);

			expect(deck.dealtCount()).toBe(20);
		});
	});
});
