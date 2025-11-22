/**
 * Single database file manager (SQLite-like behavior)
 * All collections stored in one binary file
 */

import fs from "fs/promises";
import path from "path";
import { DEFAULT_DB_PATH } from "../constants";
import { BinaryStorage } from "./binary-storage";
import { MockRecordSchema, MockView } from "./record";

/**
 * Database file format:
 * 
 * Header (64 bytes):
 * - Magic number (4 bytes): 0x4D4F434B ('MOCK')
 * - Version (4 bytes): Format version
 * - Collection count (4 bytes)
 * - Reserved (52 bytes)
 * 
 * For each collection:
 * - Collection name length (4 bytes)
 * - Collection name (variable)
 * - Collection data offset (8 bytes)
 * - Collection data length (8 bytes)
 * 
 * Collection data sections follow
 */

const MAGIC_NUMBER = 0x4d4f4442; // 'MODB' (Mockup Database)
const FORMAT_VERSION = 1;
const HEADER_SIZE = 64;

export interface CollectionData {
  name: string;
  schema: MockRecordSchema;
  records: any[];
  indexes: Array<{ name: string; field: string; unique: boolean }>;
}

export class DatabaseFile {
  private filepath: string;
  private collections: Map<string, CollectionData> = new Map();

  constructor(filepath?: string) {
    if (filepath) {
      this.filepath = path.isAbsolute(filepath)
        ? filepath
        : path.join(process.cwd(), filepath);
    } else {
      this.filepath = path.join(process.cwd(), DEFAULT_DB_PATH, "database.mdb");
    }

    // Ensure .mdb extension
    if (!this.filepath.endsWith(".mdb")) {
      this.filepath = `${this.filepath}.mdb`;
    }
  }

  /**
   * Loads all collections from database file
   */
  public async load(): Promise<void> {
    try {
      const buffer = await fs.readFile(this.filepath);
      this.collections = this.deserialize(buffer);
    } catch (error) {
      // File doesn't exist yet - that's okay
      this.collections = new Map();
    }
  }

  /**
   * Saves all collections to database file
   */
  public async save(): Promise<void> {
    const buffer = this.serialize();

    // Ensure directory exists
    const dirPath = path.dirname(this.filepath);
    await fs.mkdir(dirPath, { recursive: true });

    await fs.writeFile(this.filepath, buffer);
  }

  /**
   * Updates or adds a collection
   */
  public setCollection(data: CollectionData): void {
    this.collections.set(data.name, data);
  }

  /**
   * Gets a collection
   */
  public getCollection(name: string): CollectionData | undefined {
    return this.collections.get(name);
  }

  /**
   * Checks if collection exists
   */
  public hasCollection(name: string): boolean {
    return this.collections.has(name);
  }

  /**
   * Lists all collection names
   */
  public listCollections(): string[] {
    return Array.from(this.collections.keys());
  }

  /**
   * Serializes all collections to binary format
   */
  private serialize(): Buffer {
    const buffers: Buffer[] = [];
    const collectionMetadata: Array<{
      name: Buffer;
      dataOffset: number;
      dataLength: number;
    }> = [];

    let currentOffset = HEADER_SIZE;

    // Calculate metadata size
    for (const [name] of this.collections) {
      const nameBuffer = Buffer.from(name, "utf8");
      currentOffset += 4 + nameBuffer.length + 8 + 8; // name_len + name + offset + length
    }

    // Serialize each collection
    for (const [name, data] of this.collections) {
      const collectionBuffer = BinaryStorage.serialize(
        data.schema,
        data.records,
        data.indexes
      );

      collectionMetadata.push({
        name: Buffer.from(name, "utf8"),
        dataOffset: currentOffset,
        dataLength: collectionBuffer.length,
      });

      buffers.push(collectionBuffer);
      currentOffset += collectionBuffer.length;
    }

    // Create header
    const headerBuffer = Buffer.alloc(HEADER_SIZE);
    headerBuffer.writeUInt32LE(MAGIC_NUMBER, 0);
    headerBuffer.writeUInt32LE(FORMAT_VERSION, 4);
    headerBuffer.writeUInt32LE(this.collections.size, 8);

    // Create metadata section
    const metadataBuffers: Buffer[] = [];
    for (const meta of collectionMetadata) {
      const nameLen = Buffer.alloc(4);
      nameLen.writeUInt32LE(meta.name.length, 0);
      metadataBuffers.push(nameLen, meta.name);

      const offset = Buffer.alloc(8);
      offset.writeBigUInt64LE(BigInt(meta.dataOffset), 0);
      metadataBuffers.push(offset);

      const length = Buffer.alloc(8);
      length.writeBigUInt64LE(BigInt(meta.dataLength), 0);
      metadataBuffers.push(length);
    }

    return Buffer.concat([headerBuffer, ...metadataBuffers, ...buffers]);
  }

  /**
   * Deserializes database file
   */
  private deserialize(buffer: Buffer): Map<string, CollectionData> {
    const collections = new Map<string, CollectionData>();

    let offset = 0;

    // Read header
    const magic = buffer.readUInt32LE(offset);
    offset += 4;

    if (magic !== MAGIC_NUMBER) {
      throw new Error("Invalid database file: magic number mismatch");
    }

    const version = buffer.readUInt32LE(offset);
    offset += 4;

    if (version !== FORMAT_VERSION) {
      throw new Error(`Unsupported database version: ${version}`);
    }

    const collectionCount = buffer.readUInt32LE(offset);
    offset += 4;

    // Skip reserved space
    offset = HEADER_SIZE;

    // Read collection metadata
    const metadata: Array<{
      name: string;
      dataOffset: number;
      dataLength: number;
    }> = [];

    for (let i = 0; i < collectionCount; i++) {
      const nameLen = buffer.readUInt32LE(offset);
      offset += 4;

      const name = buffer.toString("utf8", offset, offset + nameLen);
      offset += nameLen;

      const dataOffset = Number(buffer.readBigUInt64LE(offset));
      offset += 8;

      const dataLength = Number(buffer.readBigUInt64LE(offset));
      offset += 8;

      metadata.push({ name, dataOffset, dataLength });
    }

    // Read collection data
    for (const meta of metadata) {
      const collectionBuffer = buffer.slice(
        meta.dataOffset,
        meta.dataOffset + meta.dataLength
      );

      const { schema, records, indexes } =
        BinaryStorage.deserialize(collectionBuffer);

      collections.set(meta.name, {
        name: meta.name,
        schema,
        records,
        indexes: indexes.map((idx) => ({
          name: idx.name,
          field: idx.field,
          unique: idx.unique || false,
        })),
      });
    }

    return collections;
  }

  /**
   * Gets file path
   */
  public getFilePath(): string {
    return this.filepath;
  }

  /**
   * Gets file stats
   */
  public async getStats() {
    try {
      const stats = await fs.stat(this.filepath);
      return {
        size: stats.size,
        createdAt: stats.birthtime,
        lastModified: stats.mtime,
        collections: this.collections.size,
      };
    } catch {
      return {
        size: 0,
        collections: this.collections.size,
      };
    }
  }
}

