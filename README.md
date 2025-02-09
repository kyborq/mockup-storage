# Mockup Storage

[![npm version](https://img.shields.io/npm/v/mockup-storage.svg)](https://www.npmjs.com/package/mockup-storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight, asynchronous mock storage solution for testing and prototyping, featuring thread‑safe in‑memory collections with optional file system persistence. Ideal for multi‑user server applications.

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

### Persistent Storage

Enable persistence to automatically save your collections to JSON files under the `.mock` directory.

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
  // Configure storage with persistence enabled globally
  const storage = new MockStorage(schemas, {
    persister: { persist: true },
  });

  // Get the persistent "users" collection
  const users = await storage.collection("users");

  // Data will be saved to `.mock/users-collection.json`
  await users.add({ name: "Charlie", age: 25 });

  // On subsequent runs, persisted data will be auto‑loaded
  const allUsers = await users.all();
  console.log(allUsers);
}

persistentExample();
```

---

## Features

- **Asynchronous API**: All operations return Promises for non‑blocking execution.
- **Type Safety**: Define collection schemas for automatic data validation.
- **Thread‑Safe**: Built‑in locking ensures safe concurrent operations.
- **In‑Memory Storage**: Fast, ephemeral data storage.
- **CRUD Operations**: Create, read, update, and delete records.
- **Query Support**: Filter and find records with predicate functions.
- **File Persistence**: Optional JSON file storage.
- **Modification Events**: Subscribe to collection changes.

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

## Persistence

Data is stored in JSON files under the `.mock` directory in your project root. Each collection is saved as:

```
.mock/{collection-name}-collection.json
```

File operations are performed asynchronously with proper locking to ensure data consistency.

### Persistence Configuration

You can configure persistence globally (via the `MockStorage` constructor) or per collection when you call `collection()`.

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

  // Enable persistence for the "temp" collection
  const tempCollection = await storage.collection("temp", { persist: true });

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

An in‑memory collection with CRUD and query operations.

**Methods**:

- **`add(value: InferSchemaType<T>): Promise<MockView<InferSchemaType<T>>>`**  
  Add a new record (async).
- **`all(): Promise<MockView<InferSchemaType<T>>[]>`**  
  Retrieve all records (async).
- **`find(predicate: MockFilter<InferSchemaType<T>>): Promise<MockView<InferSchemaType<T>>[]>`**  
  Filter records (async).
- **`first(predicate: MockFilter<InferSchemaType<T>>): Promise<MockView<InferSchemaType<T>> | null>`**  
  Find the first matching record (async).
- **`remove(id: string): Promise<boolean>`**  
  Delete a record by ID (async).
- **`onModify(callback: () => void): void`**  
  Subscribe to modification events.
- **`offModify(callback: () => void): void`**  
  Unsubscribe from modification events.

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

**Note**: Although designed to handle concurrency, this package is primarily intended for testing and prototyping. For production workloads at scale, consider using dedicated database solutions.
