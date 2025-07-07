import { Deck } from '../core/cards/Deck';
import { Card } from '../core/cards/Card';
import { HandEvaluator } from '../core/cards/HandEvaluator';
import { GameState } from '../core/game/GameState';
import { Player } from '../core/game/Player';
import { ActionValidator } from '../core/betting/ActionValidator';
import { PotDistribution } from '../core/game/PotManager';
import {
	Action,
	ActionType,
	GamePhase,
	GameEvent,
	HandEvaluation,
	GameConfig,
	EventCallback,
	BotGameState,
	PossibleAction,
	GameStateError,
} from '../types';

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
		this.gameState = new GameState(gameId, config.smallBlindAmount, config.bigBlindAmount);
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

		// Post blinds
		this.postBlinds();

		// Start pre-flop betting
		this.gameState.currentPhase = GamePhase.PreFlop;
		this.gameState.setNextPlayerToAct();

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

		// Check if hand is complete
		if (this.gameState.isHandComplete()) {
			this.completeHand();
		}
	}

	/**
	 * Forces a player to act (timeout)
	 */
	forcePlayerAction(playerId: string): void {
		if (!this.gameRunning) {
			throw new GameStateError('Game is not running');
		}

		const forcedAction = ActionValidator.getForceAction(this.gameState, playerId);

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

		if (!player.holeCards) {
			throw new GameStateError('Player has no hole cards');
		}

		return {
			playerId: playerId,
			playerCards: player.holeCards,
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
		// Create side pots if needed
		this.gameState.createSidePots();

		// Advance to next phase
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
				break;
			default:
				throw new GameStateError('Invalid game phase for betting round completion');
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
					this.gameState.communityCards
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

		// Create list of players with their hand evaluations
		const playerEvaluations = playersInShowdown
			.map((player) => ({
				playerId: player.id,
				handStrength: this.handEvaluations.get(player.id)?.value || 0,
			}))
			.filter((pe) => pe.handStrength > 0);

		// Simulate pot distribution
		const { distributions, totalDistributed } =
			potManager.simulateDistribution(playerEvaluations);

		// Distribute winnings to players
		const winners: Array<{
			playerId: string;
			winAmount: number;
			handDescription: string;
		}> = [];

		const winnerTotals = new Map<string, number>();

		for (const distribution of distributions) {
			const currentTotal = winnerTotals.get(distribution.playerId) || 0;
			winnerTotals.set(distribution.playerId, currentTotal + distribution.amount);
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
			gameState: this.gameState.getCompleteState(),
		});

		// Complete the hand
		this.completeHand();
	}

	/**
	 * Completes the current hand
	 */
	private completeHand(): void {
		this.gameState.advancePhase();
		this.gameRunning = false;

		this.emitEvent({
			type: 'hand_complete',
			timestamp: Date.now(),
			handNumber: this.gameState.handNumber,
			gameState: this.gameState.getPublicState(),
		});
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
				// Silently ignore callback errors to prevent breaking the game
			}
		});
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
