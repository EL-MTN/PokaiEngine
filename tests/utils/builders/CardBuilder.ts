import { Card } from '@core/poker/cards/Card';
import { Rank, Suit } from '@core/types';

export class CardBuilder {
  static card(rank: Rank, suit: Suit): Card {
    return new Card(rank, suit);
  }

  static aceOfSpades(): Card {
    return new Card('A', 'spades');
  }

  static kingOfHearts(): Card {
    return new Card('K', 'hearts');
  }

  static queenOfDiamonds(): Card {
    return new Card('Q', 'diamonds');
  }

  static jackOfClubs(): Card {
    return new Card('J', 'clubs');
  }

  static randomCard(): Card {
    const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const randomRank = ranks[Math.floor(Math.random() * ranks.length)];
    const randomSuit = suits[Math.floor(Math.random() * suits.length)];
    return new Card(randomRank, randomSuit);
  }

  static royalFlush(): Card[] {
    return [
      new Card('A', 'spades'),
      new Card('K', 'spades'),
      new Card('Q', 'spades'),
      new Card('J', 'spades'),
      new Card('10', 'spades')
    ];
  }

  static straightFlush(): Card[] {
    return [
      new Card('9', 'hearts'),
      new Card('8', 'hearts'),
      new Card('7', 'hearts'),
      new Card('6', 'hearts'),
      new Card('5', 'hearts')
    ];
  }

  static fourOfAKind(): Card[] {
    return [
      new Card('K', 'spades'),
      new Card('K', 'hearts'),
      new Card('K', 'diamonds'),
      new Card('K', 'clubs'),
      new Card('2', 'spades')
    ];
  }

  static fullHouse(): Card[] {
    return [
      new Card('A', 'spades'),
      new Card('A', 'hearts'),
      new Card('A', 'diamonds'),
      new Card('K', 'spades'),
      new Card('K', 'hearts')
    ];
  }

  static flush(): Card[] {
    return [
      new Card('A', 'hearts'),
      new Card('J', 'hearts'),
      new Card('9', 'hearts'),
      new Card('5', 'hearts'),
      new Card('3', 'hearts')
    ];
  }

  static straight(): Card[] {
    return [
      new Card('10', 'spades'),
      new Card('9', 'hearts'),
      new Card('8', 'diamonds'),
      new Card('7', 'clubs'),
      new Card('6', 'spades')
    ];
  }

  static threeOfAKind(): Card[] {
    return [
      new Card('J', 'spades'),
      new Card('J', 'hearts'),
      new Card('J', 'diamonds'),
      new Card('5', 'clubs'),
      new Card('2', 'spades')
    ];
  }

  static twoPair(): Card[] {
    return [
      new Card('K', 'spades'),
      new Card('K', 'hearts'),
      new Card('7', 'diamonds'),
      new Card('7', 'clubs'),
      new Card('2', 'spades')
    ];
  }

  static onePair(): Card[] {
    return [
      new Card('10', 'spades'),
      new Card('10', 'hearts'),
      new Card('8', 'diamonds'),
      new Card('5', 'clubs'),
      new Card('2', 'spades')
    ];
  }

  static highCard(): Card[] {
    return [
      new Card('A', 'spades'),
      new Card('J', 'hearts'),
      new Card('8', 'diamonds'),
      new Card('5', 'clubs'),
      new Card('2', 'spades')
    ];
  }

  static communityCards(stage: 'flop' | 'turn' | 'river'): Card[] {
    const flop = [
      new Card('A', 'hearts'),
      new Card('K', 'hearts'),
      new Card('Q', 'hearts')
    ];

    if (stage === 'flop') return flop;
    if (stage === 'turn') return [...flop, new Card('J', 'hearts')];
    return [...flop, new Card('J', 'hearts'), new Card('10', 'hearts')];
  }
}