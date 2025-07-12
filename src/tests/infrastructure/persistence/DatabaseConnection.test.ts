import {
	DatabaseConnection,
	DatabaseConfig,
	getDefaultDatabaseConfig,
	initializeDatabase,
} from '@/infrastructure/persistence/database/connection';
import mongoose from 'mongoose';

// Mock mongoose
jest.mock('mongoose');
jest.mock('@/infrastructure/logging/Logger', () => ({
	dbLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
	},
}));

describe('DatabaseConnection', () => {
	let mockMongoose: jest.Mocked<typeof mongoose>;
	const noop = () => {}; // For silencing unhandled rejections

	beforeEach(() => {
		mockMongoose = mongoose as jest.Mocked<typeof mongoose>;
		jest.clearAllMocks();
		jest.useFakeTimers();

		// Reset singleton instance
		(DatabaseConnection as any).instance = undefined;

		// Mock mongoose connection methods
		Object.defineProperty(mockMongoose, 'connection', {
			value: {
				readyState: 1,
				on: jest.fn(),
				db: {
					admin: jest.fn().mockReturnValue({
						ping: jest.fn().mockResolvedValue({}),
					}),
				},
			},
			writable: true,
			configurable: true,
		});
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	const createTestConfig = (): DatabaseConfig => ({
		uri: 'mongodb://localhost:27017/test-db',
		options: {
			maxPoolSize: 5,
			serverSelectionTimeoutMS: 3000,
		},
		retryAttempts: 3,
		retryDelay: 1000,
	});

	describe('singleton pattern', () => {
		it('should create a single instance', () => {
			const config = createTestConfig();
			const instance1 = DatabaseConnection.getInstance(config);
			const instance2 = DatabaseConnection.getInstance();

			expect(instance1).toBe(instance2);
		});

		it('should throw error when no config provided for first initialization', () => {
			expect(() => DatabaseConnection.getInstance()).toThrow(
				'Database configuration required for first initialization'
			);
		});

		it('should return existing instance when called without config after initialization', () => {
			const config = createTestConfig();
			const instance1 = DatabaseConnection.getInstance(config);
			const instance2 = DatabaseConnection.getInstance();

			expect(instance1).toBe(instance2);
		});
	});

	describe('connect', () => {
		let consoleErrorSpy: jest.SpyInstance;

		beforeEach(() => {
			// Suppress console.error for tests that expect errors
			consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
		});

		afterEach(() => {
			consoleErrorSpy.mockRestore();
		});

		it('should connect successfully on first attempt', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			mockMongoose.connect.mockResolvedValueOnce(mockMongoose as any);

			await db.connect();

			expect(mockMongoose.connect).toHaveBeenCalledWith(
				config.uri,
				expect.objectContaining({
					maxPoolSize: 5,
					serverSelectionTimeoutMS: 3000,
					socketTimeoutMS: 45000,
					family: 4,
				})
			);
			expect(db.isConnectionReady()).toBe(true);
		});

		it('should return early if already connected', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			mockMongoose.connect.mockResolvedValueOnce(mockMongoose as any);

			// First connection
			await db.connect();
			jest.clearAllMocks();

			// Second connection attempt
			await db.connect();

			expect(mockMongoose.connect).not.toHaveBeenCalled();
		});

		it('should retry on connection failure and succeed', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			// First attempt fails, second succeeds
			mockMongoose.connect
				.mockRejectedValueOnce(new Error('Connection failed'))
				.mockResolvedValueOnce(mockMongoose as any);

			const connectPromise = db.connect();

			// Fast-forward through retry delay
			await jest.advanceTimersByTimeAsync(1000);

			await connectPromise;

			expect(mockMongoose.connect).toHaveBeenCalledTimes(2);
		});

		it('should fail after max retry attempts', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			const connectionError = new Error('Connection failed');
			mockMongoose.connect.mockRejectedValue(connectionError);

			const connectPromise = db.connect();
			// Add a catch handler to prevent unhandled rejection
			connectPromise.catch(noop);

			// Fast-forward through all retry attempts
			await jest.runAllTimersAsync();

			await expect(connectPromise).rejects.toThrow(/Failed to connect to MongoDB after 3 attempts/);
			expect(mockMongoose.connect).toHaveBeenCalledTimes(3);
		});

		it('should use default retry settings when not specified', async () => {
			const config: DatabaseConfig = {
				uri: 'mongodb://localhost:27017/test-db',
			};
			const db = DatabaseConnection.getInstance(config);

			mockMongoose.connect.mockRejectedValue(new Error('Connection failed'));

			const connectPromise = db.connect();
			// Add a catch handler to prevent unhandled rejection
			connectPromise.catch(noop);

			// Fast-forward through all retry attempts
			await jest.runAllTimersAsync();

			await expect(connectPromise).rejects.toThrow(/Failed to connect to MongoDB after 5 attempts/);
			expect(mockMongoose.connect).toHaveBeenCalledTimes(5);
		});
	});

	describe('disconnect', () => {
		it('should disconnect successfully', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			// First connect
			mockMongoose.connect.mockResolvedValueOnce(mockMongoose as any);
			await db.connect();

			// Then disconnect
			mockMongoose.disconnect.mockResolvedValueOnce();
			await db.disconnect();

			expect(mockMongoose.disconnect).toHaveBeenCalled();
			expect(db.isConnectionReady()).toBe(false);
		});

		it('should return early if already disconnected', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			await db.disconnect();

			expect(mockMongoose.disconnect).not.toHaveBeenCalled();
		});

		it('should throw error when disconnection fails', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			// First connect
			mockMongoose.connect.mockResolvedValueOnce(mockMongoose as any);
			await db.connect();

			// Disconnect fails
			const disconnectError = new Error('Disconnect failed');
			mockMongoose.disconnect.mockRejectedValueOnce(disconnectError);

			await expect(db.disconnect()).rejects.toThrow('Disconnect failed');
		});
	});

	describe('getConnection', () => {
		it('should return mongoose when connected', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			mockMongoose.connect.mockResolvedValueOnce(mockMongoose as any);
			await db.connect();

			const connection = db.getConnection();

			expect(connection).toBe(mockMongoose);
		});

		it('should throw error when not connected', () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			expect(() => db.getConnection()).toThrow(
				'Database not connected. Call connect() first.'
			);
		});
	});

	describe('isConnectionReady', () => {
		it('should return true when connected and ready', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			mockMongoose.connect.mockResolvedValueOnce(mockMongoose as any);

			// No need to set readyState here, it's already set to 1 in beforeEach

			await db.connect();

			expect(db.isConnectionReady()).toBe(true);
		});

		it('should return false when not connected', () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			expect(db.isConnectionReady()).toBe(false);
		});

		it('should return false when connected but not ready', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			mockMongoose.connect.mockResolvedValueOnce(mockMongoose as any);

			// Update the readyState property
			Object.defineProperty(mockMongoose.connection, 'readyState', {
				value: 2, // Connecting
				writable: true,
				configurable: true,
			});

			await db.connect();

			expect(db.isConnectionReady()).toBe(false);
		});
	});

	describe('healthCheck', () => {
		it('should return true when database is healthy', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			mockMongoose.connect.mockResolvedValueOnce(mockMongoose as any);
			await db.connect();

			const isHealthy = await db.healthCheck();

			expect(isHealthy).toBe(true);
			expect(mockMongoose.connection.db!.admin().ping).toHaveBeenCalled();
		});

		it('should return false when not connected', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			const isHealthy = await db.healthCheck();

			expect(isHealthy).toBe(false);
		});

		it('should return false when no db connection available', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			mockMongoose.connect.mockResolvedValueOnce(mockMongoose as any);

			// Mock db as null
			Object.defineProperty(mockMongoose.connection, 'db', {
				value: null,
				writable: true,
				configurable: true,
			});

			await db.connect();

			const isHealthy = await db.healthCheck();

			expect(isHealthy).toBe(false);
		});

		it('should return false when ping fails', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			mockMongoose.connect.mockResolvedValueOnce(mockMongoose as any);
			(mockMongoose.connection.db!.admin().ping as jest.Mock).mockRejectedValueOnce(
				new Error('Ping failed')
			);

			await db.connect();

			const isHealthy = await db.healthCheck();

			expect(isHealthy).toBe(false);
		});
	});

	describe('event handlers', () => {
		it('should setup connection event handlers', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			mockMongoose.connect.mockResolvedValueOnce(mockMongoose as any);
			await db.connect();

			expect(mockMongoose.connection.on).toHaveBeenCalledWith('error', expect.any(Function));
			expect(mockMongoose.connection.on).toHaveBeenCalledWith(
				'disconnected',
				expect.any(Function)
			);
			expect(mockMongoose.connection.on).toHaveBeenCalledWith(
				'reconnected',
				expect.any(Function)
			);
		});

		it('should handle disconnection event', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			mockMongoose.connect.mockResolvedValueOnce(mockMongoose as any);
			await db.connect();

			// Simulate disconnection event
			const disconnectedHandler = (mockMongoose.connection.on as jest.Mock).mock.calls.find(
				(call) => call[0] === 'disconnected'
			)[1];

			disconnectedHandler();

			expect(db.isConnectionReady()).toBe(false);
		});

		it('should handle reconnection event', async () => {
			const config = createTestConfig();
			const db = DatabaseConnection.getInstance(config);

			mockMongoose.connect.mockResolvedValueOnce(mockMongoose as any);
			await db.connect();

			// Simulate disconnection then reconnection
			const disconnectedHandler = (mockMongoose.connection.on as jest.Mock).mock.calls.find(
				(call) => call[0] === 'disconnected'
			)[1];
			const reconnectedHandler = (mockMongoose.connection.on as jest.Mock).mock.calls.find(
				(call) => call[0] === 'reconnected'
			)[1];

			disconnectedHandler();
			expect(db.isConnectionReady()).toBe(false);

			reconnectedHandler();
			expect(db.isConnectionReady()).toBe(true);
		});
	});
});

describe('utility functions', () => {
	const noop = () => {}; // For silencing unhandled rejections

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		// Reset singleton instance
		(DatabaseConnection as any).instance = undefined;
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe('getDefaultDatabaseConfig', () => {
		it('should return default configuration', () => {
			const config = getDefaultDatabaseConfig();

			expect(config.uri).toBe('mongodb://localhost:27017/pokai-engine');
			expect(config.retryAttempts).toBe(5);
			expect(config.retryDelay).toBe(5000);
			expect(config.options?.maxPoolSize).toBe(10);
		});

		it('should use environment variable when available', () => {
			const originalEnv = process.env.MONGODB_URI;
			process.env.MONGODB_URI = 'mongodb://custom:27017/custom-db';

			const config = getDefaultDatabaseConfig();

			expect(config.uri).toBe('mongodb://custom:27017/custom-db');

			// Restore original
			if (originalEnv) {
				process.env.MONGODB_URI = originalEnv;
			} else {
				delete process.env.MONGODB_URI;
			}
		});
	});

	describe('initializeDatabase', () => {
		let mockMongoose: jest.Mocked<typeof mongoose>;

		beforeEach(() => {
			mockMongoose = mongoose as jest.Mocked<typeof mongoose>;
			Object.defineProperty(mockMongoose, 'connection', {
				value: {
					readyState: 1,
					on: jest.fn(),
					db: {
						admin: jest.fn().mockReturnValue({
							ping: jest.fn().mockResolvedValue({}),
						}),
					},
				},
				writable: true,
				configurable: true,
			});
		});

		it('should initialize database with default config', async () => {
			mockMongoose.connect.mockResolvedValueOnce(mockMongoose as any);

			const db = await initializeDatabase();

			expect(db).toBeInstanceOf(DatabaseConnection);
			expect(mockMongoose.connect).toHaveBeenCalledWith(
				'mongodb://localhost:27017/pokai-engine',
				expect.any(Object)
			);
		});

		it('should initialize database with custom config', async () => {
			const customConfig = {
				uri: 'mongodb://custom:27017/custom-db',
				retryAttempts: 2,
			};
			mockMongoose.connect.mockResolvedValueOnce(mockMongoose as any);

			const db = await initializeDatabase(customConfig);

			expect(db).toBeInstanceOf(DatabaseConnection);
			expect(mockMongoose.connect).toHaveBeenCalledWith(
				'mongodb://custom:27017/custom-db',
				expect.any(Object)
			);
		});

		it('should throw error when connection fails', async () => {
			const connectionError = new Error('Connection failed');
			mockMongoose.connect.mockRejectedValue(connectionError);

			const initPromise = initializeDatabase();
			// Add a catch handler to prevent unhandled rejection
			initPromise.catch(noop);
			
			// Fast-forward through all retry attempts
			await jest.runAllTimersAsync();

			await expect(initPromise).rejects.toThrow(/Failed to connect to MongoDB after 5 attempts/);
		});
	});
});
