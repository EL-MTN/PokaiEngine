import { Card } from '@/domain/poker/cards/Card';
import { Player } from '@/domain/poker/game/Player';
import { Action, ActionType, Position, Rank, Suit } from '@/domain/types';

describe('Player', () => {
	describe('Constructor', () => {
		it('should create a player with default values', () => {
			const player = new Player('p1', 'John Doe', 1000);

			expect(player.id).toBe('p1');
			expect(player.name).toBe('John Doe');
			expect(player.chipStack).toBe(1000);
			expect(player.timeBank).toBe(30);
			expect(player.isActive).toBe(true);
			expect(player.hasActed).toBe(false);
			expect(player.isFolded).toBe(false);
			expect(player.isAllIn).toBe(false);
			expect(player.currentBet).toBe(0);
			expect(player.totalBetThisHand).toBe(0);
			expect(player.isConnected).toBe(true);
			expect(player.actionsThisRound).toEqual([]);
			expect(player.totalWinnings).toBe(0);
			expect(player.handsPlayed).toBe(0);
			expect(player.holeCards).toBeUndefined();
			expect(player.position).toBeUndefined();
		});

		it('should create a player with custom timeBank', () => {
			const player = new Player('p1', 'John Doe', 1000, 60);
			expect(player.timeBank).toBe(60);
		});

		it('should handle zero chip stack', () => {
			const player = new Player('p1', 'Broke Player', 0);
			expect(player.chipStack).toBe(0);
		});
	});

	describe('Hole Cards Management', () => {
		let player: Player;

		beforeEach(() => {
			player = new Player('p1', 'John', 1000);
		});

		it('should deal hole cards correctly', () => {
			const cards: [Card, Card] = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Spades, Rank.King),
			];

			player.dealHoleCards(cards);
			expect(player.holeCards).toEqual(cards);
		});

		it('should clear hole cards', () => {
			const cards: [Card, Card] = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Spades, Rank.King),
			];

			player.dealHoleCards(cards);
			player.clearHoleCards();
			expect(player.holeCards).toBeUndefined();
		});

		it('should overwrite existing hole cards when dealing new ones', () => {
			const firstCards: [Card, Card] = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Spades, Rank.King),
			];
			const secondCards: [Card, Card] = [
				new Card(Suit.Diamonds, Rank.Queen),
				new Card(Suit.Clubs, Rank.Jack),
			];

			player.dealHoleCards(firstCards);
			player.dealHoleCards(secondCards);
			expect(player.holeCards).toEqual(secondCards);
		});
	});

	describe('Betting Actions', () => {
		let player: Player;

		beforeEach(() => {
			player = new Player('p1', 'John', 1000);
		});

		it('should handle normal bet', () => {
			player.bet(100);

			expect(player.chipStack).toBe(900);
			expect(player.currentBet).toBe(100);
			expect(player.totalBetThisHand).toBe(100);
			expect(player.hasActed).toBe(true);
			expect(player.isAllIn).toBe(false);
		});

		it('should handle multiple bets in same hand', () => {
			player.bet(100);
			player.bet(200);

			expect(player.chipStack).toBe(700);
			expect(player.currentBet).toBe(300);
			expect(player.totalBetThisHand).toBe(300);
		});

		it('should handle all-in when bet exceeds chip stack', () => {
			player.bet(1500); // More than 1000 chips

			expect(player.chipStack).toBe(0);
			expect(player.currentBet).toBe(1000);
			expect(player.totalBetThisHand).toBe(1000);
			expect(player.isAllIn).toBe(true);
			expect(player.hasActed).toBe(true);
		});

		it('should handle exact all-in bet', () => {
			player.bet(1000);

			expect(player.chipStack).toBe(0);
			expect(player.currentBet).toBe(1000);
			expect(player.totalBetThisHand).toBe(1000);
			expect(player.isAllIn).toBe(true);
		});

		it('should handle zero bet', () => {
			player.bet(0);

			expect(player.chipStack).toBe(1000);
			expect(player.currentBet).toBe(0);
			expect(player.totalBetThisHand).toBe(0);
			expect(player.hasActed).toBe(true);
			expect(player.isAllIn).toBe(false);
		});
	});

	describe('Fold Action', () => {
		let player: Player;

		beforeEach(() => {
			player = new Player('p1', 'John', 1000);
		});

		it('should fold correctly', () => {
			player.fold();

			expect(player.isFolded).toBe(true);
			expect(player.hasActed).toBe(true);
			expect(player.chipStack).toBe(1000); // Chips unchanged
		});

		it('should remain folded after multiple fold calls', () => {
			player.fold();
			player.fold();

			expect(player.isFolded).toBe(true);
			expect(player.hasActed).toBe(true);
		});
	});

	describe('Blind Posting', () => {
		let player: Player;

		beforeEach(() => {
			player = new Player('p1', 'John', 1000);
		});

		it('should post blind correctly', () => {
			player.postBlind(50);

			expect(player.chipStack).toBe(950);
			expect(player.currentBet).toBe(50);
			expect(player.totalBetThisHand).toBe(50);
			expect(player.hasActed).toBe(false); // Blind posting doesn't count as voluntary action
			expect(player.isAllIn).toBe(false);
		});

		it('should handle blind posting exceeding chip stack', () => {
			player.postBlind(1500);

			expect(player.chipStack).toBe(0);
			expect(player.currentBet).toBe(1000);
			expect(player.totalBetThisHand).toBe(1000);
			expect(player.isAllIn).toBe(true);
			expect(player.hasActed).toBe(false);
		});

		it('should handle exact all-in blind', () => {
			player.postBlind(1000);

			expect(player.chipStack).toBe(0);
			expect(player.currentBet).toBe(1000);
			expect(player.totalBetThisHand).toBe(1000);
			expect(player.isAllIn).toBe(true);
		});

		it('should handle zero blind', () => {
			player.postBlind(0);

			expect(player.chipStack).toBe(1000);
			expect(player.currentBet).toBe(0);
			expect(player.totalBetThisHand).toBe(0);
			expect(player.isAllIn).toBe(false);
		});
	});

	describe('Check Action', () => {
		let player: Player;

		beforeEach(() => {
			player = new Player('p1', 'John', 1000);
		});

		it('should check correctly', () => {
			player.check();

			expect(player.hasActed).toBe(true);
			expect(player.chipStack).toBe(1000); // Unchanged
			expect(player.currentBet).toBe(0); // Unchanged
			expect(player.isFolded).toBe(false);
			expect(player.isAllIn).toBe(false);
		});
	});

	describe('Chip Management', () => {
		let player: Player;

		beforeEach(() => {
			player = new Player('p1', 'John', 1000);
		});

		it('should add chips correctly', () => {
			player.addChips(500);

			expect(player.chipStack).toBe(1500);
			expect(player.totalWinnings).toBe(500);
		});

		it('should add multiple chip amounts', () => {
			player.addChips(200);
			player.addChips(300);

			expect(player.chipStack).toBe(1500);
			expect(player.totalWinnings).toBe(500);
		});

		it('should handle zero chip addition', () => {
			player.addChips(0);

			expect(player.chipStack).toBe(1000);
			expect(player.totalWinnings).toBe(0);
		});

		it('should remove chips correctly', () => {
			player.removeChips(200);

			expect(player.chipStack).toBe(800);
		});

		it('should handle removing more chips than available', () => {
			player.removeChips(1500);

			expect(player.chipStack).toBe(0);
		});

		it('should handle exact chip removal', () => {
			player.removeChips(1000);

			expect(player.chipStack).toBe(0);
		});

		it('should handle zero chip removal', () => {
			player.removeChips(0);

			expect(player.chipStack).toBe(1000);
		});
	});

	describe('State Reset Methods', () => {
		let player: Player;

		beforeEach(() => {
			player = new Player('p1', 'John', 1000);
			// Set up some state
			player.hasActed = true;
			player.isFolded = true;
			player.isAllIn = true;
			player.currentBet = 100;
			player.totalBetThisHand = 100;
			player.dealHoleCards([
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Spades, Rank.King),
			]);
			player.recordAction({
				type: ActionType.Bet,
				playerId: 'p1',
				amount: 100,
				timestamp: Date.now(),
			});
		});

		it('should reset for new hand correctly', () => {
			const initialHandsPlayed = player.handsPlayed;
			player.resetForNewHand();

			expect(player.hasActed).toBe(false);
			expect(player.isFolded).toBe(false);
			expect(player.isAllIn).toBe(false);
			expect(player.currentBet).toBe(0);
			expect(player.totalBetThisHand).toBe(0);
			expect(player.holeCards).toBeUndefined();
			expect(player.actionsThisRound).toEqual([]);
			expect(player.handsPlayed).toBe(initialHandsPlayed + 1);
		});

		it('should reset for new round correctly', () => {
			const initialHandsPlayed = player.handsPlayed;
			player.resetForNewRound();

			expect(player.hasActed).toBe(false);
			expect(player.currentBet).toBe(0);
			expect(player.actionsThisRound).toEqual([]);
			// These should remain unchanged for round reset
			expect(player.isFolded).toBe(true);
			expect(player.isAllIn).toBe(true);
			expect(player.totalBetThisHand).toBe(100);
			expect(player.holeCards).toBeDefined();
			expect(player.handsPlayed).toBe(initialHandsPlayed); // Unchanged
		});
	});

	describe('Action Recording', () => {
		let player: Player;

		beforeEach(() => {
			player = new Player('p1', 'John', 1000);
		});

		it('should record single action', () => {
			const action: Action = {
				type: ActionType.Bet,
				playerId: 'p1',
				amount: 100,
				timestamp: Date.now(),
			};

			player.recordAction(action);
			expect(player.actionsThisRound).toEqual([action]);
		});

		it('should record multiple actions', () => {
			const action1: Action = {
				type: ActionType.Bet,
				playerId: 'p1',
				amount: 100,
				timestamp: Date.now(),
			};
			const action2: Action = {
				type: ActionType.Fold,
				playerId: 'p1',
				timestamp: Date.now(),
			};

			player.recordAction(action1);
			player.recordAction(action2);
			expect(player.actionsThisRound).toEqual([action1, action2]);
		});
	});

	describe('State Check Methods', () => {
		let player: Player;

		beforeEach(() => {
			player = new Player('p1', 'John', 1000);
		});

		it('should return true for canAct when player can act', () => {
			expect(player.canAct()).toBe(true);
		});

		it('should return false for canAct when player is inactive', () => {
			player.setInactive();
			expect(player.canAct()).toBe(false);
		});

		it('should return false for canAct when player is folded', () => {
			player.fold();
			expect(player.canAct()).toBe(false);
		});

		it('should return false for canAct when player is all-in', () => {
			player.bet(1000); // All-in
			expect(player.canAct()).toBe(false);
		});

		it('should return false for canAct when player has no chips', () => {
			player.removeChips(1000);
			expect(player.canAct()).toBe(false);
		});

		it('should return true for isEligibleForPot when not folded', () => {
			expect(player.isEligibleForPot()).toBe(true);
		});

		it('should return false for isEligibleForPot when folded', () => {
			player.fold();
			expect(player.isEligibleForPot()).toBe(false);
		});

		it('should return correct max bet', () => {
			expect(player.getMaxBet()).toBe(1000);

			player.bet(300);
			expect(player.getMaxBet()).toBe(700);

			player.addChips(200);
			expect(player.getMaxBet()).toBe(900);
		});
	});

	describe('Position Management', () => {
		let player: Player;

		beforeEach(() => {
			player = new Player('p1', 'John', 1000);
		});

		it('should set position correctly', () => {
			player.setPosition(Position.Button);
			expect(player.position).toBe(Position.Button);
		});

		it('should update position', () => {
			player.setPosition(Position.SmallBlind);
			player.setPosition(Position.BigBlind);
			expect(player.position).toBe(Position.BigBlind);
		});
	});

	describe('Connection Management', () => {
		let player: Player;

		beforeEach(() => {
			player = new Player('p1', 'John', 1000);
		});

		it('should disconnect player', () => {
			player.disconnect();
			expect(player.isConnected).toBe(false);
		});

		it('should reconnect player', () => {
			player.disconnect();
			player.reconnect();
			expect(player.isConnected).toBe(true);
		});
	});

	describe('Activity Management', () => {
		let player: Player;

		beforeEach(() => {
			player = new Player('p1', 'John', 1000);
		});

		it('should set player inactive', () => {
			player.setInactive();
			expect(player.isActive).toBe(false);
		});

		it('should set player active', () => {
			player.setInactive();
			player.setActive();
			expect(player.isActive).toBe(true);
		});
	});

	describe('Information Methods', () => {
		let player: Player;

		beforeEach(() => {
			player = new Player('p1', 'John Doe', 1000);
			player.setPosition(Position.Button);
			player.dealHoleCards([
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Spades, Rank.King),
			]);
			player.bet(100);
		});

		it('should return correct public info (without hole cards)', () => {
			const publicInfo = player.getPublicInfo();

			expect(publicInfo.id).toBe('p1');
			expect(publicInfo.name).toBe('John Doe');
			expect(publicInfo.chipStack).toBe(900);
			expect(publicInfo.position).toBe(Position.Button);
			expect(publicInfo.isActive).toBe(true);
			expect(publicInfo.hasActed).toBe(true);
			expect(publicInfo.isFolded).toBe(false);
			expect(publicInfo.isAllIn).toBe(false);
			expect(publicInfo.currentBet).toBe(100);
			expect(publicInfo.totalBetThisHand).toBe(100);
			expect('holeCards' in publicInfo).toBe(false);
		});

		it('should return correct complete info (with hole cards)', () => {
			const completeInfo = player.getCompleteInfo();

			expect(completeInfo.id).toBe('p1');
			expect(completeInfo.name).toBe('John Doe');
			expect(completeInfo.chipStack).toBe(900);
			expect(completeInfo.position).toBe(Position.Button);
			expect(completeInfo.isActive).toBe(true);
			expect(completeInfo.hasActed).toBe(true);
			expect(completeInfo.isFolded).toBe(false);
			expect(completeInfo.isAllIn).toBe(false);
			expect(completeInfo.currentBet).toBe(100);
			expect(completeInfo.totalBetThisHand).toBe(100);
			expect(completeInfo.holeCards).toEqual([
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Spades, Rank.King),
			]);
		});
	});

	describe('Clone Method', () => {
		let originalPlayer: Player;

		beforeEach(() => {
			originalPlayer = new Player('p1', 'John Doe', 1000, 45);
			originalPlayer.setPosition(Position.Button);
			originalPlayer.dealHoleCards([
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Spades, Rank.King),
			]);
			originalPlayer.bet(100);
			originalPlayer.disconnect();
			originalPlayer.recordAction({
				type: ActionType.Bet,
				playerId: 'p1',
				amount: 100,
				timestamp: Date.now(),
			});
			originalPlayer.addChips(50);
		});

		it('should create exact copy of player', () => {
			const clonedPlayer = originalPlayer.clone();

			expect(clonedPlayer.id).toBe(originalPlayer.id);
			expect(clonedPlayer.name).toBe(originalPlayer.name);
			expect(clonedPlayer.chipStack).toBe(originalPlayer.chipStack);
			expect(clonedPlayer.timeBank).toBe(originalPlayer.timeBank);
			expect(clonedPlayer.position).toBe(originalPlayer.position);
			expect(clonedPlayer.isActive).toBe(originalPlayer.isActive);
			expect(clonedPlayer.hasActed).toBe(originalPlayer.hasActed);
			expect(clonedPlayer.isFolded).toBe(originalPlayer.isFolded);
			expect(clonedPlayer.isAllIn).toBe(originalPlayer.isAllIn);
			expect(clonedPlayer.holeCards).toEqual(originalPlayer.holeCards);
			expect(clonedPlayer.currentBet).toBe(originalPlayer.currentBet);
			expect(clonedPlayer.totalBetThisHand).toBe(
				originalPlayer.totalBetThisHand,
			);
			expect(clonedPlayer.isConnected).toBe(originalPlayer.isConnected);
			expect(clonedPlayer.actionsThisRound).toEqual(
				originalPlayer.actionsThisRound,
			);
			expect(clonedPlayer.totalWinnings).toBe(originalPlayer.totalWinnings);
			expect(clonedPlayer.handsPlayed).toBe(originalPlayer.handsPlayed);
		});

		it('should create independent copy (not reference)', () => {
			const clonedPlayer = originalPlayer.clone();

			// Modify original
			originalPlayer.bet(200);
			originalPlayer.setPosition(Position.SmallBlind);
			originalPlayer.recordAction({
				type: ActionType.Fold,
				playerId: 'p1',
				timestamp: Date.now(),
			});

			// Clone should remain unchanged
			expect(clonedPlayer.currentBet).toBe(100);
			expect(clonedPlayer.position).toBe(Position.Button);
			expect(clonedPlayer.actionsThisRound).toHaveLength(1);
		});

		it('should handle cloning player with no hole cards', () => {
			originalPlayer.clearHoleCards();
			const clonedPlayer = originalPlayer.clone();

			expect(clonedPlayer.holeCards).toBeUndefined();
		});

		it('should handle cloning player with empty actions', () => {
			originalPlayer.resetForNewRound();
			const clonedPlayer = originalPlayer.clone();

			expect(clonedPlayer.actionsThisRound).toEqual([]);
		});
	});

	describe('Edge Cases and Complex Scenarios', () => {
		let player: Player;

		beforeEach(() => {
			player = new Player('p1', 'John', 1000);
		});

		it('should handle sequence of bets leading to all-in', () => {
			player.bet(400);
			expect(player.isAllIn).toBe(false);

			player.bet(600);
			expect(player.chipStack).toBe(0);
			expect(player.currentBet).toBe(1000);
			expect(player.isAllIn).toBe(true);
		});

		it('should handle bet after fold (state should remain folded)', () => {
			player.fold();
			player.bet(100);

			expect(player.isFolded).toBe(true);
			expect(player.chipStack).toBe(900); // Bet still processed
			expect(player.hasActed).toBe(true);
		});

		it('should handle multiple state changes', () => {
			player.bet(100);
			player.setPosition(Position.SmallBlind);
			player.disconnect();
			player.setInactive();

			expect(player.currentBet).toBe(100);
			expect(player.position).toBe(Position.SmallBlind);
			expect(player.isConnected).toBe(false);
			expect(player.isActive).toBe(false);
			expect(player.canAct()).toBe(false);
		});

		it('should handle complex hand lifecycle', () => {
			// Pre-flop
			player.postBlind(50);
			player.dealHoleCards([
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Spades, Rank.King),
			]);

			// Flop action
			player.resetForNewRound();
			player.bet(100);

			// Turn action
			player.resetForNewRound();
			player.check();

			// River action
			player.resetForNewRound();
			player.bet(200);

			// Hand complete
			player.addChips(500); // Won the pot
			player.resetForNewHand();

			expect(player.chipStack).toBe(1150); // 1000 - 50 - 100 - 200 + 500
			expect(player.totalWinnings).toBe(500);
			expect(player.handsPlayed).toBe(1);
			expect(player.holeCards).toBeUndefined();
			expect(player.currentBet).toBe(0);
			expect(player.hasActed).toBe(false);
		});
	});
});
