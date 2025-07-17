/**
 * PokaiEngine Bot SDK - Type Definitions
 * 
 * Comprehensive TypeScript types for bot development
 */

// === Core Game Types ===

export interface Card {
	suit: 'H' | 'D' | 'C' | 'S';
	rank: number; // 2-14 (11=J, 12=Q, 13=K, 14=A)
}

export enum ActionType {
	Fold = 'fold',
	Check = 'check',
	Call = 'call',
	Bet = 'bet',
	Raise = 'raise',
	AllIn = 'all-in'
}

export interface Action {
	type: ActionType;
	amount?: number;
	timestamp: number;
}

export interface PossibleAction {
	type: ActionType;
	minAmount?: number;
	maxAmount?: number;
}

export interface Player {
	id: string;
	botName: string;
	chipStack: number;
	currentBet: number;
	isActive: boolean;
	position: number;
	isAllIn: boolean;
	hasFolded: boolean;
}

export interface GameState {
	gameId: string;
	currentPhase: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
	currentPlayerToAct: string | null;
	potSize: number;
	communityCards: Card[];
	playerCards: Card[];
	possibleActions: PossibleAction[];
	players: Player[];
	dealerPosition: number;
	smallBlindPosition: number;
	bigBlindPosition: number;
	handNumber: number;
	timeLimit?: number;
}

// === Event Types ===

export interface GameEvent {
	type: string;
	data?: any;
	timestamp: number;
}

export interface GameInfo {
	gameId: string;
	currentPlayers: number;
	maxPlayers: number;
	smallBlind: number;
	bigBlind: number;
	isStarted: boolean;
}

// === Bot Configuration ===

export interface BotCredentials {
	botId: string;
	apiKey: string;
}

export interface BotConfig {
	credentials: BotCredentials;
	serverUrl?: string;
	reconnectAttempts?: number;
	reconnectDelay?: number;
	actionTimeout?: number;
	debug?: boolean;
}

export interface JoinGameOptions {
	gameId: string;
	chipStack: number;
}

// === Event Handlers ===

export interface BotEventHandlers {
	onGameJoined?: (data: { playerId: string; gameId: string; botName: string; chipStack: number }) => void;
	onTurnStart?: (data: { timeLimit: number }) => void;
	onTurnWarning?: (data: { timeRemaining: number }) => void;
	onGameState?: (gameState: GameState) => void;
	onGameEvent?: (event: GameEvent) => void;
	onActionSuccess?: (action: Action) => void;
	onActionError?: (error: string) => void;
	onError?: (error: string, code?: string) => void;
	onDisconnected?: (reason: string) => void;
	onReconnected?: () => void;
}

// === Response Types ===

export interface SocketResponse<T = any> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
	timestamp: number;
}

export interface AuthResponse {
	botId: string;
	botName: string;
	playerId: string;
	timestamp: number;
}

export interface GameListResponse {
	games: GameInfo[];
	timestamp: number;
}

// === Strategy Helper Types ===

export interface HandStrength {
	rank: number; // 1-10 (1=high card, 10=royal flush)
	description: string;
	kickers?: number[];
}

export interface PotOdds {
	potSize: number;
	betToCall: number;
	odds: number;
	percentage: number;
}

export interface BotDecision {
	action: ActionType;
	amount?: number;
	confidence: number; // 0-1
	reasoning: string;
}

// === SDK Error Types ===

export class PokaiError extends Error {
	constructor(
		message: string,
		public code?: string,
		public details?: any
	) {
		super(message);
		this.name = 'PokaiError';
	}
}

export class AuthenticationError extends PokaiError {
	constructor(message: string) {
		super(message, 'AUTH_ERROR');
		this.name = 'AuthenticationError';
	}
}

export class GameError extends PokaiError {
	constructor(message: string, details?: any) {
		super(message, 'GAME_ERROR', details);
		this.name = 'GameError';
	}
}

export class ConnectionError extends PokaiError {
	constructor(message: string) {
		super(message, 'CONNECTION_ERROR');
		this.name = 'ConnectionError';
	}
}

// === Utility Types ===

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
	debug(message: string, ...args: any[]): void;
	info(message: string, ...args: any[]): void;
	warn(message: string, ...args: any[]): void;
	error(message: string, ...args: any[]): void;
}