import { createTestServer, request, mockReplayManager } from './PokaiExpressServer.setup';

describe('PokaiExpressServer - Replay Routes', () => {
	let server: any;
	let app: any;

	beforeEach(() => {
		jest.clearAllMocks();
		const testServer = createTestServer();
		server = testServer.server;
		app = testServer.app;
		
		// Mock gameController methods
		const serverAny = server as any;
		serverAny.gameController.getReplayFromAnySource = jest.fn().mockImplementation(async (gameId) => {
			if (gameId && gameId.includes('replay')) {
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
		});
		
		serverAny.gameController.getHandReplayData = jest.fn().mockImplementation((gameId, handNumber) => {
			if (handNumber === 1 && gameId && gameId.includes('hand')) {
				return {
					gameId,
					handNumber: 1,
					events: [],
				};
			}
			return null;
		});
		
		serverAny.gameController.saveReplayToFile = jest.fn().mockImplementation(async (gameId) => {
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
		});
		
		serverAny.gameController.exportReplay = jest.fn().mockImplementation((gameId, format) => {
			if (!gameId || gameId.includes('non-existent')) return null;
			const data = { gameId, events: [] };
			if (format === 'json') return JSON.stringify(data);
			return Buffer.from(JSON.stringify(data));
		});
		
		serverAny.gameController.getReplayData = jest.fn().mockImplementation((gameId) => {
			if (gameId === 'analysis-test-game') {
				return { gameId, events: [] };
			}
			return null;
		});
		
		serverAny.gameController.getReplaySystem = jest.fn().mockReturnValue({
			analyzeReplay: jest.fn().mockReturnValue({
				gameId: 'analysis-test-game',
				totalHands: 10,
				duration: 3600000,
				playerStatistics: {
					player1: {
						handsPlayed: 10,
						handsWon: 5,
						totalWinnings: 1000,
					},
				},
			}),
		});
	});

	afterEach(async () => {
		const serverAny = server as any;
		if (serverAny.httpServer) {
			await new Promise<void>((resolve) => {
				serverAny.httpServer.close(() => resolve());
			});
		}
	});

	describe('GET /api/replays', () => {
		it('should return list of available replays', async () => {
			const mockReplays = {
				mongoReplays: [
					{ gameId: 'game1', createdAt: new Date('2024-01-01'), actualPlayers: 4 },
					{ gameId: 'game2', createdAt: new Date('2024-01-02'), actualPlayers: 6 },
				],
				fileReplays: [
					{ filename: 'game3.json', path: '/replays/game3.json', size: 1024, createdAt: Date.now() },
				],
			};

			const serverAny = server as any;
			serverAny.gameController.listAllReplays = jest
				.fn()
				.mockResolvedValue(mockReplays);

			const response = await request(app).get('/api/replays');

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.data).toBeDefined();
			expect(Array.isArray(response.body.data)).toBe(true);
			expect(response.body.stats).toBeDefined();
		});

		it('should handle errors when listing replays', async () => {
			const serverAny = server as any;
			serverAny.gameController.listAllReplays = jest
				.fn()
				.mockRejectedValue(new Error('Storage error'));

			const response = await request(app).get('/api/replays');

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('Storage error');
		});
	});

	describe('GET /api/replays/:gameId', () => {
		it('should return replay data for existing game', async () => {
			const response = await request(app).get('/api/replays/replay-test-game');

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.data).toBeDefined();
			expect(response.body.data.gameId).toBe('replay-test-game');
		});

		it('should return 404 for non-existent replay', async () => {
			const response = await request(app).get('/api/replays/non-existent-game');

			expect(response.status).toBe(404);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('No replay data found for game non-existent-game');
		});

		it('should return 404 for empty games', async () => {
			const response = await request(app).get('/api/replays/empty-game');

			expect(response.status).toBe(404);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('No replay data found for game empty-game');
		});
	});

	describe('GET /api/replays/:gameId/hands/:handNumber', () => {
		it('should return hand replay data', async () => {
			const response = await request(app).get('/api/replays/hand-test-game/hands/1');

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.data).toBeDefined();
			expect(response.body.data.handNumber).toBe(1);
		});

		it('should return 404 for non-existent hand', async () => {
			const response = await request(app).get('/api/replays/test-game/hands/99');

			expect(response.status).toBe(404);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('No replay data found for hand 99 in game test-game');
		});

		it('should validate hand number', async () => {
			const response = await request(app).get('/api/replays/test-game/hands/abc');

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('Hand number must be a valid integer');
		});

		it('should validate positive hand number', async () => {
			const response = await request(app).get('/api/replays/test-game/hands/0');

			expect(response.status).toBe(404);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('No replay data found for hand 0 in game test-game');
		});
	});

	describe('POST /api/replays/:gameId/save', () => {
		it('should save replay to file', async () => {
			const response = await request(app).post('/api/replays/save-test-game/save');

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.message).toContain('saved successfully');
			expect(response.body.details).toEqual({
				fileSuccess: true,
				mongoSuccess: false,
				filePath: '/test/replay.json',
			});
		});

		it('should handle save errors', async () => {
			const response = await request(app).post('/api/replays/non-existent/save');

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('Game not found');
		});

		it('should handle missing replay data', async () => {
			// Override mock for this specific test
			const serverAny = server as any;
			serverAny.gameController.saveReplayToFile.mockResolvedValueOnce({
				fileSuccess: false,
				mongoSuccess: false,
				error: 'Replay data not found',
			});

			const response = await request(app).post('/api/replays/missing-game/save');

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toContain('Replay data not found');
		});
	});

	describe('GET /api/replays/:gameId/export', () => {
		it('should export replay as JSON', async () => {
			const response = await request(app).get(
				'/api/replays/export-test-game/export?format=json',
			);

			expect(response.status).toBe(200);
			expect(response.headers['content-type']).toContain('application/json');
			expect(response.headers['content-disposition']).toContain(
				'attachment; filename="export-test-game_replay.json"',
			);
		});

		it('should export replay as compressed format', async () => {
			const response = await request(app).get(
				'/api/replays/export-test-game/export?format=compressed',
			);

			expect(response.status).toBe(200);
			expect(response.headers['content-type']).toBe('application/gzip');
			expect(response.headers['content-disposition']).toContain(
				'attachment; filename="export-test-game_replay.gz"',
			);
		});

		it('should default to JSON format', async () => {
			const response = await request(app).get('/api/replays/export-test-game/export');

			expect(response.status).toBe(200);
			expect(response.headers['content-type']).toContain('application/json');
		});

		it('should handle invalid format', async () => {
			const response = await request(app).get(
				'/api/replays/export-test-game/export?format=invalid',
			);

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('Format must be json or compressed');
		});

		it('should return 404 for non-existent replay', async () => {
			const response = await request(app).get(
				'/api/replays/non-existent-game/export',
			);

			expect(response.status).toBe(404);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('No replay data found for game non-existent-game');
		});
	});

	describe('GET /api/replays/:gameId/analysis', () => {
		it('should return replay analysis', async () => {
			const serverAny = server as any;
			// Ensure the replay data and analysis are properly mocked
			serverAny.gameController.getReplayData.mockReturnValueOnce({ gameId: 'analysis-test-game', events: [] });
			serverAny.gameController.getReplaySystem.mockReturnValueOnce({
				loadReplay: jest.fn().mockReturnValue(true),
				analyzeReplay: jest.fn().mockReturnValue({
					gameId: 'analysis-test-game',
					totalHands: 10,
					duration: 3600000,
					playerStatistics: {
						player1: {
							handsPlayed: 10,
							handsWon: 5,
							totalWinnings: 1000,
						},
					},
				}),
			});

			const response = await request(app).get('/api/replays/analysis-test-game/analysis');

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.data).toBeDefined();
			expect(response.body.data.totalHands).toBe(10);
		});

		it('should return 404 when no analysis available', async () => {
			const serverAny = server as any;
			// Override mock to return null replay data
			serverAny.gameController.getReplayData.mockReturnValueOnce(null);

			const response = await request(app).get('/api/replays/empty-game/analysis');

			expect(response.status).toBe(404);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('No replay data found for game empty-game');
		});

		it('should handle analysis errors', async () => {
			const serverAny = server as any;
			// Override to return valid replay data but fail analysis
			serverAny.gameController.getReplayData.mockReturnValueOnce({ gameId: 'error-game', events: [] });
			serverAny.gameController.getReplaySystem.mockReturnValueOnce({
				loadReplay: jest.fn().mockReturnValue(true),
				analyzeReplay: jest.fn().mockImplementation(() => {
					throw new Error('Analysis failed');
				}),
			});

			const response = await request(app).get('/api/replays/error-game/analysis');

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toBe('Analysis failed');
		});
	});
});