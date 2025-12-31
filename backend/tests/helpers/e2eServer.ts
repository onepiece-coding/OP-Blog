import http from 'http';
import app from '../../src/app.js';

let server: http.Server | null = null;

export async function startServer(port = 0) {
  return new Promise<{ server: http.Server; port: number }>((resolve, reject) => {
    server = app.listen(port, function (this: http.Server) {
      const address = this.address();
      if (!address) return reject(new Error('Failed to start server'));
      const boundPort = typeof address === 'string' ? 0 : address.port;
      resolve({ server: this, port: boundPort });
    });
  });
}

export async function stopServer() {
  if (!server) return;
  return new Promise<void>((resolve, reject) => {
    server!.close((err?: Error) => {
      if (err) return reject(err);
      server = null;
      resolve();
    });
  });
}