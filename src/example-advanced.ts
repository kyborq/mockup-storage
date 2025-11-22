/**
 * Advanced usage example demonstrating B-Tree, indexes, and binary storage
 */

import { MockStorage, Migration } from "./index";

// Define schemas
type Schemas = {
  users: {
    email: "string";
    name: "string";
    age: "number";
    createdAt: "datetime";
  };
  products: {
    sku: "string";
    name: "string";
    price: "number";
    stock: "number";
  };
};

const schemas: Schemas = {
  users: {
    email: "string",
    name: "string",
    age: "number",
    createdAt: "datetime",
  },
  products: {
    sku: "string",
    name: "string",
    price: "number",
    stock: "number",
  },
};

async function demonstrateBTreeAndIndexes() {
  console.log("🚀 Mockup Storage 3.0 - Advanced Features Demo\n");

  // Initialize storage with binary persistence
  const storage = new MockStorage(schemas, {
    persister: { persist: true, format: "binary" },
  });

  const users = await storage.collection("users");

  // Create indexes for fast lookups
  console.log("📊 Creating indexes...");
  await users.createIndex({
    name: "email_idx",
    field: "email",
    unique: true, // Ensures email uniqueness
  });

  await users.createIndex({
    name: "age_idx",
    field: "age",
  });
  console.log("✅ Indexes created\n");

  // Add sample data
  console.log("📝 Adding users...");
  try {
    await users.add({
      email: "alice@example.com",
      name: "Alice",
      age: 28,
      createdAt: new Date(),
    });

    await users.add({
      email: "bob@example.com",
      name: "Bob",
      age: 34,
      createdAt: new Date(),
    });

    await users.add({
      email: "charlie@example.com",
      name: "Charlie",
      age: 22,
      createdAt: new Date(),
    });

    console.log("✅ Users added\n");
  } catch (error) {
    console.error("Error adding users:", error);
  }

  // Demonstrate indexed lookups (O(log n))
  console.log("🔍 Fast indexed lookup:");
  const alice = await users.findByField("email", "alice@example.com");
  console.log(`Found: ${alice?.name} (${alice?.email})\n`);

  // Demonstrate range queries
  console.log("📈 Range query (age 20-30):");
  const youngUsers = await users.findByRange("age", 20, 30);
  youngUsers.forEach((user) => {
    console.log(`  - ${user.name}, age ${user.age}`);
  });
  console.log();

  // Get collection statistics
  console.log("📊 Collection Statistics:");
  const stats = await users.getStats();
  console.log(`  Records: ${stats.recordCount}`);
  console.log(`  Indexes: ${stats.indexCount}`);
  console.log(`  Index memory: ${stats.indexMemoryUsage} bytes`);
  console.log(`  Index details:`);
  stats.indexes.forEach((idx) => {
    console.log(
      `    - ${idx.name} on '${idx.field}' (${idx.entries} entries, unique: ${idx.unique})`
    );
  });
  console.log();

  // Get storage health
  console.log("💚 Storage Health:");
  const health = await storage.getHealth();
  console.log(`  Total collections: ${health.collections.length}`);
  console.log(`  Total size: ${health.totalSize} bytes`);
  health.collections.forEach((col) => {
    console.log(
      `    - ${col.collection}: ${col.count} records, ${col.meta.size || 0} bytes`
    );
  });
  console.log();

  // Try to add duplicate email (should fail due to unique constraint)
  console.log("🚫 Testing unique constraint:");
  try {
    await users.add({
      email: "alice@example.com", // Duplicate!
      name: "Alice Clone",
      age: 30,
      createdAt: new Date(),
    });
  } catch (error) {
    console.log(`  ✅ Correctly rejected: ${(error as Error).message}\n`);
  }
}

async function demonstrateMigration() {
  console.log("🔄 Migration Tools Demo\n");

  // Analyze storage
  console.log("📊 Analyzing storage...");
  const analysis = await Migration.analyze();
  console.log(`  JSON collections: ${analysis.jsonCollections.length}`);
  console.log(`  Binary collections: ${analysis.binaryCollections.length}`);
  console.log(`  Total JSON size: ${analysis.totalJsonSize} bytes`);
  console.log(`  Total binary size: ${analysis.totalBinarySize} bytes`);

  if (analysis.potentialSavings > 0) {
    console.log(
      `  Potential savings: ${analysis.potentialSavings.toFixed(0)} bytes\n`
    );
  } else {
    console.log();
  }

  // Validate collections
  console.log("✅ Validating collections...");
  const validation = await Migration.validate();
  console.log(`  All collections valid: ${validation.valid}`);
  validation.collections.forEach((col) => {
    const status = col.valid ? "✅" : "❌";
    console.log(`    ${status} ${col.name} (${col.format})`);
    if (col.error) {
      console.log(`       Error: ${col.error}`);
    }
  });
  console.log();
}

async function demonstrateProducts() {
  console.log("🛍️ Products Collection Demo\n");

  const storage = new MockStorage(schemas, {
    persister: { persist: true, format: "binary" },
  });

  const products = await storage.collection("products");

  // Create unique SKU index
  await products.createIndex({
    name: "sku_idx",
    field: "sku",
    unique: true,
  });

  // Create price index for range queries
  await products.createIndex({
    name: "price_idx",
    field: "price",
  });

  console.log("📦 Adding products...");
  await products.add({
    sku: "WIDGET-001",
    name: "Super Widget",
    price: 29.99,
    stock: 100,
  });

  await products.add({
    sku: "GADGET-001",
    name: "Amazing Gadget",
    price: 49.99,
    stock: 50,
  });

  await products.add({
    sku: "TOOL-001",
    name: "Pro Tool",
    price: 99.99,
    stock: 25,
  });

  console.log("✅ Products added\n");

  // Fast SKU lookup
  console.log("🔍 Finding product by SKU:");
  const widget = await products.findByField("sku", "WIDGET-001");
  console.log(`  ${widget?.name} - $${widget?.price}\n`);

  // Price range query
  console.log("💰 Products under $75:");
  const affordable = await products.findByRange("price", 0, 75);
  affordable.forEach((p) => {
    console.log(`  - ${p.name}: $${p.price} (stock: ${p.stock})`);
  });
  console.log();
}

async function main() {
  try {
    await demonstrateBTreeAndIndexes();
    await demonstrateProducts();
    await demonstrateMigration();

    console.log("🎉 Demo completed successfully!");
    console.log("\n📁 Data persisted to .mock/ directory");
    console.log("   Files use efficient binary format (.mdb)");
    console.log("   Run this script again to see data loaded from disk!");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();

