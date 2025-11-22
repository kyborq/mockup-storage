import { MockStorage, DatabaseSchemas } from "./index";

const storage = new MockStorage(
  {
    author: {
      name: { type: "string", unique: true },
      asd: { type: "boolean", required: true },
    },
    book: {
      title: { type: "string" },
      authorId: {
        type: "string",
        relation: { collection: "author", type: "one-to-many" },
      },
    },
  },
  {
    persister: { persist: false },
  }
);

const main = async () => {
  const authors = await storage.collection("author");
  const books = await storage.collection("book");

  // await books.add({ authorId: author1.id, title: "Voina i mir" });
  // await books.add({ authorId: author1.id, title: "Voina i mir chast 2" });

  const allBooks = await books.all();
  console.log(allBooks);

  const b = await books.getRelated(authors, "authorId", "name");
  console.log(b);
};

main();
