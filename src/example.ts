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
        relation: { collection: "author", type: "many-to-one", onDelete: "restrict" },
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

  const author1 = await authors.add({ name: "Tolstoy", asd: true });
  await books.add({ authorId: author1.id, title: "Voina i mir" });
  await books.add({ authorId: author1.id, title: "Voina i mir chast 2" });

  const allBooks = await books.all();
  console.log("Books:", allBooks);

  // Convenient API: join by relation name (from schema: book_authorId_author)
  const booksWithAuthors = await storage.join("book_authorId_author", "left");
  console.log("Books with authors:", booksWithAuthors);

  // Get related record for one book
  const firstBook = allBooks[0];
  if (firstBook) {
    const related = await storage.getRelatedByRelation("book_authorId_author", firstBook);
    console.log("Author of first book:", related);
  }

  // Collection-level join (explicit fields; targetField defaults to "id")
  const withAuthors = await books.leftJoin(authors, "authorId", "id");
  console.log("Via leftJoin:", withAuthors);
};

main();
