import { Card } from '@/engine/poker/Card';
import { Rank, Suit } from '@/types';

export class CardBuilder {
	static card(suit: Suit, rank: Rank): Card {
		return new Card(suit, rank);
	}

	static aceOfSpades(): Card {
		return new Card(Suit.Spades, Rank.Ace);
	}

	static kingOfHearts(): Card {
		return new Card(Suit.Hearts, Rank.King);
	}

	static queenOfDiamonds(): Card {
		return new Card(Suit.Diamonds, Rank.Queen);
	}

	static jackOfClubs(): Card {
		return new Card(Suit.Clubs, Rank.Jack);
	}

	static randomCard(): Card {
		const ranks: Rank[] = [
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
		const suits: Suit[] = [Suit.Hearts, Suit.Diamonds, Suit.Clubs, Suit.Spades];
		const randomRank = ranks[Math.floor(Math.random() * ranks.length)];
		const randomSuit = suits[Math.floor(Math.random() * suits.length)];
		return new Card(randomSuit, randomRank);
	}

	static royalFlush(): Card[] {
		return [
			new Card(Suit.Spades, Rank.Ace),
			new Card(Suit.Spades, Rank.King),
			new Card(Suit.Spades, Rank.Queen),
			new Card(Suit.Spades, Rank.Jack),
			new Card(Suit.Spades, Rank.Ten),
		];
	}

	static straightFlush(): Card[] {
		return [
			new Card(Suit.Hearts, Rank.Nine),
			new Card(Suit.Hearts, Rank.Eight),
			new Card(Suit.Hearts, Rank.Seven),
			new Card(Suit.Hearts, Rank.Six),
			new Card(Suit.Hearts, Rank.Five),
		];
	}

	static fourOfAKind(): Card[] {
		return [
			new Card(Suit.Spades, Rank.King),
			new Card(Suit.Hearts, Rank.King),
			new Card(Suit.Diamonds, Rank.King),
			new Card(Suit.Clubs, Rank.King),
			new Card(Suit.Spades, Rank.Two),
		];
	}

	static fullHouse(): Card[] {
		return [
			new Card(Suit.Spades, Rank.Ace),
			new Card(Suit.Hearts, Rank.Ace),
			new Card(Suit.Diamonds, Rank.Ace),
			new Card(Suit.Spades, Rank.King),
			new Card(Suit.Hearts, Rank.King),
		];
	}

	static flush(): Card[] {
		return [
			new Card(Suit.Hearts, Rank.Ace),
			new Card(Suit.Hearts, Rank.Jack),
			new Card(Suit.Hearts, Rank.Nine),
			new Card(Suit.Hearts, Rank.Five),
			new Card(Suit.Hearts, Rank.Three),
		];
	}

	static straight(): Card[] {
		return [
			new Card(Suit.Spades, Rank.Ten),
			new Card(Suit.Hearts, Rank.Nine),
			new Card(Suit.Diamonds, Rank.Eight),
			new Card(Suit.Clubs, Rank.Seven),
			new Card(Suit.Spades, Rank.Six),
		];
	}

	static threeOfAKind(): Card[] {
		return [
			new Card(Suit.Spades, Rank.Jack),
			new Card(Suit.Hearts, Rank.Jack),
			new Card(Suit.Diamonds, Rank.Jack),
			new Card(Suit.Clubs, Rank.Five),
			new Card(Suit.Spades, Rank.Two),
		];
	}

	static twoPair(): Card[] {
		return [
			new Card(Suit.Spades, Rank.King),
			new Card(Suit.Hearts, Rank.King),
			new Card(Suit.Diamonds, Rank.Seven),
			new Card(Suit.Clubs, Rank.Seven),
			new Card(Suit.Spades, Rank.Two),
		];
	}

	static onePair(): Card[] {
		return [
			new Card(Suit.Spades, Rank.Ten),
			new Card(Suit.Hearts, Rank.Ten),
			new Card(Suit.Diamonds, Rank.Eight),
			new Card(Suit.Clubs, Rank.Five),
			new Card(Suit.Spades, Rank.Two),
		];
	}

	static highCard(): Card[] {
		return [
			new Card(Suit.Spades, Rank.Ace),
			new Card(Suit.Hearts, Rank.Jack),
			new Card(Suit.Diamonds, Rank.Eight),
			new Card(Suit.Clubs, Rank.Five),
			new Card(Suit.Spades, Rank.Two),
		];
	}

	static communityCards(stage: 'flop' | 'turn' | 'river'): Card[] {
		const flop = [
			new Card(Suit.Hearts, Rank.Ace),
			new Card(Suit.Hearts, Rank.King),
			new Card(Suit.Hearts, Rank.Queen),
		];

		if (stage === 'flop') return flop;
		if (stage === 'turn') return [...flop, new Card(Suit.Hearts, Rank.Jack)];
		return [
			...flop,
			new Card(Suit.Hearts, Rank.Jack),
			new Card(Suit.Hearts, Rank.Ten),
		];
	}
}
