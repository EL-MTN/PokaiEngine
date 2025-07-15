import { ReplayStorage } from '@/infrastructure/storage/ReplayStorage';
import * as fs from 'fs';
import * as path from 'path';

describe('ReplayStorage Configuration', () => {
	let storage: ReplayStorage;
	const testDir = './test-replay-config';

	beforeEach(() => {
		// Clean up test directory
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true });
		}
	});

	afterEach(() => {
		// Clean up test directory
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true });
		}
	});

	describe('Test Environment Detection', () => {
		it('should disable MongoDB in test environment by default', () => {
			// Create storage without explicit config
			storage = new ReplayStorage({ directory: testDir });

			// Access private config through any type assertion
			const config = (storage as any).config;

			// In test environment, MongoDB should be disabled by default
			expect(config.mongoEnabled).toBe(false);
			expect(config.fileEnabled).toBe(true);
			expect(config.preferMongo).toBe(false);
		});

		it('should allow explicit MongoDB enable even in tests', () => {
			// Create storage with explicit MongoDB enable
			storage = new ReplayStorage({
				directory: testDir,
				mongoEnabled: true,
			});

			const config = (storage as any).config;

			// Should respect explicit configuration
			expect(config.mongoEnabled).toBe(true);
		});

		it('should enable MongoDB in production environment', () => {
			// Temporarily change NODE_ENV
			const originalEnv = process.env.NODE_ENV;
			const originalJestId = process.env.JEST_WORKER_ID;

			try {
				delete process.env.NODE_ENV;
				delete process.env.JEST_WORKER_ID;

				storage = new ReplayStorage({ directory: testDir });
				const config = (storage as any).config;

				// In non-test environment, MongoDB should be enabled
				expect(config.mongoEnabled).toBe(true);
				expect(config.preferMongo).toBe(true);
			} finally {
				// Restore original environment
				process.env.NODE_ENV = originalEnv;
				if (originalJestId !== undefined) {
					process.env.JEST_WORKER_ID = originalJestId;
				}
			}
		});
	});

	describe('Storage Mode Configurations', () => {
		it('should support MongoDB-only mode', () => {
			storage = new ReplayStorage({
				directory: testDir,
				mongoEnabled: true,
				fileEnabled: false,
			});

			const config = (storage as any).config;
			expect(config.mongoEnabled).toBe(true);
			expect(config.fileEnabled).toBe(false);
		});

		it('should support file-only mode', () => {
			storage = new ReplayStorage({
				directory: testDir,
				mongoEnabled: false,
				fileEnabled: true,
			});

			const config = (storage as any).config;
			expect(config.mongoEnabled).toBe(false);
			expect(config.fileEnabled).toBe(true);
		});

		it('should support disabled storage mode', () => {
			storage = new ReplayStorage({
				directory: testDir,
				mongoEnabled: false,
				fileEnabled: false,
			});

			const config = (storage as any).config;
			expect(config.mongoEnabled).toBe(false);
			expect(config.fileEnabled).toBe(false);
		});
	});
});
