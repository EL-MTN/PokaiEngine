# Socket Event Naming Convention - PokaiEngine

## Overview

This document defines the standardized naming convention for all socket events in PokaiEngine to help bot developers organize their event handlers systematically.

## Naming Convention Rules

### 1. **Event Structure Pattern**
```
[direction]:[domain].[action].[result]
```

- **direction**: `client` (→server) or `server` (→client) 
- **domain**: Logical grouping (auth, game, action, turn, spectator)
- **action**: What operation is being performed
- **result**: success, error, or event type (for server→client only)

### 2. **Direction Prefixes**
- **Client → Server**: `client:` or no prefix (commands/requests)
- **Server → Client**: `server:` (responses/notifications)

### 3. **Domain Categories**

| Domain | Purpose | Examples |
|--------|---------|----------|
| `auth` | Authentication & connection | Login, logout, connection health |
| `game` | Game management | Join, leave, list games |
| `action` | Player actions | Bet, fold, call, raise |
| `turn` | Turn management | Turn start, warnings, timeouts |
| `state` | Game state queries | Current state, possible actions |
| `event` | Game events | Hand start, card dealt, showdown |
| `spectator` | Spectator functionality | Watch games, admin features |
| `system` | System-level events | Errors, debugging, health |

### 4. **Action Naming**
- Use **imperative verbs** for client→server (commands)
- Use **descriptive nouns** for server→client (notifications)

### 5. **Result Types** (Server→Client only)
- `.success` - Operation completed successfully
- `.error` - Operation failed
- `.update` - State change notification
- `.warning` - Warning/advisory message

## **New Naming Convention**

### Authentication & Connection

| Current Event | New Event Name | Direction | Purpose |
|---------------|----------------|-----------|---------|
| `authenticate` | `auth.login` | Client→Server | Submit credentials |
| `authenticated` | `auth.login.success` | Server→Client | Authentication successful |
| `authError` | `auth.login.error` | Server→Client | Authentication failed |
| `authRequired` | `auth.required` | Server→Client | Authentication needed |
| `ping` | `system.ping` | Client→Server | Connection health check |
| `pong` | `system.ping.success` | Server→Client | Ping response |

### Game Management

| Current Event | New Event Name | Direction | Purpose |
|---------------|----------------|-----------|---------|
| `identify` | `game.join` | Client→Server | Join a game |
| `identificationSuccess` | `game.join.success` | Server→Client | Successfully joined |
| `identificationError` | `game.join.error` | Server→Client | Failed to join |
| `listGames` | `game.list` | Client→Server | Request game list |
| `gamesList` | `game.list.success` | Server→Client | Available games |
| `leaveGame` | `game.leave` | Client→Server | Leave current game |
| `leftGame` | `game.leave.success` | Server→Client | Successfully left |
| `leaveGameError` | `game.leave.error` | Server→Client | Error leaving |
| `unseat` | `game.unseat` | Client→Server | Request to unseat |
| `unseatConfirmed` | `game.unseat.success` | Server→Client | Unseat confirmed |
| `unseatError` | `game.unseat.error` | Server→Client | Unseat failed |

### Player Actions

| Current Event | New Event Name | Direction | Purpose |
|---------------|----------------|-----------|---------|
| `action` | `action.submit` | Client→Server | Submit player action |
| `actionSuccess` | `action.submit.success` | Server→Client | Action processed |
| `actionError` | `action.submit.error` | Server→Client | Action failed |

### Game State & Information

| Current Event | New Event Name | Direction | Purpose |
|---------------|----------------|-----------|---------|
| `requestGameState` | `state.current` | Client→Server | Request game state |
| `gameState` | `state.current.success` | Server→Client | Current game state |
| `gameStateError` | `state.current.error` | Server→Client | Error getting state |
| `requestPossibleActions` | `state.actions` | Client→Server | Request possible actions |
| `possibleActions` | `state.actions.success` | Server→Client | Available actions |
| `possibleActionsError` | `state.actions.error` | Server→Client | Error getting actions |

### Turn Management

| Current Event | New Event Name | Direction | Purpose |
|---------------|----------------|-----------|---------|
| `turnStart` | `turn.start` | Server→Client | Player's turn begins |
| `turnWarning` | `turn.warning` | Server→Client | Time running out |
| `turnTimeout` | `turn.timeout` | Server→Client | Turn timed out |
| `forceActionError` | `turn.force.error` | Server→Client | Force action failed |

### Game Events

| Current Event | New Event Name | Direction | Purpose |
|---------------|----------------|-----------|---------|
| `gameEvent` | `event.game` | Server→Client | General game events |

### Spectator Events

| Current Event | New Event Name | Direction | Purpose |
|---------------|----------------|-----------|---------|
| `spectatorAuth` | `spectator.auth` | Client→Server | Spectator authentication |
| `spectatorAuthSuccess` | `spectator.auth.success` | Server→Client | Spectator auth successful |
| `spectatorAuthError` | `spectator.auth.error` | Server→Client | Spectator auth failed |
| `spectatorAuthRequired` | `spectator.auth.required` | Server→Client | Spectator auth needed |
| `spectate` | `spectator.watch` | Client→Server | Start watching game |
| `spectatingGame` | `spectator.watch.success` | Server→Client | Started watching |
| `spectateError` | `spectator.watch.error` | Server→Client | Failed to watch |
| `stopSpectating` | `spectator.unwatch` | Client→Server | Stop watching |
| `stoppedSpectating` | `spectator.unwatch.success` | Server→Client | Stopped watching |
| `stopSpectatingError` | `spectator.unwatch.error` | Server→Client | Error stopping |
| `listActiveGames` | `spectator.games` | Client→Server | List spectatable games |
| `activeGamesList` | `spectator.games.success` | Server→Client | Available games |
| `fullGameState` | `spectator.state` | Server→Client | Full game state |
| `spectatorGameEvent` | `spectator.event` | Server→Client | Game event for spectators |

### System Events

| Current Event | New Event Name | Direction | Purpose |
|---------------|----------------|-----------|---------|
| `error` | `system.error` | Server→Client | General system error |
| `disconnect` | N/A | Socket.IO Built-in | Socket disconnected |

## **Developer Benefits**

### 1. **Organized Event Handlers**
```javascript
class PokerBot {
  setupEventHandlers() {
    // Authentication handlers
    this.socket.on('auth.login.success', this.handleAuthSuccess);
    this.socket.on('auth.login.error', this.handleAuthError);
    
    // Game management handlers  
    this.socket.on('game.join.success', this.handleGameJoined);
    this.socket.on('game.join.error', this.handleGameJoinError);
    
    // Action handlers
    this.socket.on('action.submit.success', this.handleActionSuccess);
    this.socket.on('action.submit.error', this.handleActionError);
    
    // Turn handlers
    this.socket.on('turn.start', this.handleTurnStart);
    this.socket.on('turn.warning', this.handleTurnWarning);
    
    // Game events
    this.socket.on('event.game', this.handleGameEvent);
  }
}
```

### 2. **Predictable Request/Response Patterns**
```javascript
// Request pattern: domain.action
socket.emit('state.current');

// Response patterns: domain.action.result  
socket.on('state.current.success', handleSuccess);
socket.on('state.current.error', handleError);
```

### 3. **Easy Categorization**
Developers can easily group handlers by domain:
- All `auth.*` events for authentication
- All `game.*` events for game management  
- All `action.*` events for player actions
- All `turn.*` events for turn management

### 4. **Clear Direction Understanding**
- No prefix = Client sending to server (commands)
- Event received = Server sending to client (responses/notifications)

## **Implementation Strategy**

### Phase 1: Alias Support
- Add new event names alongside existing ones
- Maintain backward compatibility

### Phase 2: Documentation Update
- Update all documentation with new convention
- Provide migration guide for existing bots

### Phase 3: Deprecation
- Mark old event names as deprecated
- Add console warnings in development mode

### Phase 4: Full Migration
- Remove old event names in next major version

This naming convention provides a clear, systematic approach that helps bot developers organize their code logically while maintaining the full game state access they need.