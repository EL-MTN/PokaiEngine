import crypto from 'crypto';

import { authLogger } from '@/services/logging/Logger';
import { Bot, IBot } from '@/services/storage/models/Bot';

export interface BotCredentials {
	botId: string;
	apiKey: string;
	botName: string;
	developer: string;
	email: string;
}

export interface BotRegistrationData {
	botName: string;
	developer: string;
	email: string;
}

export interface BotStatistics {
	botId: string;
	botName: string;
	gamesPlayed: number;
	handsPlayed: number;
	totalWinnings: number;
	lastGameAt?: Date;
	status: string;
}

export class BotAuthService {
	private static instance: BotAuthService;
	private botCache: Map<string, IBot> = new Map();
	private readonly CACHE_TTL = 300000; // 5 minutes
	private cacheTimestamps: Map<string, number> = new Map();

	private constructor() {}

	static getInstance(): BotAuthService {
		if (!BotAuthService.instance) {
			BotAuthService.instance = new BotAuthService();
		}
		return BotAuthService.instance;
	}

	/**
	 * Register a new bot and generate API credentials
	 */
	async registerBot(data: BotRegistrationData): Promise<BotCredentials> {
		try {
			// Generate unique bot ID and API key
			const botId = this.generateBotId(data.botName);
			const apiKey = this.generateApiKey();
			const hashedApiKey = this.hashApiKey(apiKey);

			// Check if bot ID already exists
			const existingBot = await Bot.findOne({ botId });
			if (existingBot) {
				throw new Error(`Bot ID ${botId} already exists`);
			}

			// Create new bot
			const bot = new Bot({
				botId,
				apiKey: hashedApiKey,
				botName: data.botName,
				developer: data.developer,
				email: data.email,
			});

			await bot.save();

			authLogger.info(`New bot registered: ${botId} for ${data.developer}`);

			// Return credentials (only time the plain API key is returned)
			return {
				botId,
				apiKey, // Plain text - must be saved by developer
				botName: data.botName,
				developer: data.developer,
				email: data.email,
			};
		} catch (error) {
			authLogger.error('Failed to register bot:', error);
			throw error;
		}
	}

	/**
	 * Validate bot credentials
	 */
	async validateBot(botId: string, apiKey: string): Promise<boolean> {
		try {
			// Check cache first
			const cachedBot = this.getCachedBot(botId);
			if (cachedBot) {
				return cachedBot.validateApiKey(apiKey);
			}

			// Fetch from database
			const bot = await Bot.findOne({ botId });
			if (!bot) {
				authLogger.warn(`Bot validation failed: Bot ${botId} not found`);
				return false;
			}

			// Cache the bot
			this.cacheBot(botId, bot);

			// Validate API key
			const isValid = bot.validateApiKey(apiKey);

			if (isValid) {
				// Update last used timestamp asynchronously
				bot
					.updateLastUsed()
					.catch((err) =>
						authLogger.error(
							`Failed to update last used for bot ${botId}:`,
							err,
						),
					);
			} else {
				authLogger.warn(
					`Bot validation failed: Invalid API key for bot ${botId}`,
				);
			}

			return isValid;
		} catch (error) {
			authLogger.error(`Bot validation error for ${botId}:`, error);
			return false;
		}
	}

	/**
	 * Get bot information (excludes API key)
	 */
	async getBot(botId: string): Promise<IBot | null> {
		try {
			// Check cache first
			const cachedBot = this.getCachedBot(botId);
			if (cachedBot) {
				return cachedBot;
			}

			const bot = await Bot.findOne({ botId });
			if (bot) {
				this.cacheBot(botId, bot);
			}
			return bot;
		} catch (error) {
			authLogger.error(`Failed to get bot ${botId}:`, error);
			return null;
		}
	}

	/**
	 * Revoke a bot's API key
	 */
	async revokeBot(botId: string): Promise<void> {
		try {
			const bot = await Bot.findOne({ botId });
			if (!bot) {
				throw new Error(`Bot ${botId} not found`);
			}

			bot.status = 'revoked';
			await bot.save();

			// Remove from cache
			this.clearCache(botId);

			authLogger.info(`Bot ${botId} has been revoked`);
		} catch (error) {
			authLogger.error(`Failed to revoke bot ${botId}:`, error);
			throw error;
		}
	}

	/**
	 * Suspend a bot temporarily
	 */
	async suspendBot(botId: string): Promise<void> {
		try {
			const bot = await Bot.findOne({ botId });
			if (!bot) {
				throw new Error(`Bot ${botId} not found`);
			}

			bot.status = 'suspended';
			await bot.save();

			// Remove from cache
			this.clearCache(botId);

			authLogger.info(`Bot ${botId} has been suspended`);
		} catch (error) {
			authLogger.error(`Failed to suspend bot ${botId}:`, error);
			throw error;
		}
	}

	/**
	 * Reactivate a suspended bot
	 */
	async reactivateBot(botId: string): Promise<void> {
		try {
			const bot = await Bot.findOne({ botId });
			if (!bot) {
				throw new Error(`Bot ${botId} not found`);
			}

			if (bot.status === 'revoked') {
				throw new Error('Cannot reactivate a revoked bot');
			}

			bot.status = 'active';
			await bot.save();

			// Clear cache to force reload
			this.clearCache(botId);

			authLogger.info(`Bot ${botId} has been reactivated`);
		} catch (error) {
			authLogger.error(`Failed to reactivate bot ${botId}:`, error);
			throw error;
		}
	}

	/**
	 * Regenerate API key for a bot
	 */
	async regenerateApiKey(botId: string): Promise<string> {
		try {
			const bot = await Bot.findOne({ botId });
			if (!bot) {
				throw new Error(`Bot ${botId} not found`);
			}

			// Generate new API key
			const newApiKey = this.generateApiKey();
			bot.apiKey = this.hashApiKey(newApiKey);
			await bot.save();

			// Clear cache
			this.clearCache(botId);

			authLogger.info(`API key regenerated for bot ${botId}`);

			return newApiKey; // Return plain text key
		} catch (error) {
			authLogger.error(`Failed to regenerate API key for bot ${botId}:`, error);
			throw error;
		}
	}

	/**
	 * Get bot statistics
	 */
	async getBotStats(botId: string): Promise<BotStatistics | null> {
		try {
			const bot = await this.getBot(botId);
			if (!bot) {
				return null;
			}

			return {
				botId: bot.botId,
				botName: bot.botName,
				gamesPlayed: bot.stats.gamesPlayed,
				handsPlayed: bot.stats.handsPlayed,
				totalWinnings: bot.stats.totalWinnings,
				lastGameAt: bot.stats.lastGameAt,
				status: bot.status,
			};
		} catch (error) {
			authLogger.error(`Failed to get stats for bot ${botId}:`, error);
			return null;
		}
	}

	/**
	 * List all bots (for admin dashboard)
	 */
	async listBots(filter?: {
		status?: string;
		developer?: string;
	}): Promise<IBot[]> {
		try {
			const query: any = {};

			if (filter?.status) {
				query.status = filter.status;
			}

			if (filter?.developer) {
				query.developer = new RegExp(filter.developer, 'i');
			}

			return await Bot.find(query)
				.select('-apiKey') // Exclude API key from results
				.sort({ createdAt: -1 })
				.exec();
		} catch (error) {
			authLogger.error('Failed to list bots:', error);
			return [];
		}
	}

	/**
	 * Update bot statistics (called after games)
	 */
	async updateBotStats(
		botId: string,
		gamesPlayed: number = 0,
		handsPlayed: number = 0,
		winnings: number = 0,
	): Promise<void> {
		try {
			const bot = await Bot.findOne({ botId });
			if (bot) {
				await bot.incrementStats(gamesPlayed, handsPlayed, winnings);
				// Clear cache to ensure fresh data
				this.clearCache(botId);
			}
		} catch (error) {
			authLogger.error(`Failed to update stats for bot ${botId}:`, error);
		}
	}

	// Private helper methods

	private generateBotId(botName: string): string {
		// Create a URL-safe bot ID
		const sanitized = botName.toLowerCase().replace(/[^a-z0-9]/g, '-');
		const timestamp = Date.now().toString(36);
		const random = crypto.randomBytes(4).toString('hex');
		return `${sanitized}-${timestamp}-${random}`;
	}

	private generateApiKey(): string {
		// Generate a secure random API key
		return crypto.randomBytes(32).toString('hex');
	}

	private hashApiKey(apiKey: string): string {
		return crypto.createHash('sha256').update(apiKey).digest('hex');
	}

	private getCachedBot(botId: string): IBot | null {
		const cached = this.botCache.get(botId);
		const timestamp = this.cacheTimestamps.get(botId);

		if (cached && timestamp && Date.now() - timestamp < this.CACHE_TTL) {
			return cached;
		}

		// Cache expired
		if (cached) {
			this.clearCache(botId);
		}

		return null;
	}

	private cacheBot(botId: string, bot: IBot): void {
		this.botCache.set(botId, bot);
		this.cacheTimestamps.set(botId, Date.now());
	}

	private clearCache(botId: string): void {
		this.botCache.delete(botId);
		this.cacheTimestamps.delete(botId);
	}

	/**
	 * Clear entire cache (useful for testing)
	 */
	clearAllCache(): void {
		this.botCache.clear();
		this.cacheTimestamps.clear();
	}
}
