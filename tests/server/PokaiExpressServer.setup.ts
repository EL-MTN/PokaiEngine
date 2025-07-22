import request from 'supertest';
import { BotAuthService } from '@/services/auth/BotAuthService';
import PokaiExpressServer from '@/services/server';

// Mock the logger to avoid actual file writes during tests
jest.mock('@/services/logging/Logger', () => ({
	serverLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		http: jest.fn(),
	},
	gameLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
		logAction: jest.fn(),
		logGameState: jest.fn(),
		logHandStart: jest.fn(),
		logHandEnd: jest.fn(),
		logError: jest.fn(),
	},
}));

// Mock MongoDB connection for BotAuthService
jest.mock('@/services/storage/database', () => ({
	connectDatabase: jest.fn().mockResolvedValue(undefined),
	disconnectDatabase: jest.fn().mockResolvedValue(undefined),
}));

// Mock ReplayStorage
jest.mock('@/services/replay/ReplayStorage', () => ({
	ReplayStorage: jest.fn().mockImplementation(() => ({
		saveReplay: jest.fn().mockResolvedValue({
			fileSuccess: true,
			mongoSuccess: false,
			filePath: '/test/replay.json',
		}),
		loadReplayFromFile: jest.fn().mockReturnValue(null),
		listAvailableReplays: jest.fn().mockReturnValue([]),
		exportReplay: jest.fn().mockImplementation((data, format) => {
			if (format === 'json') return JSON.stringify(data);
			return Buffer.from(JSON.stringify(data));
		}),
	})),
}));

// Mock ReplayRepository
jest.mock('@/services/storage/repositories/ReplayRepository', () => ({
	ReplayRepository: jest.fn().mockImplementation(() => ({
		save: jest.fn().mockResolvedValue({ _id: 'test-id' }),
		findByGameId: jest.fn().mockResolvedValue(null),
		findAll: jest.fn().mockResolvedValue([]),
		findRecentGames: jest.fn().mockResolvedValue([]),
	})),
}));

// Mock ReplaySystem
export const mockReplaySystem = {
	loadReplay: jest.fn().mockImplementation((replayData) => {
		// Return false for empty games or null replay data
		if (!replayData || replayData === null) {
			return false;
		}
		return true;
	}),
	analyzeReplay: jest.fn().mockImplementation(() => ({
		gameId: 'test-game',
		handsPlayed: 1,
		totalPotSize: 100,
	})),
};

jest.mock('@/services/logging/ReplaySystem', () => ({
	ReplaySystem: jest.fn().mockImplementation(() => mockReplaySystem),
}));

// Mock ReplayManager with dynamic responses
export const mockReplayManager = {
	startRecording: jest.fn(),
	stopRecording: jest.fn(),
	recordEvent: jest.fn(),
	getReplayData: jest.fn().mockImplementation((gameId) => {
		// Return data for games that have been played, but null for empty-game
		if (gameId === 'empty-game') {
			return null;
		}
		if (
			(gameId && gameId.includes('replay')) ||
			gameId.includes('export') ||
			gameId.includes('save') ||
			gameId.includes('analysis')
		) {
			return {
				gameId,
				events: [],
				startTime: new Date(),
				endTime: new Date(),
				initialGameState: {},
				finalGameState: {},
				metadata: {},
			};
		}
		return null;
	}),
	getHandReplayData: jest.fn().mockImplementation((gameId, handNumber) => {
		if (handNumber === 1 && gameId && gameId.includes('hand')) {
			return {
				gameId,
				handNumber: 1,
				events: [],
			};
		}
		return null;
	}),
	buildHandReplayData: jest.fn().mockReturnValue({
		gameId: 'test-game',
		handNumber: 1,
		events: [],
	}),
	exportReplay: jest.fn().mockImplementation((gameId, format) => {
		if (!gameId || gameId.includes('non-existent')) return null;
		const data = { gameId, events: [] };
		if (format === 'json') return JSON.stringify(data);
		return Buffer.from(JSON.stringify(data));
	}),
	saveReplayToFile: jest.fn().mockImplementation(async (gameId) => {
		if (!gameId || gameId === 'non-existent') {
			return {
				fileSuccess: false,
				mongoSuccess: false,
				error: 'Game not found',
			};
		}
		return {
			fileSuccess: true,
			mongoSuccess: false,
			filePath: '/test/replay.json',
		};
	}),
	loadReplayFromMongo: jest.fn().mockResolvedValue(null),
	getReplayFromAnySource: jest.fn().mockImplementation(async (gameId) => {
		if (
			gameId &&
			!gameId.includes('non-existent') &&
			!gameId.includes('empty')
		) {
			return {
				gameId,
				events: [],
				startTime: new Date(),
				endTime: new Date(),
				initialGameState: {},
				finalGameState: {},
				metadata: {},
			};
		}
		return null;
	}),
};

jest.mock('@/engine/replay/ReplayManager', () => ({
	ReplayManager: jest.fn().mockImplementation(() => mockReplayManager),
}));

export function createTestServer(): { server: PokaiExpressServer; app: any } {
	const server = new PokaiExpressServer(0); // Use port 0 for random available port
	const serverAny = server as any;
	const app = serverAny.app;
	return { server, app };
}

export { request };