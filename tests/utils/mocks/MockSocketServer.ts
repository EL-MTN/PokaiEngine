import { EventEmitter } from 'events';

import { MockSocket } from './MockSocket';

export class MockSocketServer extends EventEmitter {
	public sockets: Map<string, MockSocket> = new Map();
	private rooms: Map<string, Set<string>> = new Map();
	private middleware: Array<(socket: MockSocket, next: Function) => void> = [];

	constructor() {
		super();
	}

	use(fn: (socket: MockSocket, next: Function) => void): void {
		this.middleware.push(fn);
	}

	in(room: string): { emit: (event: string, ...args: any[]) => void } {
		return {
			emit: (event: string, ...args: any[]) => {
				const socketIds = this.rooms.get(room) || new Set();
				socketIds.forEach((socketId) => {
					const socket = this.sockets.get(socketId);
					if (socket) {
						socket.emit(event, ...args);
					}
				});
			},
		};
	}

	to(room: string): { emit: (event: string, ...args: any[]) => void } {
		return this.in(room);
	}

	async connectSocket(
		socketId: string = 'test-socket',
		auth: any = {},
	): Promise<MockSocket> {
		const socket = new MockSocket(socketId);
		socket.setAuth(auth);

		for (const fn of this.middleware) {
			await new Promise<void>((resolve, reject) => {
				fn(socket, (err?: Error) => {
					if (err) reject(err);
					else resolve();
				});
			});
		}

		this.sockets.set(socketId, socket);
		this.emit('connection', socket);

		socket.on('join', (room: string) => {
			if (!this.rooms.has(room)) {
				this.rooms.set(room, new Set());
			}
			this.rooms.get(room)!.add(socketId);
		});

		socket.on('leave', (room: string) => {
			const room_sockets = this.rooms.get(room);
			if (room_sockets) {
				room_sockets.delete(socketId);
				if (room_sockets.size === 0) {
					this.rooms.delete(room);
				}
			}
		});

		socket.on('disconnect', () => {
			this.sockets.delete(socketId);
			this.rooms.forEach((room_sockets) => {
				room_sockets.delete(socketId);
			});
		});

		return socket;
	}

	// Alias for compatibility with existing tests
	connect(socketId: string): MockSocket {
		const socket = new MockSocket(socketId);
		this.sockets.set(socketId, socket);
		this.emit('connection', socket);
		return socket;
	}

	disconnectSocket(socketId: string): void {
		const socket = this.sockets.get(socketId);
		if (socket) {
			socket.disconnect();
			this.sockets.delete(socketId);
		}
	}

	disconnectAll(): void {
		this.sockets.forEach((socket) => socket.disconnect());
		this.sockets.clear();
		this.rooms.clear();
	}

	getSocket(socketId: string): MockSocket | undefined {
		return this.sockets.get(socketId);
	}

	getRoomSockets(room: string): MockSocket[] {
		const socketIds = this.rooms.get(room) || new Set();
		return Array.from(socketIds)
			.map((id) => this.sockets.get(id))
			.filter((socket): socket is MockSocket => socket !== undefined);
	}
}
