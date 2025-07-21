import mongoose from 'mongoose';

import { dbLogger } from '@/services/logging/Logger';
import { TypedError } from '@/types/database-types';

export interface DatabaseConfig {
	uri: string;
	options?: mongoose.ConnectOptions;
	retryAttempts?: number;
	retryDelay?: number;
}

export class DatabaseConnection {
	private static instance: DatabaseConnection;
	private isConnected: boolean = false;
	private config: DatabaseConfig;

	private constructor(config: DatabaseConfig) {
		this.config = {
			retryAttempts: 5,
			retryDelay: 5000,
			...config,
			options: {
				maxPoolSize: 10,
				serverSelectionTimeoutMS: 5000,
				socketTimeoutMS: 45000,
				family: 4, // Use IPv4, skip trying IPv6
				...config.options,
			},
		};
	}

	private log(message: string): void {
		dbLogger.info(message);
	}

	private logError(message: string, error?: TypedError | Error): void {
		dbLogger.error(message, error);
	}

	public static getInstance(config?: DatabaseConfig): DatabaseConnection {
		if (!DatabaseConnection.instance) {
			if (!config) {
				throw new Error(
					'Database configuration required for first initialization',
				);
			}
			DatabaseConnection.instance = new DatabaseConnection(config);
		}
		return DatabaseConnection.instance;
	}

	public async connect(): Promise<void> {
		if (this.isConnected) {
			this.log('Already connected to MongoDB');
			return;
		}

		let attempts = 0;
		const maxAttempts = this.config.retryAttempts || 5;

		while (attempts < maxAttempts) {
			try {
				this.log(
					`Attempting to connect to MongoDB (attempt ${attempts + 1}/${maxAttempts})`,
				);

				await mongoose.connect(this.config.uri, this.config.options);

				this.isConnected = true;
				this.log('Successfully connected to MongoDB');

				// Set up connection event handlers
				this.setupEventHandlers();

				return;
			} catch (error) {
				attempts++;
				this.logError(`Connection attempt ${attempts} failed:`, error as Error);

				if (attempts < maxAttempts) {
					this.log(`Retrying in ${this.config.retryDelay}ms...`);
					await this.delay(this.config.retryDelay || 5000);
				} else {
					throw new Error(
						`Failed to connect to MongoDB after ${maxAttempts} attempts: ${error}`,
					);
				}
			}
		}
	}

	public async disconnect(): Promise<void> {
		if (!this.isConnected) {
			this.log('Already disconnected from MongoDB');
			return;
		}

		try {
			await mongoose.disconnect();
			this.isConnected = false;
			this.log('Disconnected from MongoDB');
		} catch (error) {
			this.logError('Error disconnecting from MongoDB:', error as Error);
			throw error;
		}
	}

	public getConnection(): typeof mongoose {
		if (!this.isConnected) {
			throw new Error('Database not connected. Call connect() first.');
		}
		return mongoose;
	}

	public isConnectionReady(): boolean {
		return this.isConnected && mongoose.connection.readyState === 1;
	}

	public async healthCheck(): Promise<boolean> {
		try {
			if (!this.isConnected) return false;

			// Simple ping to check connection
			if (mongoose.connection.db) {
				await mongoose.connection.db.admin().ping();
				return true;
			}
			return false;
		} catch (error) {
			this.logError('Health check failed:', error as Error);
			return false;
		}
	}

	private setupEventHandlers(): void {
		mongoose.connection.on('error', (error) => {
			this.logError('MongoDB connection error:', error);
		});

		mongoose.connection.on('disconnected', () => {
			this.log('MongoDB disconnected');
			this.isConnected = false;
		});

		mongoose.connection.on('reconnected', () => {
			this.log('MongoDB reconnected');
			this.isConnected = true;
		});

		// Graceful shutdown (only in non-test environments)
		if (process.env.NODE_ENV !== 'test') {
			process.on('SIGINT', async () => {
				try {
					await this.disconnect();
					process.exit(0);
				} catch (error) {
					this.logError('Error during graceful shutdown:', error as Error);
					process.exit(1);
				}
			});
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

// Utility function to get default database configuration
export function getDefaultDatabaseConfig(): DatabaseConfig {
	const mongoUri =
		process.env.MONGODB_URI || 'mongodb://localhost:27017/pokai-engine';

	return {
		uri: mongoUri,
		options: {
			maxPoolSize: 10,
			serverSelectionTimeoutMS: 5000,
			socketTimeoutMS: 45000,
		},
		retryAttempts: 5,
		retryDelay: 5000,
	};
}

// Convenience function to initialize database
export async function initializeDatabase(
	config?: DatabaseConfig,
): Promise<DatabaseConnection> {
	const dbConfig = config || getDefaultDatabaseConfig();
	const db = DatabaseConnection.getInstance(dbConfig);
	await db.connect();
	return db;
}
