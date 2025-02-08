import fs from "fs/promises";
import path from "path";
import { MockCollection } from "./collection";
import { MockView } from "./record";

const MOCK_PERSIST_DIRECTORY = ".mock";

/**
 * Configuration options for MockPersist
 */
export interface MockPersistOptions {
  persist: boolean;
}

/**
 * Configuration object for MockPersist constructor
 * @template T - Data type stored in the collection
 */
export interface MockPersistConfig<T> {
  /** Unique name for the collection */
  name: string;
  /** Collection instance to persist */
  collection: MockCollection<T>;
  /** Persistence configuration options */
  options?: MockPersistOptions;
}

/**
 * Persistence handler for MockCollection that syncs data with JSON files
 * @template T - Data type stored in the collection
 */
export class MockPersist<T> {
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
    this.options = config.options || {
      persist: false,
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

  /**
   * Loads data from persistent storage into the collection
   * @throws {SyntaxError} If file contains invalid JSON
   */
  public async pull(): Promise<void> {
    if (!this.options.persist) return;

    const filePath = this.getFilePath();
    try {
      const data = await fs.readFile(filePath, "utf-8");
      const parsedData: MockView<T>[] = JSON.parse(data);
      this.collection.init(parsedData);
    } catch (error) {
      this.collection.init([]);
    } finally {
      this.collection.onModify(this.commitCallback);
    }
  }

  /**
   * Saves collection data to persistent storage
   * @throws {Error} On filesystem write errors
   */
  public async commit(): Promise<void> {
    if (!this.options.persist) return;

    const records = this.collection.all();
    const content = JSON.stringify(records, null, 2);
    const dirPath = path.join(process.cwd(), MOCK_PERSIST_DIRECTORY);
    const filePath = this.getFilePath();

    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }

    await fs.writeFile(filePath, content, {
      encoding: "utf-8",
    });
  }

  /**
   * Updates persistence configuration
   * @param options - New options to merge with current configuration
   */
  public configure(options: Partial<MockPersistOptions>): void {
    this.options = { ...this.options, ...options };
  }

  private getFilePath(): string {
    return path.join(
      process.cwd(),
      MOCK_PERSIST_DIRECTORY,
      `${this.name}-collection.json`
    );
  }
}
