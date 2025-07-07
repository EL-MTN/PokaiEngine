import { Card } from '../cards/Card';
import { Player } from './Player';
import { PotManager } from './PotManager';
import { GameState as GameStateInterface, GamePhase, Position, Pot, PlayerInfo } from '../../types';

export class GameState implements GameStateInterface {
	public id: string;
	public players: Player[] = [];
	public communityCards: Card[] = [];
	public pots: Pot[] = [];
	public currentPhase: GamePhase = GamePhase.PreFlop;
	public currentPlayerToAct?: string;
	public dealerPosition: number = 0;
	public smallBlindPosition: number = 0;
	public bigBlindPosition: number = 0;
	public smallBlindAmount: number;
	public bigBlindAmount: number;
	public minimumRaise: number;
	public handNumber: number = 0;
	public isComplete: boolean = false;

	private potManager: PotManager;
	private actionHistory: any[] = [];
	private playerPositions: Position[] = [];

	constructor(id: string, smallBlindAmount: number, bigBlindAmount: number) {
		this.id = id;
		this.smallBlindAmount = smallBlindAmount;
		this.bigBlindAmount = bigBlindAmount;
		this.minimumRaise = bigBlindAmount;
		this.potManager = new PotManager();
		this.pots = this.potManager.getPots();
	}

	/**
	 * Adds a player to the game
	 */
	addPlayer(player: Player): void {
		if (this.players.length >= 10) {
			throw new Error('Maximum number of players (10) reached');
		}

		if (this.players.find((p) => p.id === player.id)) {
			throw new Error('Player already exists in the game');
		}

		this.players.push(player);
		this.assignPositions();
	}

	/**
	 * Removes a player from the game
	 */
	removePlayer(playerId: string): void {
		const playerIndex = this.players.findIndex((p) => p.id === playerId);
		if (playerIndex === -1) {
			throw new Error('Player not found');
		}

		this.players.splice(playerIndex, 1);
		this.assignPositions();
	}

	/**
	 * Gets a player by ID
	 */
	getPlayer(playerId: string): Player | undefined {
		return this.players.find((p) => p.id === playerId);
	}

	/**
	 * Gets all active players
	 */
	getActivePlayers(): Player[] {
		return this.players.filter((p) => p.isActive);
	}

	/**
	 * Gets all players in the hand (not folded)
	 */
	getPlayersInHand(): Player[] {
		return this.players.filter((p) => !p.isFolded);
	}

	/**
	 * Gets all players who can act
	 */
	getPlayersWhoCanAct(): Player[] {
		return this.players.filter((p) => p.canAct());
	}

	/**
	 * Assigns positions to players based on dealer button
	 */
	assignPositions(): void {
		const activePlayers = this.getActivePlayers();
		const playerCount = activePlayers.length;

		if (playerCount < 2) {
			return;
		}

		// Reset positions
		this.playerPositions = [];
		activePlayers.forEach((player) => (player.position = undefined));

		// Assign positions based on player count
		if (playerCount === 2) {
			// Heads-up: dealer is small blind
			activePlayers[this.dealerPosition % playerCount].setPosition(Position.SmallBlind);
			activePlayers[(this.dealerPosition + 1) % playerCount].setPosition(Position.BigBlind);
		} else {
			// Multi-player
			const positions = this.getPositionsForPlayerCount(playerCount);

			for (let i = 0; i < playerCount; i++) {
				const positionIndex = (this.dealerPosition + i) % playerCount;
				activePlayers[positionIndex].setPosition(positions[i]);
			}
		}

		// Set blind positions
		this.smallBlindPosition = this.findPlayerWithPosition(Position.SmallBlind);
		this.bigBlindPosition = this.findPlayerWithPosition(Position.BigBlind);
	}

	/**
	 * Gets position array for a given player count
	 */
	private getPositionsForPlayerCount(count: number): Position[] {
		const positions: Position[] = [];

		switch (count) {
			case 3:
				positions.push(Position.Button, Position.SmallBlind, Position.BigBlind);
				break;
			case 4:
				positions.push(
					Position.Button,
					Position.SmallBlind,
					Position.BigBlind,
					Position.UnderTheGun
				);
				break;
			case 5:
				positions.push(
					Position.Button,
					Position.SmallBlind,
					Position.BigBlind,
					Position.UnderTheGun,
					Position.Cutoff
				);
				break;
			case 6:
				positions.push(
					Position.Button,
					Position.SmallBlind,
					Position.BigBlind,
					Position.UnderTheGun,
					Position.MiddlePosition1,
					Position.Cutoff
				);
				break;
			default:
				// For 7+ players, use full position set
				positions.push(
					Position.Button,
					Position.SmallBlind,
					Position.BigBlind,
					Position.UnderTheGun,
					Position.UnderTheGunPlus1,
					Position.MiddlePosition1,
					Position.MiddlePosition2,
					Position.Hijack,
					Position.Cutoff
				);
				break;
		}

		return positions.slice(0, count);
	}

	/**
	 * Finds player index with a specific position
	 */
	private findPlayerWithPosition(position: Position): number {
		const player = this.players.find((p) => p.position === position);
		return player ? this.players.indexOf(player) : -1;
	}

	/**
	 * Starts a new hand
	 */
	startNewHand(): void {
		this.handNumber++;
		this.currentPhase = GamePhase.PreFlop;
		this.communityCards = [];
		this.isComplete = false;
		this.actionHistory = [];
		this.minimumRaise = this.bigBlindAmount;

		// Reset all players for new hand
		this.players.forEach((player) => player.resetForNewHand());

		// Reset pot manager
		this.potManager.reset();
		this.pots = this.potManager.getPots();

		// Move dealer button
		this.moveDealer();

		// Assign new positions
		this.assignPositions();
	}

	/**
	 * Moves the dealer button to the next player
	 */
	moveDealer(): void {
		const activePlayers = this.getActivePlayers();
		if (activePlayers.length > 0) {
			this.dealerPosition = (this.dealerPosition + 1) % activePlayers.length;
		}
	}

	/**
	 * Advances to the next game phase
	 */
	advancePhase(): void {
		// Reset all players for new betting round
		this.players.forEach((player) => player.resetForNewRound());

		switch (this.currentPhase) {
			case GamePhase.PreFlop:
				this.currentPhase = GamePhase.Flop;
				break;
			case GamePhase.Flop:
				this.currentPhase = GamePhase.Turn;
				break;
			case GamePhase.Turn:
				this.currentPhase = GamePhase.River;
				break;
			case GamePhase.River:
				this.currentPhase = GamePhase.Showdown;
				break;
			case GamePhase.Showdown:
				this.currentPhase = GamePhase.HandComplete;
				this.isComplete = true;
				break;
			default:
				throw new Error('Cannot advance from current phase');
		}

		// Reset minimum raise for new betting round
		this.minimumRaise = this.bigBlindAmount;

		// Set first player to act for the new round
		this.setNextPlayerToAct();
	}

	/**
	 * Sets the next player to act
	 */
	setNextPlayerToAct(): void {
		const playersWhoCanAct = this.getPlayersWhoCanAct();

		if (playersWhoCanAct.length === 0) {
			this.currentPlayerToAct = undefined;
			return;
		}

		// Find the next player in order who can act
		let startPosition = 0;

		if (this.currentPhase === GamePhase.PreFlop) {
			// Pre-flop: action starts to the left of big blind
			startPosition = (this.bigBlindPosition + 1) % this.players.length;
		} else {
			// Post-flop: action starts to the left of dealer
			startPosition = (this.dealerPosition + 1) % this.players.length;
		}

		for (let i = 0; i < this.players.length; i++) {
			const playerIndex = (startPosition + i) % this.players.length;
			const player = this.players[playerIndex];

			if (player.canAct()) {
				this.currentPlayerToAct = player.id;
				return;
			}
		}

		this.currentPlayerToAct = undefined;
	}

	/**
	 * Deals community cards for the current phase
	 */
	dealCommunityCards(cards: Card[]): void {
		this.communityCards.push(...cards);
	}

	/**
	 * Processes a player's bet
	 */
	processBet(playerId: string, amount: number): void {
		const player = this.getPlayer(playerId);
		if (!player) {
			throw new Error('Player not found');
		}

		player.bet(amount);
		this.potManager.addBet(playerId, amount);
		this.pots = this.potManager.getPots();

		// Update minimum raise
		if (amount > player.currentBet) {
			this.minimumRaise = Math.max(this.minimumRaise, amount - player.currentBet);
		}
	}

	/**
	 * Creates side pots for all-in situations
	 */
	createSidePots(): void {
		this.potManager.createSidePots(this.players);
		this.pots = this.potManager.getPots();
	}

	/**
	 * Checks if betting round is complete
	 */
	isBettingRoundComplete(): boolean {
		const playersWhoCanAct = this.getPlayersWhoCanAct();

		if (playersWhoCanAct.length === 0) {
			return true;
		}

		// Check if all players have acted and bets are equal
		const activePlayers = this.getPlayersInHand().filter((p) => p.canAct());

		if (activePlayers.length === 0) {
			return true;
		}

		const currentBets = activePlayers.map((p) => p.currentBet);
		const allBetsEqual = currentBets.every((bet) => bet === currentBets[0]);
		const allPlayersActed = activePlayers.every((p) => p.hasActed);

		return allBetsEqual && allPlayersActed;
	}

	/**
	 * Checks if the hand is complete
	 */
	isHandComplete(): boolean {
		const playersInHand = this.getPlayersInHand();

		// Hand is complete if only one player remains
		if (playersInHand.length <= 1) {
			return true;
		}

		// Hand is complete if we've reached the end
		return this.currentPhase === GamePhase.HandComplete;
	}

	/**
	 * Gets the current betting state
	 */
	getCurrentBet(): number {
		const playersInHand = this.getPlayersInHand();
		return Math.max(...playersInHand.map((p) => p.currentBet), 0);
	}

	/**
	 * Gets the pot manager
	 */
	getPotManager(): PotManager {
		return this.potManager;
	}

	/**
	 * Gets public game state (without hole cards)
	 */
	getPublicState(): GameStateInterface {
		return {
			id: this.id,
			players: this.players.map((p) => p.getPublicInfo()),
			communityCards: [...this.communityCards],
			pots: [...this.pots],
			currentPhase: this.currentPhase,
			currentPlayerToAct: this.currentPlayerToAct,
			dealerPosition: this.dealerPosition,
			smallBlindPosition: this.smallBlindPosition,
			bigBlindPosition: this.bigBlindPosition,
			smallBlindAmount: this.smallBlindAmount,
			bigBlindAmount: this.bigBlindAmount,
			minimumRaise: this.minimumRaise,
			handNumber: this.handNumber,
			isComplete: this.isComplete,
		};
	}

	/**
	 * Gets complete game state (with hole cards)
	 */
	getCompleteState(): GameStateInterface {
		return {
			id: this.id,
			players: this.players.map((p) => p.getCompleteInfo()),
			communityCards: [...this.communityCards],
			pots: [...this.pots],
			currentPhase: this.currentPhase,
			currentPlayerToAct: this.currentPlayerToAct,
			dealerPosition: this.dealerPosition,
			smallBlindPosition: this.smallBlindPosition,
			bigBlindPosition: this.bigBlindPosition,
			smallBlindAmount: this.smallBlindAmount,
			bigBlindAmount: this.bigBlindAmount,
			minimumRaise: this.minimumRaise,
			handNumber: this.handNumber,
			isComplete: this.isComplete,
		};
	}

	/**
	 * Clones the game state
	 */
	clone(): GameState {
		const cloned = new GameState(this.id, this.smallBlindAmount, this.bigBlindAmount);
		cloned.players = this.players.map((p) => p.clone());
		cloned.communityCards = [...this.communityCards];
		cloned.currentPhase = this.currentPhase;
		cloned.currentPlayerToAct = this.currentPlayerToAct;
		cloned.dealerPosition = this.dealerPosition;
		cloned.smallBlindPosition = this.smallBlindPosition;
		cloned.bigBlindPosition = this.bigBlindPosition;
		cloned.minimumRaise = this.minimumRaise;
		cloned.handNumber = this.handNumber;
		cloned.isComplete = this.isComplete;
		cloned.actionHistory = [...this.actionHistory];
		cloned.playerPositions = [...this.playerPositions];

		return cloned;
	}
}
