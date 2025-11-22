import fs from "fs/promises";
import path from "path";
import { MockCollection } from "./collection";
import { MockRecordSchema, MockView } from "./record";
import { MOCK_PERSIST_DIRECTORY } from "../constants";
import { BinaryStorage } from "./binary-storage";

/**
 * Configuration options for MockPersist
 */
export interface MockPersistOptions {
  /** Whether to persist the collection data to the file system */
  persist: boolean;
  /** Storage format: 'binary' (default) or 'json' (legacy) */
  format?: "binary" | "json";
}

/**
 * Configuration object for MockPersist constructor
 * @template T - The data type stored in the collection
 */
export interface MockPersistConfig<T extends MockRecordSchema> {
  /** Unique name for the collection */
  name: string;
  /** Instance of the MockCollection to persist */
  collection: MockCollection<T>;
  /** Persistence configuration options */
  options?: MockPersistOptions;
}

/**
 * Metadata about persisted storage
 */
export interface MockPersistHealth {
  /** File size in bytes */
  size?: number;
  /** File creation date */
  createdAt?: Date;
  /** Last modified date of the file */
  lastModified?: Date;
}

/**
 * Persistence handler for MockCollection that syncs data with JSON files
 * @template T - The data type stored in the collection
 */
export class MockPersist<T extends MockRecordSchema> {
  private name: string;
  private collection: MockCollection<T>;
  private options: Required<MockPersistOptions>;
  private commitCallback: () => void;
  private commitQueue: Promise<void> = Promise.resolve();

  /**
   * Creates a persistence handler for a MockCollection
   * @constructor
   * @param {MockPersistConfig<T>} config - Configuration object
   */
  constructor(config: MockPersistConfig<T>) {
    this.name = config.name;
    this.collection = config.collection;

    this.options = { persist: false, format: "binary", ...config.options };

    this.commitCallback = () => {
      if (this.options.persist) {
        this.commitQueue = this.commitQueue
          .then(async () => {
            await this.commit();
          })
          .catch((error) => {
            console.error("Commit error:", error);
          });
      }
    };

    this.collection.onModify(this.commitCallback);
  }

  /**
   * Loads data from persistent storage into the collection
   * Supports both binary and JSON formats, with automatic format detection
   * @throws {Error} If the file format is invalid
   * @returns {Promise<void>}
   */
  public async pull(): Promise<void> {
    if (!this.options.persist) return;

    try {
      // Try binary format first
      const binaryPath = this.getBinaryFilePath();
      try {
        const buffer = await fs.readFile(binaryPath);
        const { schema, records, indexes } = BinaryStorage.deserialize(buffer);

        // Restore indexes
        for (const indexConfig of indexes) {
          try {
            await this.collection.createIndex(indexConfig);
          } catch (error) {
            console.warn(`Failed to restore index ${indexConfig.name}:`, error);
          }
        }

        await this.collection.init(records);
        return;
      } catch (binaryError) {
        // Binary file doesn't exist or is invalid, try JSON fallback
      }

      // Try legacy JSON format
      const jsonPath = this.getFilePath();
      try {
        const data = await fs.readFile(jsonPath, "utf-8");
        const { schema, records } = JSON.parse(data);

        const convertedRecords = records.map((record: any) => {
          const converted = { ...record };
          for (const [key, type] of Object.entries(schema)) {
            if (type === "datetime" && typeof converted[key] === "string") {
              converted[key] = new Date(converted[key]);
            }
          }
          return converted;
        });

        await this.collection.init(convertedRecords);

        // Migrate to binary format
        if (this.options.format === "binary") {
          await this.commit();
          // Delete old JSON file
          try {
            await fs.unlink(jsonPath);
          } catch {}
        }
      } catch (jsonError) {
        // No existing data, initialize empty
        await this.collection.init([]);
      }
    } catch (error) {
      console.error("Error loading collection:", error);
      await this.collection.init([]);
    }
  }

  /**
   * Saves collection data to persistent storage
   * Uses binary format by default, JSON as fallback
   * @throws {Error} On filesystem write errors
   * @returns {Promise<void>}
   */
  public async commit(): Promise<void> {
    if (!this.options.persist) return;

    const schema = this.collection.getSchema();
    const records = await this.collection.all();
    const indexes = this.collection.listIndexes().map((name) => {
      const stats = this.collection.getIndexStats().find((s) => s.name === name);
      return {
        name,
        field: stats?.field || "",
        unique: stats?.unique || false,
      };
    });

    const dirPath = path.join(process.cwd(), MOCK_PERSIST_DIRECTORY);

    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }

    if (this.options.format === "binary") {
      // Save as binary format
      const buffer = BinaryStorage.serialize(schema, records, indexes);
      const filePath = this.getBinaryFilePath();
      await fs.writeFile(filePath, buffer);
    } else {
      // Save as JSON format (legacy)
      const convertedRecords = records.map((record) => {
        const converted: any = { ...record };
        for (const [key, type] of Object.entries(schema)) {
          if (type === "datetime" && converted[key] instanceof Date) {
            converted[key] = converted[key].toISOString();
          }
        }
        return converted;
      });

      const content = JSON.stringify(
        { schema, records: convertedRecords },
        null,
        2
      );

      const filePath = this.getFilePath();
      await fs.writeFile(filePath, content, { encoding: "utf-8" });
    }
  }

  /**
   * Updates persistence configuration
   * @param {Partial<MockPersistOptions>} options - New options to merge with current configuration
   * @returns {void}
   */
  public configure(options: Partial<MockPersistOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Gets the file path for the collection's persistent storage (JSON format)
   * @returns {string} The file path for the persisted data
   */
  private getFilePath(): string {
    return path.join(
      process.cwd(),
      MOCK_PERSIST_DIRECTORY,
      `${this.name}-collection.json`
    );
  }

  /**
   * Gets the file path for the collection's binary storage
   * @returns {string} The file path for the binary data
   */
  private getBinaryFilePath(): string {
    return path.join(
      process.cwd(),
      MOCK_PERSIST_DIRECTORY,
      `${this.name}-collection.mdb`
    );
  }

  /**
   * Retrieves metadata about the persisted collection
   * @returns {Promise<MockPersistHealth>} Health metadata including file size and timestamps
   */
  public async health(): Promise<MockPersistHealth> {
    let filePath = this.getBinaryFilePath();

    try {
      const stats = await fs.stat(filePath);

      return {
        size: stats.size,
        createdAt: stats.birthtime,
        lastModified: stats.mtime,
      };
    } catch (error) {
      // Try JSON fallback
      filePath = this.getFilePath();
      try {
        const stats = await fs.stat(filePath);

        return {
          size: stats.size,
          createdAt: stats.birthtime,
          lastModified: stats.mtime,
        };
      } catch {
        return {};
      }
    }
  }
}
