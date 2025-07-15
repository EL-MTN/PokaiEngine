import mongoose from 'mongoose';

/**
 * Utilities for mocking MongoDB/Mongoose operations in tests
 * Use when you want to test logic without actual database connections
 */
export class MongoMockUtils {
	/**
	 * Create a complete mock of mongoose with all common methods
	 */
	static createMockMongoose(): jest.Mocked<typeof mongoose> {
		const mockMongoose = {
			connect: jest.fn(),
			disconnect: jest.fn(),
			connection: {
				readyState: 1,
				host: 'localhost',
				port: 27017,
				name: 'test-db',
				on: jest.fn(),
				once: jest.fn(),
				off: jest.fn(),
				removeAllListeners: jest.fn(),
				db: {
					admin: jest.fn().mockReturnValue({
						ping: jest.fn().mockResolvedValue({}),
					}),
				},
			},
			Types: {
				ObjectId: jest.fn().mockImplementation((id?: string) => {
					if (id) {
						return { toString: () => id, _id: id };
					}
					const mockId = `mock-id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
					return { toString: () => mockId, _id: mockId };
				}),
			},
			model: jest.fn(),
			Schema: jest.fn(),
		} as any;

		return mockMongoose;
	}

	/**
	 * Create a mock Mongoose model with common methods
	 */
	static createMockModel(modelName: string): jest.Mocked<mongoose.Model<any>> {
		const mockModel = {
			modelName,
			collection: {
				name: modelName.toLowerCase(),
				collectionName: modelName.toLowerCase(),
			},
			
			// Instance methods
			save: jest.fn(),
			remove: jest.fn(),
			deleteOne: jest.fn(),
			updateOne: jest.fn(),
			
			// Static methods
			find: jest.fn(),
			findOne: jest.fn(),
			findById: jest.fn(),
			findOneAndUpdate: jest.fn(),
			findOneAndDelete: jest.fn(),
			findByIdAndUpdate: jest.fn(),
			findByIdAndDelete: jest.fn(),
			create: jest.fn(),
			insertMany: jest.fn(),
			updateMany: jest.fn(),
			deleteMany: jest.fn(),
			countDocuments: jest.fn(),
			distinct: jest.fn(),
			aggregate: jest.fn(),
			populate: jest.fn(),
			
			// Query builder methods
			where: jest.fn(),
			select: jest.fn(),
			sort: jest.fn(),
			limit: jest.fn(),
			skip: jest.fn(),
			exec: jest.fn(),
		} as any;

		// Make query methods chainable
		const chainableMethods = ['where', 'select', 'sort', 'limit', 'skip'];
		chainableMethods.forEach(method => {
			mockModel[method].mockReturnValue(mockModel);
		});

		return mockModel;
	}

	/**
	 * Create a mock query builder with chainable methods
	 */
	static createMockQuery(): any {
		const mockQuery = {
			where: jest.fn(),
			select: jest.fn(),
			sort: jest.fn(),
			limit: jest.fn(),
			skip: jest.fn(),
			populate: jest.fn(),
			exec: jest.fn(),
		};

		// Make all methods chainable
		Object.keys(mockQuery).forEach(key => {
			if (key !== 'exec') {
				(mockQuery as any)[key].mockReturnValue(mockQuery);
			}
		});

		return mockQuery;
	}

	/**
	 * Setup mocks for a specific model with default behaviors
	 */
	static setupModelMocks(
		model: jest.Mocked<mongoose.Model<any>>,
		mockData?: Partial<any>[]
	): void {
		const defaultData = mockData || [];

		// Setup find methods
		model.find.mockImplementation(() => {
			const query = this.createMockQuery();
			query.exec.mockResolvedValue(defaultData);
			return query;
		});

		model.findOne.mockImplementation((filter) => {
			const query = this.createMockQuery();
			const result = defaultData.find(item => this.matchesFilter(item, filter)) || null;
			query.exec.mockResolvedValue(result);
			return query;
		});

		model.findById.mockImplementation((id) => {
			const query = this.createMockQuery();
			const result = defaultData.find(item => (item as any)._id === id) || null;
			query.exec.mockResolvedValue(result);
			return query;
		});

		// Setup create/save methods
		model.create.mockImplementation((doc) => {
			const created = { ...doc, _id: this.generateMockId() };
			return Promise.resolve(created);
		});

		// Note: save is an instance method, not a static method
		// This is just for reference - actual save mocking happens on document instances

		// Setup update methods
		model.updateOne.mockResolvedValue({ 
			acknowledged: true, 
			modifiedCount: 1, 
			upsertedId: null, 
			upsertedCount: 0, 
			matchedCount: 1 
		});

		model.updateMany.mockResolvedValue({ 
			acknowledged: true, 
			modifiedCount: 1, 
			upsertedId: null, 
			upsertedCount: 0, 
			matchedCount: 1 
		});

		model.findOneAndUpdate.mockImplementation((filter, update) => {
			const existing = defaultData.find(item => this.matchesFilter(item, filter));
			if (existing) {
				const updated = { ...existing, ...update };
				const query = this.createMockQuery();
				query.exec.mockResolvedValue(updated);
				return query;
			}
			const query = this.createMockQuery();
			query.exec.mockResolvedValue(null);
			return query;
		});

		// Setup delete methods
		model.deleteOne.mockResolvedValue({ acknowledged: true, deletedCount: 1 });
		model.deleteMany.mockResolvedValue({ acknowledged: true, deletedCount: defaultData.length });

		// Setup count methods
		model.countDocuments.mockResolvedValue(defaultData.length);

		// Setup aggregation
		model.aggregate.mockResolvedValue([]);
	}

	/**
	 * Generate a mock ObjectId
	 */
	static generateMockId(): string {
		return `mock-id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Simple filter matching for mocked queries
	 */
	private static matchesFilter(item: any, filter: any): boolean {
		if (!filter) return true;
		
		return Object.keys(filter).every(key => {
			const filterValue = filter[key];
			const itemValue = key.includes('.') ? this.getNestedValue(item, key) : item[key];
			
			if (typeof filterValue === 'object' && filterValue !== null) {
				// Handle MongoDB operators
				if (filterValue.$gte && itemValue < filterValue.$gte) return false;
				if (filterValue.$lte && itemValue > filterValue.$lte) return false;
				if (filterValue.$in && !filterValue.$in.includes(itemValue)) return false;
				if (filterValue.$nin && filterValue.$nin.includes(itemValue)) return false;
				return true;
			}
			
			return itemValue === filterValue;
		});
	}

	/**
	 * Get nested value from object using dot notation
	 */
	private static getNestedValue(obj: any, path: string): any {
		return path.split('.').reduce((current, key) => current?.[key], obj);
	}

	/**
	 * Reset all mocks on a model
	 */
	static resetModelMocks(model: jest.Mocked<mongoose.Model<any>>): void {
		Object.values(model).forEach(mock => {
			if (typeof mock === 'function' && mock.mockReset) {
				mock.mockReset();
			}
		});
	}

	/**
	 * Create a mock document instance
	 */
	static createMockDocument(data: Partial<any>): any {
		return {
			...data,
			_id: data._id || this.generateMockId(),
			save: jest.fn().mockResolvedValue(data),
			remove: jest.fn().mockResolvedValue(data),
			deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
			updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
			toJSON: jest.fn().mockReturnValue(data),
			toObject: jest.fn().mockReturnValue(data),
		};
	}

	/**
	 * Create mock connection events for testing connection handling
	 */
	static createMockConnectionEvents(): {
		connect: jest.Mock;
		disconnect: jest.Mock;
		error: jest.Mock;
		reconnect: jest.Mock;
	} {
		return {
			connect: jest.fn(),
			disconnect: jest.fn(),
			error: jest.fn(),
			reconnect: jest.fn(),
		};
	}

	/**
	 * Setup database connection mocks with realistic behavior
	 */
	static setupConnectionMocks(mockMongoose: jest.Mocked<typeof mongoose>): void {
		// Setup connection state management
		let connectionState = 0; // 0 = disconnected, 1 = connected
		
		mockMongoose.connect.mockImplementation(() => {
			connectionState = 1;
			(mockMongoose.connection as any).readyState = 1;
			return Promise.resolve(mockMongoose as any);
		});

		mockMongoose.disconnect.mockImplementation(() => {
			connectionState = 0;
			(mockMongoose.connection as any).readyState = 0;
			return Promise.resolve();
		});

		// Setup connection property
		Object.defineProperty(mockMongoose, 'connection', {
			value: {
				...mockMongoose.connection,
				get readyState() {
					return connectionState;
				},
			},
			writable: true,
			configurable: true,
		});
	}
}

/**
 * Decorator to automatically mock mongoose models in tests
 */
export function MockMongoModel(modelName: string) {
	return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
		const originalMethod = descriptor.value;
		
		descriptor.value = function (...args: any[]) {
			const mockModel = MongoMockUtils.createMockModel(modelName);
			// Inject mock model as first parameter
			return originalMethod.apply(this, [mockModel, ...args]);
		};
		
		return descriptor;
	};
}

/**
 * Test helper to assert database operations
 * These functions should only be called within Jest test blocks
 */
export class MongoTestAssertions {
	/**
	 * Assert that a model method was called with specific parameters
	 */
	static assertModelMethodCalled(
		model: jest.Mocked<mongoose.Model<any>>,
		method: keyof mongoose.Model<any>,
		expectedArgs?: any[]
	): void {
		const mockMethod = model[method] as jest.Mock;
		// These expects are meant to be called within test blocks
		// eslint-disable-next-line jest/no-standalone-expect
		expect(mockMethod).toHaveBeenCalled();
		if (expectedArgs) {
			// eslint-disable-next-line jest/no-standalone-expect
			expect(mockMethod).toHaveBeenCalledWith(...expectedArgs);
		}
	}

	/**
	 * Assert that a model method was called a specific number of times
	 */
	static assertModelMethodCallCount(
		model: jest.Mocked<mongoose.Model<any>>,
		method: keyof mongoose.Model<any>,
		expectedCount: number
	): void {
		const mockMethod = model[method] as jest.Mock;
		// eslint-disable-next-line jest/no-standalone-expect
		expect(mockMethod).toHaveBeenCalledTimes(expectedCount);
	}

	/**
	 * Assert that a query was built with specific parameters
	 */
	static assertQueryBuilt(mockQuery: any, expectedCalls: Record<string, any[]>): void {
		Object.entries(expectedCalls).forEach(([method, args]) => {
			// eslint-disable-next-line jest/no-standalone-expect
			expect(mockQuery[method]).toHaveBeenCalledWith(...args);
		});
	}
}