import crypto from 'crypto';

import mongoose, { Document, Schema } from 'mongoose';

export interface IBot extends Document {
	botId: string;
	apiKey: string; // Hashed
	botName: string;
	developer: string;
	email: string;
	createdAt: Date;
	lastUsed?: Date;
	status: 'active' | 'suspended' | 'revoked';
	stats: {
		gamesPlayed: number;
		handsPlayed: number;
		totalWinnings: number;
		lastGameAt?: Date;
	};
	// Methods
	validateApiKey(apiKey: string): boolean;
	updateLastUsed(): Promise<void>;
	incrementStats(
		gamesPlayed?: number,
		handsPlayed?: number,
		winnings?: number,
	): Promise<void>;
}

const BotSchema = new Schema<IBot>({
	botId: {
		type: String,
		unique: true,
		required: true,
		index: true,
	},
	apiKey: {
		type: String,
		required: true,
	}, // Stores hashed API key
	botName: {
		type: String,
		required: true,
		trim: true,
	},
	developer: {
		type: String,
		required: true,
		trim: true,
	},
	email: {
		type: String,
		required: true,
		lowercase: true,
		trim: true,
	},
	createdAt: {
		type: Date,
		default: Date.now,
	},
	lastUsed: Date,
	status: {
		type: String,
		enum: ['active', 'suspended', 'revoked'],
		default: 'active',
	},
	stats: {
		gamesPlayed: { type: Number, default: 0 },
		handsPlayed: { type: Number, default: 0 },
		totalWinnings: { type: Number, default: 0 },
		lastGameAt: Date,
	},
});

// Indexes for performance
BotSchema.index({ email: 1 });
BotSchema.index({ status: 1, lastUsed: -1 });

// Instance methods
BotSchema.methods.validateApiKey = function (apiKey: string): boolean {
	if (this.status !== 'active') {
		return false;
	}
	// Compare hashed API key
	const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
	return this.apiKey === hashedKey;
};

BotSchema.methods.updateLastUsed = async function (): Promise<void> {
	this.lastUsed = new Date();
	await this.save();
};

BotSchema.methods.incrementStats = async function (
	gamesPlayed: number = 0,
	handsPlayed: number = 0,
	winnings: number = 0,
): Promise<void> {
	this.stats.gamesPlayed += gamesPlayed;
	this.stats.handsPlayed += handsPlayed;
	this.stats.totalWinnings += winnings;
	this.stats.lastGameAt = new Date();
	await this.save();
};

// Static methods
BotSchema.statics.hashApiKey = function (apiKey: string): string {
	return crypto.createHash('sha256').update(apiKey).digest('hex');
};

BotSchema.statics.generateApiKey = function (): string {
	// Generate a secure random API key
	return crypto.randomBytes(32).toString('hex');
};

export const Bot = mongoose.model<IBot>('Bot', BotSchema);
