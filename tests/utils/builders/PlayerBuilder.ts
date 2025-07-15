import { Card } from '@core/poker/cards/Card';
import { Player } from '@core/poker/game/Player';
import { PlayerStatus } from '@core/types';

export class PlayerBuilder {
  private id: string = 'player-1';
  private name: string = 'Test Player';
  private chips: number = 1000;
  private bet: number = 0;
  private totalBet: number = 0;
  private holeCards: Card[] = [];
  private hasFolded: boolean = false;
  private hasActed: boolean = false;
  private isAllIn: boolean = false;
  private isActive: boolean = true;
  private isSittingOut: boolean = false;
  private winnings: number = 0;
  private isBot: boolean = false;
  private status: PlayerStatus = PlayerStatus.ACTIVE;

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

  withBet(bet: number): PlayerBuilder {
    this.bet = bet;
    return this;
  }

  withTotalBet(totalBet: number): PlayerBuilder {
    this.totalBet = totalBet;
    return this;
  }

  withHoleCards(cards: Card[]): PlayerBuilder {
    this.holeCards = cards;
    return this;
  }

  withAceKing(): PlayerBuilder {
    this.holeCards = [
      new Card('A', 'spades'),
      new Card('K', 'spades')
    ];
    return this;
  }

  withPocketAces(): PlayerBuilder {
    this.holeCards = [
      new Card('A', 'spades'),
      new Card('A', 'hearts')
    ];
    return this;
  }

  with72Offsuit(): PlayerBuilder {
    this.holeCards = [
      new Card('7', 'spades'),
      new Card('2', 'hearts')
    ];
    return this;
  }

  asFolded(): PlayerBuilder {
    this.hasFolded = true;
    this.status = PlayerStatus.FOLDED;
    return this;
  }

  asAllIn(): PlayerBuilder {
    this.isAllIn = true;
    this.bet = this.chips;
    this.totalBet = this.chips;
    this.chips = 0;
    return this;
  }

  asSittingOut(): PlayerBuilder {
    this.isSittingOut = true;
    this.status = PlayerStatus.SITTING_OUT;
    return this;
  }

  asBot(): PlayerBuilder {
    this.isBot = true;
    return this;
  }

  withHasActed(): PlayerBuilder {
    this.hasActed = true;
    return this;
  }

  build(): Player {
    const player = new Player(this.id, this.name, this.chips);
    
    player['bet'] = this.bet;
    player['totalBet'] = this.totalBet;
    player['holeCards'] = this.holeCards;
    player['hasFolded'] = this.hasFolded;
    player['hasActed'] = this.hasActed;
    player['isAllIn'] = this.isAllIn;
    player['isActive'] = this.isActive;
    player['isSittingOut'] = this.isSittingOut;
    player['winnings'] = this.winnings;
    player['isBot'] = this.isBot;
    player['status'] = this.status;

    return player;
  }

  static createDefault(): Player {
    return new PlayerBuilder().build();
  }

  static createWithChips(chips: number): Player {
    return new PlayerBuilder().withChips(chips).build();
  }

  static createMultiple(count: number, chipsPerPlayer: number = 1000): Player[] {
    const players: Player[] = [];
    for (let i = 0; i < count; i++) {
      players.push(
        new PlayerBuilder()
          .withId(`player-${i + 1}`)
          .withName(`Player ${i + 1}`)
          .withChips(chipsPerPlayer)
          .build()
      );
    }
    return players;
  }
}