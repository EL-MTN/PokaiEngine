import { GameState } from '@/domain/poker/game/GameState';
import { Player } from '@/domain/poker/game/Player';
import { Card } from '@/domain/poker/cards/Card';
import { Suit, Rank, GamePhase } from '@/domain/types';
import { shouldShowHoleCards } from '@/domain/types/visibility';

describe('Hole Card Visibility System', () => {
	let gameState: GameState;
	let player1: Player;
	let player2: Player;
	let player3: Player;

	beforeEach(() => {
		gameState = new GameState('test-game', 10, 20);
		
		player1 = new Player('p1', 'Alice', 1000);
		player2 = new Player('p2', 'Bob', 1000);
		player3 = new Player('p3', 'Charlie', 1000);
		
		gameState.addPlayer(player1);
		gameState.addPlayer(player2);
		gameState.addPlayer(player3);
		
		// Deal hole cards
		player1.dealHoleCards([
			new Card(Suit.Hearts, Rank.Ace),
			new Card(Suit.Hearts, Rank.King)
		]);
		player2.dealHoleCards([
			new Card(Suit.Spades, Rank.Queen),
			new Card(Suit.Spades, Rank.Jack)
		]);
		player3.dealHoleCards([
			new Card(Suit.Diamonds, Rank.Ten),
			new Card(Suit.Diamonds, Rank.Nine)
		]);
		
		// Initialize playersWhoShowedCards set
		(gameState as any).playersWhoShowedCards = new Set();
	});

	describe('shouldShowHoleCards function', () => {
		it('should show own cards to players', () => {
			expect(shouldShowHoleCards('player', 'p1', 'p1', false, false)).toBe(true);
			expect(shouldShowHoleCards('player', 'p2', 'p2', false, false)).toBe(true);
		});

		it('should hide other players cards before showdown', () => {
			expect(shouldShowHoleCards('player', 'p1', 'p2', false, false)).toBe(false);
			expect(shouldShowHoleCards('player', 'p2', 'p1', false, false)).toBe(false);
		});

		it('should show cards at showdown if not folded', () => {
			expect(shouldShowHoleCards('player', 'p1', 'p2', true, false)).toBe(true);
			expect(shouldShowHoleCards('spectator', undefined, 'p1', true, false)).toBe(true);
			expect(shouldShowHoleCards('replay', undefined, 'p1', true, false)).toBe(true);
		});

		it('should hide folded players cards even at showdown', () => {
			expect(shouldShowHoleCards('player', 'p1', 'p2', true, true)).toBe(false);
			expect(shouldShowHoleCards('spectator', undefined, 'p1', true, true)).toBe(false);
			expect(shouldShowHoleCards('replay', undefined, 'p1', true, true)).toBe(false);
		});
	});

	describe('GameState visibility', () => {
		it('should apply visibility rules correctly', () => {
			// Before showdown - player view
			const playerView = gameState.getStateWithVisibility('player', 'p1');
			
			// Should see own cards
			const p1Info = playerView.players.find(p => p.id === 'p1');
			expect(p1Info?.holeCards).toHaveLength(2);
			
			// Should not see others' cards
			const p2Info = playerView.players.find(p => p.id === 'p2');
			expect(p2Info?.holeCards).toBeUndefined();
		});

		it('should show all cards at showdown', () => {
			// Move to showdown phase
			(gameState as any).currentPhase = GamePhase.Showdown;
			
			const spectatorView = gameState.getStateWithVisibility('spectator');
			
			// Should see all active players' cards
			const p1Info = spectatorView.players.find(p => p.id === 'p1');
			const p2Info = spectatorView.players.find(p => p.id === 'p2');
			const p3Info = spectatorView.players.find(p => p.id === 'p3');
			
			expect(p1Info?.holeCards).toHaveLength(2);
			expect(p2Info?.holeCards).toHaveLength(2);
			expect(p3Info?.holeCards).toHaveLength(2);
		});

		it('should hide folded players cards at showdown', () => {
			// Fold player 3
			player3.fold();
			
			// Move to showdown
			(gameState as any).currentPhase = GamePhase.Showdown;
			
			const spectatorView = gameState.getStateWithVisibility('spectator');
			
			// Should see active players' cards
			const p1Info = spectatorView.players.find(p => p.id === 'p1');
			const p2Info = spectatorView.players.find(p => p.id === 'p2');
			expect(p1Info?.holeCards).toHaveLength(2);
			expect(p2Info?.holeCards).toHaveLength(2);
			
			// Should not see folded player's cards
			const p3Info = spectatorView.players.find(p => p.id === 'p3');
			expect(p3Info?.holeCards).toBeUndefined();
		});

		it('should apply same rules for replay viewing', () => {
			// Before showdown
			let replayView = gameState.getStateWithVisibility('replay');
			
			// Should not see any cards
			replayView.players.forEach(p => {
				expect(p.holeCards).toBeUndefined();
			});
			
			// At showdown
			(gameState as any).currentPhase = GamePhase.Showdown;
			replayView = gameState.getStateWithVisibility('replay');
			
			// Should see all active players' cards
			const activePlayers = replayView.players.filter(p => !p.isFolded);
			activePlayers.forEach(p => {
				expect(p.holeCards).toHaveLength(2);
			});
		});
	});
});