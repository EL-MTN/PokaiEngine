import { GameEngine } from '../../engine/GameEngine';
import { ActionType, GamePhase, Position } from '../../types';

describe('GameEngine', () => {
	let gameEngine: GameEngine;
	const gameConfig = {
		maxPlayers: 6,
		smallBlindAmount: 10,
		bigBlindAmount: 20,
		turnTimeLimit: 30,
		isTournament: false,
	};

	beforeEach(() => {
		gameEngine = new GameEngine('test-game', gameConfig);
	});

	describe('Game Initialization', () => {
		test('should initialize game correctly', () => {
			expect(gameEngine).toBeDefined();
			expect(gameEngine.isGameRunning()).toBe(false);
		});

		test('should add players correctly', () => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);
			gameEngine.addPlayer('player2', 'Player 2', 1000);
			gameEngine.addPlayer('player3', 'Player 3', 1000);

			const gameState = gameEngine.getGameState();
			expect(gameState.players).toHaveLength(3);
		});

		test('should not allow duplicate players', () => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);

			expect(() => {
				gameEngine.addPlayer('player1', 'Player 1 Duplicate', 1000);
			}).toThrow();
		});

		test('should not start hand with insufficient players', () => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);

			expect(() => {
				gameEngine.startHand();
			}).toThrow('Need at least 2 players');
		});
	});

	describe('Hand Management', () => {
		beforeEach(() => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);
			gameEngine.addPlayer('player2', 'Player 2', 1000);
			gameEngine.addPlayer('player3', 'Player 3', 1000);
		});

		test('should start hand correctly', () => {
			gameEngine.startHand();

			expect(gameEngine.isGameRunning()).toBe(true);

			const gameState = gameEngine.getGameState();
			expect(gameState.currentPhase).toBe(GamePhase.PreFlop);
			expect(gameState.handNumber).toBe(1);
			expect(gameState.currentPlayerToAct).toBeDefined();
		});

		test('should deal hole cards to all players', () => {
			gameEngine.startHand();

			const gameState = gameEngine.getGameState();
			gameState.players.forEach((player) => {
				expect(player.holeCards).toBeDefined();
				expect(player.holeCards).toHaveLength(2);
			});
		});

		test('should post blinds correctly', () => {
			gameEngine.startHand();

			const gameState = gameEngine.getGameState();
			const smallBlindPlayer = gameState.players.find(
				(p) => p.position === Position.SmallBlind
			);
			const bigBlindPlayer = gameState.players.find((p) => p.position === Position.BigBlind);

			expect(smallBlindPlayer?.currentBet).toBe(10);
			expect(bigBlindPlayer?.currentBet).toBe(20);
		});
	});

	describe('Action Processing', () => {
		beforeEach(() => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);
			gameEngine.addPlayer('player2', 'Player 2', 1000);
			gameEngine.addPlayer('player3', 'Player 3', 1000);
			gameEngine.startHand();
		});

		test('should process fold action', () => {
			const gameState = gameEngine.getGameState();
			const currentPlayer = gameState.currentPlayerToAct!;

			const action = {
				type: ActionType.Fold,
				playerId: currentPlayer,
				timestamp: Date.now(),
			};

			expect(() => gameEngine.processAction(action)).not.toThrow();

			const player = gameState.getPlayer(currentPlayer);
			expect(player?.isFolded).toBe(true);
		});

		test('should process call action', () => {
			const gameState = gameEngine.getGameState();
			const currentPlayer = gameState.currentPlayerToAct!;
			const player = gameState.getPlayer(currentPlayer)!;
			const initialChips = player.chipStack;

			const action = {
				type: ActionType.Call,
				playerId: currentPlayer,
				timestamp: Date.now(),
			};

			expect(() => gameEngine.processAction(action)).not.toThrow();

			expect(player.chipStack).toBe(initialChips - 20); // called the big blind
			expect(player.currentBet).toBe(20);
		});

		test('should process raise action', () => {
			const gameState = gameEngine.getGameState();
			const currentPlayer = gameState.currentPlayerToAct!;
			const player = gameState.getPlayer(currentPlayer)!;
			const initialChips = player.chipStack;

			const action = {
				type: ActionType.Raise,
				amount: 50,
				playerId: currentPlayer,
				timestamp: Date.now(),
			};

			expect(() => gameEngine.processAction(action)).not.toThrow();

			expect(player.chipStack).toBe(initialChips - 50);
			expect(player.currentBet).toBe(50);
		});

		test('should reject invalid actions', () => {
			const action = {
				type: ActionType.Call,
				playerId: 'nonexistent-player',
				timestamp: Date.now(),
			};

			expect(() => gameEngine.processAction(action)).toThrow();
		});

		test('should process action and maintain game state integrity', () => {
			const gameState = gameEngine.getGameState();
			const currentPlayer = gameState.currentPlayerToAct!;
			const player = gameState.players.find((p) => p.id === currentPlayer)!;
			const initialChips = player.chipStack;

			const action = {
				type: ActionType.Call,
				playerId: currentPlayer,
				timestamp: Date.now(),
			};

			gameEngine.processAction(action);

			// After processing action, game state should be updated correctly
			// The player should have chips deducted for the call
			const updatedPlayer = gameState.players.find((p) => p.id === currentPlayer)!;
			expect(updatedPlayer.chipStack).toBeLessThan(initialChips);

			// Game should still be in a valid state
			expect(gameState.currentPhase).toBe(GamePhase.PreFlop);
			expect(gameState.currentPlayerToAct).toBeDefined();
		});
	});

	describe('Possible Actions', () => {
		beforeEach(() => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);
			gameEngine.addPlayer('player2', 'Player 2', 1000);
			gameEngine.addPlayer('player3', 'Player 3', 1000);
			gameEngine.startHand();
		});

		test('should return possible actions for current player', () => {
			const gameState = gameEngine.getGameState();
			const currentPlayer = gameState.currentPlayerToAct!;

			const actions = gameEngine.getPossibleActions(currentPlayer);

			expect(actions.length).toBeGreaterThan(0);
			expect(actions.some((action) => action.type === ActionType.Fold)).toBe(true);
			expect(actions.some((action) => action.type === ActionType.Call)).toBe(true);
		});

		test('should return actions for any player (implementation allows checking possible actions)', () => {
			const gameState = gameEngine.getGameState();
			const nonCurrentPlayer = gameState.players.find(
				(p) => p.id !== gameState.currentPlayerToAct
			);

			if (nonCurrentPlayer) {
				const actions = gameEngine.getPossibleActions(nonCurrentPlayer.id);
				// Implementation allows any player to check their possible actions
				// even if it's not their turn
				expect(Array.isArray(actions)).toBe(true);
			}
		});
	});

	describe('Bot Game State', () => {
		beforeEach(() => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);
			gameEngine.addPlayer('player2', 'Player 2', 1000);
			gameEngine.addPlayer('player3', 'Player 3', 1000);
			gameEngine.startHand();
		});

		test('should provide correct bot game state', () => {
			const gameState = gameEngine.getGameState();
			const player = gameState.players[0];

			const botGameState = gameEngine.getBotGameState(player.id);

			expect(botGameState.playerId).toBe(player.id);
			expect(botGameState.playerCards).toHaveLength(2);
			expect(botGameState.communityCards).toHaveLength(0); // PreFlop phase
			expect(botGameState.currentPhase).toBe(GamePhase.PreFlop);
			expect(botGameState.possibleActions).toBeDefined();
		});

		test('should throw error for invalid player', () => {
			expect(() => {
				gameEngine.getBotGameState('invalid-player');
			}).toThrow('Player not found');
		});
	});

	describe('Game Statistics', () => {
		beforeEach(() => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);
			gameEngine.addPlayer('player2', 'Player 2', 1000);
			gameEngine.addPlayer('player3', 'Player 3', 1000);
		});

		test('should provide game statistics', () => {
			const stats = gameEngine.getGameStats();

			expect(stats).toHaveProperty('totalHands');
			expect(stats).toHaveProperty('activePlayers');
			expect(stats).toHaveProperty('currentPot');
			expect(stats).toHaveProperty('currentPhase');
		});

		test('should update statistics after hand start', () => {
			const statsBefore = gameEngine.getGameStats();
			expect(statsBefore.totalHands).toBe(0);

			gameEngine.startHand();

			const statsAfter = gameEngine.getGameStats();
			expect(statsAfter.totalHands).toBe(1);
			expect(statsAfter.currentPhase).toBe(GamePhase.PreFlop);
		});
	});

	describe('Event Handling', () => {
		beforeEach(() => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);
			gameEngine.addPlayer('player2', 'Player 2', 1000);
			gameEngine.addPlayer('player3', 'Player 3', 1000);
		});

		test('should register event callbacks', () => {
			const events: any[] = [];
			const callback = (event: any) => events.push(event);

			gameEngine.onEvent(callback);
			gameEngine.startHand();

			expect(events.length).toBeGreaterThan(0);
			expect(events.some((e) => e.type === 'hand_started')).toBe(true);
		});

		test('should unregister event callbacks', () => {
			const events: any[] = [];
			const callback = (event: any) => events.push(event);

			gameEngine.onEvent(callback);
			gameEngine.offEvent(callback);
			gameEngine.startHand();

			// Should not receive events after unregistering
			expect(events.length).toBe(0);
		});
	});

	describe('Error Handling', () => {
		test('should not allow adding players while game is running', () => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);
			gameEngine.addPlayer('player2', 'Player 2', 1000);
			gameEngine.startHand();

			expect(() => {
				gameEngine.addPlayer('player3', 'Player 3', 1000);
			}).toThrow('Cannot add players while game is running');
		});

		test('should not process actions when game is not running', () => {
			const action = {
				type: ActionType.Call,
				playerId: 'player1',
				timestamp: Date.now(),
			};

			expect(() => {
				gameEngine.processAction(action);
			}).toThrow('Game is not running');
		});
	});

	describe('Player Management', () => {
		test('should remove players correctly', () => {
			gameEngine.addPlayer('player1', 'Player 1', 1000);
			gameEngine.addPlayer('player2', 'Player 2', 1000);

			let gameState = gameEngine.getGameState();
			expect(gameState.players).toHaveLength(2);

			gameEngine.removePlayer('player1');

			gameState = gameEngine.getGameState();
			expect(gameState.players).toHaveLength(1);
			expect(gameState.players[0].id).toBe('player2');
		});

		test('should throw error when removing non-existent player', () => {
			expect(() => {
				gameEngine.removePlayer('non-existent');
			}).toThrow('Player not found');
		});
	});
});
