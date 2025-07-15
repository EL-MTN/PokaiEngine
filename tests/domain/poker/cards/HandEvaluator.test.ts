import { HandEvaluator } from '@/domain/poker/cards/HandEvaluator';
import { Card } from '@/domain/poker/cards/Card';
import { HandRank } from '@/domain/types';

describe('HandEvaluator', () => {
	// Helper to create a hand from strings
	const createHand = (cardStrings: string[]) => Card.fromStrings(cardStrings);

	describe('evaluateFiveCardHand', () => {
		it('should correctly identify a Royal Flush', () => {
			const hand = createHand(['AS', 'KS', 'QS', 'JS', 'TS']);
			const result = HandEvaluator.evaluateFiveCardHand(hand);
			expect(result.rank).toBe(HandRank.RoyalFlush);
			expect(result.value).toBeGreaterThan(
				HandRank.StraightFlush * 10000000000,
			);
		});

		it('should correctly identify a Straight Flush', () => {
			const hand = createHand(['9S', '8S', '7S', '6S', '5S']);
			const result = HandEvaluator.evaluateFiveCardHand(hand);
			expect(result.rank).toBe(HandRank.StraightFlush);
		});

		it('should correctly identify an Ace-low Straight Flush (Steel Wheel)', () => {
			const hand = createHand(['AS', '2S', '3S', '4S', '5S']);
			const result = HandEvaluator.evaluateFiveCardHand(hand);
			expect(result.rank).toBe(HandRank.StraightFlush);
			// The high card for value calculation should be the Five
			expect(result.cards.map((c) => c.rank).sort((a, b) => b - a)).toEqual([
				14, 5, 4, 3, 2,
			]);
		});

		it('should correctly identify Four of a Kind', () => {
			const hand = createHand(['AH', 'AC', 'AD', 'AS', 'KS']);
			const result = HandEvaluator.evaluateFiveCardHand(hand);
			expect(result.rank).toBe(HandRank.FourOfAKind);
			expect(result.kickers.length).toBe(1);
			expect(result.kickers[0].toString()).toBe('KS');
		});

		it('should correctly identify a Full House', () => {
			const hand = createHand(['AH', 'AC', 'AD', 'KS', 'KD']);
			const result = HandEvaluator.evaluateFiveCardHand(hand);
			expect(result.rank).toBe(HandRank.FullHouse);
		});

		it('should correctly identify a Flush', () => {
			const hand = createHand(['AS', 'QS', 'TS', '8S', '6S']);
			const result = HandEvaluator.evaluateFiveCardHand(hand);
			expect(result.rank).toBe(HandRank.Flush);
		});

		it('should correctly identify a Straight', () => {
			const hand = createHand(['9S', '8H', '7D', '6C', '5S']);
			const result = HandEvaluator.evaluateFiveCardHand(hand);
			expect(result.rank).toBe(HandRank.Straight);
		});

		it('should correctly identify an Ace-low Straight (Wheel)', () => {
			const hand = createHand(['AS', '2H', '3D', '4C', '5S']);
			const result = HandEvaluator.evaluateFiveCardHand(hand);
			expect(result.rank).toBe(HandRank.Straight);
			expect(result.cards.map((c) => c.rank).sort((a, b) => b - a)).toEqual([
				14, 5, 4, 3, 2,
			]);
		});

		it('should correctly identify Three of a Kind', () => {
			const hand = createHand(['AH', 'AC', 'AD', 'KS', 'QS']);
			const result = HandEvaluator.evaluateFiveCardHand(hand);
			expect(result.rank).toBe(HandRank.ThreeOfAKind);
			expect(result.kickers.length).toBe(2);
		});

		it('should correctly identify Two Pair', () => {
			const hand = createHand(['AH', 'AC', 'KD', 'KS', 'QS']);
			const result = HandEvaluator.evaluateFiveCardHand(hand);
			expect(result.rank).toBe(HandRank.TwoPair);
			expect(result.kickers.length).toBe(1);
			expect(result.kickers[0].toString()).toBe('QS');
		});

		it('should correctly identify One Pair', () => {
			const hand = createHand(['AH', 'AC', 'KD', 'JS', 'QS']);
			const result = HandEvaluator.evaluateFiveCardHand(hand);
			expect(result.rank).toBe(HandRank.OnePair);
			expect(result.kickers.length).toBe(3);
		});

		it('should correctly identify High Card', () => {
			const hand = createHand(['AH', 'KC', 'QD', 'JS', '9S']);
			const result = HandEvaluator.evaluateFiveCardHand(hand);
			expect(result.rank).toBe(HandRank.HighCard);
			expect(result.kickers.length).toBe(4);
		});

		it('should throw an error if not exactly 5 cards are provided', () => {
			const hand = createHand(['AH', 'AC']);
			expect(() => HandEvaluator.evaluateFiveCardHand(hand)).toThrow(
				'Hand must contain exactly 5 cards',
			);
		});
	});

	describe('evaluateHand (7-card evaluation)', () => {
		it('should find the best hand (Flush) from 7 cards', () => {
			const holeCards = createHand(['AS', '2S']);
			const communityCards = createHand(['KS', 'QS', 'JS', '3H', '4D']);
			const result = HandEvaluator.evaluateHand(holeCards, communityCards);
			expect(result.rank).toBe(HandRank.Flush);
		});

		it('should find a Full House instead of a lower Flush', () => {
			const holeCards = createHand(['AH', 'AD']);
			const communityCards = createHand(['AS', 'KH', 'KD', '2H', '3H']);
			const result = HandEvaluator.evaluateHand(holeCards, communityCards);
			expect(result.rank).toBe(HandRank.FullHouse);
		});

		it('should find a straight from community cards when hole cards dont play', () => {
			const holeCards = createHand(['AH', 'AD']);
			const communityCards = createHand(['2S', '3H', '4D', '5C', '6S']);
			const result = HandEvaluator.evaluateHand(holeCards, communityCards);
			expect(result.rank).toBe(HandRank.Straight);
		});

		it('should use one hole card to make a better straight', () => {
			const holeCards = createHand(['7S', 'AD']);
			const communityCards = createHand(['2S', '3H', '4D', '5C', '6S']);
			const result = HandEvaluator.evaluateHand(holeCards, communityCards);
			expect(result.rank).toBe(HandRank.Straight);
			expect(result.cards.map((c) => c.toString()).sort()).toEqual(
				['3H', '4D', '5C', '6S', '7S'].sort(),
			);
		});

		it('should throw an error if fewer than 5 total cards are provided', () => {
			const holeCards = createHand(['AS', 'KS']);
			const communityCards = createHand(['QS']);
			expect(() =>
				HandEvaluator.evaluateHand(holeCards, communityCards),
			).toThrow('Need at least 5 cards to evaluate hand');
		});
	});

	describe('Hand Comparison (Edge Cases)', () => {
		it('should correctly compare two different flushes', () => {
			const flush1 = HandEvaluator.evaluateFiveCardHand(
				createHand(['AS', 'KS', 'QS', 'JS', '8S']),
			);
			const flush2 = HandEvaluator.evaluateFiveCardHand(
				createHand(['AD', 'KD', 'QD', 'JD', '7D']),
			);
			expect(HandEvaluator.compareHands(flush1, flush2)).toBe(1);
		});

		it('should correctly compare two flushes with same high cards but different kickers', () => {
			const flush1 = HandEvaluator.evaluateFiveCardHand(
				createHand(['AS', 'KS', 'QS', 'JS', '8S']),
			);
			const flush2 = HandEvaluator.evaluateFiveCardHand(
				createHand(['AS', 'KS', 'QS', 'JS', '7S']),
			);
			expect(HandEvaluator.compareHands(flush1, flush2)).toBe(1);
		});

		it('should correctly compare two different straights', () => {
			const straight1 = HandEvaluator.evaluateFiveCardHand(
				createHand(['TH', '9S', '8D', '7C', '6H']),
			);
			const straight2 = HandEvaluator.evaluateFiveCardHand(
				createHand(['9H', '8S', '7D', '6C', '5H']),
			);
			expect(HandEvaluator.compareHands(straight1, straight2)).toBe(1);
		});

		it('should correctly compare two full houses (higher trips win)', () => {
			const fullHouse1 = HandEvaluator.evaluateFiveCardHand(
				createHand(['AH', 'AS', 'AD', '2C', '2H']),
			);
			const fullHouse2 = HandEvaluator.evaluateFiveCardHand(
				createHand(['KH', 'KS', 'KD', 'QC', 'QH']),
			);
			expect(HandEvaluator.compareHands(fullHouse1, fullHouse2)).toBe(1);
		});

		it('should correctly compare two full houses (higher pair wins if trips are same)', () => {
			// This case is impossible in Texas Holdem with a single deck, but the logic should be sound.
			const fullHouse1 = HandEvaluator.evaluateFiveCardHand(
				createHand(['AH', 'AS', 'AD', 'KC', 'KH']),
			);
			const fullHouse2 = HandEvaluator.evaluateFiveCardHand(
				createHand(['AH', 'AS', 'AD', 'QC', 'QH']),
			);
			expect(HandEvaluator.compareHands(fullHouse1, fullHouse2)).toBe(1);
		});

		it('should correctly compare two Two-Pairs (higher top pair wins)', () => {
			const twoPair1 = HandEvaluator.evaluateFiveCardHand(
				createHand(['AH', 'AS', '2D', '2C', 'KH']),
			);
			const twoPair2 = HandEvaluator.evaluateFiveCardHand(
				createHand(['KH', 'KS', 'QD', 'QC', 'JH']),
			);
			expect(HandEvaluator.compareHands(twoPair1, twoPair2)).toBe(1);
		});

		it('should correctly compare two Two-Pairs (higher bottom pair wins)', () => {
			const twoPair1 = HandEvaluator.evaluateFiveCardHand(
				createHand(['AH', 'AS', '3D', '3C', 'KH']),
			);
			const twoPair2 = HandEvaluator.evaluateFiveCardHand(
				createHand(['AH', 'AS', '2D', '2C', 'KH']),
			);
			expect(HandEvaluator.compareHands(twoPair1, twoPair2)).toBe(1);
		});

		it('should correctly compare two Two-Pairs (kicker wins)', () => {
			const twoPair1 = HandEvaluator.evaluateFiveCardHand(
				createHand(['AH', 'AS', '2D', '2C', 'KH']),
			);
			const twoPair2 = HandEvaluator.evaluateFiveCardHand(
				createHand(['AH', 'AS', '2D', '2C', 'QH']),
			);
			expect(HandEvaluator.compareHands(twoPair1, twoPair2)).toBe(1);
		});

		it('should correctly compare two pairs (kicker wins)', () => {
			const pair1 = HandEvaluator.evaluateFiveCardHand(
				createHand(['AH', 'AS', 'KD', 'JC', 'TH']),
			);
			const pair2 = HandEvaluator.evaluateFiveCardHand(
				createHand(['AH', 'AS', 'KD', 'JC', '9H']),
			);
			expect(HandEvaluator.compareHands(pair1, pair2)).toBe(1);
		});

		it('should result in a tie for identical hands', () => {
			const hand1 = HandEvaluator.evaluateFiveCardHand(
				createHand(['AH', 'AS', 'KD', 'JC', 'TH']),
			);
			const hand2 = HandEvaluator.evaluateFiveCardHand(
				createHand(['AD', 'AC', 'KH', 'JS', 'TC']),
			);
			expect(HandEvaluator.compareHands(hand1, hand2)).toBe(0);
		});
	});
});
