import { Card } from './Card';
import { HandRank, HandEvaluation, Rank, Suit } from '../../types';

export class HandEvaluator {
	/**
	 * Evaluates the best 5-card poker hand from hole cards and community cards
	 */
	static evaluateHand(holeCards: Card[], communityCards: Card[]): HandEvaluation {
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
	 * Evaluates a specific 5-card hand
	 */
	static evaluateFiveCardHand(cards: Card[]): HandEvaluation {
		if (cards.length !== 5) {
			throw new Error('Hand must contain exactly 5 cards');
		}

		// Sort cards by rank (descending)
		const sortedCards = [...cards].sort((a, b) => b.rank - a.rank);

		// Check for each hand type (from highest to lowest)

		// Royal Flush
		if (this.isRoyalFlush(sortedCards)) {
			return {
				rank: HandRank.RoyalFlush,
				cards: sortedCards,
				kickers: [],
				value: this.calculateHandValue(HandRank.RoyalFlush, sortedCards),
			};
		}

		// Straight Flush
		if (this.isStraightFlush(sortedCards)) {
			// Handle ace-low straight flush (wheel) specially
			if (this.isAceLowStraight(sortedCards)) {
				// For ace-low straight flush, treat ace as 1 for comparison
				const wheelCards = [...sortedCards];
				// Re-sort for ace-low: 5-4-3-2-A
				wheelCards.sort((a, b) => {
					if (a.rank === Rank.Ace) return 1; // Ace becomes lowest
					if (b.rank === Rank.Ace) return -1;
					return b.rank - a.rank;
				});
				return {
					rank: HandRank.StraightFlush,
					cards: wheelCards,
					kickers: [],
					value: this.calculateHandValue(HandRank.StraightFlush, [
						{ rank: 5 } as Card, // Use 5 as the high card for ace-low straight flush
					]),
				};
			}
			return {
				rank: HandRank.StraightFlush,
				cards: sortedCards,
				kickers: [],
				value: this.calculateHandValue(HandRank.StraightFlush, [sortedCards[0]]), // Use highest card
			};
		}

		// Four of a Kind
		const fourOfAKind = this.getFourOfAKind(sortedCards);
		if (fourOfAKind) {
			const kicker = sortedCards.find((c) => c.rank !== fourOfAKind.rank)!;
			return {
				rank: HandRank.FourOfAKind,
				cards: sortedCards,
				kickers: [kicker],
				value: this.calculateHandValue(HandRank.FourOfAKind, [fourOfAKind, kicker]),
			};
		}

		// Full House
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

		// Flush
		if (this.isFlush(sortedCards)) {
			return {
				rank: HandRank.Flush,
				cards: sortedCards,
				kickers: sortedCards.slice(1), // All cards except the highest are kickers
				value: this.calculateHandValue(HandRank.Flush, sortedCards),
			};
		}

		// Straight
		if (this.isStraight(sortedCards)) {
			// Handle ace-low straight (wheel) specially
			if (this.isAceLowStraight(sortedCards)) {
				// For ace-low straight, treat ace as 1 for comparison
				const wheelCards = [...sortedCards];
				// Re-sort for ace-low: 5-4-3-2-A
				wheelCards.sort((a, b) => {
					if (a.rank === Rank.Ace) return 1; // Ace becomes lowest
					if (b.rank === Rank.Ace) return -1;
					return b.rank - a.rank;
				});
				return {
					rank: HandRank.Straight,
					cards: wheelCards,
					kickers: [],
					value: this.calculateHandValue(HandRank.Straight, [
						{ rank: 5 } as Card, // Use 5 as the high card for ace-low straight
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

		// Three of a Kind
		const threeOfAKind = this.getThreeOfAKind(sortedCards);
		if (threeOfAKind) {
			const kickers = sortedCards.filter((c) => c.rank !== threeOfAKind.rank);
			return {
				rank: HandRank.ThreeOfAKind,
				cards: sortedCards,
				kickers: kickers,
				value: this.calculateHandValue(HandRank.ThreeOfAKind, [threeOfAKind, ...kickers]),
			};
		}

		// Two Pair
		const twoPair = this.getTwoPair(sortedCards);
		if (twoPair) {
			const kicker = sortedCards.find(
				(c) => c.rank !== twoPair.high.rank && c.rank !== twoPair.low.rank
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

		// One Pair
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

		// High Card
		return {
			rank: HandRank.HighCard,
			cards: sortedCards,
			kickers: sortedCards.slice(1),
			value: this.calculateHandValue(HandRank.HighCard, sortedCards),
		};
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
	 * Checks if hand is a royal flush
	 */
	private static isRoyalFlush(cards: Card[]): boolean {
		return this.isFlush(cards) && this.isStraight(cards) && cards[0].rank === Rank.Ace;
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
	private static getFullHouse(cards: Card[]): { trips: Card; pair: Card } | null {
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
	 * Calculates a numeric value for hand comparison
	 */
	private static calculateHandValue(handRank: HandRank, significantCards: Card[]): number {
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
