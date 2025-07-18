/**
 * PokaiEngine - Main Entry Point
 * 
 * This is the main entry point for the PokaiEngine application.
 * It exports the server class and starts the server when run directly.
 */

import { PokaiExpressServer } from './services/server';

// Export the server class for programmatic usage
export { PokaiExpressServer };

// Start the server if this file is run directly
if (require.main === module) {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const server = new PokaiExpressServer(port);
  
  try {
    server.start();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}