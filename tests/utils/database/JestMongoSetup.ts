import { MongoTestSetup } from './MongoTestUtils';

/**
 * Global Jest setup for MongoDB tests
 * This can be used in jest.config.js or in test files
 */
export class JestMongoSetup {
	/**
	 * Global setup - runs once before all tests
	 */
	static async globalSetup(): Promise<void> {
		// This is typically used in jest.config.js globalSetup
		await MongoTestSetup.setup();
	}

	/**
	 * Global teardown - runs once after all tests
	 */
	static async globalTeardown(): Promise<void> {
		// This is typically used in jest.config.js globalTeardown
		await MongoTestSetup.teardown();
	}

	/**
	 * Setup for individual test suites
	 */
	static setupTestSuite(): {
		beforeAll: () => Promise<void>;
		afterAll: () => Promise<void>;
		beforeEach: () => Promise<void>;
	} {
		return {
			beforeAll: async () => {
				await MongoTestSetup.setup();
			},
			afterAll: async () => {
				await MongoTestSetup.teardown();
			},
			beforeEach: async () => {
				await MongoTestSetup.reset();
			},
		};
	}

	/**
	 * Helper to create a describe block with MongoDB setup
	 */
	static describeWithMongo(description: string, tests: () => void): void {
		// eslint-disable-next-line jest/valid-title
		describe(description, () => {
			const setup = JestMongoSetup.setupTestSuite();

			beforeAll(setup.beforeAll);
			afterAll(setup.afterAll);
			beforeEach(setup.beforeEach);

			tests();
		});
	}
}

/**
 * Helper function to create test environment with MongoDB
 */
export function withMongoDB(testFn: () => void): () => void {
	return function mongoDbTestWrapper() {
		const setup = JestMongoSetup.setupTestSuite();

		beforeAll(setup.beforeAll);
		afterAll(setup.afterAll);
		beforeEach(setup.beforeEach);

		testFn();
	};
}

/**
 * Timeout configuration for MongoDB tests
 */
export const MONGO_TEST_TIMEOUT = 30000; // 30 seconds

/**
 * Common Jest configuration for MongoDB tests
 */
export const mongoJestConfig = {
	testTimeout: MONGO_TEST_TIMEOUT,
	detectOpenHandles: true,
	forceExit: true,
	setupFilesAfterEnv: ['<rootDir>/tests/utils/database/JestMongoSetup.ts'],
};
