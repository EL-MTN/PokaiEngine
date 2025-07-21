import { GameState } from '@/engine/game/GameState';
import { ActionValidator } from '@/engine/poker/ActionValidator';
import { Deck } from '@/engine/poker/Deck';
import { HandEvaluator } from '@/engine/poker/HandEvaluator';
import { Player } from '@/engine/poker/Player';
import { gameLogger } from '@/services/logging/Logger';
import {
	Action,
	BotGameState,
	EventCallback,
	GameConfig,
	GameEvent,
	GamePhase,
	GameStateError,
	HandEvaluation,
	PossibleAction,
} from '@/types';
import { isGameStateWithVisibility, WinnerInfo } from '@/types/game-types';

export interface GameResult {
	winners: Array<{
		playerId: string;
		winAmount: number;
		handDescription: string;
	}>;
	finalPots: number;
	handNumber: number;
}

export class GameEngine {
	private gameState: GameState;
	private deck: Deck;
	private config: GameConfig;
	private eventCallbacks: EventCallback[] = [];
	private handEvaluations: Map<string, HandEvaluation> = new Map();
	private gameRunning: boolean = false;

	constructor(gameId: string, config: GameConfig) {
		this.config = config;
		this.gameState = new GameState(
			gameId,
			config.smallBlindAmount,
			config.bigBlindAmount,
		);
		this.deck = new Deck();
	}

	/**
	 * Adds a player to the game
	 */
	addPlayer(playerId: string, playerName: string, chipStack: number): void {
		if (this.gameRunning) {
			throw new GameStateError('Cannot add players while game is running');
		}

		const player = new Player(playerId, playerName, chipStack);
		this.gameState.addPlayer(player);

		this.emitEvent({
			type: 'player_joined',
			playerId: playerId,
			timestamp: Date.now(),
			handNumber: this.gameState.handNumber,
		});
	}

	/**
	 * Removes a player from the game
	 */
	removePlayer(playerId: string): void {
		this.gameState.removePlayer(playerId);

		this.emitEvent({
			type: 'player_left',
			playerId: playerId,
			timestamp: Date.now(),
			handNumber: this.gameState.handNumber,
		});
	}

	/**
	 * Starts a new hand
	 */
	startHand(): void {
		const activePlayers = this.gameState.getActivePlayers();

		if (activePlayers.length < 2) {
			throw new GameStateError('Need at least 2 players to start a hand');
		}

		this.gameRunning = true;
		this.gameState.startNewHand();
		this.deck.reset();
		this.deck.shuffle();
		this.handEvaluations.clear();

		// Deal hole cards
		this.dealHoleCards();

		/*
		 * Post blinds – this sets the initial player to act.  For heads-up we
		 * want the small blind (dealer) to act first, so we rely on the state
		 * set by postBlinds().
		 *
		 * For 3-plus handed games, we need the small blind to act first — but
		 * postBlinds() leaves the action on UTG (button when 3-handed). We
		 * therefore advance the action pointer once more so that the SB is up.
		 */
		this.postBlinds();

		if (this.gameState.getActivePlayers().length > 2) {
			this.gameState.setNextPlayerToAct();
		}

		this.emitEvent({
			type: 'hand_started',
			timestamp: Date.now(),
			handNumber: this.gameState.handNumber,
			gameState: this.gameState.getPublicState(),
		});
	}

	/**
	 * Processes a player action
	 */
	processAction(action: Action): void {
		if (!this.gameRunning) {
			throw new GameStateError('Game is not running');
		}

		// Validate the action
		ActionValidator.validateAction(this.gameState, action);

		// Process the action
		ActionValidator.processAction(this.gameState, action);

		// Emit action event
		this.emitEvent({
			type: 'action_taken',
			playerId: action.playerId,
			action: action,
			timestamp: Date.now(),
			handNumber: this.gameState.handNumber,
			gameState: this.gameState.getPublicState(),
		});

		// Check if betting round is complete
		if (this.gameState.isBettingRoundComplete()) {
			this.completeBettingRound();
		}

		// Only attempt to complete the hand once per hand lifecycle
		if (this.gameRunning && this.gameState.isHandComplete()) {
			// If hand is complete, determine winners first (handles single player case)
			this.determineWinners();
		}
	}

	/**
	 * Forces a player to act (timeout)
	 */
	forcePlayerAction(playerId: string): void {
		if (!this.gameRunning) {
			throw new GameStateError('Game is not running');
		}

		const forcedAction = ActionValidator.getForceAction(
			this.gameState,
			playerId,
		);

		this.emitEvent({
			type: 'player_timeout',
			playerId: playerId,
			timestamp: Date.now(),
			handNumber: this.gameState.handNumber,
		});

		this.processAction(forcedAction);
	}

	/**
	 * Gets possible actions for a player
	 */
	getPossibleActions(playerId: string): PossibleAction[] {
		return ActionValidator.getPossibleActions(this.gameState, playerId);
	}

	/**
	 * Gets bot game state for a specific player
	 */
	getBotGameState(playerId: string): BotGameState {
		const player = this.gameState.getPlayer(playerId);
		if (!player) {
			throw new GameStateError('Player not found');
		}

		return {
			playerId: playerId,
			playerCards: player.holeCards || undefined, // Handle missing cards gracefully
			communityCards: [...this.gameState.communityCards],
			potSize: this.gameState.getPotManager().getTotalPotAmount(),
			players: this.gameState.players.map((p) => p.getPublicInfo()),
			currentPlayerToAct: this.gameState.currentPlayerToAct,
			possibleActions: this.getPossibleActions(playerId),
			timeRemaining: this.config.turnTimeLimit,
			currentPhase: this.gameState.currentPhase,
			minimumRaise: this.gameState.minimumRaise,
		};
	}

	/**
	 * Gets the current game state
	 */
	getGameState(): GameState {
		return this.gameState;
	}

	/**
	 * Gets the game configuration
	 */
	getConfig(): GameConfig {
		return this.config;
	}

	/**
	 * Subscribes to game events
	 */
	onEvent(callback: EventCallback): void {
		this.eventCallbacks.push(callback);
	}

	/**
	 * Removes event callback
	 */
	offEvent(callback: EventCallback): void {
		const index = this.eventCallbacks.indexOf(callback);
		if (index > -1) {
			this.eventCallbacks.splice(index, 1);
		}
	}

	/**
	 * Deals hole cards to all active players
	 */
	private dealHoleCards(): void {
		const activePlayers = this.gameState.getActivePlayers();
		const holeCards = this.deck.dealHoleCards(activePlayers.length);

		activePlayers.forEach((player, index) => {
			player.dealHoleCards([holeCards[index][0], holeCards[index][1]]);
		});

		this.emitEvent({
			type: 'hole_cards_dealt',
			timestamp: Date.now(),
			handNumber: this.gameState.handNumber,
		});
	}

	/**
	 * Posts blinds
	 */
	private postBlinds(): void {
		ActionValidator.processBlindPosting(this.gameState);

		this.emitEvent({
			type: 'blinds_posted',
			timestamp: Date.now(),
			handNumber: this.gameState.handNumber,
			gameState: this.gameState.getPublicState(),
		});
	}

	/**
	 * Completes the current betting round
	 */
	private completeBettingRound(): void {
		let shouldContinue = true;

		while (shouldContinue && this.gameRunning) {
			// 1. Create (or recreate) side pots
			this.gameState.createSidePots();

			// 2. Advance to the next logical phase
			switch (this.gameState.currentPhase) {
				case GamePhase.PreFlop:
					this.dealFlop();
					break;
				case GamePhase.Flop:
					this.dealTurn();
					break;
				case GamePhase.Turn:
					this.dealRiver();
					break;
				case GamePhase.River:
					this.startShowdown();
					// startShowdown() will eventually mark the hand complete
					break;
				default:
					throw new GameStateError(
						'Invalid game phase for betting round completion',
					);
			}

			// 3. If after advancing there are still players able to act, stop auto-advance.
			//    Otherwise, loop again to burn remaining streets.
			const playersAbleToAct = this.gameState.getPlayersWhoCanAct();
			shouldContinue =
				playersAbleToAct.length === 0 && !this.gameState.isHandComplete();
		}
	}

	/**
	 * Deals the flop
	 */
	private dealFlop(): void {
		const flopCards = this.deck.dealFlop();
		this.gameState.dealCommunityCards(flopCards);
		this.gameState.advancePhase();

		this.emitEvent({
			type: 'flop_dealt',
			timestamp: Date.now(),
			handNumber: this.gameState.handNumber,
			gameState: this.gameState.getPublicState(),
		});
	}

	/**
	 * Deals the turn
	 */
	private dealTurn(): void {
		const turnCard = this.deck.dealTurn();
		this.gameState.dealCommunityCards([turnCard]);
		this.gameState.advancePhase();

		this.emitEvent({
			type: 'turn_dealt',
			timestamp: Date.now(),
			handNumber: this.gameState.handNumber,
			gameState: this.gameState.getPublicState(),
		});
	}

	/**
	 * Deals the river
	 */
	private dealRiver(): void {
		const riverCard = this.deck.dealRiver();
		this.gameState.dealCommunityCards([riverCard]);
		this.gameState.advancePhase();

		this.emitEvent({
			type: 'river_dealt',
			timestamp: Date.now(),
			handNumber: this.gameState.handNumber,
			gameState: this.gameState.getPublicState(),
		});
	}

	/**
	 * Starts the showdown phase
	 */
	private startShowdown(): void {
		this.gameState.advancePhase();
		this.evaluateHands();

		// Mark all remaining players as having shown cards (they're required to show)
		const playersInShowdown = this.gameState.getPlayersInHand();
		playersInShowdown.forEach((player) => {
			this.gameState.playersWhoShowedCards.add(player.id);
		});

		this.determineWinners();
	}

	/**
	 * Evaluates all hands
	 */
	private evaluateHands(): void {
		const playersInShowdown = this.gameState.getPlayersInHand();

		for (const player of playersInShowdown) {
			if (player.holeCards) {
				const evaluation = HandEvaluator.evaluateHand(
					player.holeCards,
					this.gameState.communityCards,
				);
				this.handEvaluations.set(player.id, evaluation);
			}
		}
	}

	/**
	 * Determines winners and distributes pots
	 */
	private determineWinners(): void {
		const playersInShowdown = this.gameState.getPlayersInHand();
		const potManager = this.gameState.getPotManager();

		// Handle single winner (win by default) - no showdown needed
		if (playersInShowdown.length === 1) {
			const winnerPlayer = playersInShowdown[0];
			const allPots = potManager.getPots();
			const totalWinnings = allPots.reduce((sum, pot) => sum + pot.amount, 0);

			winnerPlayer.addChips(totalWinnings);

			const winnerData = [
				{
					playerId: winnerPlayer.id,
					winAmount: totalWinnings,
					handDescription: 'Win by default',
				},
			];

			// Emit showdown event
			this.emitEvent({
				type: 'showdown_complete',
				timestamp: Date.now(),
				handNumber: this.gameState.handNumber,
				gameState: this.getVisibilityAwareState('showdown'),
			});

			this.completeHand(winnerData);
			return;
		}

		// Create list of players with their hand evaluations
		const playerEvaluations = playersInShowdown
			.map((player) => ({
				playerId: player.id,
				handStrength: this.handEvaluations.get(player.id)?.value || 0,
			}))
			.filter((pe) => pe.handStrength > 0);

		// Fallback for empty evaluations - distribute equally to remaining players
		if (playerEvaluations.length === 0 && playersInShowdown.length > 0) {
			this.distributeToRemainingPlayers(playersInShowdown);
			return;
		}

		// Simulate pot distribution
		const remainingPlayerIds = playersInShowdown.map((p) => p.id);
		const { distributions } = potManager.simulateDistribution(
			playerEvaluations,
			remainingPlayerIds,
		);

		// Distribute winnings to players
		const winners: Array<{
			playerId: string;
			winAmount: number;
			handDescription: string;
		}> = [];

		const winnerTotals = new Map<string, number>();

		for (const distribution of distributions) {
			const currentTotal = winnerTotals.get(distribution.playerId) || 0;
			winnerTotals.set(
				distribution.playerId,
				currentTotal + distribution.amount,
			);
		}

		// Add chips to winners and create result
		for (const [playerId, amount] of winnerTotals) {
			const player = this.gameState.getPlayer(playerId);
			const handEval = this.handEvaluations.get(playerId);

			if (player && handEval) {
				player.addChips(amount);
				winners.push({
					playerId: playerId,
					winAmount: amount,
					handDescription: this.getHandDescription(handEval),
				});
			}
		}

		// Emit showdown event
		this.emitEvent({
			type: 'showdown_complete',
			timestamp: Date.now(),
			handNumber: this.gameState.handNumber,
			gameState: this.getVisibilityAwareState('showdown'),
		});

		// Complete the hand
		this.completeHand(winners);
	}

	/**
	 * Distributes pots equally to remaining players when no hand evaluations exist
	 */
	private distributeToRemainingPlayers(players: Player[]): void {
		const potManager = this.gameState.getPotManager();
		const allPots = potManager.getPots();
		const totalWinnings = allPots.reduce((sum, pot) => sum + pot.amount, 0);

		// Distribute equally among remaining players
		const baseAmount = Math.floor(totalWinnings / players.length);
		const remainder = totalWinnings % players.length;

		const winners: WinnerInfo[] = [];
		players.forEach((player, index) => {
			const amount = baseAmount + (index < remainder ? 1 : 0);
			player.addChips(amount);
			winners.push({
				playerId: player.id,
				winAmount: amount,
				amount: amount,
				handDescription: 'Split Pot (Tie)',
			});
		});

		// Emit showdown event
		this.emitEvent({
			type: 'showdown_complete',
			timestamp: Date.now(),
			handNumber: this.gameState.handNumber,
			gameState: this.getVisibilityAwareState('showdown'),
		});

		this.completeHand(winners.map(w => ({
			playerId: w.playerId,
			winAmount: w.winAmount || w.amount || 0,
			handDescription: w.handDescription || w.description || ''
		})));
	}

	/**
	 * Completes the current hand
	 */
	private completeHand(
		winners: Array<{
			playerId: string;
			winAmount: number;
			handDescription: string;
		}>,
	): void {
		this.gameState.advancePhase();
		this.gameRunning = false;

		this.emitEvent({
			type: 'hand_complete',
			timestamp: Date.now(),
			handNumber: this.gameState.handNumber,
			winners,
			gameState: this.gameState.getPublicState(),
		} as GameEvent);

		// Eliminate players who have no chips left. This keeps the table free of
		// bust-out seats and prevents zero-stack players from being dealt into
		// the next hand.
		const bustedPlayers = this.gameState.players.filter(
			(p) => p.chipStack <= 0,
		);
		for (const player of bustedPlayers) {
			this.removePlayer(player.id);
		}
	}

	/**
	 * Gets a human-readable description of a hand
	 */
	private getHandDescription(handEval: HandEvaluation): string {
		const rankNames = {
			1: 'High Card',
			2: 'One Pair',
			3: 'Two Pair',
			4: 'Three of a Kind',
			5: 'Straight',
			6: 'Flush',
			7: 'Full House',
			8: 'Four of a Kind',
			9: 'Straight Flush',
			10: 'Royal Flush',
		};

		return rankNames[handEval.rank] || 'Unknown Hand';
	}

	/**
	 * Emits an event to all subscribers
	 */
	private emitEvent(event: GameEvent): void {
		this.eventCallbacks.forEach((callback) => {
			try {
				callback(event);
			} catch (error) {
				gameLogger.error(`Error emitting event ${event.type}: ${error}`);
			}
		});
	}

	/**
	 * Gets state with visibility rules applied based on event context
	 */
	private getVisibilityAwareState(eventType: string): ReturnType<GameState['getPublicState']> {
		// For showdown events, use visibility rules (spectator view)
		if (eventType === 'showdown') {
			// Use the GameState's visibility method if available
			const gameState = this.gameState;
			if (isGameStateWithVisibility(gameState)) {
				return gameState.getStateWithVisibility(
					'spectator',
					undefined,
				);
			}
			// Fallback to complete state for showdown
			return this.gameState.getCompleteState();
		}

		// For other events, use public state
		return this.gameState.getPublicState();
	}

	/**
	 * Checks if the game is running
	 */
	isGameRunning(): boolean {
		return this.gameRunning;
	}

	/**
	 * Gets game statistics
	 */
	getGameStats(): {
		totalHands: number;
		activePlayers: number;
		currentPot: number;
		currentPhase: GamePhase;
	} {
		return {
			totalHands: this.gameState.handNumber,
			activePlayers: this.gameState.getActivePlayers().length,
			currentPot: this.gameState.getPotManager().getTotalPotAmount(),
			currentPhase: this.gameState.currentPhase,
		};
	}
}
