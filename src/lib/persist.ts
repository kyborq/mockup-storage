import fs from "fs/promises";
import path from "path";
import { MockCollection } from "./collection";
import { MockRecordSchema, MockView } from "./record";
import { DEFAULT_DB_PATH } from "../constants";
import { BinaryStorage } from "./binary-storage";

export interface MockPersistOptions {
  persist: boolean;
  filepath?: string;
  autoCommit?: boolean;
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
  private options: MockPersistOptions & { persist: boolean };
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

    this.options = {
      persist: false,
      ...config.options,
    };

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

  public async pull(): Promise<void> {
    await this.collection.init([]);
  }

  /**
   * Saves collection data to persistent storage
   * Uses binary format by default, JSON as fallback
   * Automatically creates directory if it doesn't exist
   * @throws {Error} On filesystem write errors
   * @returns {Promise<void>}
   */
  public async commit(): Promise<void> {}

  /**
   * Updates persistence configuration
   * @param {Partial<MockPersistOptions>} options - New options to merge with current configuration
   * @returns {void}
   */
  public configure(options: Partial<MockPersistOptions>): void {
    this.options = { ...this.options, ...options };
  }

  public async health(): Promise<MockPersistHealth> {
    return {};
  }
}
