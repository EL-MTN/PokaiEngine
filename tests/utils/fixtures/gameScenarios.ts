import { GameState } from '@core/poker/game/GameState';

import { CardBuilder, GameStateBuilder, PlayerBuilder } from '../builders';

export const GameScenarios = {
  headsUp: {
    preflop: (): GameState => {
      const player1 = new PlayerBuilder()
        .withId('player1')
        .withName('Alice')
        .withChips(1000)
        .withPocketAces()
        .build();

      const player2 = new PlayerBuilder()
        .withId('player2')
        .withName('Bob')
        .withChips(1000)
        .withAceKing()
        .build();

      return new GameStateBuilder()
        .withPlayers([player1, player2])
        .atPreflop()
        .withBlindLevel({ smallBlind: 10, bigBlind: 20, ante: 0 })
        .build();
    },

    allInPreflop: (): GameState => {
      const player1 = new PlayerBuilder()
        .withId('player1')
        .withName('Alice')
        .withChips(500)
        .withPocketAces()
        .asAllIn()
        .build();

      const player2 = new PlayerBuilder()
        .withId('player2')
        .withName('Bob')
        .withChips(500)
        .withAceKing()
        .build();

      return new GameStateBuilder()
        .withPlayers([player1, player2])
        .atPreflop()
        .withPot(1000)
        .withCurrentBet(500)
        .build();
    }
  },

  multiway: {
    threePlayers: (): GameState => {
      const players = [
        new PlayerBuilder().withId('p1').withName('Alice').withChips(1500).build(),
        new PlayerBuilder().withId('p2').withName('Bob').withChips(1000).build(),
        new PlayerBuilder().withId('p3').withName('Charlie').withChips(800).build()
      ];

      return new GameStateBuilder()
        .withPlayers(players)
        .atFlop()
        .withCommunityCards(CardBuilder.communityCards('flop'))
        .withPot(150)
        .build();
    },

    withFoldedPlayers: (): GameState => {
      const players = [
        new PlayerBuilder().withId('p1').withName('Alice').withChips(1500).build(),
        new PlayerBuilder().withId('p2').withName('Bob').withChips(1000).asFolded().build(),
        new PlayerBuilder().withId('p3').withName('Charlie').withChips(800).build(),
        new PlayerBuilder().withId('p4').withName('David').withChips(1200).asFolded().build(),
        new PlayerBuilder().withId('p5').withName('Eve').withChips(900).build()
      ];

      return new GameStateBuilder()
        .withPlayers(players)
        .atTurn()
        .withCommunityCards(CardBuilder.communityCards('turn'))
        .withPot(300)
        .build();
    }
  },

  sidePots: {
    simple: (): GameState => {
      const player1 = new PlayerBuilder()
        .withId('p1')
        .withName('ShortStack')
        .withChips(0)
        .withTotalBet(200)
        .asAllIn()
        .build();

      const player2 = new PlayerBuilder()
        .withId('p2')
        .withName('MediumStack')
        .withChips(300)
        .withBet(200)
        .withTotalBet(200)
        .build();

      const player3 = new PlayerBuilder()
        .withId('p3')
        .withName('BigStack')
        .withChips(800)
        .withBet(200)
        .withTotalBet(200)
        .build();

      return new GameStateBuilder()
        .withPlayers([player1, player2, player3])
        .atRiver()
        .withPot(600)
        .withCurrentBet(200)
        .build();
    },

    complex: (): GameState => {
      const players = [
        new PlayerBuilder().withId('p1').withChips(0).withTotalBet(100).asAllIn().build(),
        new PlayerBuilder().withId('p2').withChips(0).withTotalBet(300).asAllIn().build(),
        new PlayerBuilder().withId('p3').withChips(0).withTotalBet(500).asAllIn().build(),
        new PlayerBuilder().withId('p4').withChips(200).withTotalBet(500).build(),
        new PlayerBuilder().withId('p5').withChips(1000).withTotalBet(500).build()
      ];

      return new GameStateBuilder()
        .withPlayers(players)
        .atShowdown()
        .withPot(1900)
        .build();
    }
  },

  specialCases: {
    onlyOneActivePlayer: (): GameState => {
      const players = [
        new PlayerBuilder().withId('p1').withChips(2000).build(),
        new PlayerBuilder().withId('p2').withChips(0).asFolded().build(),
        new PlayerBuilder().withId('p3').withChips(0).asSittingOut().build(),
        new PlayerBuilder().withId('p4').withChips(0).asFolded().build()
      ];

      return new GameStateBuilder()
        .withPlayers(players)
        .atPreflop()
        .build();
    },

    allPlayersAllIn: (): GameState => {
      const players = PlayerBuilder.createMultiple(4, 0).map((player, i) => {
        return new PlayerBuilder()
          .withId(player.id)
          .withName(player.name)
          .withChips(0)
          .withTotalBet((i + 1) * 100)
          .asAllIn()
          .build();
      });

      return new GameStateBuilder()
        .withPlayers(players)
        .atRiver()
        .withPot(1000)
        .build();
    },

    bigBlindWinsUncontested: (): GameState => {
      const players = [
        new PlayerBuilder().withId('sb').withChips(990).asFolded().build(),
        new PlayerBuilder().withId('bb').withChips(980).withTotalBet(20).build(),
        new PlayerBuilder().withId('p3').withChips(1000).asFolded().build()
      ];

      return new GameStateBuilder()
        .withPlayers(players)
        .atPreflop()
        .withPot(30)
        .withBlindLevel({ smallBlind: 10, bigBlind: 20, ante: 0 })
        .build();
    }
  },

  tournaments: {
    bubble: (): GameState => {
      const players = [
        new PlayerBuilder().withId('p1').withChips(50000).build(),
        new PlayerBuilder().withId('p2').withChips(30000).build(),
        new PlayerBuilder().withId('p3').withChips(15000).build(),
        new PlayerBuilder().withId('p4').withChips(5000).build()
      ];

      return new GameStateBuilder()
        .withPlayers(players)
        .withBlindLevel({ smallBlind: 1000, bigBlind: 2000, ante: 200 })
        .atPreflop()
        .build();
    },

    headsUpForTitle: (): GameState => {
      const players = [
        new PlayerBuilder().withId('p1').withChips(750000).build(),
        new PlayerBuilder().withId('p2').withChips(250000).build()
      ];

      return new GameStateBuilder()
        .withPlayers(players)
        .withBlindLevel({ smallBlind: 10000, bigBlind: 20000, ante: 2000 })
        .atFlop()
        .build();
    }
  }
};