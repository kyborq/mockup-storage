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
    persister: { persist: true, format: "binary" },
  });

  const books = await storage.collection("books");

  // Add some books
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

  console.log("All books:", await books.all());

  // Fast indexed lookup
  const msBooks = await books.findByField("author", "Microsoft");
  console.log("Microsoft books:", msBooks);
};

main();
