import request from 'supertest';
import type { SuperAgentTest } from 'supertest';
import type { Server } from 'http';

export const getE2EAgent = (): SuperAgentTest => {
  const server = global.__E2E_SERVER__ as Server | null;
  if (!server) throw new Error('E2E server is not initialized');
  return request.agent(server) as unknown as SuperAgentTest;
};