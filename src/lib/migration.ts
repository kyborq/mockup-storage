/**
 * Migration utilities for converting between storage formats
 */

import fs from "fs/promises";
import path from "path";
import { DEFAULT_DB_PATH } from "../constants";
import { BinaryStorage } from "./binary-storage";
import { MockRecordSchema } from "./record";

/**
 * Migration result statistics
 */
export interface MigrationResult {
  success: boolean;
  collectionsProcessed: number;
  collectionsFailed: number;
  totalSizeBefore: number;
  totalSizeAfter: number;
  compressionRatio: number;
  errors: Array<{ collection: string; error: string }>;
}

/**
 * Migration utilities
 */
export class Migration {
  /**
   * Migrates all JSON collections to binary format
   * @returns Migration statistics
   */
  public static async jsonToBinary(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      collectionsProcessed: 0,
      collectionsFailed: 0,
      totalSizeBefore: 0,
      totalSizeAfter: 0,
      compressionRatio: 0,
      errors: [],
    };

    const dirPath = path.join(process.cwd(), DEFAULT_DB_PATH);

    try {
      await fs.access(dirPath);
    } catch {
      // Directory doesn't exist, nothing to migrate
      return result;
    }

    const files = await fs.readdir(dirPath);
    const jsonFiles = files.filter((file) => file.endsWith("-collection.json"));

    for (const jsonFile of jsonFiles) {
      const collectionName = jsonFile.replace("-collection.json", "");
      const jsonPath = path.join(dirPath, jsonFile);
      const binaryPath = path.join(dirPath, `${collectionName}-collection.mdb`);

      try {
        // Read JSON file
        const jsonData = await fs.readFile(jsonPath, "utf-8");
        const jsonStats = await fs.stat(jsonPath);
        const { schema, records } = JSON.parse(jsonData);

        // Convert datetime strings back to Date objects
        const convertedRecords = records.map((record: any) => {
          const converted = { ...record };
          for (const [key, type] of Object.entries(schema)) {
            if (type === "datetime" && typeof converted[key] === "string") {
              converted[key] = new Date(converted[key]);
            }
          }
          return converted;
        });

        // Serialize to binary
        const buffer = BinaryStorage.serialize(schema, convertedRecords, []);

        // Write binary file
        await fs.writeFile(binaryPath, buffer);

        const binaryStats = await fs.stat(binaryPath);

        result.totalSizeBefore += jsonStats.size;
        result.totalSizeAfter += binaryStats.size;
        result.collectionsProcessed++;

        console.log(
          `✓ Migrated ${collectionName}: ${jsonStats.size} → ${binaryStats.size} bytes ` +
            `(${((1 - binaryStats.size / jsonStats.size) * 100).toFixed(1)}% smaller)`
        );

        // Delete JSON file after successful migration
        await fs.unlink(jsonPath);
      } catch (error) {
        result.collectionsFailed++;
        result.success = false;
        result.errors.push({
          collection: collectionName,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error(`✗ Failed to migrate ${collectionName}:`, error);
      }
    }

    if (result.totalSizeBefore > 0) {
      result.compressionRatio =
        1 - result.totalSizeAfter / result.totalSizeBefore;
    }

    return result;
  }

  /**
   * Migrates all binary collections back to JSON format (for compatibility)
   * @returns Migration statistics
   */
  public static async binaryToJson(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      collectionsProcessed: 0,
      collectionsFailed: 0,
      totalSizeBefore: 0,
      totalSizeAfter: 0,
      compressionRatio: 0,
      errors: [],
    };

    const dirPath = path.join(process.cwd(), DEFAULT_DB_PATH);

    try {
      await fs.access(dirPath);
    } catch {
      return result;
    }

    const files = await fs.readdir(dirPath);
    const binaryFiles = files.filter((file) => file.endsWith("-collection.mdb"));

    for (const binaryFile of binaryFiles) {
      const collectionName = binaryFile.replace("-collection.mdb", "");
      const binaryPath = path.join(dirPath, binaryFile);
      const jsonPath = path.join(dirPath, `${collectionName}-collection.json`);

      try {
        // Read binary file
        const buffer = await fs.readFile(binaryPath);
        const binaryStats = await fs.stat(binaryPath);
        const { schema, records } = BinaryStorage.deserialize(buffer);

        // Convert Date objects to ISO strings
        const convertedRecords = records.map((record: any) => {
          const converted = { ...record };
          for (const [key, type] of Object.entries(schema)) {
            if (type === "datetime" && converted[key] instanceof Date) {
              converted[key] = converted[key].toISOString();
            }
          }
          return converted;
        });

        // Write JSON file
        const jsonData = JSON.stringify(
          { schema, records: convertedRecords },
          null,
          2
        );
        await fs.writeFile(jsonPath, jsonData, "utf-8");

        const jsonStats = await fs.stat(jsonPath);

        result.totalSizeBefore += binaryStats.size;
        result.totalSizeAfter += jsonStats.size;
        result.collectionsProcessed++;

        console.log(
          `✓ Converted ${collectionName}: ${binaryStats.size} → ${jsonStats.size} bytes`
        );

        // Delete binary file after successful conversion
        await fs.unlink(binaryPath);
      } catch (error) {
        result.collectionsFailed++;
        result.success = false;
        result.errors.push({
          collection: collectionName,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error(`✗ Failed to convert ${collectionName}:`, error);
      }
    }

    if (result.totalSizeBefore > 0) {
      result.compressionRatio =
        1 - result.totalSizeAfter / result.totalSizeBefore;
    }

    return result;
  }

  /**
   * Analyzes collections and provides storage statistics
   */
  public static async analyze(): Promise<{
    jsonCollections: Array<{
      name: string;
      size: number;
      recordCount: number;
    }>;
    binaryCollections: Array<{
      name: string;
      size: number;
      recordCount: number;
    }>;
    totalJsonSize: number;
    totalBinarySize: number;
    potentialSavings: number;
  }> {
    const dirPath = path.join(process.cwd(), DEFAULT_DB_PATH);
    const jsonCollections: Array<{
      name: string;
      size: number;
      recordCount: number;
    }> = [];
    const binaryCollections: Array<{
      name: string;
      size: number;
      recordCount: number;
    }> = [];

    try {
      await fs.access(dirPath);
    } catch {
      return {
        jsonCollections,
        binaryCollections,
        totalJsonSize: 0,
        totalBinarySize: 0,
        potentialSavings: 0,
      };
    }

    const files = await fs.readdir(dirPath);

    // Analyze JSON files
    const jsonFiles = files.filter((file) => file.endsWith("-collection.json"));
    for (const file of jsonFiles) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      const data = await fs.readFile(filePath, "utf-8");
      const { records } = JSON.parse(data);

      jsonCollections.push({
        name: file.replace("-collection.json", ""),
        size: stats.size,
        recordCount: records.length,
      });
    }

    // Analyze binary files
    const binaryFiles = files.filter((file) => file.endsWith("-collection.mdb"));
    for (const file of binaryFiles) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      const buffer = await fs.readFile(filePath);
      const { records } = BinaryStorage.deserialize(buffer);

      binaryCollections.push({
        name: file.replace("-collection.mdb", ""),
        size: stats.size,
        recordCount: records.length,
      });
    }

    const totalJsonSize = jsonCollections.reduce((sum, c) => sum + c.size, 0);
    const totalBinarySize = binaryCollections.reduce(
      (sum, c) => sum + c.size,
      0
    );

    // Estimate potential savings if migrating JSON to binary (rough estimate: 40% smaller)
    const potentialSavings = totalJsonSize > 0 ? totalJsonSize * 0.4 : 0;

    return {
      jsonCollections,
      binaryCollections,
      totalJsonSize,
      totalBinarySize,
      potentialSavings,
    };
  }

  /**
   * Validates all collections (both JSON and binary)
   */
  public static async validate(): Promise<{
    valid: boolean;
    collections: Array<{
      name: string;
      format: "json" | "binary";
      valid: boolean;
      error?: string;
    }>;
  }> {
    const dirPath = path.join(process.cwd(), DEFAULT_DB_PATH);
    const collections: Array<{
      name: string;
      format: "json" | "binary";
      valid: boolean;
      error?: string;
    }> = [];

    try {
      await fs.access(dirPath);
    } catch {
      return { valid: true, collections };
    }

    const files = await fs.readdir(dirPath);

    // Validate JSON files
    const jsonFiles = files.filter((file) => file.endsWith("-collection.json"));
    for (const file of jsonFiles) {
      const filePath = path.join(dirPath, file);
      const name = file.replace("-collection.json", "");

      try {
        const data = await fs.readFile(filePath, "utf-8");
        const parsed = JSON.parse(data);

        if (!parsed.schema || !parsed.records) {
          throw new Error("Missing schema or records");
        }

        collections.push({ name, format: "json", valid: true });
      } catch (error) {
        collections.push({
          name,
          format: "json",
          valid: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Validate binary files
    const binaryFiles = files.filter((file) => file.endsWith("-collection.mdb"));
    for (const file of binaryFiles) {
      const filePath = path.join(dirPath, file);
      const name = file.replace("-collection.mdb", "");

      try {
        const buffer = await fs.readFile(filePath);
        BinaryStorage.deserialize(buffer);
        collections.push({ name, format: "binary", valid: true });
      } catch (error) {
        collections.push({
          name,
          format: "binary",
          valid: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const valid = collections.every((c) => c.valid);

    return { valid, collections };
  }
}

