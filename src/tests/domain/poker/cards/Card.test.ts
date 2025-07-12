import { Card } from '@/domain/poker/cards/Card';
import { Suit, Rank } from '@/domain/types';

describe('Card', () => {
	describe('Constructor', () => {
		it('should create a card with correct suit and rank', () => {
			const card = new Card(Suit.Hearts, Rank.Ace);
			expect(card.suit).toBe(Suit.Hearts);
			expect(card.rank).toBe(Rank.Ace);
		});

		it('should create cards with all suits', () => {
			const hearts = new Card(Suit.Hearts, Rank.King);
			const diamonds = new Card(Suit.Diamonds, Rank.Queen);
			const clubs = new Card(Suit.Clubs, Rank.Jack);
			const spades = new Card(Suit.Spades, Rank.Ten);

			expect(hearts.suit).toBe(Suit.Hearts);
			expect(diamonds.suit).toBe(Suit.Diamonds);
			expect(clubs.suit).toBe(Suit.Clubs);
			expect(spades.suit).toBe(Suit.Spades);
		});

		it('should create cards with all ranks', () => {
			const ranks = [
				Rank.Ace,
				Rank.King,
				Rank.Queen,
				Rank.Jack,
				Rank.Ten,
				Rank.Nine,
				Rank.Eight,
				Rank.Seven,
				Rank.Six,
				Rank.Five,
				Rank.Four,
				Rank.Three,
				Rank.Two,
			];

			ranks.forEach((rank) => {
				const card = new Card(Suit.Spades, rank);
				expect(card.rank).toBe(rank);
			});
		});
	});

	describe('toString', () => {
		it('should convert ace cards to correct string', () => {
			expect(new Card(Suit.Hearts, Rank.Ace).toString()).toBe('AH');
			expect(new Card(Suit.Diamonds, Rank.Ace).toString()).toBe('AD');
			expect(new Card(Suit.Clubs, Rank.Ace).toString()).toBe('AC');
			expect(new Card(Suit.Spades, Rank.Ace).toString()).toBe('AS');
		});

		it('should convert face cards to correct string', () => {
			expect(new Card(Suit.Hearts, Rank.King).toString()).toBe('KH');
			expect(new Card(Suit.Diamonds, Rank.Queen).toString()).toBe('QD');
			expect(new Card(Suit.Clubs, Rank.Jack).toString()).toBe('JC');
			expect(new Card(Suit.Spades, Rank.Ten).toString()).toBe('TS');
		});

		it('should convert number cards to correct string', () => {
			expect(new Card(Suit.Hearts, Rank.Nine).toString()).toBe('9H');
			expect(new Card(Suit.Diamonds, Rank.Eight).toString()).toBe('8D');
			expect(new Card(Suit.Clubs, Rank.Seven).toString()).toBe('7C');
			expect(new Card(Suit.Spades, Rank.Six).toString()).toBe('6S');
			expect(new Card(Suit.Hearts, Rank.Five).toString()).toBe('5H');
			expect(new Card(Suit.Diamonds, Rank.Four).toString()).toBe('4D');
			expect(new Card(Suit.Clubs, Rank.Three).toString()).toBe('3C');
			expect(new Card(Suit.Spades, Rank.Two).toString()).toBe('2S');
		});
	});

	describe('toDisplayString', () => {
		it('should convert ace cards to readable format', () => {
			expect(new Card(Suit.Hearts, Rank.Ace).toDisplayString()).toBe('Ace of Hearts');
			expect(new Card(Suit.Diamonds, Rank.Ace).toDisplayString()).toBe('Ace of Diamonds');
			expect(new Card(Suit.Clubs, Rank.Ace).toDisplayString()).toBe('Ace of Clubs');
			expect(new Card(Suit.Spades, Rank.Ace).toDisplayString()).toBe('Ace of Spades');
		});

		it('should convert face cards to readable format', () => {
			expect(new Card(Suit.Hearts, Rank.King).toDisplayString()).toBe('King of Hearts');
			expect(new Card(Suit.Diamonds, Rank.Queen).toDisplayString()).toBe('Queen of Diamonds');
			expect(new Card(Suit.Clubs, Rank.Jack).toDisplayString()).toBe('Jack of Clubs');
			expect(new Card(Suit.Spades, Rank.Ten).toDisplayString()).toBe('10 of Spades');
		});

		it('should convert number cards to readable format', () => {
			expect(new Card(Suit.Hearts, Rank.Nine).toDisplayString()).toBe('9 of Hearts');
			expect(new Card(Suit.Diamonds, Rank.Eight).toDisplayString()).toBe('8 of Diamonds');
			expect(new Card(Suit.Clubs, Rank.Seven).toDisplayString()).toBe('7 of Clubs');
			expect(new Card(Suit.Spades, Rank.Six).toDisplayString()).toBe('6 of Spades');
			expect(new Card(Suit.Hearts, Rank.Five).toDisplayString()).toBe('5 of Hearts');
			expect(new Card(Suit.Diamonds, Rank.Four).toDisplayString()).toBe('4 of Diamonds');
			expect(new Card(Suit.Clubs, Rank.Three).toDisplayString()).toBe('3 of Clubs');
			expect(new Card(Suit.Spades, Rank.Two).toDisplayString()).toBe('2 of Spades');
		});
	});

	describe('equals', () => {
		it('should return true for identical cards', () => {
			const card1 = new Card(Suit.Hearts, Rank.Ace);
			const card2 = new Card(Suit.Hearts, Rank.Ace);
			expect(card1.equals(card2)).toBe(true);
		});

		it('should return false for different suits', () => {
			const card1 = new Card(Suit.Hearts, Rank.Ace);
			const card2 = new Card(Suit.Spades, Rank.Ace);
			expect(card1.equals(card2)).toBe(false);
		});

		it('should return false for different ranks', () => {
			const card1 = new Card(Suit.Hearts, Rank.Ace);
			const card2 = new Card(Suit.Hearts, Rank.King);
			expect(card1.equals(card2)).toBe(false);
		});

		it('should return false for completely different cards', () => {
			const card1 = new Card(Suit.Hearts, Rank.Ace);
			const card2 = new Card(Suit.Clubs, Rank.Two);
			expect(card1.equals(card2)).toBe(false);
		});
	});

	describe('compareRank', () => {
		it('should return 0 for same rank', () => {
			const card1 = new Card(Suit.Hearts, Rank.Ace);
			const card2 = new Card(Suit.Spades, Rank.Ace);
			expect(card1.compareRank(card2)).toBe(0);
		});

		it('should return positive for higher rank', () => {
			const aceCard = new Card(Suit.Hearts, Rank.Ace);
			const kingCard = new Card(Suit.Spades, Rank.King);
			expect(aceCard.compareRank(kingCard)).toBeGreaterThan(0);
		});

		it('should return negative for lower rank', () => {
			const kingCard = new Card(Suit.Hearts, Rank.King);
			const aceCard = new Card(Suit.Spades, Rank.Ace);
			expect(kingCard.compareRank(aceCard)).toBeLessThan(0);
		});

		it('should work with number cards', () => {
			const nineCard = new Card(Suit.Hearts, Rank.Nine);
			const twoCard = new Card(Suit.Spades, Rank.Two);
			expect(nineCard.compareRank(twoCard)).toBeGreaterThan(0);
			expect(twoCard.compareRank(nineCard)).toBeLessThan(0);
		});
	});

	describe('isRed', () => {
		it('should return true for hearts', () => {
			const card = new Card(Suit.Hearts, Rank.Ace);
			expect(card.isRed()).toBe(true);
		});

		it('should return true for diamonds', () => {
			const card = new Card(Suit.Diamonds, Rank.King);
			expect(card.isRed()).toBe(true);
		});

		it('should return false for clubs', () => {
			const card = new Card(Suit.Clubs, Rank.Queen);
			expect(card.isRed()).toBe(false);
		});

		it('should return false for spades', () => {
			const card = new Card(Suit.Spades, Rank.Jack);
			expect(card.isRed()).toBe(false);
		});
	});

	describe('isBlack', () => {
		it('should return true for clubs', () => {
			const card = new Card(Suit.Clubs, Rank.Ace);
			expect(card.isBlack()).toBe(true);
		});

		it('should return true for spades', () => {
			const card = new Card(Suit.Spades, Rank.King);
			expect(card.isBlack()).toBe(true);
		});

		it('should return false for hearts', () => {
			const card = new Card(Suit.Hearts, Rank.Queen);
			expect(card.isBlack()).toBe(false);
		});

		it('should return false for diamonds', () => {
			const card = new Card(Suit.Diamonds, Rank.Jack);
			expect(card.isBlack()).toBe(false);
		});
	});

	describe('fromString', () => {
		it('should parse ace cards correctly', () => {
			const aceHearts = Card.fromString('AH');
			expect(aceHearts.rank).toBe(Rank.Ace);
			expect(aceHearts.suit).toBe(Suit.Hearts);

			const aceDiamonds = Card.fromString('AD');
			expect(aceDiamonds.rank).toBe(Rank.Ace);
			expect(aceDiamonds.suit).toBe(Suit.Diamonds);

			const aceClubs = Card.fromString('AC');
			expect(aceClubs.rank).toBe(Rank.Ace);
			expect(aceClubs.suit).toBe(Suit.Clubs);

			const aceSpades = Card.fromString('AS');
			expect(aceSpades.rank).toBe(Rank.Ace);
			expect(aceSpades.suit).toBe(Suit.Spades);
		});

		it('should parse face cards correctly', () => {
			const kingHearts = Card.fromString('KH');
			expect(kingHearts.rank).toBe(Rank.King);
			expect(kingHearts.suit).toBe(Suit.Hearts);

			const queenDiamonds = Card.fromString('QD');
			expect(queenDiamonds.rank).toBe(Rank.Queen);
			expect(queenDiamonds.suit).toBe(Suit.Diamonds);

			const jackClubs = Card.fromString('JC');
			expect(jackClubs.rank).toBe(Rank.Jack);
			expect(jackClubs.suit).toBe(Suit.Clubs);

			const tenSpades = Card.fromString('TS');
			expect(tenSpades.rank).toBe(Rank.Ten);
			expect(tenSpades.suit).toBe(Suit.Spades);
		});

		it('should parse number cards correctly', () => {
			const nineHearts = Card.fromString('9H');
			expect(nineHearts.rank).toBe(Rank.Nine);
			expect(nineHearts.suit).toBe(Suit.Hearts);

			const twoSpades = Card.fromString('2S');
			expect(twoSpades.rank).toBe(Rank.Two);
			expect(twoSpades.suit).toBe(Suit.Spades);
		});

		it('should throw error for invalid string length', () => {
			expect(() => Card.fromString('A')).toThrow('Invalid card string: A');
			expect(() => Card.fromString('AHX')).toThrow('Invalid card string: AHX');
			expect(() => Card.fromString('')).toThrow('Invalid card string: ');
		});

		it('should throw error for invalid rank character', () => {
			expect(() => Card.fromString('XH')).toThrow('Invalid rank character: X');
			expect(() => Card.fromString('1H')).toThrow('Invalid rank character: 1');
			expect(() => Card.fromString('BH')).toThrow('Invalid rank character: B');
		});

		it('should throw error for invalid suit character', () => {
			expect(() => Card.fromString('AX')).toThrow('Invalid suit character: X');
			expect(() => Card.fromString('A1')).toThrow('Invalid suit character: 1');
			expect(() => Card.fromString('AB')).toThrow('Invalid suit character: B');
		});
	});

	describe('fromStrings', () => {
		it('should parse multiple valid cards', () => {
			const cards = Card.fromStrings(['AH', 'KS', 'QD', 'JC']);

			expect(cards).toHaveLength(4);
			expect(cards[0].toString()).toBe('AH');
			expect(cards[1].toString()).toBe('KS');
			expect(cards[2].toString()).toBe('QD');
			expect(cards[3].toString()).toBe('JC');
		});

		it('should handle empty array', () => {
			const cards = Card.fromStrings([]);
			expect(cards).toHaveLength(0);
		});

		it('should handle single card', () => {
			const cards = Card.fromStrings(['AH']);
			expect(cards).toHaveLength(1);
			expect(cards[0].toString()).toBe('AH');
		});

		it('should throw error for any invalid card in array', () => {
			expect(() => Card.fromStrings(['AH', 'XY', 'KS'])).toThrow();
			expect(() => Card.fromStrings(['AH', 'K'])).toThrow();
		});
	});

	describe('toJSON', () => {
		it('should serialize card to plain object', () => {
			const card = new Card(Suit.Hearts, Rank.Ace);
			const json = card.toJSON();

			expect(json).toEqual({
				suit: Suit.Hearts,
				rank: Rank.Ace,
			});
		});

		it('should work with all suit and rank combinations', () => {
			const card = new Card(Suit.Spades, Rank.Two);
			const json = card.toJSON();

			expect(json.suit).toBe(Suit.Spades);
			expect(json.rank).toBe(Rank.Two);
		});
	});

	describe('fromJSON', () => {
		it('should deserialize plain object to card', () => {
			const obj = {
				suit: Suit.Hearts,
				rank: Rank.Ace,
			};

			const card = Card.fromJSON(obj);
			expect(card.suit).toBe(Suit.Hearts);
			expect(card.rank).toBe(Rank.Ace);
		});

		it('should work with all suit and rank combinations', () => {
			const obj = {
				suit: Suit.Clubs,
				rank: Rank.Seven,
			};

			const card = Card.fromJSON(obj);
			expect(card.suit).toBe(Suit.Clubs);
			expect(card.rank).toBe(Rank.Seven);
		});
	});

	describe('Integration Tests', () => {
		it('should maintain consistency between toString and fromString', () => {
			const originalCard = new Card(Suit.Hearts, Rank.Ace);
			const cardString = originalCard.toString();
			const parsedCard = Card.fromString(cardString);

			expect(parsedCard.equals(originalCard)).toBe(true);
		});

		it('should maintain consistency between toJSON and fromJSON', () => {
			const originalCard = new Card(Suit.Spades, Rank.King);
			const json = originalCard.toJSON();
			const deserializedCard = Card.fromJSON(json);

			expect(deserializedCard.equals(originalCard)).toBe(true);
		});

		it('should work with all cards in a deck', () => {
			const suits = [Suit.Hearts, Suit.Diamonds, Suit.Clubs, Suit.Spades];
			const ranks = [
				Rank.Ace,
				Rank.King,
				Rank.Queen,
				Rank.Jack,
				Rank.Ten,
				Rank.Nine,
				Rank.Eight,
				Rank.Seven,
				Rank.Six,
				Rank.Five,
				Rank.Four,
				Rank.Three,
				Rank.Two,
			];

			suits.forEach((suit) => {
				ranks.forEach((rank) => {
					const card = new Card(suit, rank);

					// Test string conversion round-trip
					const cardString = card.toString();
					const parsedCard = Card.fromString(cardString);
					expect(parsedCard.equals(card)).toBe(true);

					// Test JSON conversion round-trip
					const json = card.toJSON();
					const deserializedCard = Card.fromJSON(json);
					expect(deserializedCard.equals(card)).toBe(true);

					// Test display string is non-empty
					expect(card.toDisplayString().length).toBeGreaterThan(0);

					// Test color consistency
					const isRed = suit === Suit.Hearts || suit === Suit.Diamonds;
					expect(card.isRed()).toBe(isRed);
					expect(card.isBlack()).toBe(!isRed);
				});
			});
		});
	});
});
