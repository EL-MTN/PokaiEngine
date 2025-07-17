# Socket.IO Events Documentation for Postman

This guide provides comprehensive documentation for testing PokaiEngine's Socket.IO events using Postman.

## Prerequisites

1. Install Postman (v10.0+ recommended for Socket.IO support)
2. Ensure PokaiEngine is running on `ws://localhost:3001` (default)
3. Have valid bot credentials (botId and apiKey)

## Postman Socket.IO Setup

1. Create a new Socket.IO request in Postman
2. Set the URL to `ws://localhost:3001`
3. Connect to establish the socket connection

## Authentication Flow

### 1. Initial Connection
Upon connecting, you'll receive:
```json
Event: "authRequired"
Data: {
  "message": "Please authenticate using your bot credentials",
  "timestamp": 1234567890
}
```

### 2. Bot Authentication
**Event:** `auth.login`  
**Send:**
```json
{
  "botId": "your-bot-id",
  "apiKey": "your-api-key"
}
```

**Success Response:**
```json
Event: "auth.login.success"
Data: {
  "botId": "your-bot-id",
  "botName": "YourBotName",
  "playerId": "your-bot-id",
  "timestamp": 1234567890
}
```

**Error Response:**
```json
Event: "auth.login.error"
Data: {
  "message": "Invalid bot credentials",
  "timestamp": 1234567890
}
```

## Game Management Events

### List Available Games
**Event:** `game.list`  
**Send:** (no data required)

**Response:**
```json
Event: "game.list.success"
Data: {
  "games": [
    {
      "gameId": "test-game",
      "currentPlayers": 1,
      "maxPlayers": 6,
      "smallBlind": 50,
      "bigBlind": 100,
      "isStarted": true
    }
  ],
  "timestamp": 1234567890
}
```

### Join a Game
**Event:** `game.join`  
**Send:
```json
{
  "gameId": "test-game",
  "chipStack": 1000
}
```

**Success Response:**
```json
Event: "game.join.success"
Data: {
  "playerId": "your-bot-id",
  "gameId": "test-game",
  "botName": "YourRegisteredBotName",
  "chipStack": 1000,
  "timestamp": 1234567890
}
```

### Leave a Game
**Event:** `game.leave`  
**Send:** (no data required)

**Response:**
```json
Event: "game.leave.success"
Data: {
  "timestamp": 1234567890
}
```

## Game State Events

### Request Current Game State
**Event:** `state.current`  
**Send:** (no data required)

**Response:**
```json
Event: "state.current.success"
Data: {
  "gameState": {
    "gameId": "test-game",
    "currentPlayerToAct": "player-id",
    "potSize": 150,
    "communityCards": ["Ah", "Kd", "Qc"],
    "playerCards": ["As", "Ks"],
    "possibleActions": [
      {"type": "check"},
      {"type": "bet", "minAmount": 100, "maxAmount": 1000}
    ],
    "players": [
      {
        "playerId": "player1",
        "botName": "Bot1",
        "chipStack": 950,
        "isActive": true,
        "currentBet": 50
      }
    ]
  },
  "timestamp": 1234567890
}
```

### Request Possible Actions
**Event:** `state.actions`  
**Send:** (no data required)

**Response:**
```json
Event: "state.actions.success"
Data: {
  "possibleActions": [
    {"type": "fold"},
    {"type": "call", "amount": 100},
    {"type": "raise", "minAmount": 200, "maxAmount": 1000}
  ],
  "timestamp": 1234567890
}
```

## Game Actions

### Submit an Action
**Event:** `action.submit`  
**Send:
```json
{
  "action": {
    "type": "call",
    "amount": 100,
    "timestamp": 1234567890
  }
}
```

**Action Types:**
- `fold` - No amount required
- `check` - No amount required
- `call` - Amount required
- `bet` - Amount required
- `raise` - Amount required
- `all-in` - No amount required

**Success Response:**
```json
Event: "action.submit.success"
Data: {
  "action": {
    "type": "call",
    "playerId": "your-bot-id",
    "amount": 100,
    "timestamp": 1234567890
  },
  "timestamp": 1234567890
}
```

## Real-time Game Events

You'll automatically receive these events while in a game:

### Turn Start
```json
Event: "turn.start"
Data: {
  "timeLimit": 30,
  "timestamp": 1234567890
}
```

### Turn Warning
```json
Event: "turn.warning"
Data: {
  "timeRemaining": 9,
  "timestamp": 1234567890
}
```

### Game Events
```json
Event: "event.game"
Data: {
  "event": {
    "type": "hand_started",
    "data": {
      "handNumber": 42,
      "dealerPosition": 0,
      "smallBlindPosition": 1,
      "bigBlindPosition": 2
    }
  },
  "timestamp": 1234567890
}
```

**Event Types:**
- `hand_started` - New hand begins
- `action_taken` - Player took an action
- `flop_dealt` - Flop cards revealed
- `turn_dealt` - Turn card revealed
- `river_dealt` - River card revealed
- `showdown_complete` - Cards revealed at showdown
- `hand_complete` - Hand finished, pot distributed

## Utility Events

### Ping/Pong (Keep-alive)
**Event:** `system.ping`  
**Send:** (no data required)

**Response:**
```json
Event: "system.ping.success"
Data: {
  "timestamp": 1234567890
}
```

## Spectator Mode

### Spectator Authentication
**Event:** `spectator.auth`  
**Send:
```json
{
  "adminKey": "optional-admin-key"
}
```

### Start Spectating
**Event:** `spectator.watch`  
**Send:
```json
{
  "gameId": "test-game"
}
```

### List Active Games (Spectator)
**Event:** `spectator.games`  
**Send:** (no data required)

**Response:**
```json
Event: "spectator.games.success"
Data: {
  "games": [
    {
      "gameId": "test-game",
      "currentPlayers": 2,
      "maxPlayers": 6,
      "smallBlind": 50,
      "bigBlind": 100,
      "isStarted": true,
      "currentHandNumber": 5,
      "totalPot": 500
    }
  ],
  "timestamp": 1234567890
}
```

## Error Handling

### General Error Format
```json
Event: "system.error"
Data: {
  "code": "AUTH_REQUIRED",
  "message": "Authentication required. Please authenticate first.",
  "timestamp": 1234567890
}
```

**Common Error Codes:**
- `AUTH_REQUIRED` - Must authenticate before this action
- `NOT_IN_GAME` - Bot is not in a game
- `INVALID_ACTION` - Action is not valid in current state
- `NOT_YOUR_TURN` - It's not your turn to act

## Testing Workflow in Postman

1. **Connect** to the Socket.IO server
2. **Authenticate** using your bot credentials
3. **List games** to see available games
4. **Join a game** using the identify event
5. **Request game state** to see current situation
6. **Wait for turnStart** event
7. **Request possible actions** when it's your turn
8. **Submit an action** based on your strategy
9. **Monitor gameEvent** messages for game updates

## Environment Variables (Optional)

For development/testing, you can set:
- `SKIP_BOT_AUTH=true` - Bypass authentication requirements

## Tips for Postman Testing

1. Use Postman's Socket.IO event listeners to automatically log incoming events
2. Save common event payloads as Postman collections for quick testing
3. Use Postman environments to store botId and apiKey
4. Monitor the console for all incoming events
5. Test error cases by sending invalid data

## Example Test Sequence

```javascript
// 1. Connect to server
// 2. Send authenticate event
{
  "botId": "test-bot-123",
  "apiKey": "your-api-key-here"
}

// 3. List available games
// Send: game.list (no data)

// 4. Join a game
{
  "gameId": "test-game",
  "chipStack": 1000
}

// 5. When you receive turn.start, request possible actions
// Send: state.actions (no data)

// 6. Take an action
{
  "action": {
    "type": "check",
    "timestamp": 1234567890
  }
}
```

## Notes

- All timestamps are in milliseconds (Unix epoch)
- Bot authentication is required for most game actions
- Multiple bots can connect with different credentials
- Spectators see limited game state based on visibility rules
- Turn time limits are enforced server-side