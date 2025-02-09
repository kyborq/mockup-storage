# Mockup Storage

[![npm version](https://img.shields.io/npm/v/mockup-storage.svg)](https://www.npmjs.com/package/mockup-storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight, asynchronous mock storage solution for testing and prototyping, featuring thread-safe in-memory collections with file system persistence. Ideal for multi-user server applications.

## Installation

```bash
npm install mockup-storage
```

## Quick Start

### Basic Usage

```typescript
import { MockStorage } from "mockup-storage";

async function main() {
  // Initialize storage
  const storage = new MockStorage();

  // Get/create a collection
  const users = await storage.collection<User>("users");

  // Add records
  await users.add({ name: "Alice", age: 28 });
  await users.add({ name: "Bob", age: 32 });

  // Query data
  const adults = await users.find((user) => user.age >= 18);
  console.log(adults); // Array of matching records
}

main();
```

### Persistent Storage

```typescript
async function persistentExample() {
  // Configure storage with persistence
  const storage = new MockStorage({
    persister: { persist: true },
  });

  // Get persistent collection
  const users = await storage.collection<User>("users");

  // Data will be saved to `.mock/users-collection.json`
  await users.add({ name: "Charlie", age: 25 });

  // Later runs will auto-load persisted data
  const allUsers = await users.all();
  console.log(allUsers);
}

persistentExample();
```

## Features

- **Asynchronous API**: All operations return Promises for non-blocking execution
- **Concurrency Safe**: Read-write locks ensure thread safety in multi-user environments
- **In-Memory Storage**: Fast, ephemeral data storage
- **CRUD Operations**: Create, read, update, delete records
- **Query Support**: Filter and find records with predicate functions
- **File Persistence**: Optional JSON file storage
- **Type Safety**: Full TypeScript support
- **Modification Events**: Subscribe to collection changes

## Usage

### Initializing Storage

```typescript
const storage = new MockStorage({
  persister: {
    persist: true, // Enable persistence globally
  },
});
```

### Working with Collections

```typescript
interface User {
  name: string;
  age: number;
}

async function collectionOperations() {
  const storage = new MockStorage();
  const userCollection = await storage.collection<User>("users");

  // Add records
  const alice = await userCollection.add({ name: "Alice", age: 28 });
  const bob = await userCollection.add({ name: "Bob", age: 32 });

  // Get all records
  const allUsers = await userCollection.all();

  // Find specific records
  const adults = await userCollection.find((u) => u.age >= 18);
  const firstBob = await userCollection.first((u) => u.name === "Bob");

  // Remove records
  const removed = await userCollection.remove(alice.id);
}

collectionOperations();
```

### Concurrency Handling

```typescript
async function concurrentAccess() {
  const storage = new MockStorage();
  const collection = await storage.collection<number>("counters");

  // Simultaneous updates will be safely queued
  await Promise.all([
    collection.add({ value: 1 }),
    collection.add({ value: 2 }),
    collection.add({ value: 3 }),
  ]);

  const results = await collection.all();
  console.log(results); // All three values properly added
}

concurrentAccess();
```

## API Documentation

### `MockStorage`

Main storage manager class

**Methods**:

- `collection<T>(name: string, options?): Promise<MockCollection<T>>`  
  Get or create a collection (async)
- `configureCollection(name: string, options): void`  
  Update persistence settings
- `commit(name: string): Promise<void>`  
  Save specific collection (async)
- `commitAll(): Promise<void>`  
  Save all collections (async)
- `listCollections(): string[]`  
  Get all collection names
- `hasCollection(name: string): boolean`  
  Check collection existence

### `MockCollection<T>`

Data container with CRUD operations

**Methods**:

- `add(value: T): Promise<MockView<T>>`  
  Add new record (async)
- `all(): Promise<MockView<T>[]>`  
  Get all records (async)
- `find(predicate): Promise<MockView<T>[]>`  
  Filter records (async)
- `first(predicate): Promise<MockView<T> | null>`  
  Find first match (async)
- `remove(id: string): Promise<boolean>`  
  Delete record (async)
- `onModify(callback): void`  
  Subscribe to changes
- `offModify(callback): void`  
  Unsubscribe from changes

## Persistence

Data is stored in JSON files under the `.mock` directory in your project root. Each collection is saved as:

```
.mock/{collection-name}-collection.json
```

File operations are performed asynchronously with proper locking to ensure data consistency across multiple processes.

### Persistence Configuration

```typescript
async function configurePersistence() {
  const storage = new MockStorage();

  // Enable persistence for a specific collection
  const tempCollection = await storage.collection<string>("temp", {
    persist: true,
    rewriteOnCommit: true,
  });

  // Update persistence settings
  storage.configureCollection("temp", {
    persist: false, // Disable persistence
  });

  // Manual save
  await storage.commit("temp");
  await storage.commitAll(); // Save all collections
}

configurePersistence();
```

## Concurrency Model

The library uses read-write locks to ensure:

- Multiple simultaneous reads
- Exclusive access for write operations
- Atomic commit operations
- Consistent state during file I/O

This makes it suitable for:

- Server applications with multiple concurrent users
- Testing scenarios with parallel operations
- Prototyping distributed systems

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Commit your changes (ensure async patterns are maintained)
4. Push to the branch
5. Create a Pull Request

## License

MIT © [Konstantin Podyganov](mailto:k.podyganov@mail.ru)

---

**Note**: While designed for concurrency, this package is primarily intended for testing and prototyping. For production workloads at scale, consider using dedicated database solutions.
