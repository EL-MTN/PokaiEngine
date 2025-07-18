/**
 * PokaiEngine Bot SDK - Utility Functions
 * 
 * Helper functions for poker calculations and strategy
 */

import { ActionType, BotDecision, Card, Player, PossibleAction, PotOdds } from './types.js';

// === Card Utilities ===

/**
 * Format a card for display
 */
export function formatCard(card: Card): string {
	const suits = { H: '♥', D: '♦', C: '♣', S: '♠' };
	const ranks = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
	const rank = ranks[card.rank as keyof typeof ranks] || card.rank.toString();
	const suit = suits[card.suit];
	return `${rank}${suit}`;
}

/**
 * Format multiple cards for display
 */
export function formatCards(cards: Card[]): string {
	return cards.map(formatCard).join(' ');
}

/**
 * Check if cards form a pair
 */
export function isPair(cards: Card[]): boolean {
	if (cards.length < 2) return false;
	return cards[0].rank === cards[1].rank;
}

/**
 * Check if cards are suited
 */
export function isSuited(cards: Card[]): boolean {
	if (cards.length < 2) return false;
	return cards.every(card => card.suit === cards[0].suit);
}

/**
 * Check if cards are connected (consecutive ranks)
 */
export function isConnected(cards: Card[]): boolean {
	if (cards.length < 2) return false;
	const ranks = cards.map(c => c.rank).sort((a, b) => a - b);
	
	for (let i = 1; i < ranks.length; i++) {
		if (ranks[i] - ranks[i-1] !== 1) {
			// Check for ace-low straight possibility
			if (!(ranks[0] === 2 && ranks[ranks.length-1] === 14 && ranks[ranks.length-2] === 5)) {
				return false;
			}
		}
	}
	return true;
}

// === Pot Odds Calculations ===

/**
 * Calculate pot odds
 */
export function calculatePotOdds(potSize: number, betToCall: number): PotOdds {
	const totalPot = potSize + betToCall;
	const odds = totalPot / betToCall;
	const percentage = (betToCall / totalPot) * 100;
	
	return {
		potSize,
		betToCall,
		odds,
		percentage
	};
}

/**
 * Calculate if a call is profitable based on equity
 */
export function isProfitableCall(potOdds: PotOdds, winProbability: number): boolean {
	const requiredEquity = potOdds.percentage;
	return (winProbability * 100) > requiredEquity;
}

// === Position Utilities ===

/**
 * Get position name relative to dealer
 */
export function getPositionName(position: number, totalPlayers: number): string {
	if (totalPlayers <= 2) {
		return position === 0 ? 'Button/SB' : 'BB';
	}
	
	const positions = ['Button', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'CO'];
	const adjustedPosition = (position + totalPlayers - 1) % totalPlayers;
	return positions[adjustedPosition] || `Position ${adjustedPosition}`;
}

/**
 * Check if position is early, middle, or late
 */
export function getPositionType(position: number, totalPlayers: number): 'early' | 'middle' | 'late' {
	if (totalPlayers <= 3) return 'late';
	
	const adjustedPosition = (position + totalPlayers - 1) % totalPlayers;
	
	if (adjustedPosition <= 1) return 'late'; // Button, SB
	if (adjustedPosition === 2) return 'middle'; // BB
	if (adjustedPosition <= 4) return 'early'; // UTG, UTG+1
	return 'middle';
}

// === Betting Utilities ===

/**
 * Find specific action from possible actions
 */
export function findAction(possibleActions: PossibleAction[], actionType: ActionType): PossibleAction | null {
	return possibleActions.find(action => action.type === actionType) || null;
}

/**
 * Get minimum bet/raise amount
 */
export function getMinBetAmount(possibleActions: PossibleAction[]): number {
	const betAction = findAction(possibleActions, ActionType.Bet);
	const raiseAction = findAction(possibleActions, ActionType.Raise);
	
	return (betAction?.minAmount || raiseAction?.minAmount || 0);
}

/**
 * Get maximum bet/raise amount
 */
export function getMaxBetAmount(possibleActions: PossibleAction[]): number {
	const betAction = findAction(possibleActions, ActionType.Bet);
	const raiseAction = findAction(possibleActions, ActionType.Raise);
	
	return (betAction?.maxAmount || raiseAction?.maxAmount || 0);
}

/**
 * Calculate a percentage bet size
 */
export function calculateBetSize(potSize: number, percentage: number): number {
	return Math.round(potSize * (percentage / 100));
}

// === Player Information ===

/**
 * Find player by ID
 */
export function findPlayer(players: Player[], playerId: string): Player | null {
	return players.find(player => player.id === playerId) || null;
}

/**
 * Get active players (not folded, not all-in)
 */
export function getActivePlayers(players: Player[]): Player[] {
	return players.filter(player => player.isActive && !player.hasFolded && !player.isAllIn);
}

/**
 * Get players still in hand (not folded)
 */
export function getPlayersInHand(players: Player[]): Player[] {
	return players.filter(player => !player.hasFolded);
}

/**
 * Calculate total pot including all current bets
 */
export function calculateTotalPot(players: Player[], potSize: number): number {
	const currentBets = players.reduce((sum, player) => sum + player.currentBet, 0);
	return potSize + currentBets;
}

// === Decision Making Helpers ===

/**
 * Create a simple aggressive decision
 */
export function createAggressiveDecision(possibleActions: PossibleAction[], confidence: number = 0.7): BotDecision {
	// Prefer raise/bet > call > check > fold
	let action = findAction(possibleActions, ActionType.Raise);
	if (!action) action = findAction(possibleActions, ActionType.Bet);
	if (!action) action = findAction(possibleActions, ActionType.Call);
	if (!action) action = findAction(possibleActions, ActionType.Check);
	if (!action) action = possibleActions[0]; // Fallback
	
	return {
		action: action.type,
		amount: action.minAmount,
		confidence,
		reasoning: 'Aggressive play style'
	};
}

/**
 * Create a simple conservative decision
 */
export function createConservativeDecision(possibleActions: PossibleAction[], confidence: number = 0.6): BotDecision {
	// Prefer check > call > fold > bet/raise
	let action = findAction(possibleActions, ActionType.Check);
	if (!action) action = findAction(possibleActions, ActionType.Call);
	if (!action) action = findAction(possibleActions, ActionType.Fold);
	if (!action) action = possibleActions[0]; // Fallback
	
	return {
		action: action.type,
		amount: action.minAmount,
		confidence,
		reasoning: 'Conservative play style'
	};
}

/**
 * Create a pot odds based decision
 */
export function createPotOddsDecision(
	possibleActions: PossibleAction[], 
	potSize: number, 
	winProbability: number
): BotDecision {
	const callAction = findAction(possibleActions, ActionType.Call);
	
	if (callAction && callAction.minAmount) {
		const potOdds = calculatePotOdds(potSize, callAction.minAmount);
		const profitable = isProfitableCall(potOdds, winProbability);
		
		if (profitable) {
			// If profitable, consider raising with high confidence
			if (winProbability > 0.7) {
				const raiseAction = findAction(possibleActions, ActionType.Raise);
				if (raiseAction) {
					return {
						action: ActionType.Raise,
						amount: raiseAction.minAmount,
						confidence: winProbability,
						reasoning: `Strong hand (${(winProbability * 100).toFixed(1)}% equity), pot odds favor aggression`
					};
				}
			}
			
			return {
				action: ActionType.Call,
				amount: callAction.minAmount,
				confidence: winProbability,
				reasoning: `Pot odds favorable (${potOdds.odds.toFixed(1)}:1, need ${potOdds.percentage.toFixed(1)}% equity)`
			};
		}
	}
	
	// Not profitable to call, check if we can check
	const checkAction = findAction(possibleActions, ActionType.Check);
	if (checkAction) {
		return {
			action: ActionType.Check,
			confidence: 0.5,
			reasoning: 'Pot odds unfavorable, checking for free card'
		};
	}
	
	// Must fold
	return {
		action: ActionType.Fold,
		confidence: 1 - winProbability,
		reasoning: 'Pot odds unfavorable, folding'
	};
}

// === Validation Utilities ===

/**
 * Validate that an action is possible
 */
export function isActionValid(action: ActionType, possibleActions: PossibleAction[]): boolean {
	return possibleActions.some(pa => pa.type === action);
}

/**
 * Validate bet amount is within limits
 */
export function isBetAmountValid(action: ActionType, amount: number, possibleActions: PossibleAction[]): boolean {
	const actionData = findAction(possibleActions, action);
	if (!actionData) return false;
	
	if (actionData.minAmount !== undefined && amount < actionData.minAmount) return false;
	if (actionData.maxAmount !== undefined && amount > actionData.maxAmount) return false;
	
	return true;
}

// === Timing Utilities ===

/**
 * Add random delay to make bot behavior more human-like
 */
export function addRandomDelay(minMs: number = 500, maxMs: number = 2000): Promise<void> {
	const delay = Math.random() * (maxMs - minMs) + minMs;
	return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Create a timeout promise for action decisions
 */
export function createActionTimeout(timeoutMs: number): Promise<never> {
	return new Promise((_, reject) => {
		setTimeout(() => reject(new Error('Action decision timeout')), timeoutMs);
	});
}