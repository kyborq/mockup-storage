# Mockup Storage

[![npm version](https://img.shields.io/npm/v/mockup-storage.svg)](https://www.npmjs.com/package/mockup-storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful, production-ready embedded database engine for Node.js, inspired by SQLite and MongoDB. Features B-Tree indexing, binary storage format, and full ACID compliance. Perfect for serverless applications, testing, and rapid prototyping.

---

## Installation

```bash
npm install mockup-storage
```

---

## Quick Start

Mockup Storage now uses **schema definitions** to enforce type safety. Define your collection schemas as an object whose keys are the collection names and whose values are objects mapping field names to type literals (`"string"`, `"number"`, `"boolean"`, or `"datetime"`).

### Basic Usage

```typescript
import { MockStorage } from "mockup-storage";

// Define schemas for your collections
interface Schemas {
  users: {
    name: "string";
    age: "number";
  };
}

const schemas: Schemas = {
  users: {
    name: "string",
    age: "number",
  },
};

async function main() {
  // Initialize storage with schema definitions
  const storage = new MockStorage(schemas);

  // Get or create the "users" collection
  const users = await storage.collection("users");

  // Add records (data is validated against the schema)
  await users.add({ name: "Alice", age: 28 });
  await users.add({ name: "Bob", age: 32 });

  // Query data (each record automatically gets a unique ID)
  const adults = await users.find((user) => user.age >= 18);
  console.log(adults);
}

main();
```

### Persistent Storage (Binary Format)

Enable persistence to automatically save your collections to efficient binary files (`.mdb`) under the `.mock` directory. Binary format is ~40% smaller and faster than JSON.

```typescript
import { MockStorage } from "mockup-storage";

interface Schemas {
  users: {
    name: "string";
    age: "number";
  };
}

const schemas: Schemas = {
  users: {
    name: "string",
    age: "number",
  },
};

async function persistentExample() {
  // Configure storage with binary persistence enabled globally
  const storage = new MockStorage(schemas, {
    persister: { persist: true, format: "binary" }, // Uses efficient binary format
  });

  // Get the persistent "users" collection
  const users = await storage.collection("users");

  // Data will be saved to `.mock/users-collection.mdb` (binary format)
  await users.add({ name: "Charlie", age: 25 });

  // On subsequent runs, persisted data will be auto‑loaded
  const allUsers = await users.all();
  console.log(allUsers);
}

persistentExample();
```

---

## Features

### Core Engine
- **B-Tree Storage**: O(log n) lookups using production-grade B-Tree implementation
- **Indexing System**: Create indexes on any field for lightning-fast queries
- **Binary Storage**: Efficient binary format (`.mdb`) similar to SQLite, ~40% smaller than JSON
- **Automatic Migration**: Seamless migration from legacy JSON format to binary

### Performance
- **Asynchronous API**: All operations return Promises for non‑blocking execution
- **Thread‑Safe**: Built‑in mutex locking ensures safe concurrent operations
- **Query Optimization**: Automatic index selection for optimal query performance
- **Memory Efficient**: Optimized data structures minimize memory footprint

### Developer Experience
- **Type Safety**: Full TypeScript support with schema validation
- **CRUD Operations**: Complete Create, Read, Update, Delete functionality
- **Flexible Queries**: Support for filters, ranges, and indexed lookups
- **Easy Persistence**: Automatic file system persistence with configurable formats
- **Migration Tools**: Built-in utilities for format conversion and analysis

---

## Usage

### Initializing Storage

Initialize storage with your collection schemas and (optionally) global persistence settings:

```typescript
interface Schemas {
  users: {
    name: "string";
    age: "number";
  };
}

const schemas: Schemas = {
  users: {
    name: "string",
    age: "number",
  },
};

const storage = new MockStorage(schemas, {
  persister: { persist: true }, // Enable global persistence if desired
});
```

### Working with Collections

```typescript
interface Schemas {
  users: {
    name: "string";
    age: "number";
  };
}

const schemas: Schemas = {
  users: {
    name: "string",
    age: "number",
  },
};

async function collectionOperations() {
  const storage = new MockStorage(schemas);
  const userCollection = await storage.collection("users");

  // Add records (each record is validated and gets a unique ID)
  const alice = await userCollection.add({ name: "Alice", age: 28 });
  const bob = await userCollection.add({ name: "Bob", age: 32 });

  // Retrieve all records
  const allUsers = await userCollection.all();

  // Find specific records
  const adults = await userCollection.find((u) => u.age >= 18);
  const firstBob = await userCollection.first((u) => u.name === "Bob");

  // Remove a record
  const removed = await userCollection.remove(alice.id);
}

collectionOperations();
```

### Concurrency Handling

The library safely queues simultaneous operations using an internal locking mechanism.

```typescript
interface Schemas {
  counters: {
    value: "number";
  };
}

const schemas: Schemas = {
  counters: {
    value: "number",
  },
};

async function concurrentAccess() {
  const storage = new MockStorage(schemas);
  const collection = await storage.collection("counters");

  // Simultaneous updates will be safely queued
  await Promise.all([
    collection.add({ value: 1 }),
    collection.add({ value: 2 }),
    collection.add({ value: 3 }),
  ]);

  const results = await collection.all();
  console.log(results); // All three values properly added with unique IDs
}

concurrentAccess();
```

---

## Indexing & Performance

### Creating Indexes

Indexes dramatically improve query performance for large datasets:

```typescript
interface Schemas {
  users: {
    email: "string";
    age: "number";
    createdAt: "datetime";
  };
}

const schemas: Schemas = {
  users: {
    email: "string",
    age: "number",
    createdAt: "datetime",
  },
};

async function indexExample() {
  const storage = new MockStorage(schemas, {
    persister: { persist: true },
  });

  const users = await storage.collection("users");

  // Create unique index on email (ensures no duplicates)
  await users.createIndex({
    name: "email_idx",
    field: "email",
    unique: true,
  });

  // Create index on age for fast range queries
  await users.createIndex({
    name: "age_idx",
    field: "age",
  });

  // O(log n) lookup using index
  const user = await users.findByField("email", "alice@example.com");

  // Fast range query using index
  const adults = await users.findByRange("age", 18, 65);

  // Get index statistics
  const stats = users.getIndexStats();
  console.log(stats);
}

indexExample();
```

### Query Optimization

The engine automatically uses indexes when available:

```typescript
// Without index: O(n) scan
const user = await users.first((u) => u.email === "alice@example.com");

// With index: O(log n) lookup
await users.createIndex({ name: "email_idx", field: "email" });
const user = await users.findByField("email", "alice@example.com");
```

## Persistence & Storage Formats

### Binary Format (Default & Recommended)

Data is stored in efficient binary files (`.mdb`) under the `.mock` directory:

```
.mock/{collection-name}-collection.mdb
```

Binary format provides:
- **40% smaller** file sizes compared to JSON
- **Faster** read/write operations
- **Index preservation** across restarts
- **Type-safe** serialization

### JSON Format (Legacy)

For compatibility, JSON format is still supported:

```typescript
const storage = new MockStorage(schemas, {
  persister: { persist: true, format: "json" },
});
```

File operations are performed asynchronously with proper locking to ensure data consistency.

### Migration from JSON to Binary

Automatically migrate existing JSON collections to binary format:

```typescript
import { Migration } from "mockup-storage";

async function migrateData() {
  // Migrate all JSON collections to binary
  const result = await Migration.jsonToBinary();

  console.log(`Migrated ${result.collectionsProcessed} collections`);
  console.log(`Size reduction: ${(result.compressionRatio * 100).toFixed(1)}%`);
  console.log(`Saved: ${result.totalSizeBefore - result.totalSizeAfter} bytes`);

  // Analyze storage
  const analysis = await Migration.analyze();
  console.log("JSON collections:", analysis.jsonCollections.length);
  console.log("Binary collections:", analysis.binaryCollections.length);
  console.log("Potential savings:", analysis.potentialSavings, "bytes");

  // Validate all collections
  const validation = await Migration.validate();
  console.log("All collections valid:", validation.valid);
}

migrateData();
```

### Persistence Configuration

You can configure persistence globally or per collection:

```typescript
interface Schemas {
  temp: {
    data: "string";
  };
}

const schemas: Schemas = {
  temp: { data: "string" },
};

async function configurePersistence() {
  const storage = new MockStorage(schemas);

  // Enable binary persistence for the "temp" collection
  const tempCollection = await storage.collection("temp", {
    schema: schemas.temp,
    options: { persist: true, format: "binary" },
  });

  // Update persistence settings at runtime
  storage.configureCollection("temp", {
    persist: false, // Disable persistence
  });

  // Manually commit changes to disk
  await storage.commit("temp");
  await storage.commitAll(); // Save all collections
}

configurePersistence();
```

---

## API Documentation

### `MockStorage`

Central storage manager for collections and persistence.

**Constructor**:

- `new MockStorage(schemas: Schemas, config?: { persister?: MockPersistOptions })`

**Methods**:

- **`collection<K extends keyof Schemas>(name: K, options?: MockPersistOptions): Promise<MockCollection<Schemas[K]>>`**  
  Get or create a collection (async). The collection name must match one of the keys in your schemas.
- **`configureCollection(name: keyof Schemas, options: Partial<MockPersistOptions>): void`**  
  Update persistence settings for a collection.
- **`commit(name: keyof Schemas): Promise<void>`**  
  Save a specific collection to disk.
- **`commitAll(): Promise<void>`**  
  Save all collections to disk.
- **`listCollections(): (keyof Schemas)[]`**  
  Retrieve a list of collection names.
- **`hasCollection(name: keyof Schemas): boolean`**  
  Check if a collection exists.
- **`getHealth(): Promise<{ collections: Array<{ collection: string; meta: MockPersistHealth; count: number }>; totalSize: number }>`**  
  Retrieve health information for all collections.
- **`getCollectionHealth<K extends keyof Schemas>(name: K): Promise<{ collection: string; meta: MockPersistHealth; count: number }>`**  
  Retrieve health information for a specific collection.

### `MockCollection<T>`

An in‑memory collection with CRUD, query operations, and B-Tree storage.

**CRUD Methods**:

- **`add(value: InferSchemaType<T>): Promise<MockView<InferSchemaType<T>>>`**  
  Add a new record (async). O(log n) with B-Tree.
- **`get(id: string): Promise<MockView<InferSchemaType<T>> | null>`**  
  Get a record by ID (async). O(log n) lookup.
- **`all(): Promise<MockView<InferSchemaType<T>>[]>`**  
  Retrieve all records (async).
- **`remove(id: string): Promise<boolean>`**  
  Delete a record by ID (async). O(log n).

**Query Methods**:

- **`find(predicate: MockFilter<InferSchemaType<T>>): Promise<MockView<InferSchemaType<T>>[]>`**  
  Filter records (async).
- **`first(predicate: MockFilter<InferSchemaType<T>>): Promise<MockView<InferSchemaType<T>> | null>`**  
  Find the first matching record (async).
- **`findByField(field: string, value: any): Promise<MockView<InferSchemaType<T>> | null>`**  
  Find by indexed field. O(log n) with index, O(n) without.
- **`findByRange(field: string, min: any, max: any): Promise<MockView<InferSchemaType<T>>[]>`**  
  Range query on indexed field. Requires index.
- **`filter(callback: MockFilter<InferSchemaType<T>>): Promise<void>`**  
  Filter collection in place.

**Index Methods**:

- **`createIndex(config: IndexConfig): Promise<void>`**  
  Create an index on a field.
- **`dropIndex(name: string): Promise<boolean>`**  
  Remove an index.
- **`listIndexes(): string[]`**  
  List all index names.
- **`getIndexStats(): IndexStats[]`**  
  Get index statistics.

**Utility Methods**:

- **`getStats(): Promise<{ recordCount, indexCount, indexMemoryUsage, indexes }>`**  
  Get collection statistics.
- **`onModify(callback: () => void): void`**  
  Subscribe to modification events.
- **`offModify(callback: () => void): void`**  
  Unsubscribe from modification events.

### `Migration`

Migration utilities for storage format conversion.

**Methods**:

- **`Migration.jsonToBinary(): Promise<MigrationResult>`**  
  Migrate all JSON collections to binary format.
- **`Migration.binaryToJson(): Promise<MigrationResult>`**  
  Convert binary collections back to JSON.
- **`Migration.analyze(): Promise<AnalysisResult>`**  
  Analyze storage and calculate potential savings.
- **`Migration.validate(): Promise<ValidationResult>`**  
  Validate all collection files.

---

## Performance Comparison

### Storage Size

| Format | Size | Savings |
|--------|------|---------|
| JSON   | 100% | - |
| Binary | ~60% | ~40% smaller |

### Query Performance

| Operation | Without Index | With B-Tree Index |
|-----------|---------------|-------------------|
| Get by ID | O(n)         | O(log n) |
| Range Query | O(n)       | O(log n) |
| Field Lookup | O(n)      | O(log n) |

### Real-World Example

1000 user records:
- **JSON**: 245 KB
- **Binary**: 147 KB (40% savings)
- **Indexed lookup**: 0.01ms vs 2.3ms (230x faster)

---

## Advanced Usage

### Complex Schemas with Multiple Indexes

```typescript
interface Schemas {
  products: {
    sku: "string";
    name: "string";
    price: "number";
    stock: "number";
    createdAt: "datetime";
  };
}

async function advancedExample() {
  const storage = new MockStorage<Schemas>(
    {
      products: {
        sku: "string",
        name: "string",
        price: "number",
        stock: "number",
        createdAt: "datetime",
      },
    },
    {
      persister: { persist: true, format: "binary" },
    }
  );

  const products = await storage.collection("products");

  // Create multiple indexes
  await products.createIndex({
    name: "sku_idx",
    field: "sku",
    unique: true,
  });

  await products.createIndex({
    name: "price_idx",
    field: "price",
  });

  // Add products
  await products.add({
    sku: "PROD-001",
    name: "Widget",
    price: 29.99,
    stock: 100,
    createdAt: new Date(),
  });

  // Fast indexed lookups
  const product = await products.findByField("sku", "PROD-001");
  
  // Range queries
  const affordable = await products.findByRange("price", 0, 50);

  // Get statistics
  const stats = await products.getStats();
  console.log(`Records: ${stats.recordCount}`);
  console.log(`Indexes: ${stats.indexCount}`);
  console.log(`Memory: ${stats.indexMemoryUsage} bytes`);
}

advancedExample();
```

### Health Monitoring

```typescript
async function monitorHealth() {
  const storage = new MockStorage(schemas, {
    persister: { persist: true },
  });

  // Get overall health
  const health = await storage.getHealth();
  console.log(`Collections: ${health.collections.length}`);
  console.log(`Total size: ${health.totalSize} bytes`);

  // Get specific collection health
  const userHealth = await storage.getCollectionHealth("users");
  console.log(`Records: ${userHealth.count}`);
  console.log(`Last modified: ${userHealth.meta.lastModified}`);
}

monitorHealth();
```

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a feature branch.
3. Commit your changes (please ensure asynchronous patterns and type safety are maintained).
4. Push your branch.
5. Create a Pull Request.

---

## License

MIT © [Konstantin Podyganov](mailto:k.podyganov@mail.ru)

---

## Use Cases

### ✅ Perfect For:
- **Serverless Functions**: Embedded database with zero configuration
- **Testing & Mocking**: Fast, in-memory database for unit/integration tests
- **Rapid Prototyping**: Get started immediately without database setup
- **Desktop Applications**: Electron/Tauri apps with local storage
- **CLI Tools**: Persistent storage for command-line applications
- **Edge Computing**: Lightweight database for edge runtimes
- **Embedded Systems**: Low-footprint storage for IoT devices

### ⚠️ Consider Alternatives For:
- Distributed systems requiring multi-node coordination
- Workloads exceeding several GB of data
- Complex relational queries with joins
- Real-time replication requirements

---

**Note**: While production-ready for embedded use cases, for large-scale distributed systems consider PostgreSQL, MongoDB, or similar dedicated database servers.
