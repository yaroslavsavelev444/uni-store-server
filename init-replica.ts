const { MongoClient } = require("mongodb");

const MONGO_PRIMARY = "mongodb://mongo1:27017";

async function waitForMongo(timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const client = new MongoClient(MONGO_PRIMARY);
      await client.connect();
      await client.db().admin().ping();
      await client.close();
      console.log("✅ Mongo is ready");
      return true;
    } catch (err) {
      console.log("⏳ Waiting for MongoDB to be ready...");
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("MongoDB not ready within timeout");
}

async function waitForPrimary(client, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const status = await client.db("admin").command({ replSetGetStatus: 1 });
    const primary = status.members.find((m) => m.stateStr === "PRIMARY");
    if (primary) {
      console.log(`✅ PRIMARY is up: ${primary.name}`);
      return;
    }
    console.log("⏳ Waiting for PRIMARY election...");
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Replica set did not elect a PRIMARY within timeout");
}

async function initReplicaSet() {
  const client = new MongoClient(MONGO_PRIMARY);
  try {
    await client.connect();
    const admin = client.db("admin");

    try {
      const status = await admin.command({ replSetGetStatus: 1 });
      console.log("✅ Replica set already initialized:", status.set);
      return;
    } catch (err) {
      if (err.codeName === "NotYetInitialized") {
        console.log("ℹ️ Replica set not initialized yet, proceeding...");
      } else {
        throw err; // пробрасываем фатальные ошибки
      }
    }

    console.log("🚀 Initializing replica set...");
    await admin.command({
      replSetInitiate: {
        _id: "rs0",
        members: [
          { _id: 0, host: "mongo1:27017", priority: 2 },
          { _id: 1, host: "mongo2:27017", priority: 1 },
          { _id: 2, host: "mongo3:27017", priority: 0, arbiterOnly: true },
        ],
      },
    });

    // ждём, пока станет доступен PRIMARY
    await waitForPrimary(client);
    console.log("✅ Replica set initialized successfully");
  } catch (err) {
    console.error("❌ Replica set initialization failed:", err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

(async () => {
  try {
    console.log("⏳ Waiting for MongoDB containers...");
    await waitForMongo();
    await initReplicaSet();
  } catch (err) {
    console.error("❌ Initialization error:", err.message);
    process.exit(1);
  }
})();