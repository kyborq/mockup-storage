import fs from "fs/promises";
import path from "path";
import { MockCollection } from "./collection";
import { MockRecordSchema, MockView } from "./record";
import { MOCK_PERSIST_DIRECTORY } from "../constants";

/**
 * Configuration options for MockPersist
 */
export interface MockPersistOptions {
  /** Whether to persist the collection data to the file system */
  persist: boolean;
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

    this.options = { persist: false, ...config.options };

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
   * @throws {SyntaxError} If the file contains invalid JSON
   * @returns {Promise<void>}
   */
  public async pull(): Promise<void> {
    if (!this.options.persist) return;

    const filePath = this.getFilePath();
    try {
      const data = await fs.readFile(filePath, "utf-8");
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
    } catch (error) {
      await this.collection.init([]);
    }
  }

  /**
   * Saves collection data to persistent storage
   * @throws {Error} On filesystem write errors
   * @returns {Promise<void>}
   */
  public async commit(): Promise<void> {
    if (!this.options.persist) return;

    const schema = this.collection.getSchema();
    const records = await this.collection.all();

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

    const dirPath = path.join(process.cwd(), MOCK_PERSIST_DIRECTORY);
    const filePath = this.getFilePath();

    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }

    await fs.writeFile(filePath, content, { encoding: "utf-8" });
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
   * Gets the file path for the collection's persistent storage
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
   * Retrieves metadata about the persisted collection
   * @returns {Promise<MockPersistHealth>} Health metadata including file size and timestamps
   */
  public async health(): Promise<MockPersistHealth> {
    const filePath = this.getFilePath();

    try {
      const stats = await fs.stat(filePath);

      return {
        size: stats.size,
        createdAt: stats.birthtime,
        lastModified: stats.mtime,
      };
    } catch (error) {
      return {};
    }
  }
}
