// Core game types
export enum Suit {
	Hearts = 'H',
	Diamonds = 'D',
	Clubs = 'C',
	Spades = 'S',
}

export enum Rank {
	Two = 2,
	Three = 3,
	Four = 4,
	Five = 5,
	Six = 6,
	Seven = 7,
	Eight = 8,
	Nine = 9,
	Ten = 10,
	Jack = 11,
	Queen = 12,
	King = 13,
	Ace = 14,
}

export interface Card {
	suit: Suit;
	rank: Rank;
}

export enum HandRank {
	HighCard = 1,
	OnePair = 2,
	TwoPair = 3,
	ThreeOfAKind = 4,
	Straight = 5,
	Flush = 6,
	FullHouse = 7,
	FourOfAKind = 8,
	StraightFlush = 9,
	RoyalFlush = 10,
}

export interface HandEvaluation {
	rank: HandRank;
	cards: Card[];
	kickers: Card[];
	value: number; // For comparison
}

// Player and Position types
export enum Position {
	SmallBlind = 'SB',
	BigBlind = 'BB',
	UnderTheGun = 'UTG',
	UnderTheGunPlus1 = 'UTG+1',
	UnderTheGunPlus2 = 'UTG+2',
	MiddlePosition1 = 'MP1',
	MiddlePosition2 = 'MP2',
	MiddlePosition3 = 'MP3',
	Hijack = 'HJ',
	Cutoff = 'CO',
	Button = 'BTN',
}

export interface PlayerInfo {
	id: string;
	name: string;
	chipStack: number;
	position?: Position;
	isActive: boolean;
	hasActed: boolean;
	isFolded: boolean;
	isAllIn: boolean;
	holeCards?: [Card, Card];
	currentBet: number;
	totalBetThisHand: number;
}

// Action types
export enum ActionType {
	Fold = 'fold',
	Check = 'check',
	Call = 'call',
	Bet = 'bet',
	Raise = 'raise',
	AllIn = 'all_in',
}

export interface Action {
	type: ActionType;
	amount?: number;
	playerId: string;
	timestamp: number;
}

export interface PossibleAction {
	type: ActionType;
	minAmount?: number;
	maxAmount?: number;
	description: string;
}

// Game state types
export enum GamePhase {
	PreFlop = 'preflop',
	Flop = 'flop',
	Turn = 'turn',
	River = 'river',
	Showdown = 'showdown',
	HandComplete = 'hand_complete',
}

export interface Pot {
	amount: number;
	eligiblePlayers: string[];
	isMainPot: boolean;
}

export interface GameState {
	id: string;
	players: PlayerInfo[];
	communityCards: Card[];
	pots: Pot[];
	currentPhase: GamePhase;
	currentPlayerToAct?: string;
	dealerPosition: number;
	smallBlindPosition: number;
	bigBlindPosition: number;
	smallBlindAmount: number;
	bigBlindAmount: number;
	minimumRaise: number;
	handNumber: number;
	isComplete: boolean;
}

// Socket communication types
export interface BotGameState {
	playerId: string;
	playerCards?: [Card, Card]; // Optional: player may not have cards yet
	communityCards: Card[];
	potSize: number;
	players: Omit<PlayerInfo, 'holeCards'>[];
	currentPlayerToAct?: string;
	possibleActions: PossibleAction[];
	timeRemaining: number;
	currentPhase: GamePhase;
	minimumRaise: number;
}

export interface GameEvent {
	type: string;
	playerId?: string;
	action?: Action;
	gameState?: GameState;
	timestamp: number;
	handNumber: number;
	phase?: GamePhase;
}

// Tournament and blinds structure (for future expansion)
export interface BlindLevel {
	level: number;
	smallBlind: number;
	bigBlind: number;
	ante?: number;
	duration: number; // in minutes
}

export interface TournamentSettings {
	blindLevels: BlindLevel[];
	startingStack: number;
	maxPlayers: number;
	currentBlindLevel: number;
}

// Start condition types
export type StartCondition = 'manual' | 'minPlayers' | 'scheduled';

export interface StartSettings {
	condition: StartCondition;
	minPlayers?: number; // For 'minPlayers' condition (default: 2)
	scheduledStartTime?: Date; // For 'scheduled' condition
	creatorId?: string; // For 'manual' condition - who can start the game
}

// Game configuration
export interface GameConfig {
	maxPlayers: number;
	smallBlindAmount: number;
	bigBlindAmount: number;
	turnTimeLimit: number; // in seconds
	handStartDelay?: number; // in milliseconds, delay between hands
	isTournament: boolean;
	tournamentSettings?: TournamentSettings;
	startSettings?: StartSettings; // Optional to maintain backward compatibility
}

// Error types
export class PokerEngineError extends Error {
	constructor(message: string, public code: string) {
		super(message);
		this.name = 'PokerEngineError';
	}
}

export class InvalidActionError extends PokerEngineError {
	constructor(message: string) {
		super(message, 'INVALID_ACTION');
	}
}

export class GameStateError extends PokerEngineError {
	constructor(message: string) {
		super(message, 'GAME_STATE_ERROR');
	}
}

// Replay System Types
export interface ReplayEvent extends GameEvent {
	sequenceId: number;
	gameStateBefore?: GameState; // State before this event
	gameStateAfter?: GameState;  // State after this event
	playerDecisionContext?: PlayerDecisionContext;
	eventDuration?: number; // Time taken for this event (ms)
}

export interface PlayerDecisionContext {
	playerId: string;
	possibleActions: PossibleAction[];
	timeToDecide: number; // Time taken to make decision (ms)
	equityBefore?: number; // Hand equity before action (if calculated)
	equityAfter?: number;  // Hand equity after action (if calculated)
	position: Position;
	chipStack: number;
	potOdds?: number;
	effectiveStackSize?: number;
}

export interface ReplayMetadata {
	gameConfig: GameConfig;
	playerNames: Record<PlayerId, string>;
	handCount: number;
	totalEvents: number;
	totalActions: number;
	gameDuration: number; // Total game time in ms
	avgHandDuration?: number;
	winners?: { playerId: PlayerId; handsWon: number }[];
	finalChipCounts?: Record<PlayerId, number>;
	createdAt: Date;
	version: string; // Replay format version
}

export interface ReplayData {
	gameId: GameId;
	startTime: Date;
	endTime?: Date;
	events: ReplayEvent[];
	initialGameState: GameState;
	finalGameState?: GameState;
	metadata: ReplayMetadata;
	checkpoints?: ReplayCheckpoint[]; // For faster seeking
}

export interface ReplayCheckpoint {
	sequenceId: number;
	handNumber: number;
	phase: GamePhase;
	gameState: GameState;
	timestamp: number;
	eventIndex: number; // Index in events array
}

export interface HandReplayData {
	handNumber: number;
	startTime: Date;
	endTime: Date;
	events: ReplayEvent[];
	playersInvolved: PlayerId[];
	initialState: GameState;
	finalState: GameState;
	communityCards: Card[];
	winners: { playerId: PlayerId; handDescription?: string; winAmount: number }[];
	potSize: number;
	showdownResults?: Record<PlayerId, HandEvaluation>;
}

// Utility types
export type PlayerId = string;
export type GameId = string;
export type EventCallback = (event: GameEvent) => void;
