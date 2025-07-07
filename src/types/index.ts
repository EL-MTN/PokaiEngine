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
	playerCards: [Card, Card];
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

// Game configuration
export interface GameConfig {
	maxPlayers: number;
	smallBlindAmount: number;
	bigBlindAmount: number;
	turnTimeLimit: number; // in seconds
	isTournament: boolean;
	tournamentSettings?: TournamentSettings;
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

// Utility types
export type PlayerId = string;
export type GameId = string;
export type EventCallback = (event: GameEvent) => void;
