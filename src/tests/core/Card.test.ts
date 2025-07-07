import { Card } from '../../core/cards/Card';
import { Suit, Rank } from '../../types';

describe('Card', () => {
	describe('Constructor', () => {
		test('should create a card with suit and rank', () => {
			const card = new Card(Suit.Hearts, Rank.Ace);
			expect(card.suit).toBe(Suit.Hearts);
			expect(card.rank).toBe(Rank.Ace);
		});
	});

	describe('toString', () => {
		test('should return correct string representation for face cards', () => {
			expect(new Card(Suit.Hearts, Rank.Ace).toString()).toBe('AH');
			expect(new Card(Suit.Spades, Rank.King).toString()).toBe('KS');
			expect(new Card(Suit.Diamonds, Rank.Queen).toString()).toBe('QD');
			expect(new Card(Suit.Clubs, Rank.Jack).toString()).toBe('JC');
		});

		test('should return correct string representation for number cards', () => {
			expect(new Card(Suit.Hearts, Rank.Two).toString()).toBe('2H');
			expect(new Card(Suit.Spades, Rank.Five).toString()).toBe('5S');
			expect(new Card(Suit.Diamonds, Rank.Ten).toString()).toBe('TD');
		});
	});

	describe('toDisplayString', () => {
		test('should return human-readable string', () => {
			expect(new Card(Suit.Hearts, Rank.Ace).toDisplayString()).toBe('Ace of Hearts');
			expect(new Card(Suit.Spades, Rank.King).toDisplayString()).toBe('King of Spades');
			expect(new Card(Suit.Diamonds, Rank.Two).toDisplayString()).toBe('2 of Diamonds');
		});
	});

	describe('equals', () => {
		test('should return true for identical cards', () => {
			const card1 = new Card(Suit.Hearts, Rank.Ace);
			const card2 = new Card(Suit.Hearts, Rank.Ace);
			expect(card1.equals(card2)).toBe(true);
		});

		test('should return false for different cards', () => {
			const card1 = new Card(Suit.Hearts, Rank.Ace);
			const card2 = new Card(Suit.Hearts, Rank.King);
			const card3 = new Card(Suit.Spades, Rank.Ace);

			expect(card1.equals(card2)).toBe(false);
			expect(card1.equals(card3)).toBe(false);
		});
	});

	describe('compareRank', () => {
		test('should compare ranks correctly', () => {
			const ace = new Card(Suit.Hearts, Rank.Ace);
			const king = new Card(Suit.Spades, Rank.King);
			const two = new Card(Suit.Diamonds, Rank.Two);

			expect(ace.compareRank(king)).toBeGreaterThan(0);
			expect(king.compareRank(ace)).toBeLessThan(0);
			expect(two.compareRank(two)).toBe(0);
		});
	});

	describe('Color methods', () => {
		test('isRed should work correctly', () => {
			expect(new Card(Suit.Hearts, Rank.Ace).isRed()).toBe(true);
			expect(new Card(Suit.Diamonds, Rank.King).isRed()).toBe(true);
			expect(new Card(Suit.Clubs, Rank.Queen).isRed()).toBe(false);
			expect(new Card(Suit.Spades, Rank.Jack).isRed()).toBe(false);
		});

		test('isBlack should work correctly', () => {
			expect(new Card(Suit.Clubs, Rank.Ace).isBlack()).toBe(true);
			expect(new Card(Suit.Spades, Rank.King).isBlack()).toBe(true);
			expect(new Card(Suit.Hearts, Rank.Queen).isBlack()).toBe(false);
			expect(new Card(Suit.Diamonds, Rank.Jack).isBlack()).toBe(false);
		});
	});

	describe('fromString', () => {
		test('should create cards from valid strings', () => {
			const aceHearts = Card.fromString('AH');
			expect(aceHearts.suit).toBe(Suit.Hearts);
			expect(aceHearts.rank).toBe(Rank.Ace);

			const kingSpades = Card.fromString('KS');
			expect(kingSpades.suit).toBe(Suit.Spades);
			expect(kingSpades.rank).toBe(Rank.King);

			const tenDiamonds = Card.fromString('TD');
			expect(tenDiamonds.suit).toBe(Suit.Diamonds);
			expect(tenDiamonds.rank).toBe(Rank.Ten);
		});

		test('should handle number cards correctly', () => {
			const twoClubs = Card.fromString('2C');
			expect(twoClubs.suit).toBe(Suit.Clubs);
			expect(twoClubs.rank).toBe(Rank.Two);

			const nineHearts = Card.fromString('9H');
			expect(nineHearts.suit).toBe(Suit.Hearts);
			expect(nineHearts.rank).toBe(Rank.Nine);
		});

		test('should throw error for invalid strings', () => {
			expect(() => Card.fromString('XX')).toThrow();
			expect(() => Card.fromString('AZ')).toThrow();
			expect(() => Card.fromString('1H')).toThrow();
			expect(() => Card.fromString('A')).toThrow();
			expect(() => Card.fromString('ABC')).toThrow();
		});
	});

	describe('fromStrings', () => {
		test('should create multiple cards from string array', () => {
			const cards = Card.fromStrings(['AH', 'KS', '2D']);

			expect(cards).toHaveLength(3);
			expect(cards[0].toString()).toBe('AH');
			expect(cards[1].toString()).toBe('KS');
			expect(cards[2].toString()).toBe('2D');
		});
	});

	describe('Serialization', () => {
		test('toJSON should create serializable object', () => {
			const card = new Card(Suit.Hearts, Rank.Ace);
			const json = card.toJSON();

			expect(json).toEqual({
				suit: Suit.Hearts,
				rank: Rank.Ace,
			});
		});

		test('fromJSON should recreate card from serialized data', () => {
			const original = new Card(Suit.Spades, Rank.King);
			const json = original.toJSON();
			const recreated = Card.fromJSON(json);

			expect(recreated.equals(original)).toBe(true);
		});

		test('should maintain equality through serialization round trip', () => {
			const cards = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Spades, Rank.Two),
				new Card(Suit.Diamonds, Rank.Jack),
				new Card(Suit.Clubs, Rank.Queen),
			];

			cards.forEach((card) => {
				const json = card.toJSON();
				const recreated = Card.fromJSON(json);
				expect(recreated.equals(card)).toBe(true);
			});
		});
	});

	describe('Edge cases', () => {
		test('should handle all possible card combinations', () => {
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
					const card = new Card(suit, rank);
					expect(card.suit).toBe(suit);
					expect(card.rank).toBe(rank);

					// Test that string conversion and parsing work
					const cardString = card.toString();
					const parsed = Card.fromString(cardString);
					expect(parsed.equals(card)).toBe(true);
				});
			});
		});
	});
});
