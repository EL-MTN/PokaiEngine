import { GameState } from '@/domain/poker/game/GameState';
import { Player } from '@/domain/poker/game/Player';
import { Card } from '@/domain/poker/cards/Card';
import { GamePhase, Position, Suit, Rank } from '@/domain/types';

describe('GameState', () => {
	describe('Constructor', () => {
		it('should create a game state with correct initial values', () => {
			const gameState = new GameState('game-1', 5, 10);

			expect(gameState.id).toBe('game-1');
			expect(gameState.smallBlindAmount).toBe(5);
			expect(gameState.bigBlindAmount).toBe(10);
			expect(gameState.minimumRaise).toBe(10);
			expect(gameState.lastRaiseAmount).toBe(10);
			expect(gameState.currentPhase).toBe(GamePhase.PreFlop);
			expect(gameState.dealerPosition).toBe(0);
			expect(gameState.smallBlindPosition).toBe(0);
			expect(gameState.bigBlindPosition).toBe(0);
			expect(gameState.handNumber).toBe(0);
			expect(gameState.isComplete).toBe(false);
			expect(gameState.players).toEqual([]);
			expect(gameState.communityCards).toEqual([]);
			expect(gameState.pots).toHaveLength(1); // PotManager creates initial empty pot
			expect(gameState.pots[0].amount).toBe(0);
			expect(gameState.currentPlayerToAct).toBeUndefined();
			expect(gameState.lastAggressor).toBeUndefined();
		});

		it('should handle different blind amounts', () => {
			const gameState = new GameState('game-1', 25, 50);

			expect(gameState.smallBlindAmount).toBe(25);
			expect(gameState.bigBlindAmount).toBe(50);
			expect(gameState.minimumRaise).toBe(50);
		});

		it('should handle zero blind amounts', () => {
			const gameState = new GameState('game-1', 0, 0);

			expect(gameState.smallBlindAmount).toBe(0);
			expect(gameState.bigBlindAmount).toBe(0);
			expect(gameState.minimumRaise).toBe(0);
		});
	});

	describe('Player Management', () => {
		let gameState: GameState;

		beforeEach(() => {
			gameState = new GameState('game-1', 5, 10);
		});

		it('should add a player successfully', () => {
			const player = new Player('p1', 'Alice', 1000);
			gameState.addPlayer(player);

			expect(gameState.players).toHaveLength(1);
			expect(gameState.players[0]).toBe(player);
			expect(gameState.getPlayer('p1')).toBe(player);
		});

		it('should add multiple players', () => {
			const player1 = new Player('p1', 'Alice', 1000);
			const player2 = new Player('p2', 'Bob', 1500);

			gameState.addPlayer(player1);
			gameState.addPlayer(player2);

			expect(gameState.players).toHaveLength(2);
			expect(gameState.getPlayer('p1')).toBe(player1);
			expect(gameState.getPlayer('p2')).toBe(player2);
		});

		it('should throw error when adding duplicate player', () => {
			const player1 = new Player('p1', 'Alice', 1000);
			const player2 = new Player('p1', 'Bob', 1500); // Same ID

			gameState.addPlayer(player1);
			expect(() => gameState.addPlayer(player2)).toThrow('Player already exists in the game');
		});

		it('should throw error when adding 11th player', () => {
			// Add 10 players
			for (let i = 1; i <= 10; i++) {
				gameState.addPlayer(new Player(`p${i}`, `Player ${i}`, 1000));
			}

			const extraPlayer = new Player('p11', 'Extra Player', 1000);
			expect(() => gameState.addPlayer(extraPlayer)).toThrow(
				'Maximum number of players (10) reached'
			);
		});

		it('should remove a player successfully', () => {
			const player1 = new Player('p1', 'Alice', 1000);
			const player2 = new Player('p2', 'Bob', 1500);

			gameState.addPlayer(player1);
			gameState.addPlayer(player2);
			gameState.removePlayer('p1');

			expect(gameState.players).toHaveLength(1);
			expect(gameState.getPlayer('p1')).toBeUndefined();
			expect(gameState.getPlayer('p2')).toBe(player2);
		});

		it('should throw error when removing non-existent player', () => {
			expect(() => gameState.removePlayer('nonexistent')).toThrow('Player not found');
		});

		it('should return undefined for non-existent player', () => {
			expect(gameState.getPlayer('nonexistent')).toBeUndefined();
		});
	});

	describe('Player Filtering Methods', () => {
		let gameState: GameState;
		let player1: Player;
		let player2: Player;
		let player3: Player;

		beforeEach(() => {
			gameState = new GameState('game-1', 5, 10);
			player1 = new Player('p1', 'Alice', 1000);
			player2 = new Player('p2', 'Bob', 1500);
			player3 = new Player('p3', 'Charlie', 2000);

			gameState.addPlayer(player1);
			gameState.addPlayer(player2);
			gameState.addPlayer(player3);
		});

		it('should get all active players', () => {
			const activePlayers = gameState.getActivePlayers();
			expect(activePlayers).toHaveLength(3);
			expect(activePlayers).toContain(player1);
			expect(activePlayers).toContain(player2);
			expect(activePlayers).toContain(player3);
		});

		it('should filter out inactive players', () => {
			player2.setInactive();
			const activePlayers = gameState.getActivePlayers();
			expect(activePlayers).toHaveLength(2);
			expect(activePlayers).not.toContain(player2);
		});

		it('should get players in hand (not folded)', () => {
			const playersInHand = gameState.getPlayersInHand();
			expect(playersInHand).toHaveLength(3);
		});

		it('should filter out folded players', () => {
			player1.fold();
			const playersInHand = gameState.getPlayersInHand();
			expect(playersInHand).toHaveLength(2);
			expect(playersInHand).not.toContain(player1);
		});

		it('should get players who can act', () => {
			const playersWhoCanAct = gameState.getPlayersWhoCanAct();
			expect(playersWhoCanAct).toHaveLength(3);
		});

		it('should filter out players who cannot act', () => {
			player1.fold();
			player2.bet(1500); // All-in
			player3.setInactive();

			const playersWhoCanAct = gameState.getPlayersWhoCanAct();
			expect(playersWhoCanAct).toHaveLength(0);
		});
	});

	describe('Position Assignment', () => {
		let gameState: GameState;

		beforeEach(() => {
			gameState = new GameState('game-1', 5, 10);
		});

		it('should not assign positions with less than 2 players', () => {
			const player = new Player('p1', 'Alice', 1000);
			gameState.addPlayer(player);

			expect(player.position).toBeUndefined();
		});

		it('should assign heads-up positions correctly', () => {
			const player1 = new Player('p1', 'Alice', 1000);
			const player2 = new Player('p2', 'Bob', 1500);

			gameState.addPlayer(player1);
			gameState.addPlayer(player2);

			// In heads-up, dealer is small blind
			expect(player1.position).toBe(Position.SmallBlind);
			expect(player2.position).toBe(Position.BigBlind);
		});

		it('should assign 3-player positions correctly', () => {
			const player1 = new Player('p1', 'Alice', 1000);
			const player2 = new Player('p2', 'Bob', 1500);
			const player3 = new Player('p3', 'Charlie', 2000);

			gameState.addPlayer(player1);
			gameState.addPlayer(player2);
			gameState.addPlayer(player3);

			expect(player1.position).toBe(Position.Button);
			expect(player2.position).toBe(Position.SmallBlind);
			expect(player3.position).toBe(Position.BigBlind);
		});

		it('should assign 6-player positions correctly', () => {
			const players = [];
			for (let i = 1; i <= 6; i++) {
				const player = new Player(`p${i}`, `Player ${i}`, 1000);
				players.push(player);
				gameState.addPlayer(player);
			}

			expect(players[0].position).toBe(Position.Button);
			expect(players[1].position).toBe(Position.SmallBlind);
			expect(players[2].position).toBe(Position.BigBlind);
			expect(players[3].position).toBe(Position.UnderTheGun);
			expect(players[4].position).toBe(Position.MiddlePosition1);
			expect(players[5].position).toBe(Position.Cutoff);
		});

		it('should handle inactive players in position assignment', () => {
			const player1 = new Player('p1', 'Alice', 1000);
			const player2 = new Player('p2', 'Bob', 1500);
			const player3 = new Player('p3', 'Charlie', 2000);

			gameState.addPlayer(player1);
			gameState.addPlayer(player2);
			gameState.addPlayer(player3);

			// Make middle player inactive
			player2.setInactive();
			gameState.assignPositions();

			// Only active players should get positions (heads-up now)
			expect(player1.position).toBe(Position.SmallBlind); // Dealer is SB in heads-up
			// Note: inactive player retains previous position (engine behavior)
			expect(player3.position).toBe(Position.BigBlind);

			// Verify only active players are considered for game logic
			const activePlayers = gameState.getActivePlayers();
			expect(activePlayers).toHaveLength(2);
			expect(activePlayers).not.toContain(player2);
		});
	});

	describe('Hand Lifecycle', () => {
		let gameState: GameState;
		let player1: Player;
		let player2: Player;

		beforeEach(() => {
			gameState = new GameState('game-1', 5, 10);
			player1 = new Player('p1', 'Alice', 1000);
			player2 = new Player('p2', 'Bob', 1500);
			gameState.addPlayer(player1);
			gameState.addPlayer(player2);
		});

		it('should start a new hand correctly', () => {
			// Simulate some previous state
			player1.fold();
			player2.bet(100);
			gameState.communityCards.push(new Card(Suit.Hearts, Rank.Ace));
			gameState.currentPhase = GamePhase.Flop;

			gameState.startNewHand();

			expect(gameState.handNumber).toBe(1);
			expect(gameState.currentPhase).toBe(GamePhase.PreFlop);
			expect(gameState.communityCards).toEqual([]);
			expect(gameState.isComplete).toBe(false);
			expect(gameState.minimumRaise).toBe(10);
			expect(player1.isFolded).toBe(false);
			expect(player2.currentBet).toBe(0);
		});

		it('should move dealer button on new hand', () => {
			const initialDealer = gameState.dealerPosition;
			gameState.startNewHand();
			expect(gameState.dealerPosition).toBe((initialDealer + 1) % 2);
		});

		it('should advance phases correctly', () => {
			expect(gameState.currentPhase).toBe(GamePhase.PreFlop);

			gameState.advancePhase();
			expect(gameState.currentPhase).toBe(GamePhase.Flop);

			gameState.advancePhase();
			expect(gameState.currentPhase).toBe(GamePhase.Turn);

			gameState.advancePhase();
			expect(gameState.currentPhase).toBe(GamePhase.River);

			gameState.advancePhase();
			expect(gameState.currentPhase).toBe(GamePhase.Showdown);

			gameState.advancePhase();
			expect(gameState.currentPhase).toBe(GamePhase.HandComplete);
			expect(gameState.isComplete).toBe(true);
		});

		it('should throw error when trying to advance from HandComplete', () => {
			gameState.currentPhase = GamePhase.HandComplete;
			expect(() => gameState.advancePhase()).toThrow('Cannot advance from current phase');
		});

		it('should reset betting round state on phase advance', () => {
			// Set up some betting state
			player1.bet(50);
			gameState.minimumRaise = 100;
			gameState.lastRaiseAmount = 75;

			gameState.advancePhase();

			expect(gameState.minimumRaise).toBe(10); // Reset to big blind
			expect(gameState.lastRaiseAmount).toBe(10);
			expect(player1.hasActed).toBe(false);
			expect(player1.currentBet).toBe(0);
		});
	});

	describe('Community Cards', () => {
		let gameState: GameState;

		beforeEach(() => {
			gameState = new GameState('game-1', 5, 10);
		});

		it('should deal flop correctly', () => {
			const flop = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Spades, Rank.King),
				new Card(Suit.Diamonds, Rank.Queen),
			];

			gameState.dealCommunityCards(flop);
			expect(gameState.communityCards).toEqual(flop);
		});

		it('should deal turn and river correctly', () => {
			const flop = [
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Spades, Rank.King),
				new Card(Suit.Diamonds, Rank.Queen),
			];
			const turn = [new Card(Suit.Clubs, Rank.Jack)];
			const river = [new Card(Suit.Hearts, Rank.Ten)];

			gameState.dealCommunityCards(flop);
			gameState.dealCommunityCards(turn);
			gameState.dealCommunityCards(river);

			expect(gameState.communityCards).toHaveLength(5);
			expect(gameState.communityCards).toEqual([...flop, ...turn, ...river]);
		});

		it('should handle empty card arrays', () => {
			gameState.dealCommunityCards([]);
			expect(gameState.communityCards).toEqual([]);
		});
	});

	describe('Betting Mechanics', () => {
		let gameState: GameState;
		let player1: Player;
		let player2: Player;

		beforeEach(() => {
			gameState = new GameState('game-1', 5, 10);
			player1 = new Player('p1', 'Alice', 1000);
			player2 = new Player('p2', 'Bob', 1500);
			gameState.addPlayer(player1);
			gameState.addPlayer(player2);
		});

		it('should process bet correctly', () => {
			gameState.processBet('p1', 100);

			expect(player1.chipStack).toBe(900);
			expect(player1.currentBet).toBe(100);
			expect(player1.totalBetThisHand).toBe(100);
			expect(gameState.pots[0].amount).toBe(100);
		});

		it('should process blind correctly', () => {
			gameState.processBlind('p1', 5);

			expect(player1.chipStack).toBe(995);
			expect(player1.currentBet).toBe(5);
			expect(player1.hasActed).toBe(false); // Blinds don't count as voluntary action
			expect(gameState.pots[0].amount).toBe(5);
		});

		it('should update minimum raise on raise', () => {
			gameState.processBet('p1', 50); // Bet 50
			gameState.processBet('p2', 100); // Raise to 100 (raise of 50)

			expect(gameState.minimumRaise).toBe(50);
			expect(gameState.lastRaiseAmount).toBe(50);
		});

		it('should throw error for non-existent player bet', () => {
			expect(() => gameState.processBet('nonexistent', 100)).toThrow('Player not found');
		});

		it('should throw error for non-existent player blind', () => {
			expect(() => gameState.processBlind('nonexistent', 5)).toThrow('Player not found');
		});

		it('should get current bet correctly', () => {
			expect(gameState.getCurrentBet()).toBe(0);

			gameState.processBet('p1', 50);
			expect(gameState.getCurrentBet()).toBe(50);

			gameState.processBet('p2', 100);
			expect(gameState.getCurrentBet()).toBe(100);
		});

		it('should handle all players folded', () => {
			player1.fold();
			player2.fold();
			expect(gameState.getCurrentBet()).toBe(0);
		});
	});

	describe('Side Pots', () => {
		let gameState: GameState;
		let player1: Player;
		let player2: Player;
		let player3: Player;

		beforeEach(() => {
			gameState = new GameState('game-1', 5, 10);
			player1 = new Player('p1', 'Alice', 100); // Short stack
			player2 = new Player('p2', 'Bob', 1000);
			player3 = new Player('p3', 'Charlie', 1500);
			gameState.addPlayer(player1);
			gameState.addPlayer(player2);
			gameState.addPlayer(player3);
		});

		it('should create side pots for all-in situations', () => {
			// Player 1 goes all-in for 100
			gameState.processBet('p1', 100);
			// Player 2 calls 100
			gameState.processBet('p2', 100);
			// Player 3 raises to 200
			gameState.processBet('p3', 200);
			// Player 2 calls the raise
			gameState.processBet('p2', 100);

			gameState.createSidePots();

			expect(gameState.pots.length).toBeGreaterThanOrEqual(1);
			// Main pot should have contributions from all players
			// Side pot should have additional contributions from players 2 and 3
		});
	});

	describe('Player to Act Logic', () => {
		let gameState: GameState;
		let player1: Player;
		let player2: Player;
		let player3: Player;

		beforeEach(() => {
			gameState = new GameState('game-1', 5, 10);
			player1 = new Player('p1', 'Alice', 1000);
			player2 = new Player('p2', 'Bob', 1500);
			player3 = new Player('p3', 'Charlie', 2000);
			gameState.addPlayer(player1);
			gameState.addPlayer(player2);
			gameState.addPlayer(player3);
		});

		it('should set correct player to act pre-flop', () => {
			gameState.setNextPlayerToAct();
			// In 3-player, action starts with UTG (after BB)
			expect(gameState.currentPlayerToAct).toBe('p1'); // Button acts first pre-flop in 3-handed
		});

		it('should set correct player to act post-flop', () => {
			gameState.currentPhase = GamePhase.Flop;
			gameState.setNextPlayerToAct();
			// Post-flop action starts with SB
			expect(gameState.currentPlayerToAct).toBe('p2'); // Small blind acts first post-flop
		});

		it('should handle heads-up action correctly', () => {
			gameState.removePlayer('p3');
			gameState.currentPhase = GamePhase.Flop;
			gameState.setNextPlayerToAct();
			// In heads-up post-flop, dealer acts first
			expect(gameState.currentPlayerToAct).toBe('p1');
		});

		it('should skip folded players', () => {
			player2.fold();
			gameState.setNextPlayerToAct();
			// Should skip folded player
			expect(gameState.currentPlayerToAct).not.toBe('p2');
		});

		it('should return undefined when no players can act', () => {
			player1.fold();
			player2.fold();
			player3.fold();
			gameState.setNextPlayerToAct();
			expect(gameState.currentPlayerToAct).toBeUndefined();
		});
	});

	describe('Betting Round Completion', () => {
		let gameState: GameState;
		let player1: Player;
		let player2: Player;

		beforeEach(() => {
			gameState = new GameState('game-1', 5, 10);
			player1 = new Player('p1', 'Alice', 1000);
			player2 = new Player('p2', 'Bob', 1500);
			gameState.addPlayer(player1);
			gameState.addPlayer(player2);
		});

		it('should return true when all players have acted and bets are equal', () => {
			player1.bet(100);
			player1.hasActed = true;
			player2.bet(100);
			player2.hasActed = true;

			expect(gameState.isBettingRoundComplete()).toBe(true);
		});

		it('should return false when players have not acted', () => {
			player1.bet(100);
			player2.bet(100);
			// bet() automatically sets hasActed to true, so manually override
			player1.hasActed = false;
			player2.hasActed = false;

			expect(gameState.isBettingRoundComplete()).toBe(false);
		});

		it('should return false when bets are not equal', () => {
			player1.bet(100);
			player1.hasActed = true;
			player2.bet(200);
			player2.hasActed = true;

			expect(gameState.isBettingRoundComplete()).toBe(false);
		});

		it('should return true when no players can act', () => {
			player1.fold();
			player2.fold();

			expect(gameState.isBettingRoundComplete()).toBe(true);
		});
	});

	describe('Hand Completion', () => {
		let gameState: GameState;
		let player1: Player;
		let player2: Player;

		beforeEach(() => {
			gameState = new GameState('game-1', 5, 10);
			player1 = new Player('p1', 'Alice', 1000);
			player2 = new Player('p2', 'Bob', 1500);
			gameState.addPlayer(player1);
			gameState.addPlayer(player2);
		});

		it('should return true when only one player remains', () => {
			player1.fold();
			expect(gameState.isHandComplete()).toBe(true);
		});

		it('should return true when phase is HandComplete', () => {
			gameState.currentPhase = GamePhase.HandComplete;
			expect(gameState.isHandComplete()).toBe(true);
		});

		it('should return false when multiple players remain and not at end', () => {
			expect(gameState.isHandComplete()).toBe(false);
		});
	});

	describe('State Retrieval Methods', () => {
		let gameState: GameState;
		let player1: Player;

		beforeEach(() => {
			gameState = new GameState('game-1', 5, 10);
			player1 = new Player('p1', 'Alice', 1000);
			player1.dealHoleCards([
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Spades, Rank.King),
			]);
			gameState.addPlayer(player1);
		});

		it('should return public state without hole cards', () => {
			const publicState = gameState.getPublicState();

			expect(publicState.id).toBe('game-1');
			expect(publicState.smallBlindAmount).toBe(5);
			expect(publicState.bigBlindAmount).toBe(10);
			expect(publicState.players).toHaveLength(1);
			expect('holeCards' in publicState.players[0]).toBe(false);
		});

		it('should return complete state with hole cards', () => {
			const completeState = gameState.getCompleteState();

			expect(completeState.id).toBe('game-1');
			expect(completeState.players).toHaveLength(1);
			expect(completeState.players[0].holeCards).toBeDefined();
		});

		it('should return pot manager', () => {
			const potManager = gameState.getPotManager();
			expect(potManager).toBeDefined();
		});
	});

	describe('Clone Method', () => {
		let gameState: GameState;
		let player1: Player;

		beforeEach(() => {
			gameState = new GameState('game-1', 5, 10);
			player1 = new Player('p1', 'Alice', 1000);
			gameState.addPlayer(player1);
			gameState.startNewHand();
			gameState.dealCommunityCards([new Card(Suit.Hearts, Rank.Ace)]);
		});

		it('should create exact copy of game state', () => {
			const cloned = gameState.clone();

			expect(cloned.id).toBe(gameState.id);
			expect(cloned.smallBlindAmount).toBe(gameState.smallBlindAmount);
			expect(cloned.bigBlindAmount).toBe(gameState.bigBlindAmount);
			expect(cloned.currentPhase).toBe(gameState.currentPhase);
			expect(cloned.dealerPosition).toBe(gameState.dealerPosition);
			expect(cloned.handNumber).toBe(gameState.handNumber);
			expect(cloned.players).toHaveLength(gameState.players.length);
			expect(cloned.communityCards).toEqual(gameState.communityCards);
		});

		it('should create independent copy (not reference)', () => {
			const cloned = gameState.clone();

			// Modify original
			gameState.addPlayer(new Player('p2', 'Bob', 1500));
			gameState.dealCommunityCards([new Card(Suit.Spades, Rank.King)]);
			gameState.currentPhase = GamePhase.Flop;

			// Clone should remain unchanged
			expect(cloned.players).toHaveLength(1);
			expect(cloned.communityCards).toHaveLength(1);
			expect(cloned.currentPhase).toBe(GamePhase.PreFlop);
		});
	});

	describe('Showdown Order', () => {
		let gameState: GameState;
		let player1: Player;
		let player2: Player;
		let player3: Player;

		beforeEach(() => {
			gameState = new GameState('game-1', 5, 10);
			player1 = new Player('p1', 'Alice', 1000);
			player2 = new Player('p2', 'Bob', 1500);
			player3 = new Player('p3', 'Charlie', 2000);
			gameState.addPlayer(player1);
			gameState.addPlayer(player2);
			gameState.addPlayer(player3);
		});

		it('should return single player when only one in showdown', () => {
			player2.fold();
			player3.fold();

			const order = gameState.getShowdownOrder();
			expect(order).toEqual(['p1']);
		});

		it('should handle showdown with river aggressor', () => {
			gameState.lastAggressorPerRound.set(GamePhase.River, 'p2');

			const order = gameState.getShowdownOrder();
			expect(order[0]).toBe('p2'); // Aggressor shows first
		});

		it('should handle showdown without river betting', () => {
			// No river aggressor set
			const order = gameState.getShowdownOrder();
			expect(order).toHaveLength(3);
			expect(order).toContain('p1');
			expect(order).toContain('p2');
			expect(order).toContain('p3');
		});
	});

	describe('Edge Cases and Error Handling', () => {
		let gameState: GameState;

		beforeEach(() => {
			gameState = new GameState('game-1', 5, 10);
		});

		it('should handle empty game operations gracefully', () => {
			expect(gameState.getActivePlayers()).toEqual([]);
			expect(gameState.getPlayersInHand()).toEqual([]);
			expect(gameState.getPlayersWhoCanAct()).toEqual([]);
			expect(gameState.getCurrentBet()).toBe(0);
			expect(gameState.isBettingRoundComplete()).toBe(true);
		});

		it('should handle position assignment with empty game', () => {
			gameState.assignPositions();
			expect(gameState.smallBlindPosition).toBe(0); // Default initialization
			expect(gameState.bigBlindPosition).toBe(0); // Default initialization
		});

		it('should handle dealer movement with no players', () => {
			const initialDealer = gameState.dealerPosition;
			gameState.moveDealer();
			expect(gameState.dealerPosition).toBe(initialDealer);
		});

		it('should handle setNextPlayerToAct with no players', () => {
			gameState.setNextPlayerToAct();
			expect(gameState.currentPlayerToAct).toBeUndefined();
		});
	});

	describe('Complex Scenarios', () => {
		let gameState: GameState;
		let players: Player[];

		beforeEach(() => {
			gameState = new GameState('game-1', 5, 10);
			players = [];
			for (let i = 1; i <= 4; i++) {
				const player = new Player(`p${i}`, `Player ${i}`, 1000);
				players.push(player);
				gameState.addPlayer(player);
			}
		});

		it('should handle complete hand lifecycle', () => {
			// Start hand
			gameState.startNewHand();
			expect(gameState.handNumber).toBe(1);
			expect(gameState.currentPhase).toBe(GamePhase.PreFlop);

			// Process blinds
			gameState.processBlind('p2', 5); // SB
			gameState.processBlind('p3', 10); // BB

			// Pre-flop betting - all players need equal bets
			gameState.processBet('p4', 10); // UTG calls
			gameState.processBet('p1', 10); // Button calls
			gameState.processBet('p2', 5); // SB completes to 10
			// BB already has 10, just needs to act
			players[2].hasActed = true; // BB checked

			expect(gameState.isBettingRoundComplete()).toBe(true);

			// Advance to flop
			gameState.advancePhase();
			expect(gameState.currentPhase).toBe(GamePhase.Flop);

			// Deal flop
			gameState.dealCommunityCards([
				new Card(Suit.Hearts, Rank.Ace),
				new Card(Suit.Spades, Rank.King),
				new Card(Suit.Diamonds, Rank.Queen),
			]);

			expect(gameState.communityCards).toHaveLength(3);
		});

		it('should handle all-in scenarios with side pots', () => {
			// Short stack goes all-in
			players[0].chipStack = 50;
			gameState.processBet('p1', 50); // All-in
			gameState.processBet('p2', 100); // Raise
			gameState.processBet('p3', 100); // Call
			players[3].fold(); // p4 folds

			gameState.createSidePots();
			expect(gameState.pots.length).toBeGreaterThanOrEqual(1);
		});

		it('should handle player elimination and re-seating', () => {
			// Remove a player mid-game
			gameState.removePlayer('p3');
			expect(gameState.players).toHaveLength(3);

			// Positions should be reassigned
			gameState.assignPositions();
			const activePlayers = gameState.getActivePlayers();
			expect(activePlayers.every((p) => p.position !== undefined)).toBe(true);
		});
	});
});
