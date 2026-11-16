const { test } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2');
const { DatabaseService } = require('../dist/database/database.service');

async function withDatabaseEnvironment(url, tls, run) {
  const previousUrl = process.env.DATABASE_URL;
  const previousTls = process.env.DATABASE_SSL;
  process.env.DATABASE_URL = url;
  if (tls === undefined) delete process.env.DATABASE_SSL;
  else process.env.DATABASE_SSL = tls;
  try {
    return await run();
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousTls === undefined) delete process.env.DATABASE_SSL;
    else process.env.DATABASE_SSL = previousTls;
  }
}

test('existing MySQL configuration remains unchanged unless TLS is enabled', async () => {
  await withDatabaseEnvironment('mysql://test:local-only@localhost:3306/test', undefined, async () => {
    const db = new DatabaseService();
    try {
      assert.equal(db.sequelize.options.dialectOptions.ssl, undefined);
    } finally {
      await db.sequelize.close();
    }
  });
});

test('secure MySQL connections verify the certificate and server identity', async () => {
  await withDatabaseEnvironment('mysql://test:local-only@localhost:3306/test', 'true', async () => {
    const db = new DatabaseService();
    try {
      const ssl = db.sequelize.options.dialectOptions.ssl;
      assert.equal(ssl.rejectUnauthorized, true);
      assert.equal(ssl.verifyIdentity, true);
      assert.equal(ssl.minVersion, 'TLSv1.2');
    } finally {
      await db.sequelize.close();
    }
  });
});

test('secure mode refuses a MySQL server without TLS before authentication', async () => {
  let authenticated = false;
  const connections = new Set();
  const server = mysql.createServer();
  server.on('connection', connection => {
    connections.add(connection.stream);
    connection.stream.on('close', () => connections.delete(connection.stream));
    connection.on('error', () => {});
    connection.serverHandshake({
      protocolVersion: 10,
      serverVersion: '8.0.0-test',
      connectionId: 1,
      capabilityFlags: 0x00088201, // MySQL protocol 4.1, no CLIENT_SSL
      characterSet: 45,
      statusFlags: 2,
      authCallback: (_credentials, done) => {
        authenticated = true;
        done(null);
      },
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await withDatabaseEnvironment(`mysql://test:local-only@127.0.0.1:${server._server.address().port}/test`, 'true', async () => {
      const db = new DatabaseService();
      try {
        await assert.rejects(db.sequelize.connectionManager.getConnection(), /Server does not support secure connection/);
        assert.equal(authenticated, false);
      } finally {
        await db.sequelize.close();
      }
    });
  } finally {
    for (const socket of connections) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});

test('an invalid TLS setting fails before connecting', async () => {
  await withDatabaseEnvironment('mysql://test:local-only@localhost:3306/test', 'enabled', async () => {
    assert.throws(() => new DatabaseService(), /DATABASE_SSL must be true or false/);
  });
});
