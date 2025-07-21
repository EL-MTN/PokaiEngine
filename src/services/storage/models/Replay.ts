import mongoose, { Document, Schema } from 'mongoose';

import { Card } from '@/types';

export interface IGameEvent {
	type: string;
	timestamp: number;
	data: unknown;
	phase?: string;
	handNumber?: number;
	playerId?: string;
}

export interface IPlayerMetadata {
	id: string;
	name: string;
	initialChipStack: number;
	finalChipStack: number;
	handsPlayed: number;
	totalActions: number;
	winnings: number;
}

export interface IHandSummary {
	handNumber: number;
	startTimestamp: number;
	endTimestamp: number;
	duration: number;
	winner: string;
	potSize: number;
	communityCards: Card[];
	actions: number;
}

export interface IGameMetadata {
	gameId: string;
	gameName?: string;
	gameType: 'cash' | 'tournament';
	maxPlayers: number;
	actualPlayers: number;
	smallBlindAmount: number;
	bigBlindAmount: number;
	turnTimeLimit: number;
	gameStartTime: number;
	gameEndTime: number;
	gameDuration: number;
	totalHands: number;
	totalActions: number;
	playerNames: Record<string, string>;
	winners: string[];
}

export interface IReplayAnalytics {
	totalEvents: number;
	avgHandDuration: number;
	actionDistribution: Record<string, number>;
	phaseDistribution: Record<string, number>;
	playerPerformance: Record<string, IPlayerMetadata>;
	gameFlow: {
		peakPotSize: number;
		longestHand: number;
		shortestHand: number;
		mostActivePlayer: string;
	};
}

export interface IReplay extends Document {
	gameId: string;
	metadata: IGameMetadata;
	events: IGameEvent[];
	handSummaries: IHandSummary[];
	analytics: IReplayAnalytics;
	fileSize: number;
	version: string;
	createdAt: Date;
	updatedAt: Date;
}

const GameEventSchema = new Schema<IGameEvent>(
	{
		type: { type: String, required: true, index: true },
		timestamp: { type: Number, required: true, index: true },
		data: { type: Schema.Types.Mixed, required: true },
		phase: { type: String, index: true },
		handNumber: { type: Number, index: true },
		playerId: { type: String, index: true },
	},
	{ _id: false },
);

const PlayerMetadataSchema = new Schema<IPlayerMetadata>(
	{
		id: { type: String, required: true },
		name: { type: String, required: true },
		initialChipStack: { type: Number, required: true },
		finalChipStack: { type: Number, required: true },
		handsPlayed: { type: Number, default: 0 },
		totalActions: { type: Number, default: 0 },
		winnings: { type: Number, default: 0 },
	},
	{ _id: false },
);

const HandSummarySchema = new Schema<IHandSummary>(
	{
		handNumber: { type: Number, required: true },
		startTimestamp: { type: Number, required: true },
		endTimestamp: { type: Number, required: true },
		duration: { type: Number, required: true },
		winner: { type: String, required: true },
		potSize: { type: Number, required: true },
		communityCards: [{ type: Schema.Types.Mixed }],
		actions: { type: Number, default: 0 },
	},
	{ _id: false },
);

const GameMetadataSchema = new Schema<IGameMetadata>(
	{
		gameId: { type: String, required: true },
		gameName: { type: String },
		gameType: { type: String, enum: ['cash', 'tournament'], required: true },
		maxPlayers: { type: Number, required: true },
		actualPlayers: { type: Number, required: true },
		smallBlindAmount: { type: Number, required: true },
		bigBlindAmount: { type: Number, required: true },
		turnTimeLimit: { type: Number, required: true },
		gameStartTime: { type: Number, required: true },
		gameEndTime: { type: Number, required: true },
		gameDuration: { type: Number, required: true },
		totalHands: { type: Number, default: 0 },
		totalActions: { type: Number, default: 0 },
		playerNames: { type: Map, of: String, default: new Map() },
		winners: [{ type: String }],
	},
	{ _id: false },
);

const ReplayAnalyticsSchema = new Schema<IReplayAnalytics>(
	{
		totalEvents: { type: Number, required: true },
		avgHandDuration: { type: Number, default: 0 },
		actionDistribution: { type: Map, of: Number, default: new Map() },
		phaseDistribution: { type: Map, of: Number, default: new Map() },
		playerPerformance: {
			type: Map,
			of: PlayerMetadataSchema,
			default: new Map(),
		},
		gameFlow: {
			peakPotSize: { type: Number, default: 0 },
			longestHand: { type: Number, default: 0 },
			shortestHand: { type: Number, default: 0 },
			mostActivePlayer: { type: String, default: '' },
		},
	},
	{ _id: false },
);

const ReplaySchema = new Schema<IReplay>(
	{
		gameId: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		metadata: {
			type: GameMetadataSchema,
			required: true,
		},
		events: [GameEventSchema],
		handSummaries: [HandSummarySchema],
		analytics: {
			type: ReplayAnalyticsSchema,
			required: true,
		},
		fileSize: {
			type: Number,
			default: 0,
		},
		version: {
			type: String,
			default: '1.0.0',
		},
	},
	{
		timestamps: true,
		collection: 'replays',
	},
);

// Compound indexes for efficient queries
ReplaySchema.index({ gameId: 1, createdAt: -1 });
ReplaySchema.index({ 'metadata.gameType': 1, createdAt: -1 });
ReplaySchema.index({ 'metadata.actualPlayers': 1, createdAt: -1 });
ReplaySchema.index({ 'events.type': 1, 'events.timestamp': 1 });
ReplaySchema.index({ 'events.handNumber': 1, 'events.phase': 1 });

// Text index for searching
ReplaySchema.index({
	gameId: 'text',
	'metadata.gameName': 'text',
	'metadata.playerNames': 'text',
});

// Virtual for file size in MB
ReplaySchema.virtual('fileSizeMB').get(function () {
	return (this.fileSize / (1024 * 1024)).toFixed(2);
});

// Pre-save middleware to calculate file size
ReplaySchema.pre('save', function (next) {
	if (this.isModified()) {
		const jsonString = JSON.stringify(this.toObject());
		this.fileSize = Buffer.byteLength(jsonString, 'utf8');
	}
	next();
});

// Static methods for common queries
ReplaySchema.statics = {
	findByGameId(gameId: string) {
		return this.findOne({ gameId });
	},

	findByDateRange(startDate: Date, endDate: Date) {
		return this.find({
			createdAt: {
				$gte: startDate,
				$lte: endDate,
			},
		}).sort({ createdAt: -1 });
	},

	findByGameType(gameType: 'cash' | 'tournament') {
		return this.find({
			'metadata.gameType': gameType,
		}).sort({ createdAt: -1 });
	},

	findByPlayerCount(playerCount: number) {
		return this.find({
			'metadata.actualPlayers': playerCount,
		}).sort({ createdAt: -1 });
	},

	getRecentReplays(limit: number = 10) {
		return this.find()
			.sort({ createdAt: -1 })
			.limit(limit)
			.select(
				'gameId metadata.gameName metadata.gameType metadata.actualPlayers metadata.gameDuration createdAt',
			);
	},
};

export const Replay = mongoose.model<IReplay>('Replay', ReplaySchema);

export default Replay;
