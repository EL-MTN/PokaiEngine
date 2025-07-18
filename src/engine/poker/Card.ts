import { Card as CardInterface, Rank, Suit } from '@/types';

export class Card implements CardInterface {
	/**
	 * Static mapping for rank to short string representation
	 */
	private static readonly RANK_TO_SHORT_STRING = {
		[Rank.Ace]: 'A',
		[Rank.King]: 'K',
		[Rank.Queen]: 'Q',
		[Rank.Jack]: 'J',
		[Rank.Ten]: 'T',
		[Rank.Nine]: '9',
		[Rank.Eight]: '8',
		[Rank.Seven]: '7',
		[Rank.Six]: '6',
		[Rank.Five]: '5',
		[Rank.Four]: '4',
		[Rank.Three]: '3',
		[Rank.Two]: '2',
	} as const;

	/**
	 * Static mapping for rank to display string representation
	 */
	private static readonly RANK_TO_DISPLAY_STRING = {
		[Rank.Ace]: 'Ace',
		[Rank.King]: 'King',
		[Rank.Queen]: 'Queen',
		[Rank.Jack]: 'Jack',
		[Rank.Ten]: '10',
		[Rank.Nine]: '9',
		[Rank.Eight]: '8',
		[Rank.Seven]: '7',
		[Rank.Six]: '6',
		[Rank.Five]: '5',
		[Rank.Four]: '4',
		[Rank.Three]: '3',
		[Rank.Two]: '2',
	} as const;

	/**
	 * Static mapping for suit to display string representation
	 */
	private static readonly SUIT_TO_DISPLAY_STRING = {
		[Suit.Hearts]: 'Hearts',
		[Suit.Diamonds]: 'Diamonds',
		[Suit.Clubs]: 'Clubs',
		[Suit.Spades]: 'Spades',
	} as const;

	/**
	 * Reverse mapping for parsing from string
	 */
	private static readonly SHORT_STRING_TO_RANK = {
		A: Rank.Ace,
		K: Rank.King,
		Q: Rank.Queen,
		J: Rank.Jack,
		T: Rank.Ten,
		'9': Rank.Nine,
		'8': Rank.Eight,
		'7': Rank.Seven,
		'6': Rank.Six,
		'5': Rank.Five,
		'4': Rank.Four,
		'3': Rank.Three,
		'2': Rank.Two,
	} as const;

	/**
	 * Reverse mapping for parsing suit from string
	 */
	private static readonly SHORT_STRING_TO_SUIT = {
		H: Suit.Hearts,
		D: Suit.Diamonds,
		C: Suit.Clubs,
		S: Suit.Spades,
	} as const;

	constructor(
		public readonly suit: Suit,
		public readonly rank: Rank,
	) {}

	/**
	 * Returns a string representation of the card (e.g., "AH", "KS", "2C")
	 */
	toString(): string {
		const rankStr = Card.RANK_TO_SHORT_STRING[this.rank];
		return `${rankStr}${this.suit}`;
	}

	/**
	 * Returns a human-readable string representation
	 */
	toDisplayString(): string {
		const rankStr = Card.RANK_TO_DISPLAY_STRING[this.rank];
		const suitStr = Card.SUIT_TO_DISPLAY_STRING[this.suit];
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

		const rankChar = cardStr[0] as keyof typeof Card.SHORT_STRING_TO_RANK;
		const suitChar = cardStr[1] as keyof typeof Card.SHORT_STRING_TO_SUIT;

		const rank = Card.SHORT_STRING_TO_RANK[rankChar];
		if (rank === undefined) {
			throw new Error(`Invalid rank character: ${rankChar}`);
		}

		const suit = Card.SHORT_STRING_TO_SUIT[suitChar];
		if (suit === undefined) {
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
