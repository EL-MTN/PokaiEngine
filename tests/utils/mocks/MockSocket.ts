import { EventEmitter } from 'events';

export class MockSocket extends EventEmitter {
  public id: string;
  public rooms: Set<string> = new Set();
  public data: any = {};
  public connected: boolean = true;
  public disconnected: boolean = false;
  public handshake: any = {
    auth: {},
    query: {},
    headers: {}
  };

  private emittedEvents: Array<{ event: string; data: any }> = [];
  private joinedRooms: string[] = [];
  private leftRooms: string[] = [];

  constructor(id: string = 'mock-socket-id') {
    super();
    this.id = id;
    this.rooms.add(id);
  }

  join(room: string): void {
    this.rooms.add(room);
    this.joinedRooms.push(room);
  }

  leave(room: string): void {
    this.rooms.delete(room);
    this.leftRooms.push(room);
  }

  to(room: string): MockSocket {
    // This method mimics Socket.IO's behavior where to() returns the socket for chaining
    // The room parameter is intentionally not used as this is a mock implementation
    void room; // Acknowledge the parameter
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    // Store in emittedEvents for compatibility with existing tests
    this.emittedEvents.push({ event, data: args.length === 1 ? args[0] : args });
    // Also emit the actual event for EventEmitter functionality
    return super.emit(event, ...args);
  }

  // Alias for trigger to maintain compatibility with existing tests
  trigger(event: string, data: any): void {
    // Emit to listeners but don't add to emittedEvents
    super.emit(event, data);
  }

  // Alias for outgoing to maintain compatibility with existing tests
  get outgoing(): Array<{ event: string; data: any }> {
    return this.emittedEvents;
  }

  disconnect(close?: boolean): void {
    // The close parameter mimics Socket.IO's API but is not used in this mock
    void close; // Acknowledge the parameter
    this.connected = false;
    this.disconnected = true;
    this.emit('disconnect', 'transport close');
  }

  getEmittedEvents(): Array<{ event: string; data: any }> {
    return this.emittedEvents;
  }

  getLastEmittedEvent(): { event: string; data: any } | undefined {
    return this.emittedEvents[this.emittedEvents.length - 1];
  }

  hasEmitted(event: string): boolean {
    return this.emittedEvents.some(e => e.event === event);
  }

  getEmittedData(event: string): any[] {
    const events = this.emittedEvents.filter(e => e.event === event);
    return events.map(e => e.data);
  }

  clearEmittedEvents(): void {
    this.emittedEvents = [];
  }

  // Clear outgoing for compatibility
  clearOutgoing(): void {
    this.clearEmittedEvents();
  }

  getJoinedRooms(): string[] {
    return this.joinedRooms;
  }

  getLeftRooms(): string[] {
    return this.leftRooms;
  }

  setAuth(auth: any): void {
    this.handshake.auth = auth;
  }

  setData(key: string, value: any): void {
    this.data[key] = value;
  }
}