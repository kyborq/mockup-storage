# 🗄️ Mockup Storage

[![npm version](https://img.shields.io/npm/v/mockup-storage.svg)](https://www.npmjs.com/package/mockup-storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Production-ready embedded database engine for Node.js and TypeScript**

Inspired by SQLite and MongoDB, Mockup Storage combines the simplicity of embedded databases with modern features like B-Tree indexing, binary storage, and relational capabilities. Perfect for serverless applications, testing, prototyping, and desktop apps.

```typescript
const storage = new MockStorage(schemas, { persister: { persist: true } });
const users = await storage.collection("users");
await users.add({ name: "Alice", email: "alice@example.com" });
```

---

## ✨ Why Mockup Storage?

- **🚀 Zero Configuration** - No server setup, no config files, just code
- **📦 Single File Database** - All data in one `.mdb` file (SQLite-style)
- **⚡ Fast** - B-Tree indexing provides O(log n) lookups
- **💾 Efficient** - Binary format is ~40% smaller than JSON
- **🔗 Relational** - SQL-like JOINs and foreign keys
- **🛡️ Type-Safe** - Full TypeScript support with schema inference
- **🔄 Auto-Commit** - Changes saved automatically within 100ms
- **🧵 Thread-Safe** - Built-in mutex locking for concurrent operations

---

## 📦 Installation

```bash
npm install mockup-storage
```

---

## 🚀 Quick Start

### Basic Example

```typescript
import { MockStorage, DatabaseSchemas } from "mockup-storage";

// Define schemas with full type safety
const schemas: DatabaseSchemas = {
  users: {
    name: { type: "string", required: true },
    email: { type: "string", index: true, unique: true },
    age: { type: "number", index: true },
  },
};

async function main() {
  // Initialize storage with persistence
  const storage = new MockStorage(schemas, {
    persister: { persist: true },
  });

  // Auto-loads from database.mdb if exists
  const users = await storage.collection("users");

  // Add records (auto-saved!)
  await users.add({
    name: "Alice",
    email: "alice@example.com",
    age: 28,
  });

  // Fast O(log n) lookup using index
  const alice = await users.findByField("email", "alice@example.com");
  console.log(alice);

  // Range queries
  const adults = await users.findByRange("age", 18, 65);
  console.log(adults);
}

main();
```

### Persistent Storage (Recommended)

All collections are stored in a **single binary file** (like SQLite):

```
./data/database.mdb  (contains ALL collections)
```

**Auto-commit is enabled by default** - changes are automatically saved within 100ms:

```typescript
const storage = new MockStorage(schemas, {
  persister: {
    persist: true, // Enable persistence
    autoCommit: true, // Auto-save (default)
    filepath: "./data/database", // Custom path (optional)
  },
});

const users = await storage.collection("users");
await users.add({ name: "Bob" }); // Automatically saved!
```

For manual control:

```typescript
const storage = new MockStorage(schemas, {
  persister: { persist: true, autoCommit: false },
});

await users.add({ name: "Bob" });
await storage.commitAll(); // Manual save
```

---

## 📚 Core Features

### 1. Declarative Schema System

Define schemas with indexes, constraints, and relations:

```typescript
const schemas: DatabaseSchemas = {
  users: {
    name: {
      type: "string",
      required: true,
    },
    email: {
      type: "string",
      index: true, // ⚡ Auto-creates index
      unique: true, // ✅ Unique constraint
    },
    age: {
      type: "number",
      index: true, // 📊 Fast range queries
    },
  },
};

// Indexes are created automatically!
const users = await storage.collection("users");
```

**Supported types**: `string`, `number`, `boolean`, `datetime`

### 2. High-Performance Indexing

Indexes provide **O(log n)** lookups vs **O(n)** full scans:

```typescript
// ⚡ Indexed lookup - O(log n)
const user = await users.findByField("email", "alice@example.com");

// 📊 Range query - O(log n)
const young = await users.findByRange("age", 18, 30);

// 📈 Get index statistics
const stats = users.getIndexStats();
console.log(stats); // { name, field, unique, size }
```

### 3. CRUD Operations

```typescript
// Create
const user = await users.add({ name: "Alice", email: "alice@ex.com", age: 28 });

// Read
const alice = await users.get(user.id);
const all = await users.all();
const filtered = await users.find((u) => u.age >= 18);
const first = await users.first((u) => u.name === "Alice");

// Update
await users.update(user.id, { age: 29 });

// Delete
await users.remove(user.id);
```

### 4. Relations & JOINs (SQL-like)

Create relationships between collections with full type safety:

```typescript
const schemas: DatabaseSchemas = {
  users: {
    name: { type: "string" },
    email: { type: "string", unique: true, index: true },
  },
  posts: {
    userId: { type: "string", index: true }, // Foreign key
    title: { type: "string" },
    content: { type: "string" },
  },
};

const storage = new MockStorage(schemas, { persister: { persist: true } });
const users = await storage.collection("users");
const posts = await storage.collection("posts");

// Create records
const alice = await users.add({ name: "Alice", email: "alice@ex.com" });
await posts.add({ userId: alice.id, title: "Hello", content: "World" });

// Define relation
await users.createIndex({ name: "id_idx", field: "id" as any, unique: true });

const relation = storage.defineRelation({
  name: "user_posts",
  sourceCollection: "posts",
  targetCollection: "users",
  sourceField: "userId",
  targetField: "id" as any,
  type: "one-to-many",
  onDelete: "cascade", // Delete posts when user deleted
});

// INNER JOIN
const postsWithAuthors = await relation.innerJoin();
postsWithAuthors.forEach((p) => {
  console.log(`"${p.title}" by ${p.joined?.name}`);
});

// LEFT JOIN (all posts, with user or null)
const allPosts = await relation.leftJoin();

// Validate integrity
const integrity = await relation.validateIntegrity();
console.log(`Valid: ${integrity.valid}`);
```

**Relation types**: `one-to-one`, `one-to-many`, `many-to-one`, `many-to-many`  
**Cascade options**: `cascade`, `set-null`, `restrict`

### 5. Binary Storage Format

Binary format provides significant advantages over JSON:

| Format | Size | Speed     |
| ------ | ---- | --------- |
| JSON   | 100% | Baseline  |
| Binary | ~60% | ⚡ Faster |

**Benefits:**

- 40% smaller file sizes
- Faster read/write operations
- Index preservation across restarts
- Type-safe serialization

### 6. Migration Utilities

Migrate between storage formats:

```typescript
import { Migration } from "mockup-storage";

// Migrate JSON → Binary
const result = await Migration.jsonToBinary();
console.log(`Migrated ${result.collectionsProcessed} collections`);
console.log(`Size reduction: ${(result.compressionRatio * 100).toFixed(1)}%`);

// Analyze storage
const analysis = await Migration.analyze();
console.log("JSON collections:", analysis.jsonCollections.length);
console.log("Binary collections:", analysis.binaryCollections.length);
console.log("Potential savings:", analysis.potentialSavings, "bytes");

// Validate all collections
const validation = await Migration.validate();
console.log("All valid:", validation.valid);
```

---

## 🎯 API Reference

### MockStorage

Central storage manager for collections and persistence.

```typescript
constructor(schemas: DatabaseSchemas, config?: MockStorageConfig)
```

**Methods:**

| Method                   | Description                         |
| ------------------------ | ----------------------------------- |
| `collection<K>(name: K)` | Get or create a collection (async)  |
| `commitAll()`            | Save all collections to disk        |
| `commit(name)`           | Save specific collection            |
| `listCollections()`      | Get all collection names            |
| `hasCollection(name)`    | Check if collection exists          |
| `getHealth()`            | Get database health info            |
| `defineRelation(config)` | Create relation between collections |
| `listRelations()`        | Get all relation names              |
| `validateRelations()`    | Validate referential integrity      |

### MockCollection

In-memory collection with CRUD and query operations.

**CRUD:**

- `add(value)` - Create record (O(log n))
- `get(id)` - Get by ID (O(log n))
- `all()` - Get all records
- `update(id, updates)` - Update record
- `remove(id)` - Delete record (O(log n))

**Queries:**

- `find(filter)` - Filter records
- `first(filter)` - Get first match
- `findByField(field, value)` - Indexed lookup (O(log n))
- `findByRange(field, min, max)` - Range query (O(log n))

**Indexes:**

- `createIndex(config)` - Create index
- `dropIndex(name)` - Remove index
- `listIndexes()` - List all indexes
- `getIndexStats()` - Get index statistics

**Events:**

- `onModify(callback)` - Subscribe to changes
- `offModify(callback)` - Unsubscribe

### Types

```typescript
// Schema definition
type DatabaseSchemas = Record<string, CollectionSchema>;

type CollectionSchema = Record<string, FieldDefinition>;

interface FieldDefinition {
  type: "string" | "number" | "boolean" | "datetime";
  index?: boolean; // Create index
  unique?: boolean; // Unique constraint
  required?: boolean; // Required field
  default?: any; // Default value
  relation?: {
    // Foreign key
    collection: string;
    type: RelationType;
    onDelete?: "cascade" | "set-null" | "restrict";
  };
}
```

---

## 📊 Performance Benchmarks

### Query Performance (1000 records)

| Operation    | Without Index | With Index        | Improvement     |
| ------------ | ------------- | ----------------- | --------------- |
| Get by ID    | 2.3ms (O(n))  | 0.01ms (O(log n)) | **230x faster** |
| Range query  | 3.1ms (O(n))  | 0.02ms (O(log n)) | **155x faster** |
| Field lookup | 2.8ms (O(n))  | 0.01ms (O(log n)) | **280x faster** |

### Storage Size (1000 user records)

- **JSON**: 245 KB
- **Binary**: 147 KB (**40% savings**)

---

## 🎯 Use Cases

### ✅ Perfect For

- **Serverless Functions** - Embedded DB with zero configuration
- **Testing & Mocking** - Fast in-memory database for tests
- **Rapid Prototyping** - Start coding immediately
- **Desktop Apps** - Electron/Tauri apps with local storage
- **CLI Tools** - Persistent storage for command-line apps
- **Edge Computing** - Lightweight DB for edge runtimes
- **Embedded Systems** - Low-footprint storage for IoT devices

### ⚠️ Consider Alternatives For

- Distributed systems requiring multi-node coordination
- Workloads exceeding several GB of data
- Heavy concurrent writes (1000+ writes/sec)
- Real-time replication requirements

---

## 🔧 Advanced Usage

### Complex Schemas

```typescript
const schemas: DatabaseSchemas = {
  products: {
    sku: { type: "string", unique: true, index: true },
    name: { type: "string", required: true },
    price: { type: "number", index: true },
    stock: { type: "number" },
    createdAt: { type: "datetime" },
    categoryId: {
      type: "string",
      index: true,
      relation: {
        collection: "categories",
        type: "many-to-one",
        onDelete: "restrict",
      },
    },
  },
  categories: {
    name: { type: "string", required: true, unique: true },
  },
};
```

### Health Monitoring

```typescript
// Get overall health
const health = await storage.getHealth();
console.log(`Database: ${health.databasePath}`);
console.log(`Total size: ${health.totalSize} bytes`);
console.log(`Collections: ${health.collections.length}`);

// Get specific collection health
const userHealth = await storage.getCollectionHealth("users");
console.log(`Records: ${userHealth.count}`);
```

### Custom Database Path

```typescript
const storage = new MockStorage(schemas, {
  persister: {
    persist: true,
    filepath: "./custom/path/mydb", // Saves to: ./custom/path/mydb.mdb
  },
});
```

---

## 🧪 Testing

Mockup Storage is perfect for testing:

```typescript
// test/users.test.ts
import { MockStorage, DatabaseSchemas } from "mockup-storage";

describe("User operations", () => {
  let storage: MockStorage<any>;

  beforeEach(async () => {
    const schemas: DatabaseSchemas = {
      users: {
        name: { type: "string" },
        email: { type: "string", unique: true },
      },
    };

    // In-memory only (no persistence)
    storage = new MockStorage(schemas);
  });

  it("should add user", async () => {
    const users = await storage.collection("users");
    const user = await users.add({ name: "Alice", email: "alice@ex.com" });

    expect(user.name).toBe("Alice");
    expect(user.id).toBeDefined();
  });
});
```

---

## 📝 Examples

Check the [examples](./src/example.ts) directory for more usage patterns:

```bash
npm run dev  # Run example
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

Please ensure:

- TypeScript types are maintained
- Async patterns are used consistently
- Code follows existing style

---

## 📄 License

MIT © [Konstantin Podyganov](mailto:k.podyganov@mail.ru)

---

## 🔗 Links

- **GitHub**: [github.com/kyborq/mockup-storage](https://github.com/kyborq/mockup-storage)
- **npm**: [npmjs.com/package/mockup-storage](https://www.npmjs.com/package/mockup-storage)
- **Issues**: [Report bugs](https://github.com/kyborq/mockup-storage/issues)

---

## 📋 Changelog

### v3.2.3 (Current)

- Single database file architecture (.mdb)
- Enhanced schema system with declarative indexes
- Relations and JOIN support
- Auto-commit enabled by default
- Thread-safe operations with mutex locks
- Migration utilities
- Full TypeScript support

---

**Made with ❤️ for developers who need a simple, fast, embedded database**
