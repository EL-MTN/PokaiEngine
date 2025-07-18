import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { DatabaseConnection } from '@/services/storage/database';

/**
 * Shared MongoDB test utilities for consistent database testing
 * Provides in-memory MongoDB setup, cleanup, and helper methods
 */
export class MongoTestUtils {
	private static mongod: MongoMemoryServer | null = null;
	private static isConnected = false;

	/**
	 * Start an in-memory MongoDB instance and connect to it
	 */
	static async setupInMemoryMongoDB(): Promise<string> {
		if (this.mongod) {
			throw new Error('MongoDB is already running');
		}

		this.mongod = await MongoMemoryServer.create({
			binary: {
				version: '7.0.0',
			},
			instance: {
				dbName: 'pokai-test',
			},
		});

		const uri = this.mongod.getUri();
		await mongoose.connect(uri);
		this.isConnected = true;

		return uri;
	}

	/**
	 * Stop the in-memory MongoDB instance and disconnect
	 */
	static async teardownInMemoryMongoDB(): Promise<void> {
		if (this.isConnected) {
			await mongoose.connection.dropDatabase();
			await mongoose.connection.close();
			this.isConnected = false;
		}

		if (this.mongod) {
			await this.mongod.stop();
			this.mongod = null;
		}
	}

	/**
	 * Clear all collections in the database
	 */
	static async clearDatabase(): Promise<void> {
		if (!this.isConnected) {
			throw new Error('MongoDB is not connected');
		}

		const collections = mongoose.connection.collections;
		for (const key in collections) {
			const collection = collections[key];
			await collection.deleteMany({});
		}
	}

	/**
	 * Drop a specific collection
	 */
	static async dropCollection(collectionName: string): Promise<void> {
		if (!this.isConnected) {
			throw new Error('MongoDB is not connected');
		}

		const collection = mongoose.connection.collections[collectionName];
		if (collection) {
			await collection.drop();
		}
	}

	/**
	 * Get the current MongoDB connection URI
	 */
	static getConnectionUri(): string {
		if (!this.mongod) {
			throw new Error('MongoDB is not running');
		}
		return this.mongod.getUri();
	}

	/**
	 * Check if MongoDB is connected
	 */
	static isMongoConnected(): boolean {
		return this.isConnected && mongoose.connection.readyState === 1;
	}

	/**
	 * Get connection statistics
	 */
	static getConnectionStats(): {
		readyState: number;
		host: string;
		port: number;
		name: string;
	} {
		if (!this.isConnected) {
			throw new Error('MongoDB is not connected');
		}

		return {
			readyState: mongoose.connection.readyState,
			host: mongoose.connection.host,
			port: mongoose.connection.port,
			name: mongoose.connection.name,
		};
	}

	/**
	 * Create a test database configuration for DatabaseConnection
	 */
	static createTestDatabaseConfig() {
		return {
			uri: this.getConnectionUri(),
			options: {
				maxPoolSize: 5,
				serverSelectionTimeoutMS: 3000,
				socketTimeoutMS: 45000,
				family: 4,
			},
			retryAttempts: 3,
			retryDelay: 1000,
		};
	}

	/**
	 * Setup DatabaseConnection singleton with test configuration
	 */
	static async setupDatabaseConnection(): Promise<DatabaseConnection> {
		if (!this.isConnected) {
			throw new Error(
				'MongoDB is not connected. Call setupInMemoryMongoDB() first',
			);
		}

		const config = this.createTestDatabaseConfig();
		const db = DatabaseConnection.getInstance(config);
		await db.connect();
		return db;
	}

	/**
	 * Cleanup DatabaseConnection singleton
	 */
	static async teardownDatabaseConnection(): Promise<void> {
		try {
			const db = DatabaseConnection.getInstance();
			await db.disconnect();
		} catch {
			// Ignore errors if instance doesn't exist
		}
		// Reset singleton instance
		(DatabaseConnection as any).instance = undefined;
	}
}

/**
 * Jest setup helper for MongoDB tests
 * Use this in your beforeAll/afterAll hooks
 */
export class MongoTestSetup {
	/**
	 * Setup MongoDB for a test suite
	 */
	static async setup(): Promise<void> {
		await MongoTestUtils.setupInMemoryMongoDB();
	}

	/**
	 * Cleanup MongoDB after a test suite
	 */
	static async teardown(): Promise<void> {
		await MongoTestUtils.teardownInMemoryMongoDB();
	}

	/**
	 * Reset database state between tests
	 */
	static async reset(): Promise<void> {
		await MongoTestUtils.clearDatabase();
	}
}

/**
 * Utility function to create test data with consistent structure
 */
export class MongoTestData {
	/**
	 * Create a test ObjectId or use provided one
	 */
	static createObjectId(id?: string): mongoose.Types.ObjectId {
		return id ? new mongoose.Types.ObjectId(id) : new mongoose.Types.ObjectId();
	}

	/**
	 * Create a test bot document
	 */
	static createTestBot(overrides?: Partial<any>): any {
		const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		return {
			botId: `test-bot-${uniqueId}`,
			botName: 'Test Bot',
			developer: 'Test Developer',
			email: 'test@example.com',
			apiKey: 'test-api-key',
			status: 'active',
			createdAt: new Date(),
			updatedAt: new Date(),
			...overrides,
		};
	}

	/**
	 * Create a test replay document
	 */
	static createTestReplay(overrides?: Partial<any>): any {
		const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const gameId = `test-game-${uniqueId}`;
		return {
			gameId,
			metadata: {
				gameId,
				gameName: 'Test Game',
				gameType: 'cash',
				maxPlayers: 6,
				actualPlayers: 4,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				gameStartTime: Date.now(),
				gameEndTime: Date.now() + 3600000,
				gameDuration: 3600000,
				totalHands: 30,
				totalActions: 120,
				playerNames: {
					player1: 'Alice',
					player2: 'Bob',
					player3: 'Charlie',
					player4: 'David',
				},
				winners: ['player1'],
			},
			events: [],
			handSummaries: [],
			analytics: {
				totalEvents: 120,
				avgHandDuration: 120000,
				actionDistribution: { bet: 30, call: 60, fold: 30 },
				phaseDistribution: { preflop: 30, flop: 20, turn: 10, river: 5 },
				playerPerformance: {},
				gameFlow: {
					peakPotSize: 500,
					longestHand: 180000,
					shortestHand: 60000,
					mostActivePlayer: 'player1',
				},
			},
			fileSize: 512000,
			version: '1.0.0',
			createdAt: new Date(),
			updatedAt: new Date(),
			...overrides,
		};
	}

	/**
	 * Create a test game event
	 */
	static createTestGameEvent(overrides?: Partial<any>): any {
		return {
			type: 'action',
			timestamp: Date.now(),
			data: {
				action: {
					type: 'bet',
					amount: 50,
				},
			},
			handNumber: 1,
			phase: 'preflop',
			playerId: 'player1',
			...overrides,
		};
	}
}
