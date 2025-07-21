import { Types } from 'mongoose';

import {
	IGameEvent,
	IReplay,
	IReplayAnalytics,
	Replay,
} from '@/services/storage/models/Replay';
import { DatabaseQuery } from '@/types/database-types';

export interface ReplaySearchFilters {
	gameType?: 'cash' | 'tournament';
	playerCount?: number;
	dateFrom?: Date;
	dateTo?: Date;
	gameId?: string;
	playerId?: string;
	limit?: number;
	offset?: number;
}

export interface ReplayListItem {
	id: string;
	gameId: string;
	gameName?: string;
	gameType: 'cash' | 'tournament';
	actualPlayers: number;
	gameDuration: number;
	totalHands: number;
	createdAt: Date;
	fileSizeMB: string;
}

export class ReplayRepository {
	async create(replayData: Partial<IReplay>): Promise<IReplay> {
		try {
			const replay = new Replay(replayData);
			return await replay.save();
		} catch (error) {
			throw new Error(
				`Failed to create replay: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	async findById(id: string): Promise<IReplay | null> {
		try {
			if (!Types.ObjectId.isValid(id)) {
				return null;
			}
			return await Replay.findById(id);
		} catch (error) {
			throw new Error(
				`Failed to find replay by ID: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	async findByGameId(gameId: string): Promise<IReplay | null> {
		try {
			return await Replay.findOne({ gameId });
		} catch (error) {
			throw new Error(
				`Failed to find replay by game ID: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	async findAll(filters: ReplaySearchFilters = {}): Promise<ReplayListItem[]> {
		try {
			const query: DatabaseQuery = {};

			// Apply filters
			if (filters.gameType) {
				query['metadata.gameType'] = filters.gameType;
			}

			if (filters.playerCount) {
				query['metadata.actualPlayers'] = filters.playerCount;
			}

			if (filters.gameId) {
				query.gameId = new RegExp(filters.gameId, 'i');
			}

			if (filters.playerId) {
				query['metadata.playerNames'] = { $exists: true };
			}

			if (filters.dateFrom || filters.dateTo) {
				const dateQuery: { $gte?: Date; $lte?: Date } = {};
				if (filters.dateFrom) {
					dateQuery.$gte = filters.dateFrom;
				}
				if (filters.dateTo) {
					dateQuery.$lte = filters.dateTo;
				}
				query.createdAt = dateQuery;
			}

			const results = await Replay.find(query)
				.select(
					'gameId metadata.gameName metadata.gameType metadata.actualPlayers metadata.gameDuration metadata.totalHands createdAt fileSize',
				)
				.sort({ createdAt: -1 })
				.limit(filters.limit || 50)
				.skip(filters.offset || 0);

			return results.map((replay) => ({
				id: String(replay._id),
				gameId: replay.gameId,
				gameName: replay.metadata.gameName,
				gameType: replay.metadata.gameType,
				actualPlayers: replay.metadata.actualPlayers,
				gameDuration: replay.metadata.gameDuration,
				totalHands: replay.metadata.totalHands,
				createdAt: replay.createdAt,
				fileSizeMB: (replay.fileSize / (1024 * 1024)).toFixed(2),
			}));
		} catch (error) {
			throw new Error(
				`Failed to find replays: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	async getRecentReplays(limit: number = 10): Promise<ReplayListItem[]> {
		try {
			const results = await Replay.find()
				.select(
					'gameId metadata.gameName metadata.gameType metadata.actualPlayers metadata.gameDuration metadata.totalHands createdAt fileSize',
				)
				.sort({ createdAt: -1 })
				.limit(limit);

			return results.map((replay) => ({
				id: String(replay._id),
				gameId: replay.gameId,
				gameName: replay.metadata.gameName,
				gameType: replay.metadata.gameType,
				actualPlayers: replay.metadata.actualPlayers,
				gameDuration: replay.metadata.gameDuration,
				totalHands: replay.metadata.totalHands,
				createdAt: replay.createdAt,
				fileSizeMB: (replay.fileSize / (1024 * 1024)).toFixed(2),
			}));
		} catch (error) {
			throw new Error(
				`Failed to get recent replays: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	async getEventsByGameId(
		gameId: string,
		filters?: { handNumber?: number; phase?: string; eventType?: string },
	): Promise<IGameEvent[]> {
		try {
			const replay = await Replay.findOne({ gameId }).select('events');
			if (!replay) {
				return [];
			}

			let events = replay.events;

			// Apply filters
			if (filters) {
				if (filters.handNumber !== undefined) {
					events = events.filter(
						(event) => event.handNumber === filters.handNumber,
					);
				}
				if (filters.phase) {
					events = events.filter((event) => event.phase === filters.phase);
				}
				if (filters.eventType) {
					events = events.filter((event) => event.type === filters.eventType);
				}
			}

			return events.sort((a, b) => a.timestamp - b.timestamp);
		} catch (error) {
			throw new Error(
				`Failed to get events: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	async getAnalytics(gameId: string): Promise<IReplayAnalytics | null> {
		try {
			const replay = await Replay.findOne({ gameId }).select('analytics');
			return replay ? replay.analytics : null;
		} catch (error) {
			throw new Error(
				`Failed to get analytics: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	async updateAnalytics(
		gameId: string,
		analytics: IReplayAnalytics,
	): Promise<IReplay | null> {
		try {
			return await Replay.findOneAndUpdate(
				{ gameId },
				{ analytics, updatedAt: new Date() },
				{ new: true },
			);
		} catch (error) {
			throw new Error(
				`Failed to update analytics: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	async addEvents(
		gameId: string,
		events: IGameEvent[],
	): Promise<IReplay | null> {
		try {
			return await Replay.findOneAndUpdate(
				{ gameId },
				{
					$push: { events: { $each: events } },
					updatedAt: new Date(),
				},
				{ new: true },
			);
		} catch (error) {
			throw new Error(
				`Failed to add events: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	async delete(gameId: string): Promise<boolean> {
		try {
			const result = await Replay.deleteOne({ gameId });
			return result.deletedCount === 1;
		} catch (error) {
			throw new Error(
				`Failed to delete replay: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	async deleteById(id: string): Promise<boolean> {
		try {
			if (!Types.ObjectId.isValid(id)) {
				return false;
			}
			const result = await Replay.deleteOne({ _id: id });
			return result.deletedCount === 1;
		} catch (error) {
			throw new Error(
				`Failed to delete replay by ID: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	async exists(gameId: string): Promise<boolean> {
		try {
			const count = await Replay.countDocuments({ gameId });
			return count > 0;
		} catch (error) {
			throw new Error(
				`Failed to check if replay exists: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	async count(filters: ReplaySearchFilters = {}): Promise<number> {
		try {
			const query: DatabaseQuery = {};

			// Apply same filters as findAll
			if (filters.gameType) {
				query['metadata.gameType'] = filters.gameType;
			}
			if (filters.playerCount) {
				query['metadata.actualPlayers'] = filters.playerCount;
			}
			if (filters.gameId) {
				query.gameId = new RegExp(filters.gameId, 'i');
			}
			if (filters.playerId) {
				query['metadata.playerNames'] = { $exists: true };
			}
			if (filters.dateFrom || filters.dateTo) {
				const dateQuery: { $gte?: Date; $lte?: Date } = {};
				if (filters.dateFrom) {
					dateQuery.$gte = filters.dateFrom;
				}
				if (filters.dateTo) {
					dateQuery.$lte = filters.dateTo;
				}
				query.createdAt = dateQuery;
			}

			return await Replay.countDocuments(query);
		} catch (error) {
			throw new Error(
				`Failed to count replays: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	async getStorageStats(): Promise<{
		totalReplays: number;
		totalSizeBytes: number;
		totalSizeMB: string;
		avgSizePerReplayMB: string;
		oldestReplay: Date | null;
		newestReplay: Date | null;
	}> {
		try {
			const stats = await Replay.aggregate([
				{
					$group: {
						_id: null,
						totalReplays: { $sum: 1 },
						totalSizeBytes: { $sum: '$fileSize' },
						oldestReplay: { $min: '$createdAt' },
						newestReplay: { $max: '$createdAt' },
					},
				},
			]);

			const result = stats[0] || {
				totalReplays: 0,
				totalSizeBytes: 0,
				oldestReplay: null,
				newestReplay: null,
			};

			const totalSizeMB = (result.totalSizeBytes / (1024 * 1024)).toFixed(2);
			const avgSizePerReplayMB =
				result.totalReplays > 0
					? (
							result.totalSizeBytes /
							result.totalReplays /
							(1024 * 1024)
						).toFixed(2)
					: '0.00';

			return {
				totalReplays: result.totalReplays,
				totalSizeBytes: result.totalSizeBytes,
				totalSizeMB,
				avgSizePerReplayMB,
				oldestReplay: result.oldestReplay,
				newestReplay: result.newestReplay,
			};
		} catch (error) {
			throw new Error(
				`Failed to get storage stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}
}

export default ReplayRepository;
