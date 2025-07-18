import { Card } from '@/engine/poker/Card';
import { Player } from '@/engine/poker/Player';
import { Rank, Suit } from '@/types';

export class PlayerBuilder {
	private id: string = 'player-1';
	private name: string = 'Test Player';
	private chips: number = 1000;
	private currentBet: number = 0;
	private totalBetThisHand: number = 0;
	private holeCards: [Card, Card] | undefined = undefined;
	private isFolded: boolean = false;
	private hasActed: boolean = false;
	private isAllIn: boolean = false;
	private isActive: boolean = true;

	withId(id: string): PlayerBuilder {
		this.id = id;
		return this;
	}

	withName(name: string): PlayerBuilder {
		this.name = name;
		return this;
	}

	withChips(chips: number): PlayerBuilder {
		this.chips = chips;
		return this;
	}

	withCurrentBet(bet: number): PlayerBuilder {
		this.currentBet = bet;
		return this;
	}

	withTotalBetThisHand(totalBet: number): PlayerBuilder {
		this.totalBetThisHand = totalBet;
		return this;
	}

	withHoleCards(cards: [Card, Card]): PlayerBuilder {
		this.holeCards = cards;
		return this;
	}

	withAceKing(): PlayerBuilder {
		this.holeCards = [
			new Card(Suit.Spades, Rank.Ace),
			new Card(Suit.Spades, Rank.King),
		];
		return this;
	}

	withPocketAces(): PlayerBuilder {
		this.holeCards = [
			new Card(Suit.Spades, Rank.Ace),
			new Card(Suit.Hearts, Rank.Ace),
		];
		return this;
	}

	with72Offsuit(): PlayerBuilder {
		this.holeCards = [
			new Card(Suit.Spades, Rank.Seven),
			new Card(Suit.Hearts, Rank.Two),
		];
		return this;
	}

	asFolded(): PlayerBuilder {
		this.isFolded = true;
		return this;
	}

	asAllIn(): PlayerBuilder {
		this.isAllIn = true;
		this.currentBet = this.chips;
		this.totalBetThisHand = this.chips;
		this.chips = 0;
		return this;
	}

	asInactive(): PlayerBuilder {
		this.isActive = false;
		return this;
	}

	withHasActed(): PlayerBuilder {
		this.hasActed = true;
		return this;
	}

	build(): Player {
		const player = new Player(this.id, this.name, this.chips);

		if (this.holeCards) {
			player.dealHoleCards(this.holeCards);
		}

		// Set internal properties using bracket notation for private properties
		(player as any).currentBet = this.currentBet;
		(player as any).totalBetThisHand = this.totalBetThisHand;
		(player as any).isFolded = this.isFolded;
		(player as any).hasActed = this.hasActed;
		(player as any).isAllIn = this.isAllIn;
		(player as any).isActive = this.isActive;

		return player;
	}

	static createDefault(): Player {
		return new PlayerBuilder().build();
	}

	static createWithChips(chips: number): Player {
		return new PlayerBuilder().withChips(chips).build();
	}

	static createMultiple(
		count: number,
		chipsPerPlayer: number = 1000,
	): Player[] {
		const players: Player[] = [];
		for (let i = 0; i < count; i++) {
			players.push(
				new PlayerBuilder()
					.withId(`player-${i + 1}`)
					.withName(`Player ${i + 1}`)
					.withChips(chipsPerPlayer)
					.build(),
			);
		}
		return players;
	}
}
