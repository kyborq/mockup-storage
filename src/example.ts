import { MockStorage } from "./lib/storage";

const main = async () => {
  const storage = new MockStorage();

  await storage.initialize();

  const collection = await storage.collection("books", {
    schema: {
      title: "string",
    },
    options: {
      persist: true,
    },
  });

  console.log("data", await collection.all());
};

main();
