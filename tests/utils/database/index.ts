/**
 * Shared MongoDB test utilities
 * 
 * This module provides comprehensive utilities for testing MongoDB operations
 * in the PokaiEngine project. It supports both in-memory MongoDB testing
 * and complete mocking approaches.
 */

// In-memory MongoDB testing utilities
export {
	MongoTestUtils,
	MongoTestSetup,
	MongoTestData,
} from './MongoTestUtils';

// MongoDB mocking utilities
export {
	MongoMockUtils,
	MockMongoModel,
	MongoTestAssertions,
} from './MongoMockUtils';

// Jest setup helpers
export {
	JestMongoSetup,
	withMongoDB,
	mongoJestConfig,
	MONGO_TEST_TIMEOUT,
} from './JestMongoSetup';

/**
 * Quick start examples:
 * 
 * 1. Using in-memory MongoDB:
 * ```typescript
 * import { MongoTestSetup } from '@/tests/utils/database';
 * 
 * describe('My Test Suite', () => {
 *   beforeAll(async () => {
 *     await MongoTestSetup.setup();
 *   });
 * 
 *   afterAll(async () => {
 *     await MongoTestSetup.teardown();
 *   });
 * 
 *   beforeEach(async () => {
 *     await MongoTestSetup.reset();
 *   });
 * 
 *   it('should work with real MongoDB', async () => {
 *     // Your test code here
 *   });
 * });
 * ```
 * 
 * 2. Using mocked MongoDB:
 * ```typescript
 * import { MongoMockUtils } from '@/tests/utils/database';
 * 
 * describe('My Test Suite', () => {
 *   let mockModel: jest.Mocked<mongoose.Model<any>>;
 * 
 *   beforeEach(() => {
 *     mockModel = MongoMockUtils.createMockModel('MyModel');
 *     MongoMockUtils.setupModelMocks(mockModel);
 *   });
 * 
 *   it('should work with mocked MongoDB', async () => {
 *     // Your test code here
 *   });
 * });
 * ```
 * 
 * 3. Using the convenience wrapper:
 * ```typescript
 * import { withMongoDB } from '@/tests/utils/database';
 * 
 * describe('My Test Suite', withMongoDB(() => {
 *   it('should work with automatic setup', async () => {
 *     // MongoDB is automatically set up and torn down
 *   });
 * }));
 * ```
 */