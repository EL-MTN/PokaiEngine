import { HandEvaluator } from '../../core/cards/HandEvaluator';
import { Card } from '../../core/cards/Card';
import { HandRank, Rank, Suit } from '../../types';

describe('HandEvaluator Fixes', () => {
	describe('Royal Flush Detection', () => {
		test('should correctly identify royal flush (10-J-Q-K-A)', () => {
			const royalFlush = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Hearts, Rank.King),
				new Card(Suit.Hearts, Rank.Queen),
				new Card(Suit.Hearts, Rank.Jack),
				new Card(Suit.Hearts, Rank.Ten),
			];

			const evaluation = HandEvaluator.evaluateFiveCardHand(royalFlush);
			expect(evaluation.rank).toBe(HandRank.RoyalFlush);
		});

		test('should NOT identify ace-low straight flush as royal flush', () => {
			const aceLowStraightFlush = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Hearts, Rank.Two),
				new Card(Suit.Hearts, Rank.Three),
				new Card(Suit.Hearts, Rank.Four),
				new Card(Suit.Hearts, Rank.Five),
			];

			const evaluation = HandEvaluator.evaluateFiveCardHand(aceLowStraightFlush);
			expect(evaluation.rank).toBe(HandRank.StraightFlush);
			expect(evaluation.rank).not.toBe(HandRank.RoyalFlush);
		});

		test('should correctly identify other straight flushes', () => {
			const straightFlush = [
				new Card(Suit.Diamonds, Rank.Nine),
				new Card(Suit.Diamonds, Rank.Eight),
				new Card(Suit.Diamonds, Rank.Seven),
				new Card(Suit.Diamonds, Rank.Six),
				new Card(Suit.Diamonds, Rank.Five),
			];

			const evaluation = HandEvaluator.evaluateFiveCardHand(straightFlush);
			expect(evaluation.rank).toBe(HandRank.StraightFlush);
		});

		test('should correctly rank royal flush higher than straight flush', () => {
			const royalFlush = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Hearts, Rank.King),
				new Card(Suit.Hearts, Rank.Queen),
				new Card(Suit.Hearts, Rank.Jack),
				new Card(Suit.Hearts, Rank.Ten),
			];

			const straightFlush = [
				new Card(Suit.Diamonds, Rank.Nine),
				new Card(Suit.Diamonds, Rank.Eight),
				new Card(Suit.Diamonds, Rank.Seven),
				new Card(Suit.Diamonds, Rank.Six),
				new Card(Suit.Diamonds, Rank.Five),
			];

			const royalEval = HandEvaluator.evaluateFiveCardHand(royalFlush);
			const straightEval = HandEvaluator.evaluateFiveCardHand(straightFlush);

			expect(royalEval.value).toBeGreaterThan(straightEval.value);
		});

		test('should correctly rank ace-low straight flush as lowest straight flush', () => {
			const aceLowStraightFlush = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Hearts, Rank.Two),
				new Card(Suit.Hearts, Rank.Three),
				new Card(Suit.Hearts, Rank.Four),
				new Card(Suit.Hearts, Rank.Five),
			];

			const sixHighStraightFlush = [
				new Card(Suit.Diamonds, Rank.Six),
				new Card(Suit.Diamonds, Rank.Five),
				new Card(Suit.Diamonds, Rank.Four),
				new Card(Suit.Diamonds, Rank.Three),
				new Card(Suit.Diamonds, Rank.Two),
			];

			const aceLowEval = HandEvaluator.evaluateFiveCardHand(aceLowStraightFlush);
			const sixHighEval = HandEvaluator.evaluateFiveCardHand(sixHighStraightFlush);

			expect(aceLowEval.value).toBeLessThan(sixHighEval.value);
		});
	});
});