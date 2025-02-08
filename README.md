# Mockup Storage

[![npm version](https://img.shields.io/npm/v/mockup-storage.svg)](https://www.npmjs.com/package/mockup-storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight mock storage solution for testing and prototyping, featuring in-memory collections with optional file system persistence.

## Installation

```bash
npm install mockup-storage
```

## Quick Start

### Basic Usage (In-Memory)

```typescript
import { MockStorage } from "mockup-storage";

// Initialize storage
const storage = new MockStorage();

// Get a collection
const users = storage.collection<User>("users");

// Add records
users.add({ name: "Alice", age: 28 });
users.add({ name: "Bob", age: 32 });

// Query data
const adults = users.find((user) => user.age >= 18);
console.log(adults); // Array of matching records
```

### Persistent Storage

```typescript
// Configure storage with persistence
const storage = new MockStorage({
  persister: { persist: true },
});

// Get persistent collection
const users = storage.collection<User>("users");

// Data will be saved to `.mock/users-collection.json`
users.add({ name: "Charlie", age: 25 });

// Later runs will auto-load persisted data
```

## Features

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

// Get or create a collection
const userCollection = storage.collection<User>("users");

// Add records
const alice = userCollection.add({ name: "Alice", age: 28 });
const bob = userCollection.add({ name: "Bob", age: 32 });

// Get all records
const allUsers = userCollection.all();

// Find specific records
const adults = userCollection.find((u) => u.age >= 18);
const firstBob = userCollection.first((u) => u.name === "Bob");

// Remove records
userCollection.remove(alice.id);
```

### Persistence Configuration

```typescript
// Enable persistence for a specific collection
const tempCollection = storage.collection<string>("temp", {
  persist: true,
});

// Update persistence settings
storage.configureCollection("temp", {
  persist: false, // Disable persistence
});

// Manual save
storage.commit("temp");
storage.commitAll(); // Save all collections
```

## API Documentation

### `MockStorage`

Main storage manager class

**Methods**:

- `collection<T>(name: string, options?)`: Get or create a collection
- `configureCollection(name: string, options)`: Update persistence settings
- `commit(name)`: Save specific collection
- `commitAll()`: Save all collections

### `MockCollection<T>`

Data container with CRUD operations

**Methods**:

- `add(value: T)`: Add new record
- `all()`: Get all records
- `find(predicate)`: Filter records
- `first(predicate)`: Find first match
- `remove(id)`: Delete record
- `onModify(callback)`: Subscribe to changes

### `MockPersist`

Persistence handler (automatically managed)

### `MockRecord<T>`

Individual record wrapper with UUID

## Persistence

Data is stored in JSON files under the `.mock` directory in your project root. Each collection is saved as:

```
.mock/{collection-name}-collection.json
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT © [Konstantin Podyganov](mailto:k.podyganov@mail.ru)

---

**Note**: This package is designed for testing and prototyping purposes. For production use cases, consider using proper database solutions.
