// A real MongoDB for tests, with nothing to install by hand.
//  - TEST_MONGO_URI set  -> use that server (a throw-away database; never point it at real data).
//  - otherwise           -> start `mongodb-memory-server` (a devDependency; downloads mongod once and caches it).
//  - neither available   -> `available()` is false and the test skips with a clear message.
let memory = null;
const hasMemoryServer = () => { try { require.resolve('mongodb-memory-server'); return true; } catch { return false; } };
const available = () => !!process.env.TEST_MONGO_URI || hasMemoryServer();
const skipReason = () => (available() ? false : 'run `npm install` in web/server (mongodb-memory-server) or set TEST_MONGO_URI to run the database tests');

async function start() {
  if (process.env.TEST_MONGO_URI) return process.env.TEST_MONGO_URI;
  const { MongoMemoryServer } = require('mongodb-memory-server');
  memory = await MongoMemoryServer.create();
  return memory.getUri('flexfit_test');
}
async function stop() { if (memory) { await memory.stop(); memory = null; } }

module.exports = { available, skipReason, start, stop };
