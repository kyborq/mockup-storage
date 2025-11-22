import { MockStorage, DatabaseSchemas } from "./index";

// Define database schemas
const schemas: DatabaseSchemas = {
  books: {
    title: {
      type: "string",
      required: true,
    },
    author: {
      type: "string",
      index: true, // Auto-create index
    },
    year: {
      type: "number",
      index: true, // For range queries
    },
  },
};

const main = async () => {
  const storage = new MockStorage(schemas, {
    persister: { persist: true },
  });

  // Auto-loads existing data from database.mdb
  const books = await storage.collection("books");

  // Add books only if collection is empty
  const existingBooks = await books.all();
  if (existingBooks.length === 0) {
    console.log("Adding initial books...\n");
    await books.add({
      title: "TypeScript Handbook",
      author: "Microsoft",
      year: 2023,
    });
    await books.add({
      title: "JavaScript: The Good Parts",
      author: "Douglas Crockford",
      year: 2008,
    });
  }

  console.log("All books:", await books.all());

  // Fast indexed lookup
  const msBooks = await books.findByField("author", "Microsoft");
  console.log("Microsoft books:", msBooks);

  // Wait for auto-commit (enabled by default)
  await new Promise((resolve) => setTimeout(resolve, 200));

  const health = await storage.getHealth();
  console.log(`\n📊 Database: ${health.databasePath}`);
  console.log(`📦 Size: ${health.totalSize} bytes`);
  console.log(`📚 Collections: ${health.collections.length}`);
};

main();
