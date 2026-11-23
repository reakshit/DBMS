const config = require('./config');
const app = require('./app');
const pool = require('./db');

const server = app.listen(config.port, () => {
  console.log(`Railway API listening on http://localhost:${config.port}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
