import { HandEvaluation, HandRank, Rank, Suit } from '@/domain/types';

import { Card } from './Card';

/**
 * Texas Hold'em hand evaluation utility class
 *
 * This class implements the standard poker hand ranking system for Texas Hold'em.
 * Hand rankings from highest to lowest:
 * 1. Royal Flush (10, J, Q, K, A of the same suit)
 * 2. Straight Flush (5 consecutive cards of the same suit)
 * 3. Four of a Kind (4 cards of the same rank)
 * 4. Full House (3 of a kind + pair)
 * 5. Flush (5 cards of the same suit)
 * 6. Straight (5 consecutive cards)
 * 7. Three of a Kind (3 cards of the same rank)
 * 8. Two Pair (2 pairs of different ranks)
 * 9. One Pair (2 cards of the same rank)
 * 10. High Card (no matching cards)
 *
 * Special rules implemented:
 * - Ace can be high (A-K-Q-J-10) or low (A-2-3-4-5) in straights
 * - Ace-low straight (wheel) is the lowest possible straight
 * - All methods are static for performance and stateless operation
 */
export class HandEvaluator {
	/**
	 * Evaluates the best 5-card poker hand from hole cards and community cards
	 *
	 * @param holeCards - The player's 2 hole cards
	 * @param communityCards - The 5 community cards (flop, turn, river)
	 * @returns The best possible 5-card hand evaluation
	 * @throws Error if fewer than 5 total cards are provided
	 */
	static evaluateHand(
		holeCards: Card[],
		communityCards: Card[],
	): HandEvaluation {
		const allCards = [...holeCards, ...communityCards];

		if (allCards.length < 5) {
			throw new Error('Need at least 5 cards to evaluate hand');
		}

		// Generate all possible 5-card combinations
		const combinations = this.generateCombinations(allCards, 5);

		// Evaluate each combination and find the best
		let bestHand: HandEvaluation | null = null;

		for (const combination of combinations) {
			const evaluation = this.evaluateFiveCardHand(combination);

			if (!bestHand || evaluation.value > bestHand.value) {
				bestHand = evaluation;
			}
		}

		return bestHand!;
	}

	/**
	 * Evaluates a specific 5-card hand and determines its rank and value
	 *
	 * This method takes exactly 5 cards and determines the best poker hand
	 * they form. The evaluation includes the hand rank, cards used, kickers,
	 * and a numeric value for comparison purposes.
	 *
	 * @param cards - Array of exactly 5 cards to evaluate
	 * @returns HandEvaluation object containing rank, cards, kickers, and comparison value
	 * @throws Error if the number of cards is not exactly 5
	 */
	static evaluateFiveCardHand(cards: Card[]): HandEvaluation {
		if (cards.length !== 5) {
			throw new Error('Hand must contain exactly 5 cards');
		}

		// Sort cards by rank (descending)
		const sortedCards = [...cards].sort((a, b) => b.rank - a.rank);

		// Check for each hand type (from highest to lowest)
		return (
			this.checkRoyalFlush(sortedCards) ||
			this.checkStraightFlush(sortedCards) ||
			this.checkFourOfAKind(sortedCards) ||
			this.checkFullHouse(sortedCards) ||
			this.checkFlush(sortedCards) ||
			this.checkStraight(sortedCards) ||
			this.checkThreeOfAKind(sortedCards) ||
			this.checkTwoPair(sortedCards) ||
			this.checkOnePair(sortedCards) ||
			this.checkHighCard(sortedCards)
		);
	}

	/**
	 * Checks for royal flush (10-J-Q-K-A of same suit)
	 *
	 * A royal flush is the highest possible hand in poker, consisting of
	 * the top 5 cards of the same suit: 10, Jack, Queen, King, and Ace.
	 *
	 * @param sortedCards - Cards sorted in descending rank order
	 * @returns HandEvaluation if royal flush found, null otherwise
	 */
	private static checkRoyalFlush(sortedCards: Card[]): HandEvaluation | null {
		if (this.isRoyalFlush(sortedCards)) {
			return {
				rank: HandRank.RoyalFlush,
				cards: sortedCards,
				kickers: [],
				value: this.calculateHandValue(HandRank.RoyalFlush, sortedCards),
			};
		}
		return null;
	}

	/**
	 * Checks for straight flush (5 consecutive cards of same suit, excluding royal flush)
	 *
	 * A straight flush consists of 5 consecutive cards all of the same suit.
	 * Special handling for ace-low straight flush (A-2-3-4-5), also known as
	 * the "wheel" or "bicycle", which is the lowest possible straight flush.
	 *
	 * @param sortedCards - Cards sorted in descending rank order
	 * @returns HandEvaluation if straight flush found, null otherwise
	 */
	private static checkStraightFlush(
		sortedCards: Card[],
	): HandEvaluation | null {
		if (this.isStraightFlush(sortedCards)) {
			// Handle ace-low straight flush (wheel) specially
			if (this.isAceLowStraight(sortedCards)) {
				const wheelCards = this.sortWheelCards(sortedCards);
				return {
					rank: HandRank.StraightFlush,
					cards: wheelCards,
					kickers: [],
					value: this.calculateHandValue(HandRank.StraightFlush, [
						this.createTempCard(Rank.Five), // Use 5 as the high card for ace-low straight flush
					]),
				};
			}
			return {
				rank: HandRank.StraightFlush,
				cards: sortedCards,
				kickers: [],
				value: this.calculateHandValue(HandRank.StraightFlush, [
					sortedCards[0],
				]), // Use highest card
			};
		}
		return null;
	}

	/**
	 * Checks for four of a kind
	 */
	private static checkFourOfAKind(sortedCards: Card[]): HandEvaluation | null {
		const fourOfAKind = this.getFourOfAKind(sortedCards);
		if (fourOfAKind) {
			const kicker = sortedCards.find((c) => c.rank !== fourOfAKind.rank)!;
			return {
				rank: HandRank.FourOfAKind,
				cards: sortedCards,
				kickers: [kicker],
				value: this.calculateHandValue(HandRank.FourOfAKind, [
					fourOfAKind,
					kicker,
				]),
			};
		}
		return null;
	}

	/**
	 * Checks for full house
	 */
	private static checkFullHouse(sortedCards: Card[]): HandEvaluation | null {
		const fullHouse = this.getFullHouse(sortedCards);
		if (fullHouse) {
			return {
				rank: HandRank.FullHouse,
				cards: sortedCards,
				kickers: [],
				value: this.calculateHandValue(HandRank.FullHouse, [
					fullHouse.trips,
					fullHouse.pair,
				]),
			};
		}
		return null;
	}

	/**
	 * Checks for flush
	 */
	private static checkFlush(sortedCards: Card[]): HandEvaluation | null {
		if (this.isFlush(sortedCards)) {
			return {
				rank: HandRank.Flush,
				cards: sortedCards,
				kickers: sortedCards.slice(1), // All cards except the highest are kickers
				value: this.calculateHandValue(HandRank.Flush, sortedCards),
			};
		}
		return null;
	}

	/**
	 * Checks for straight
	 */
	private static checkStraight(sortedCards: Card[]): HandEvaluation | null {
		if (this.isStraight(sortedCards)) {
			// Handle ace-low straight (wheel) specially
			if (this.isAceLowStraight(sortedCards)) {
				const wheelCards = this.sortWheelCards(sortedCards);
				return {
					rank: HandRank.Straight,
					cards: wheelCards,
					kickers: [],
					value: this.calculateHandValue(HandRank.Straight, [
						this.createTempCard(Rank.Five), // Use 5 as the high card for ace-low straight
					]),
				};
			}
			return {
				rank: HandRank.Straight,
				cards: sortedCards,
				kickers: [],
				value: this.calculateHandValue(HandRank.Straight, [sortedCards[0]]), // Use highest card
			};
		}
		return null;
	}

	/**
	 * Checks for three of a kind
	 */
	private static checkThreeOfAKind(sortedCards: Card[]): HandEvaluation | null {
		const threeOfAKind = this.getThreeOfAKind(sortedCards);
		if (threeOfAKind) {
			const kickers = sortedCards.filter((c) => c.rank !== threeOfAKind.rank);
			return {
				rank: HandRank.ThreeOfAKind,
				cards: sortedCards,
				kickers: kickers,
				value: this.calculateHandValue(HandRank.ThreeOfAKind, [
					threeOfAKind,
					...kickers,
				]),
			};
		}
		return null;
	}

	/**
	 * Checks for two pair
	 */
	private static checkTwoPair(sortedCards: Card[]): HandEvaluation | null {
		const twoPair = this.getTwoPair(sortedCards);
		if (twoPair) {
			const kicker = sortedCards.find(
				(c) => c.rank !== twoPair.high.rank && c.rank !== twoPair.low.rank,
			)!;
			return {
				rank: HandRank.TwoPair,
				cards: sortedCards,
				kickers: [kicker],
				value: this.calculateHandValue(HandRank.TwoPair, [
					twoPair.high,
					twoPair.low,
					kicker,
				]),
			};
		}
		return null;
	}

	/**
	 * Checks for one pair
	 */
	private static checkOnePair(sortedCards: Card[]): HandEvaluation | null {
		const onePair = this.getOnePair(sortedCards);
		if (onePair) {
			const kickers = sortedCards.filter((c) => c.rank !== onePair.rank);
			return {
				rank: HandRank.OnePair,
				cards: sortedCards,
				kickers: kickers,
				value: this.calculateHandValue(HandRank.OnePair, [onePair, ...kickers]),
			};
		}
		return null;
	}

	/**
	 * Checks for high card
	 */
	private static checkHighCard(sortedCards: Card[]): HandEvaluation {
		return {
			rank: HandRank.HighCard,
			cards: sortedCards,
			kickers: sortedCards.slice(1),
			value: this.calculateHandValue(HandRank.HighCard, sortedCards),
		};
	}

	/**
	 * Sorts cards for wheel (A-2-3-4-5) display order
	 *
	 * In an ace-low straight, the ace should be displayed as the lowest card
	 * rather than the highest. This method re-sorts the cards to show them
	 * in the conventional order: 5-4-3-2-A.
	 *
	 * @param cards - The 5 cards forming an ace-low straight
	 * @returns Cards sorted in wheel display order (5-4-3-2-A)
	 */
	private static sortWheelCards(cards: Card[]): Card[] {
		const wheelCards = [...cards];
		// Re-sort for ace-low: 5-4-3-2-A
		wheelCards.sort((a, b) => {
			if (a.rank === Rank.Ace) return 1; // Ace becomes lowest
			if (b.rank === Rank.Ace) return -1;
			return b.rank - a.rank;
		});
		return wheelCards;
	}

	/**
	 * Compares two hands and returns the winner
	 * @returns 1 if hand1 wins, -1 if hand2 wins, 0 if tie
	 */
	static compareHands(hand1: HandEvaluation, hand2: HandEvaluation): number {
		if (hand1.value > hand2.value) return 1;
		if (hand1.value < hand2.value) return -1;
		return 0;
	}

	/**
	 * Generates all combinations of k cards from n cards
	 */
	private static generateCombinations(cards: Card[], k: number): Card[][] {
		const combinations: Card[][] = [];

		const combine = (start: number, combo: Card[]) => {
			if (combo.length === k) {
				combinations.push([...combo]);
				return;
			}

			for (let i = start; i < cards.length; i++) {
				combo.push(cards[i]);
				combine(i + 1, combo);
				combo.pop();
			}
		};

		combine(0, []);
		return combinations;
	}

	/**
	 * Checks if hand is a royal flush (10-J-Q-K-A of same suit)
	 */
	private static isRoyalFlush(cards: Card[]): boolean {
		if (!this.isFlush(cards)) return false;

		const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
		return (
			ranks[0] === Rank.Ace &&
			ranks[1] === Rank.King &&
			ranks[2] === Rank.Queen &&
			ranks[3] === Rank.Jack &&
			ranks[4] === Rank.Ten
		);
	}

	/**
	 * Checks if hand is a straight flush
	 */
	private static isStraightFlush(cards: Card[]): boolean {
		return this.isFlush(cards) && this.isStraight(cards);
	}

	/**
	 * Checks if hand is a flush
	 */
	private static isFlush(cards: Card[]): boolean {
		const suit = cards[0].suit;
		return cards.every((card) => card.suit === suit);
	}

	/**
	 * Checks if hand is a straight
	 */
	private static isStraight(cards: Card[]): boolean {
		const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);

		// Check for regular straight
		for (let i = 1; i < ranks.length; i++) {
			if (ranks[i] !== ranks[i - 1] - 1) {
				break;
			}
			if (i === ranks.length - 1) {
				return true;
			}
		}

		// Check for A-2-3-4-5 straight (wheel)
		if (
			ranks[0] === Rank.Ace &&
			ranks[1] === Rank.Five &&
			ranks[2] === Rank.Four &&
			ranks[3] === Rank.Three &&
			ranks[4] === Rank.Two
		) {
			return true;
		}

		return false;
	}

	/**
	 * Checks if hand is an ace-low straight (wheel)
	 */
	private static isAceLowStraight(cards: Card[]): boolean {
		const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
		return (
			ranks[0] === Rank.Ace &&
			ranks[1] === Rank.Five &&
			ranks[2] === Rank.Four &&
			ranks[3] === Rank.Three &&
			ranks[4] === Rank.Two
		);
	}

	/**
	 * Gets four of a kind if present
	 */
	private static getFourOfAKind(cards: Card[]): Card | null {
		const rankCounts = this.getRankCounts(cards);

		for (const [rank, count] of rankCounts) {
			if (count === 4) {
				return cards.find((c) => c.rank === rank)!;
			}
		}

		return null;
	}

	/**
	 * Gets full house if present
	 */
	private static getFullHouse(
		cards: Card[],
	): { trips: Card; pair: Card } | null {
		const rankCounts = this.getRankCounts(cards);
		let trips: Card | null = null;
		let pair: Card | null = null;

		for (const [rank, count] of rankCounts) {
			if (count === 3) {
				trips = cards.find((c) => c.rank === rank)!;
			} else if (count === 2) {
				pair = cards.find((c) => c.rank === rank)!;
			}
		}

		return trips && pair ? { trips, pair } : null;
	}

	/**
	 * Gets three of a kind if present
	 */
	private static getThreeOfAKind(cards: Card[]): Card | null {
		const rankCounts = this.getRankCounts(cards);

		for (const [rank, count] of rankCounts) {
			if (count === 3) {
				return cards.find((c) => c.rank === rank)!;
			}
		}

		return null;
	}

	/**
	 * Gets two pair if present
	 */
	private static getTwoPair(cards: Card[]): { high: Card; low: Card } | null {
		const rankCounts = this.getRankCounts(cards);
		const pairs: Card[] = [];

		for (const [rank, count] of rankCounts) {
			if (count === 2) {
				pairs.push(cards.find((c) => c.rank === rank)!);
			}
		}

		if (pairs.length === 2) {
			pairs.sort((a, b) => b.rank - a.rank);
			return { high: pairs[0], low: pairs[1] };
		}

		return null;
	}

	/**
	 * Gets one pair if present
	 */
	private static getOnePair(cards: Card[]): Card | null {
		const rankCounts = this.getRankCounts(cards);

		for (const [rank, count] of rankCounts) {
			if (count === 2) {
				return cards.find((c) => c.rank === rank)!;
			}
		}

		return null;
	}

	/**
	 * Creates a temporary card object for hand value calculation
	 *
	 * This helper method creates a minimal Card object used only for calculating
	 * hand comparison values. The suit is irrelevant for value calculation,
	 * so Hearts is used as a default.
	 *
	 * @param rank - The rank of the temporary card
	 * @returns A Card object with the specified rank and Hearts suit
	 */
	private static createTempCard(rank: Rank): Card {
		return new Card(Suit.Hearts, rank); // Suit doesn't matter for value calculation
	}

	/**
	 * Calculates a numeric value for hand comparison
	 *
	 * This method generates a unique numeric value for each possible poker hand
	 * that allows for accurate comparison. The value is calculated as:
	 * - Base value: Hand rank * 10 billion (ensures rank precedence)
	 * - Card values: Each significant card adds its rank * (100^position)
	 *
	 * This ensures that a higher-ranked hand always beats a lower-ranked hand,
	 * and within the same rank, proper kicker comparison is maintained.
	 *
	 * @param handRank - The type of poker hand (pair, flush, etc.)
	 * @param significantCards - Cards that determine hand strength (main cards + kickers)
	 * @returns Numeric value for comparison (higher = better hand)
	 */
	private static calculateHandValue(
		handRank: HandRank,
		significantCards: Card[],
	): number {
		// Use a much larger multiplier to ensure hand rank always dominates
		let value = handRank * 10000000000; // Base value for hand rank (10 billion)

		// Add significance of individual cards
		for (let i = 0; i < significantCards.length; i++) {
			value += significantCards[i].rank * Math.pow(100, 4 - i);
		}

		return value;
	}

	/**
	 * Counts occurrences of each rank in the hand
	 */
	private static getRankCounts(cards: Card[]): Map<Rank, number> {
		const counts = new Map<Rank, number>();

		for (const card of cards) {
			counts.set(card.rank, (counts.get(card.rank) || 0) + 1);
		}

		return counts;
	}
}
