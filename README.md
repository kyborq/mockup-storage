# Mockup Storage

[![npm version](https://img.shields.io/npm/v/mockup-storage.svg)](https://www.npmjs.com/package/mockup-storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Embedded storage for Node.js and TypeScript: in-memory collections with optional persistence to a single file. B-Tree indexing, schema-based relations, and TypeScript inference.

```typescript
const storage = new MockStorage(schemas, { persister: { persist: true } });
const users = await storage.collection("users");
await users.add({ name: "Alice", email: "alice@example.com" });
```

---

## Features

- **No server** – in-process only, no config files
- **Single file** – all data in one `.mdb` file (SQLite-style)
- **B-Tree indexing** – O(log n) lookups and range queries
- **Binary format** – smaller than JSON, indexes preserved on disk
- **Relations** – foreign keys and JOINs by relation name (from schema)
- **Typed API** – schema-driven types and relation name autocomplete
- **Auto-commit** – optional, flushes changes after 100ms
- **Concurrent access** – mutex for async operations

---

## Installation

```bash
npm install mockup-storage
```

---

## Quick Start

### Basic usage

```typescript
import { MockStorage, DatabaseSchemas } from "mockup-storage";

const schemas: DatabaseSchemas = {
  users: {
    name: { type: "string", required: true },
    email: { type: "string", index: true, unique: true },
    age: { type: "number", index: true },
  },
};

async function main() {
  const storage = new MockStorage(schemas, {
    persister: { persist: true },
  });

  const users = await storage.collection("users");
  await users.add({
    name: "Alice",
    email: "alice@example.com",
    age: 28,
  });

  const alice = await users.findByField("email", "alice@example.com");
  const adults = await users.findByRange("age", 18, 65);
}

main();
```

### Persistence

Collections are stored in one binary file. Auto-commit is on by default (saves within 100ms of changes).

```typescript
const storage = new MockStorage(schemas, {
  persister: {
    persist: true,
    autoCommit: true,
    filepath: "./data/database",
  },
});

const users = await storage.collection("users");
await users.add({ name: "Bob" });
```

Manual flush:

```typescript
const storage = new MockStorage(schemas, {
  persister: { persist: true, autoCommit: false },
});
await users.add({ name: "Bob" });
await storage.commitAll();
```

---

## Schema and indexes

Define schemas with types, indexes, and relations. Indexes are created from the schema.

```typescript
const schemas: DatabaseSchemas = {
  users: {
    name: { type: "string", required: true },
    email: { type: "string", index: true, unique: true },
    age: { type: "number", index: true },
  },
};

const users = await storage.collection("users");
```

Supported field types: `string`, `number`, `boolean`, `datetime`.

Indexed lookups and range queries are O(log n):

```typescript
const user = await users.findByField("email", "alice@example.com");
const young = await users.findByRange("age", 18, 30);
const stats = users.getIndexStats();
```

---

## CRUD

```typescript
const user = await users.add({ name: "Alice", email: "alice@ex.com", age: 28 });
const alice = await users.get(user.id);
const all = await users.all();
const filtered = await users.find((u) => u.age >= 18);
const first = await users.first((u) => u.name === "Alice");

await users.update(user.id, { age: 29 });
await users.remove(user.id);
```

---

## Relations and JOINs

Declare relations in the schema with `relation` on a field. Relation names are auto-generated: `${sourceCollection}_${fieldName}_${targetCollection}` (e.g. `posts_userId_users`). Target is always the referenced collection’s `id` by convention.

```typescript
const schemas: DatabaseSchemas = {
  users: {
    name: { type: "string" },
    email: { type: "string", unique: true, index: true },
  },
  posts: {
    userId: {
      type: "string",
      index: true,
      relation: { collection: "users", type: "many-to-one", onDelete: "restrict" },
    },
    title: { type: "string" },
    content: { type: "string" },
  },
};

const storage = new MockStorage(schemas, { persister: { persist: true } });
const users = await storage.collection("users");
const posts = await storage.collection("posts");

const alice = await users.add({ name: "Alice", email: "alice@ex.com" });
await posts.add({ userId: alice.id, title: "Hello", content: "World" });

// Join by relation name (TypeScript suggests "posts_userId_users")
const rows = await storage.join("posts_userId_users", "left");
rows.forEach((row) => {
  console.log(row.title, row.joined?.name);
});

// One record’s related target
const author = await storage.getRelatedByRelation("posts_userId_users", post);

// Or use the relation object
const relation = storage.getRelation("posts_userId_users");
const withAuthors = await relation?.leftJoin();
```

Relation types: `one-to-one`, `one-to-many`, `many-to-one`, `many-to-many`.  
`onDelete`: `cascade`, `restrict`. (`set-null` is not implemented.)

Deleting a record in the target collection runs `onDelete` (e.g. `restrict` throws if references exist, `cascade` removes referencing rows).

---

## Binary storage and migration

Data is stored in a binary format (smaller than JSON, indexes preserved). Use `Migration` for format conversion and checks:

```typescript
import { Migration } from "mockup-storage";

const result = await Migration.jsonToBinary();
const analysis = await Migration.analyze();
const validation = await Migration.validate();
```

---

## API overview

### MockStorage

| Method | Description |
|--------|-------------|
| `collection(name)` | Get or create collection (async) |
| `commitAll()` | Flush all collections to disk |
| `commit(name)` | Flush one collection |
| `listCollections()` | List collection names |
| `hasCollection(name)` | Check if collection exists |
| `getHealth()` | Database path and size info |
| `defineRelation(config)` | Register a relation (by collection names) |
| `getRelation(name)` | Get relation by name |
| `listRelations()` | List relation names |
| `join(relationName, joinType?)` | Join by relation name (`"inner"` \| `"left"` \| `"right"`) |
| `getRelatedByRelation(relationName, sourceRecord)` | Related record(s) for one source row |
| `validateRelations()` | Check referential integrity |

### MockCollection

**CRUD:** `add`, `get`, `all`, `update`, `remove`  
**Queries:** `find`, `first`, `findByField`, `findByRange`  
**Indexes:** `createIndex`, `dropIndex`, `listIndexes`, `getIndexStats`  
**Events:** `onModify`, `offModify`  
**Joins (ad-hoc):** `innerJoin`, `leftJoin`, `getRelated` (with explicit target collection and fields)

### Schema types

```typescript
type DatabaseSchemas = Record<string, CollectionSchema>;

type CollectionSchema = Record<string, FieldDefinition>;

interface FieldDefinition {
  type: "string" | "number" | "boolean" | "datetime";
  index?: boolean;
  unique?: boolean;
  required?: boolean;
  default?: string | number | boolean | Date;
  relation?: {
    collection: string;
    type: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
    onDelete?: "cascade" | "set-null" | "restrict";
  };
  hidden?: boolean;
}
```

---

## Example and scripts

Run the example:

```bash
npm run dev
```

Example file: [src/example.ts](./src/example.ts).

---

## Contributing

1. Fork the repo
2. Create a branch (`git checkout -b feature/your-feature`)
3. Commit changes
4. Push and open a Pull Request

Keep TypeScript types and async usage consistent with the existing code.

---

## License

MIT © [Konstantin Podyganov](mailto:k.podyganov@mail.ru)

---

## Links

- [GitHub](https://github.com/kyborq/mockup-storage)
- [npm](https://www.npmjs.com/package/mockup-storage)
- [Issues](https://github.com/kyborq/mockup-storage/issues)
