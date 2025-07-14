import { Action, PlayerInfo, Position } from '@/domain/types';
import { Card } from '../cards/Card';

export class Player implements PlayerInfo {
	public id: string;
	public name: string;
	public chipStack: number;
	public position?: Position;
	public isActive: boolean;
	public hasActed: boolean;
	public isFolded: boolean;
	public isAllIn: boolean;
	public holeCards?: [Card, Card];
	public currentBet: number;
	public totalBetThisHand: number;
	public timeBank: number;
	public isConnected: boolean;
	public actionsThisRound: Action[];
	public totalWinnings: number;
	public handsPlayed: number;

	constructor(id: string, name: string, chipStack: number, timeBank: number = 30) {
		this.id = id;
		this.name = name;
		this.chipStack = chipStack;
		this.timeBank = timeBank;
		this.isActive = true;
		this.hasActed = false;
		this.isFolded = false;
		this.isAllIn = false;
		this.currentBet = 0;
		this.totalBetThisHand = 0;
		this.isConnected = true;
		this.actionsThisRound = [];
		this.totalWinnings = 0;
		this.handsPlayed = 0;
	}

	/**
	 * Deals hole cards to the player
	 */
	dealHoleCards(cards: [Card, Card]): void {
		this.holeCards = cards;
	}

	/**
	 * Clears hole cards (for new hand)
	 */
	clearHoleCards(): void {
		this.holeCards = undefined;
	}

	/**
	 * Makes a bet (includes raise, call, blind posting)
	 */
	bet(amount: number): void {
		if (amount > this.chipStack) {
			// All-in situation
			amount = this.chipStack;
			this.isAllIn = true;
		}

		this.chipStack -= amount;
		this.currentBet += amount;
		this.totalBetThisHand += amount;
		this.hasActed = true;

		if (this.chipStack === 0) {
			this.isAllIn = true;
		}
	}

	/**
	 * Folds the player's hand
	 */
	fold(): void {
		this.isFolded = true;
		this.hasActed = true;
	}

	/**
	 * Posts a blind payment (does not count as a voluntary action)
	 */
	postBlind(amount: number): void {
		if (amount > this.chipStack) {
			amount = this.chipStack;
		}

		this.chipStack -= amount;
		this.currentBet += amount;
		this.totalBetThisHand += amount;

		if (this.chipStack === 0) {
			this.isAllIn = true;
		}
	}

	/**
	 * Checks (no bet required)
	 */
	check(): void {
		this.hasActed = true;
	}

	/**
	 * Adds chips to the player's stack
	 */
	addChips(amount: number): void {
		this.chipStack += amount;
		this.totalWinnings += amount;
	}

	/**
	 * Removes chips from the player's stack
	 */
	removeChips(amount: number): void {
		if (amount > this.chipStack) {
			amount = this.chipStack;
		}
		this.chipStack -= amount;
	}

	/**
	 * Resets player state for a new hand
	 */
	resetForNewHand(): void {
		this.hasActed = false;
		this.isFolded = false;
		this.isAllIn = false;
		this.currentBet = 0;
		this.totalBetThisHand = 0;
		this.clearHoleCards();
		this.actionsThisRound = [];
		this.handsPlayed++;
	}

	/**
	 * Resets player state for a new betting round
	 */
	resetForNewRound(): void {
		this.hasActed = false;
		this.currentBet = 0;
		this.actionsThisRound = [];
	}

	/**
	 * Records an action taken by the player
	 */
	recordAction(action: Action): void {
		this.actionsThisRound.push(action);
	}

	/**
	 * Checks if the player can act (not folded, not all-in, has chips)
	 */
	canAct(): boolean {
		return this.isActive && !this.isFolded && !this.isAllIn && this.chipStack > 0;
	}

	/**
	 * Checks if the player is eligible for the pot
	 */
	isEligibleForPot(): boolean {
		return !this.isFolded;
	}

	/**
	 * Gets the maximum amount the player can bet
	 */
	getMaxBet(): number {
		return this.chipStack;
	}

	/**
	 * Sets the player's position
	 */
	setPosition(position: Position): void {
		this.position = position;
	}

	/**
	 * Disconnects the player
	 */
	disconnect(): void {
		this.isConnected = false;
	}

	/**
	 * Reconnects the player
	 */
	reconnect(): void {
		this.isConnected = true;
	}

	/**
	 * Sets the player as inactive (leaves table)
	 */
	setInactive(): void {
		this.isActive = false;
	}

	/**
	 * Sets the player as active (joins table)
	 */
	setActive(): void {
		this.isActive = true;
	}

	/**
	 * Gets a sanitized version of player info (without hole cards)
	 */
	getPublicInfo(): Omit<PlayerInfo, 'holeCards'> {
		return {
			id: this.id,
			name: this.name,
			chipStack: this.chipStack,
			position: this.position,
			isActive: this.isActive,
			hasActed: this.hasActed,
			isFolded: this.isFolded,
			isAllIn: this.isAllIn,
			currentBet: this.currentBet,
			totalBetThisHand: this.totalBetThisHand,
		};
	}

	/**
	 * Gets complete player info including hole cards
	 */
	getCompleteInfo(): PlayerInfo {
		return {
			id: this.id,
			name: this.name,
			chipStack: this.chipStack,
			position: this.position,
			isActive: this.isActive,
			hasActed: this.hasActed,
			isFolded: this.isFolded,
			isAllIn: this.isAllIn,
			holeCards: this.holeCards,
			currentBet: this.currentBet,
			totalBetThisHand: this.totalBetThisHand,
		};
	}

	/**
	 * Creates a copy of the player
	 */
	clone(): Player {
		const cloned = new Player(this.id, this.name, this.chipStack, this.timeBank);
		cloned.position = this.position;
		cloned.isActive = this.isActive;
		cloned.hasActed = this.hasActed;
		cloned.isFolded = this.isFolded;
		cloned.isAllIn = this.isAllIn;
		cloned.holeCards = this.holeCards;
		cloned.currentBet = this.currentBet;
		cloned.totalBetThisHand = this.totalBetThisHand;
		cloned.isConnected = this.isConnected;
		cloned.actionsThisRound = [...this.actionsThisRound];
		cloned.totalWinnings = this.totalWinnings;
		cloned.handsPlayed = this.handsPlayed;
		return cloned;
	}
}
