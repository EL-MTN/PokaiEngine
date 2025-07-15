import { Card } from '@core/poker/cards/Card';
import { GameState } from '@core/poker/game/GameState';
import { Player } from '@core/poker/game/Player';
import { BlindLevel, GamePhase, Rank, Suit } from '@core/types';

export class GameStateBuilder {
  private gameId: string = 'test-game-123';
  private players: Player[] = [];
  private currentBettingRound: number = 0;
  private stage: GamePhase = GamePhase.PreFlop;
  private pot: number = 0;
  private currentBet: number = 0;
  private dealerPosition: number = 0;
  private activePlayerIndex: number = 0;
  private lastAggressorIndex: number | null = null;
  private minimumRaiseAmount: number = 0;
  private communityCards: Card[] = [];
  private deck: Card[] = [];
  private blindLevel: BlindLevel = { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, duration: 15 };
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

  withStage(stage: GamePhase): GameStateBuilder {
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
    this.stage = GamePhase.PreFlop;
    this.communityCards = [];
    return this;
  }

  atFlop(): GameStateBuilder {
    this.stage = GamePhase.Flop;
    if (this.communityCards.length < 3) {
      this.communityCards = [
        new Card(Suit.Hearts, Rank.Ace),
        new Card(Suit.Hearts, Rank.King),
        new Card(Suit.Hearts, Rank.Queen)
      ];
    }
    return this;
  }

  atTurn(): GameStateBuilder {
    this.stage = GamePhase.Turn;
    if (this.communityCards.length < 4) {
      this.communityCards = [
        new Card(Suit.Hearts, Rank.Ace),
        new Card(Suit.Hearts, Rank.King),
        new Card(Suit.Hearts, Rank.Queen),
        new Card(Suit.Hearts, Rank.Jack)
      ];
    }
    return this;
  }

  atRiver(): GameStateBuilder {
    this.stage = GamePhase.River;
    if (this.communityCards.length < 5) {
      this.communityCards = [
        new Card(Suit.Hearts, Rank.Ace),
        new Card(Suit.Hearts, Rank.King),
        new Card(Suit.Hearts, Rank.Queen),
        new Card(Suit.Hearts, Rank.Jack),
        new Card(Suit.Hearts, Rank.Ten)
      ];
    }
    return this;
  }

  atShowdown(): GameStateBuilder {
    this.stage = GamePhase.Showdown;
    return this;
  }

  build(): GameState {
    const state = new GameState(
      this.gameId,
      this.blindLevel.smallBlind,
      this.blindLevel.bigBlind
    );

    // Set players
    state.players = this.players;
    
    // Set game state properties
    state.currentPhase = this.stage;
    state.dealerPosition = this.dealerPosition;
    state.communityCards = this.communityCards;
    state.handNumber = this.handNumber;
    
    // Set optional properties
    if (this.lastAggressorIndex !== null && this.players[this.lastAggressorIndex]) {
      state.lastAggressor = this.players[this.lastAggressorIndex].id;
    }

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