import { MongoClient, MongoServerError } from "mongodb";

const MONGO_URI = "mongodb://mongo1:27017";
const REPLICA_SET_NAME = "rs0";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ReplMember = {
  name: string;
  stateStr: string;
  [key: string]: unknown;
};

type ReplMemberConfig = {
  _id: number;
  host: string;
  priority?: number;
  arbiterOnly?: boolean;
};

const REPLICA_SET_MEMBERS: ReplMemberConfig[] = [
  { _id: 0, host: "mongo1:27017", priority: 2 },
  { _id: 1, host: "mongo2:27017", priority: 1 },
  { _id: 2, host: "mongo3:27017", priority: 0, arbiterOnly: true },
];

async function waitForMongo(timeoutMs = 120_000): Promise<void> {
  const client = new MongoClient(MONGO_URI);
  const start = Date.now();

  try {
    while (Date.now() - start < timeoutMs) {
      try {
        await client.connect();
        await client.db().admin().ping();
        console.log("✅ Mongo is ready");
        return;
      } catch {
        console.warn("⏳ Waiting for MongoDB to be ready...");
        await sleep(3000);
      }
    }
    throw new Error("MongoDB not ready within timeout");
  } finally {
    await client.close().catch(() => {});
  }
}

async function waitForAllMembers(
  members: ReplMemberConfig[],
  timeoutMs = 120_000,
): Promise<void> {
  const start = Date.now();
  const memberHosts = members.map((m) => m.host);

  while (Date.now() - start < timeoutMs) {
    let allReady = true;
    for (const host of memberHosts) {
      const client = new MongoClient(`mongodb://${host}`);
      try {
        await client.connect();
        await client.db().admin().ping();
        await client.close();
      } catch {
        console.warn(`⏳ Member ${host} not ready yet`);
        allReady = false;
        break;
      }
    }
    if (allReady) {
      console.log("✅ All replica set members are ready");
      return;
    }
    await sleep(3000);
  }
  throw new Error("Not all members ready within timeout");
}

async function waitForPrimary(
  client: MongoClient,
  timeoutMs = 60_000,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const status = (await client
      .db("admin")
      .command({ replSetGetStatus: 1 })) as { members: ReplMember[] };
    const primary = status.members.find(
      (m: ReplMember) => m.stateStr === "PRIMARY",
    );

    if (primary) {
      console.log(`✅ PRIMARY is up: ${primary.name}`);
      return;
    }

    console.log("⏳ Waiting for PRIMARY election...");
    await sleep(3000);
  }

  throw new Error("Replica set did not elect a PRIMARY within timeout");
}

async function initReplicaSet(): Promise<void> {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const adminDb = client.db("admin");

    try {
      await adminDb.command({ replSetGetStatus: 1 });
      console.log("✅ Replica set already initialized");
      return;
    } catch (err: unknown) {
      if (
        !(
          err instanceof MongoServerError &&
          err.codeName === "NotYetInitialized"
        )
      ) {
        throw err;
      }
      console.log("ℹ️ Replica set not initialized, proceeding...");
    }

    console.log("⏳ Waiting for all members to be reachable...");
    // await waitForAllMembers(REPLICA_SET_MEMBERS);

    console.log("🚀 Initializing replica set...");

    await adminDb.command({
      replSetInitiate: {
        _id: REPLICA_SET_NAME,
        members: REPLICA_SET_MEMBERS,
      },
    });

    await waitForPrimary(client);
    console.log("✅ Replica set initialized successfully");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Replica set initialization failed:", message);
    process.exit(1);
  } finally {
    await client.close().catch(() => {});
  }
}

async function bootstrap(): Promise<void> {
  try {
    console.log("⏳ Waiting for MongoDB containers...");
    await waitForMongo();
    await initReplicaSet();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Initialization error:", message);
    process.exit(1);
  }
}

bootstrap();
