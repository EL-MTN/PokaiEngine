import { ReplaySystem } from '@logging/ReplaySystem';
import { GameLogger } from '@logging/GameLogger';
import { GameState, GameEvent, PlayerInfo, GamePhase, Pot, ActionType } from '@types';

describe('ReplaySystem', () => {
	let gameLogger: GameLogger;
	let replaySystem: ReplaySystem;
	let initialGameState: GameState;
	let playerNames: Map<string, string>;

	beforeEach(() => {
		gameLogger = new GameLogger();
		replaySystem = new ReplaySystem(gameLogger);
		const players: PlayerInfo[] = [
			{
				id: 'p1',
				name: 'Player 1',
				chipStack: 1000,
				currentBet: 0,
				isAllIn: false,
				isFolded: false,
				hasActed: false,
				isActive: true,
				totalBetThisHand: 0,
			},
			{
				id: 'p2',
				name: 'Player 2',
				chipStack: 1000,
				currentBet: 0,
				isAllIn: false,
				isFolded: false,
				hasActed: false,
				isActive: true,
				totalBetThisHand: 0,
			},
		];
		const pots: Pot[] = [{ amount: 0, eligiblePlayers: ['p1', 'p2'], isMainPot: true }];
		initialGameState = {
			id: 'test-game',
			players,
			communityCards: [],
			pots,
			currentPhase: GamePhase.PreFlop,
			currentPlayerToAct: 'p1',
			dealerPosition: 0,
			smallBlindPosition: 0,
			bigBlindPosition: 1,
			smallBlindAmount: 10,
			bigBlindAmount: 20,
			minimumRaise: 20,
			handNumber: 1,
			isComplete: false,
		};
		playerNames = new Map([
			['p1', 'Player 1'],
			['p2', 'Player 2'],
		]);
		gameLogger.startGame('test-game', initialGameState, playerNames);
	});

	it('should replay a game', async () => {
		const event: GameEvent = {
			type: 'hand_started',
			handNumber: 1,
			timestamp: Date.now(),
			gameState: initialGameState,
		};
		gameLogger.logEvent('test-game', event);

		const onReplayEvent = jest.fn();
		replaySystem.onReplayEvent(onReplayEvent);

		await replaySystem.replayGame('test-game', { speed: 'instant' });

		expect(onReplayEvent).toHaveBeenCalled();
		const replayState = replaySystem.getReplayState();
		expect(replayState.isPlaying).toBe(false);
		expect(replayState.currentEventIndex).toBe(1);
	});

	it('should throw an error when replaying a non-existent game', async () => {
		await expect(replaySystem.replayGame('non-existent-game')).rejects.toThrow(
			'Game log not found for game non-existent-game'
		);
	});

	it('should replay a hand', async () => {
		const event1: GameEvent = {
			type: 'hand_started',
			handNumber: 1,
			timestamp: Date.now(),
			gameState: initialGameState,
		};
		const event2: GameEvent = {
			type: 'hand_complete',
			handNumber: 1,
			timestamp: Date.now(),
			gameState: initialGameState,
		};
		gameLogger.logEvent('test-game', event1);
		gameLogger.logEvent('test-game', event2);

		const onReplayEvent = jest.fn();
		replaySystem.onReplayEvent(onReplayEvent);

		await replaySystem.replayHand('test-game', 1, { speed: 'instant' });

		expect(onReplayEvent).toHaveBeenCalledTimes(2);
	});

	it('should throw an error when replaying a non-existent hand', async () => {
		await expect(replaySystem.replayHand('test-game', 2)).rejects.toThrow(
			'No events found for hand 2 in game test-game'
		);
	});

	it('should create a scenario from a hand', () => {
		const event1: GameEvent = {
			type: 'hand_started',
			handNumber: 1,
			timestamp: Date.now(),
			gameState: initialGameState,
		};
		const event2: GameEvent = {
			type: 'hand_complete',
			handNumber: 1,
			timestamp: Date.now(),
			gameState: initialGameState,
		};
		gameLogger.logEvent('test-game', event1);
		gameLogger.logEvent('test-game', event2);

		const scenario = replaySystem.createScenarioFromHand(
			'test-game',
			1,
			'Test Scenario',
			'A test scenario'
		);
		expect(scenario).toBeDefined();
		expect(scenario?.name).toBe('Test Scenario');
	});

	it('should pause and resume the replay', async () => {
		const event: GameEvent = {
			type: 'hand_started',
			handNumber: 1,
			timestamp: Date.now(),
			gameState: initialGameState,
		};
		gameLogger.logEvent('test-game', event);

		const promise = replaySystem.replayGame('test-game');
		replaySystem.pause();
		let state = replaySystem.getReplayState();
		expect(state.isPaused).toBe(true);

		replaySystem.resume();
		state = replaySystem.getReplayState();
		expect(state.isPaused).toBe(false);

		await promise;
	});

	it('should stop the replay', async () => {
		const event: GameEvent = {
			type: 'hand_started',
			handNumber: 1,
			timestamp: Date.now(),
			gameState: initialGameState,
		};
		gameLogger.logEvent('test-game', event);

		const promise = replaySystem.replayGame('test-game');
		replaySystem.stop();
		const state = replaySystem.getReplayState();
		expect(state.isPlaying).toBe(false);

		await promise;
	});

	it('should step forward and backward', async () => {
		const event1: GameEvent = {
			type: 'hand_started',
			handNumber: 1,
			timestamp: Date.now(),
			gameState: initialGameState,
		};
		const event2: GameEvent = {
			type: 'hand_complete',
			handNumber: 1,
			timestamp: Date.now(),
			gameState: initialGameState,
		};
		gameLogger.logEvent('test-game', event1);
		gameLogger.logEvent('test-game', event2);

		await replaySystem.replayGame('test-game', { speed: 'instant' });

		replaySystem.stepBackward();
		let state = replaySystem.getReplayState();
		expect(state.currentEventIndex).toBe(1);

		replaySystem.stepForward();
		state = replaySystem.getReplayState();
		expect(state.currentEventIndex).toBe(2);
	});

	it('should jump to an event', async () => {
		const event1: GameEvent = {
			type: 'hand_started',
			handNumber: 1,
			timestamp: Date.now(),
			gameState: initialGameState,
		};
		const event2: GameEvent = {
			type: 'hand_complete',
			handNumber: 1,
			timestamp: Date.now(),
			gameState: initialGameState,
		};
		gameLogger.logEvent('test-game', event1);
		gameLogger.logEvent('test-game', event2);

		await replaySystem.replayGame('test-game', { speed: 'instant' });

		replaySystem.jumpToEvent(0);
		const state = replaySystem.getReplayState();
		expect(state.currentEventIndex).toBe(0);
	});
});
