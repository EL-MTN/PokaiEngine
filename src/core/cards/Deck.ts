import { Card } from './Card';
import { Suit, Rank } from '../../types';

export class Deck {
	private cards: Card[] = [];
	private dealtCards: Card[] = [];

	constructor() {
		this.reset();
	}

	/**
	 * Resets the deck to a full 52-card deck
	 */
	reset(): void {
		this.cards = [];
		this.dealtCards = [];

		// Create all 52 cards
		for (const suit of Object.values(Suit)) {
			for (const rank of Object.values(Rank)) {
				if (typeof rank === 'number') {
					this.cards.push(new Card(suit, rank));
				}
			}
		}
	}

	/**
	 * Shuffles the deck using Fisher-Yates algorithm
	 */
	shuffle(): void {
		for (let i = this.cards.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
		}
	}

	/**
	 * Deals a single card from the top of the deck
	 */
	dealCard(): Card {
		if (this.cards.length === 0) {
			throw new Error('Cannot deal from empty deck');
		}

		const card = this.cards.pop()!;
		this.dealtCards.push(card);
		return card;
	}

	/**
	 * Deals multiple cards
	 */
	dealCards(count: number): Card[] {
		if (count > this.cards.length) {
			throw new Error(`Cannot deal ${count} cards, only ${this.cards.length} remaining`);
		}

		const cards: Card[] = [];
		for (let i = 0; i < count; i++) {
			cards.push(this.dealCard());
		}

		return cards;
	}

	/**
	 * Deals hole cards to players (2 cards each)
	 */
	dealHoleCards(playerCount: number): Card[][] {
		if (playerCount * 2 > this.cards.length) {
			throw new Error(`Cannot deal hole cards to ${playerCount} players, insufficient cards`);
		}

		const holeCards: Card[][] = [];

		// Deal first card to each player
		for (let i = 0; i < playerCount; i++) {
			holeCards.push([this.dealCard()]);
		}

		// Deal second card to each player
		for (let i = 0; i < playerCount; i++) {
			holeCards[i].push(this.dealCard());
		}

		return holeCards;
	}

	/**
	 * Deals the flop (3 community cards)
	 */
	dealFlop(): Card[] {
		this.burnCard(); // Burn one card before the flop
		return this.dealCards(3);
	}

	/**
	 * Deals the turn (1 community card)
	 */
	dealTurn(): Card {
		this.burnCard(); // Burn one card before the turn
		return this.dealCard();
	}

	/**
	 * Deals the river (1 community card)
	 */
	dealRiver(): Card {
		this.burnCard(); // Burn one card before the river
		return this.dealCard();
	}

	/**
	 * Burns a card (removes it from play without showing)
	 */
	private burnCard(): void {
		if (this.cards.length === 0) {
			throw new Error('Cannot burn card from empty deck');
		}

		const burnedCard = this.cards.pop()!;
		this.dealtCards.push(burnedCard);
	}

	/**
	 * Returns the number of cards remaining in the deck
	 */
	remainingCards(): number {
		return this.cards.length;
	}

	/**
	 * Returns the number of cards dealt
	 */
	dealtCount(): number {
		return this.dealtCards.length;
	}

	/**
	 * Checks if the deck is empty
	 */
	isEmpty(): boolean {
		return this.cards.length === 0;
	}

	/**
	 * Returns a copy of the remaining cards (for testing/debugging)
	 */
	getRemainingCards(): Card[] {
		return [...this.cards];
	}

	/**
	 * Returns a copy of the dealt cards (for testing/debugging)
	 */
	getDealtCards(): Card[] {
		return [...this.dealtCards];
	}

	/**
	 * Creates a deck from a specific order of cards (useful for testing)
	 */
	static fromCards(cards: Card[]): Deck {
		const deck = new Deck();
		deck.cards = [...cards];
		deck.dealtCards = [];
		return deck;
	}

	/**
	 * Creates a deck from string representations
	 */
	static fromStrings(cardStrings: string[]): Deck {
		const cards = Card.fromStrings(cardStrings);
		return Deck.fromCards(cards);
	}

	/**
	 * Validates that the deck contains exactly 52 unique cards
	 */
	validate(): boolean {
		const allCards = [...this.cards, ...this.dealtCards];

		if (allCards.length !== 52) {
			return false;
		}

		// Check for duplicates
		const cardStrings = allCards.map((card) => card.toString());
		const uniqueCards = new Set(cardStrings);

		return uniqueCards.size === 52;
	}
}
