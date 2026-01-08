import type { Server } from 'http';
import { startServer, stopServer } from './helpers/e2eServer.js';

declare global {
  var __E2E_SERVER__: Server | null;
  var __E2E_BASE_URL__: string | null;
}

beforeAll(async () => {
  const { server, port } = await startServer();
  global.__E2E_SERVER__ = server;
  global.__E2E_BASE_URL__ = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await stopServer();
  global.__E2E_SERVER__ = null;
  global.__E2E_BASE_URL__ = null;
});