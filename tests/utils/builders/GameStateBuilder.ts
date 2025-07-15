import { Card } from '@core/poker/cards/Card';
import { GameState } from '@core/poker/game/GameState';
import { Player } from '@core/poker/game/Player';
import { BlindLevel, GameStage } from '@core/types';

export class GameStateBuilder {
  private gameId: string = 'test-game-123';
  private players: Player[] = [];
  private currentBettingRound: number = 0;
  private stage: GameStage = GameStage.PREFLOP;
  private pot: number = 0;
  private currentBet: number = 0;
  private dealerPosition: number = 0;
  private activePlayerIndex: number = 0;
  private lastAggressorIndex: number | null = null;
  private minimumRaiseAmount: number = 0;
  private communityCards: Card[] = [];
  private deck: Card[] = [];
  private blindLevel: BlindLevel = { smallBlind: 10, bigBlind: 20, ante: 0 };
  private handNumber: number = 1;

  withGameId(gameId: string): GameStateBuilder {
    this.gameId = gameId;
    return this;
  }

  withPlayers(players: Player[]): GameStateBuilder {
    this.players = players;
    return this;
  }

  withPlayer(player: Player): GameStateBuilder {
    this.players.push(player);
    return this;
  }

  withStage(stage: GameStage): GameStateBuilder {
    this.stage = stage;
    return this;
  }

  withPot(pot: number): GameStateBuilder {
    this.pot = pot;
    return this;
  }

  withCurrentBet(currentBet: number): GameStateBuilder {
    this.currentBet = currentBet;
    return this;
  }

  withDealerPosition(position: number): GameStateBuilder {
    this.dealerPosition = position;
    return this;
  }

  withActivePlayerIndex(index: number): GameStateBuilder {
    this.activePlayerIndex = index;
    return this;
  }

  withCommunityCards(cards: Card[]): GameStateBuilder {
    this.communityCards = cards;
    return this;
  }

  withBlindLevel(blindLevel: BlindLevel): GameStateBuilder {
    this.blindLevel = blindLevel;
    return this;
  }

  atPreflop(): GameStateBuilder {
    this.stage = GameStage.PREFLOP;
    this.communityCards = [];
    return this;
  }

  atFlop(): GameStateBuilder {
    this.stage = GameStage.FLOP;
    if (this.communityCards.length < 3) {
      this.communityCards = [
        new Card('A', 'hearts'),
        new Card('K', 'hearts'),
        new Card('Q', 'hearts')
      ];
    }
    return this;
  }

  atTurn(): GameStateBuilder {
    this.stage = GameStage.TURN;
    if (this.communityCards.length < 4) {
      this.communityCards = [
        new Card('A', 'hearts'),
        new Card('K', 'hearts'),
        new Card('Q', 'hearts'),
        new Card('J', 'hearts')
      ];
    }
    return this;
  }

  atRiver(): GameStateBuilder {
    this.stage = GameStage.RIVER;
    if (this.communityCards.length < 5) {
      this.communityCards = [
        new Card('A', 'hearts'),
        new Card('K', 'hearts'),
        new Card('Q', 'hearts'),
        new Card('J', 'hearts'),
        new Card('10', 'hearts')
      ];
    }
    return this;
  }

  atShowdown(): GameStateBuilder {
    this.stage = GameStage.SHOWDOWN;
    return this;
  }

  build(): GameState {
    const state = new GameState(
      this.gameId,
      this.players,
      this.blindLevel
    );

    state['currentBettingRound'] = this.currentBettingRound;
    state['stage'] = this.stage;
    state['pot'] = this.pot;
    state['currentBet'] = this.currentBet;
    state['dealerPosition'] = this.dealerPosition;
    state['activePlayerIndex'] = this.activePlayerIndex;
    state['lastAggressorIndex'] = this.lastAggressorIndex;
    state['minimumRaiseAmount'] = this.minimumRaiseAmount;
    state['communityCards'] = this.communityCards;
    state['deck'] = this.deck;
    state['handNumber'] = this.handNumber;

    return state;
  }

  static createDefault(): GameState {
    return new GameStateBuilder()
      .withPlayers([
        new Player('player1', 'Player 1', 1000),
        new Player('player2', 'Player 2', 1000)
      ])
      .build();
  }

  static createWithPlayers(count: number, startingChips: number = 1000): GameState {
    const builder = new GameStateBuilder();
    for (let i = 0; i < count; i++) {
      builder.withPlayer(new Player(`player${i + 1}`, `Player ${i + 1}`, startingChips));
    }
    return builder.build();
  }
}