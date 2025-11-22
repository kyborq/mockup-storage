/**
 * 🚀 NEW STANDARD - Declarative Schema with Relations
 * This is the recommended way to define your database
 */

import { MockStorage, DatabaseSchemas } from "./index";

// ✨ Define complete database schema in one place
const schemas: DatabaseSchemas = {
  users: {
    name: {
      type: "string",
      required: true,
    },
    email: {
      type: "string",
      index: true, // 🎯 Auto-creates index
      unique: true, // 🎯 Unique constraint
    },
    age: {
      type: "number",
      index: true, // 🎯 For range queries
    },
    createdAt: {
      type: "datetime",
    },
  },

  posts: {
    userId: {
      type: "string",
      index: true, // 🎯 Foreign key index
      relation: {
        // 🔗 Define relation right here!
        collection: "users",
        type: "many-to-one",
        onDelete: "cascade",
      },
    },
    title: {
      type: "string",
      required: true,
    },
    content: {
      type: "string",
    },
    views: {
      type: "number",
      default: 0,
      index: true, // 🎯 For sorting by popularity
    },
    publishedAt: {
      type: "datetime",
      index: true, // 🎯 For date range queries
    },
  },

  comments: {
    postId: {
      type: "string",
      index: true,
      relation: {
        // 🔗 Relation to posts
        collection: "posts",
        type: "many-to-one",
        onDelete: "cascade",
      },
    },
    userId: {
      type: "string",
      index: true,
      relation: {
        // 🔗 Relation to users
        collection: "users",
        type: "many-to-one",
        onDelete: "set-null",
      },
    },
    text: {
      type: "string",
      required: true,
    },
    createdAt: {
      type: "datetime",
      index: true,
    },
  },

  profiles: {
    userId: {
      type: "string",
      unique: true, // 🎯 One-to-one relationship
      index: true,
      relation: {
        // 🔗 One-to-one with users
        collection: "users",
        type: "one-to-one",
        onDelete: "cascade",
      },
    },
    bio: {
      type: "string",
    },
    website: {
      type: "string",
    },
    avatar: {
      type: "string",
    },
  },

  products: {
    sku: {
      type: "string",
      unique: true, // 🎯 Unique product identifier
      index: true,
    },
    name: {
      type: "string",
      required: true,
    },
    price: {
      type: "number",
      index: true, // 🎯 For price range queries
    },
    stock: {
      type: "number",
      default: 0,
    },
    category: {
      type: "string",
      index: true, // 🎯 For category filtering
    },
  },
};

async function demonstrateNewStandard() {
  console.log("🚀 New Standard - Declarative Database Schema\n");

  const storage = new MockStorage(schemas, {
    persister: { persist: false },
  });

  // Get collections - indexes and relations are AUTO-CREATED!
  const users = await storage.collection("users");
  const posts = await storage.collection("posts");
  const comments = await storage.collection("comments");
  const profiles = await storage.collection("profiles");

  console.log("✅ All collections created with auto-indexes and relations!\n");

  // Check auto-created indexes
  console.log("📊 Auto-created indexes:");
  console.log(`  Users: ${users.listIndexes().join(", ")}`);
  console.log(`  Posts: ${posts.listIndexes().join(", ")}`);
  console.log(`  Comments: ${comments.listIndexes().join(", ")}`);
  console.log(`  Profiles: ${profiles.listIndexes().join(", ")}\n`);

  // Check auto-created relations
  console.log("🔗 Auto-created relations:");
  storage.listRelations().forEach((name) => console.log(`  - ${name}`));
  console.log();

  // Add some data
  console.log("📝 Adding data...");
  const alice = await users.add({
    name: "Alice",
    email: "alice@example.com",
    age: 28,
    createdAt: new Date(),
  });

  const bob = await users.add({
    name: "Bob",
    email: "bob@example.com",
    age: 32,
    createdAt: new Date(),
  });

  // Add profile for Alice (one-to-one)
  await profiles.add({
    userId: alice.id,
    bio: "Software Engineer & TypeScript enthusiast",
    website: "https://alice.dev",
    avatar: "/avatars/alice.jpg",
  });

  // Add posts
  const post1 = await posts.add({
    userId: alice.id,
    title: "Getting Started with TypeScript",
    content: "TypeScript is amazing...",
    views: 150,
    publishedAt: new Date(),
  });

  const post2 = await posts.add({
    userId: alice.id,
    title: "Advanced TypeScript Tips",
    content: "Here are some advanced tips...",
    views: 89,
    publishedAt: new Date(),
  });

  const post3 = await posts.add({
    userId: bob.id,
    title: "Node.js Best Practices",
    content: "Best practices for Node.js...",
    views: 234,
    publishedAt: new Date(),
  });

  // Add comments
  await comments.add({
    postId: post1.id,
    userId: bob.id,
    text: "Great article!",
    createdAt: new Date(),
  });

  await comments.add({
    postId: post1.id,
    userId: alice.id,
    text: "Thanks Bob!",
    createdAt: new Date(),
  });

  console.log("✅ Data added\n");

  // Use relations (they were auto-created from schema!)
  console.log("🔗 Using auto-created relations:");
  const userPostsRelation = storage.getRelation("posts_userId_users");

  if (userPostsRelation) {
    const postsWithAuthors = await userPostsRelation.innerJoin();
    console.log("\n  Posts with authors:");
    postsWithAuthors.forEach((result) => {
      console.log(
        `    - "${result.title}" by ${result.joined?.name} (${result.views} views)`
      );
    });
  }

  // Fast indexed queries
  console.log("\n🔍 Fast indexed lookups:");
  const aliceByEmail = await users.findByField("email", "alice@example.com");
  console.log(`  Found by email: ${aliceByEmail?.name}`);

  const popularPosts = await posts.findByRange("views", 100, 1000);
  console.log(`  Popular posts (100-1000 views): ${popularPosts.length}`);

  // Type-safe field access with autocomplete
  console.log("\n✨ Type-safe operations:");
  const youngUsers = await users.findByRange("age", 20, 30);
  console.log(
    `  Young users (20-30): ${youngUsers.map((u) => u.name).join(", ")}`
  );

  // Get relation metadata
  console.log("\n📋 Relation metadata:");
  const relationMetadata = storage.getRelationMetadata();
  Object.entries(relationMetadata).forEach(([name, meta]) => {
    console.log(
      `  ${meta.type}: ${meta.sourceField} → ${meta.targetField} (${meta.onDelete})`
    );
  });
}

async function demonstrateProductCatalog() {
  console.log("\n" + "=".repeat(60) + "\n");
  console.log("🛍️  Product Catalog Example\n");

  const storage = new MockStorage(schemas, {
    persister: { persist: false },
  });

  const products = await storage.collection("products");

  console.log("📦 Auto-created indexes:");
  products.listIndexes().forEach((idx) => console.log(`  - ${idx}`));
  console.log();

  // Add products
  await products.add({
    sku: "WIDGET-001",
    name: "Super Widget",
    price: 29.99,
    stock: 100,
    category: "Widgets",
  });

  await products.add({
    sku: "GADGET-001",
    name: "Amazing Gadget",
    price: 19.99,
    stock: 200,
    category: "Gadgets",
  });

  await products.add({
    sku: "TOOL-001",
    name: "Pro Tool",
    price: 99.99,
    stock: 25,
    category: "Tools",
  });

  // Fast queries using auto-created indexes
  console.log("🔍 Fast SKU lookup:");
  const widget = await products.findByField("sku", "WIDGET-001");
  console.log(`  ${widget?.name} - $${widget?.price}\n`);

  console.log("💰 Price range $10-$50:");
  const affordable = await products.findByRange("price", 10, 50);
  affordable.forEach((p) => {
    console.log(`  - ${p.name}: $${p.price}`);
  });
  console.log();

  console.log("📁 Widgets category:");
  const widgets = await products.find((p) => p.category === "Widgets");
  widgets.forEach((p) => {
    console.log(`  - ${p.name}: $${p.price} (${p.stock} in stock)`);
  });
}

async function main() {
  console.log("🎯 Mockup Storage - New Declarative Standard\n");
  console.log("=".repeat(60) + "\n");

  try {
    await demonstrateNewStandard();
    await demonstrateProductCatalog();

    console.log("\n" + "=".repeat(60));
    console.log("\n🎉 All demos completed successfully!\n");
    console.log("✨ New Standard Benefits:");
    console.log("  ✅ Everything defined in ONE place");
    console.log("  ✅ Indexes created automatically from schema");
    console.log("  ✅ Relations defined RIGHT in the field");
    console.log("  ✅ No manual index/relation setup needed");
    console.log("  ✅ Self-documenting database structure");
    console.log("  ✅ Full type safety with autocomplete");
    console.log("  ✅ Less code, more clarity");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
