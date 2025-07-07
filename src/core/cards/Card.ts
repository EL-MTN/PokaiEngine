import { Card as CardInterface, Suit, Rank } from '../../types';

export class Card implements CardInterface {
	constructor(public readonly suit: Suit, public readonly rank: Rank) {}

	/**
	 * Returns a string representation of the card (e.g., "AH", "KS", "2C")
	 */
	toString(): string {
		const rankStr =
			this.rank === Rank.Ace
				? 'A'
				: this.rank === Rank.King
				? 'K'
				: this.rank === Rank.Queen
				? 'Q'
				: this.rank === Rank.Jack
				? 'J'
				: this.rank === Rank.Ten
				? 'T'
				: this.rank.toString();

		return `${rankStr}${this.suit}`;
	}

	/**
	 * Returns a human-readable string representation
	 */
	toDisplayString(): string {
		const rankStr =
			this.rank === Rank.Ace
				? 'Ace'
				: this.rank === Rank.King
				? 'King'
				: this.rank === Rank.Queen
				? 'Queen'
				: this.rank === Rank.Jack
				? 'Jack'
				: this.rank.toString();

		const suitStr =
			this.suit === Suit.Hearts
				? 'Hearts'
				: this.suit === Suit.Diamonds
				? 'Diamonds'
				: this.suit === Suit.Clubs
				? 'Clubs'
				: 'Spades';

		return `${rankStr} of ${suitStr}`;
	}

	/**
	 * Checks if this card equals another card
	 */
	equals(other: Card): boolean {
		return this.suit === other.suit && this.rank === other.rank;
	}

	/**
	 * Compares rank only (for sorting and evaluation)
	 */
	compareRank(other: Card): number {
		return this.rank - other.rank;
	}

	/**
	 * Checks if this card is red (Hearts or Diamonds)
	 */
	isRed(): boolean {
		return this.suit === Suit.Hearts || this.suit === Suit.Diamonds;
	}

	/**
	 * Checks if this card is black (Clubs or Spades)
	 */
	isBlack(): boolean {
		return this.suit === Suit.Clubs || this.suit === Suit.Spades;
	}

	/**
	 * Creates a card from a string representation (e.g., "AH", "KS")
	 */
	static fromString(cardStr: string): Card {
		if (cardStr.length !== 2) {
			throw new Error(`Invalid card string: ${cardStr}`);
		}

		const rankChar = cardStr[0];
		const suitChar = cardStr[1];

		let rank: Rank;
		switch (rankChar) {
			case 'A':
				rank = Rank.Ace;
				break;
			case 'K':
				rank = Rank.King;
				break;
			case 'Q':
				rank = Rank.Queen;
				break;
			case 'J':
				rank = Rank.Jack;
				break;
			case '2':
			case '3':
			case '4':
			case '5':
			case '6':
			case '7':
			case '8':
			case '9':
				rank = parseInt(rankChar) as Rank;
				break;
			case 'T':
				rank = Rank.Ten;
				break;
			default:
				throw new Error(`Invalid rank character: ${rankChar}`);
		}

		let suit: Suit;
		switch (suitChar) {
			case 'H':
				suit = Suit.Hearts;
				break;
			case 'D':
				suit = Suit.Diamonds;
				break;
			case 'C':
				suit = Suit.Clubs;
				break;
			case 'S':
				suit = Suit.Spades;
				break;
			default:
				throw new Error(`Invalid suit character: ${suitChar}`);
		}

		return new Card(suit, rank);
	}

	/**
	 * Creates multiple cards from string representations
	 */
	static fromStrings(cardStrings: string[]): Card[] {
		return cardStrings.map((str) => Card.fromString(str));
	}

	/**
	 * Converts a card to a plain object for serialization
	 */
	toJSON(): CardInterface {
		return {
			suit: this.suit,
			rank: this.rank,
		};
	}

	/**
	 * Creates a Card from a plain object
	 */
	static fromJSON(obj: CardInterface): Card {
		return new Card(obj.suit, obj.rank);
	}
}
