/**
 * Binary storage format for efficient data persistence
 * Inspired by SQLite's storage engine
 */

import { MockRecordSchema, MockView, InferSchemaType } from "./record";
import { IndexConfig } from "./index";

/**
 * Binary file format:
 *
 * Header (64 bytes):
 * - Magic number (4 bytes): 0x4D4F434B ('MOCK')
 * - Version (4 bytes): Format version
 * - Schema offset (8 bytes): Offset to schema section
 * - Index offset (8 bytes): Offset to index section
 * - Data offset (8 bytes): Offset to data section
 * - Record count (8 bytes): Number of records
 * - Reserved (24 bytes): For future use
 *
 * Schema section:
 * - Field count (4 bytes)
 * - For each field:
 *   - Name length (4 bytes)
 *   - Name (variable)
 *   - Type (1 byte): 0=string, 1=number, 2=boolean, 3=datetime
 *
 * Index section:
 * - Index count (4 bytes)
 * - For each index:
 *   - Name length (4 bytes)
 *   - Name (variable)
 *   - Field length (4 bytes)
 *   - Field (variable)
 *   - Flags (1 byte): bit 0=unique
 *
 * Data section:
 * - For each record:
 *   - Record length (4 bytes)
 *   - ID length (4 bytes)
 *   - ID (variable)
 *   - For each field:
 *     - Value type (1 byte)
 *     - Value length (4 bytes)
 *     - Value (variable)
 */

const MAGIC_NUMBER = 0x4d4f434b; // 'MOCK'
const FORMAT_VERSION = 1;
const HEADER_SIZE = 64;

/**
 * Type codes for binary serialization
 */
enum TypeCode {
  STRING = 0,
  NUMBER = 1,
  BOOLEAN = 2,
  DATETIME = 3,
  NULL = 4,
}

/**
 * Binary storage metadata
 */
export interface BinaryStorageHeader {
  version: number;
  schemaOffset: number;
  indexOffset: number;
  dataOffset: number;
  recordCount: number;
}

/**
 * Binary storage writer
 */
export class BinaryWriter {
  private buffer: Buffer;
  private offset: number = 0;

  constructor(initialSize: number = 1024) {
    this.buffer = Buffer.allocUnsafe(initialSize);
  }

  /**
   * Ensures buffer has enough space
   */
  private ensureCapacity(additionalBytes: number): void {
    const required = this.offset + additionalBytes;
    if (required > this.buffer.length) {
      const newSize = Math.max(required, this.buffer.length * 2);
      const newBuffer = Buffer.allocUnsafe(newSize);
      this.buffer.copy(newBuffer);
      this.buffer = newBuffer;
    }
  }

  /**
   * Writes a 32-bit unsigned integer
   */
  public writeUInt32(value: number): void {
    this.ensureCapacity(4);
    this.buffer.writeUInt32LE(value, this.offset);
    this.offset += 4;
  }

  /**
   * Writes a 64-bit unsigned integer (as BigInt)
   */
  public writeUInt64(value: number): void {
    this.ensureCapacity(8);
    this.buffer.writeBigUInt64LE(BigInt(value), this.offset);
    this.offset += 8;
  }

  /**
   * Writes a single byte
   */
  public writeByte(value: number): void {
    this.ensureCapacity(1);
    this.buffer.writeUInt8(value, this.offset);
    this.offset += 1;
  }

  /**
   * Writes a double (64-bit float)
   */
  public writeDouble(value: number): void {
    this.ensureCapacity(8);
    this.buffer.writeDoubleLE(value, this.offset);
    this.offset += 8;
  }

  /**
   * Writes a string with length prefix
   */
  public writeString(value: string): void {
    const stringBuffer = Buffer.from(value, "utf8");
    this.writeUInt32(stringBuffer.length);
    this.ensureCapacity(stringBuffer.length);
    stringBuffer.copy(this.buffer, this.offset);
    this.offset += stringBuffer.length;
  }

  /**
   * Writes raw bytes
   */
  public writeBytes(bytes: Buffer): void {
    this.ensureCapacity(bytes.length);
    bytes.copy(this.buffer, this.offset);
    this.offset += bytes.length;
  }

  /**
   * Returns current offset
   */
  public getOffset(): number {
    return this.offset;
  }

  /**
   * Sets offset (for seeking)
   */
  public setOffset(offset: number): void {
    this.offset = offset;
  }

  /**
   * Returns the final buffer
   */
  public toBuffer(): Buffer {
    return this.buffer.slice(0, this.offset);
  }
}

/**
 * Binary storage reader
 */
export class BinaryReader {
  private buffer: Buffer;
  private offset: number = 0;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  /**
   * Reads a 32-bit unsigned integer
   */
  public readUInt32(): number {
    const value = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  /**
   * Reads a 64-bit unsigned integer
   */
  public readUInt64(): number {
    const value = Number(this.buffer.readBigUInt64LE(this.offset));
    this.offset += 8;
    return value;
  }

  /**
   * Reads a single byte
   */
  public readByte(): number {
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  /**
   * Reads a double
   */
  public readDouble(): number {
    const value = this.buffer.readDoubleLE(this.offset);
    this.offset += 8;
    return value;
  }

  /**
   * Reads a string with length prefix
   */
  public readString(): string {
    const length = this.readUInt32();
    const value = this.buffer.toString(
      "utf8",
      this.offset,
      this.offset + length
    );
    this.offset += length;
    return value;
  }

  /**
   * Reads raw bytes
   */
  public readBytes(length: number): Buffer {
    const bytes = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }

  /**
   * Returns current offset
   */
  public getOffset(): number {
    return this.offset;
  }

  /**
   * Sets offset
   */
  public setOffset(offset: number): void {
    this.offset = offset;
  }

  /**
   * Checks if there's more data to read
   */
  public hasMore(): boolean {
    return this.offset < this.buffer.length;
  }
}

/**
 * Binary storage serializer
 */
export class BinaryStorage {
  /**
   * Serializes collection data to binary format
   */
  public static serialize<T extends MockRecordSchema>(
    schema: T,
    records: MockView<InferSchemaType<T>>[],
    indexes: IndexConfig[]
  ): Buffer {
    const writer = new BinaryWriter(HEADER_SIZE + records.length * 256);

    // Write header placeholder
    const headerOffset = writer.getOffset();
    writer.setOffset(headerOffset + HEADER_SIZE);

    // Write schema section
    const schemaOffset = writer.getOffset();
    this.writeSchema(writer, schema);

    // Write index section
    const indexOffset = writer.getOffset();
    this.writeIndexes(writer, indexes);

    // Write data section
    const dataOffset = writer.getOffset();
    this.writeRecords(writer, schema, records);

    // Write header
    writer.setOffset(headerOffset);
    writer.writeUInt32(MAGIC_NUMBER);
    writer.writeUInt32(FORMAT_VERSION);
    writer.writeUInt64(schemaOffset);
    writer.writeUInt64(indexOffset);
    writer.writeUInt64(dataOffset);
    writer.writeUInt64(records.length);
    // Reserved space (24 bytes)
    for (let i = 0; i < 24; i++) {
      writer.writeByte(0);
    }

    return writer.toBuffer();
  }

  /**
   * Writes schema to binary format
   */
  private static writeSchema<T extends MockRecordSchema>(
    writer: BinaryWriter,
    schema: T
  ): void {
    const fields = Object.entries(schema);
    writer.writeUInt32(fields.length);

    for (const [fieldName, fieldType] of fields) {
      writer.writeString(fieldName);

      // Write type code
      let typeCode: TypeCode;
      switch (fieldType) {
        case "string":
          typeCode = TypeCode.STRING;
          break;
        case "number":
          typeCode = TypeCode.NUMBER;
          break;
        case "boolean":
          typeCode = TypeCode.BOOLEAN;
          break;
        case "datetime":
          typeCode = TypeCode.DATETIME;
          break;
        default:
          typeCode = TypeCode.STRING;
      }
      writer.writeByte(typeCode);
    }
  }

  /**
   * Writes indexes to binary format
   */
  private static writeIndexes(
    writer: BinaryWriter,
    indexes: IndexConfig[]
  ): void {
    writer.writeUInt32(indexes.length);

    for (const index of indexes) {
      writer.writeString(index.name);
      writer.writeString(index.field);

      // Write flags
      let flags = 0;
      if (index.unique) flags |= 1;
      writer.writeByte(flags);
    }
  }

  /**
   * Writes records to binary format
   */
  private static writeRecords<T extends MockRecordSchema>(
    writer: BinaryWriter,
    schema: T,
    records: MockView<InferSchemaType<T>>[]
  ): void {
    for (const record of records) {
      const recordStart = writer.getOffset();

      // Placeholder for record length
      writer.writeUInt32(0);

      // Write ID
      writer.writeString(record.id);

      // Write fields
      for (const [fieldName, fieldType] of Object.entries(schema)) {
        const value = (record as any)[fieldName];

        if (value === null || value === undefined) {
          writer.writeByte(TypeCode.NULL);
          writer.writeUInt32(0);
          continue;
        }

        switch (fieldType) {
          case "string":
            writer.writeByte(TypeCode.STRING);
            writer.writeString(value);
            break;

          case "number":
            writer.writeByte(TypeCode.NUMBER);
            writer.writeUInt32(8);
            writer.writeDouble(value);
            break;

          case "boolean":
            writer.writeByte(TypeCode.BOOLEAN);
            writer.writeUInt32(1);
            writer.writeByte(value ? 1 : 0);
            break;

          case "datetime":
            writer.writeByte(TypeCode.DATETIME);
            writer.writeUInt32(8);
            writer.writeDouble(value.getTime());
            break;
        }
      }

      // Write record length
      const recordEnd = writer.getOffset();
      const recordLength = recordEnd - recordStart - 4;
      const currentOffset = writer.getOffset();
      writer.setOffset(recordStart);
      writer.writeUInt32(recordLength);
      writer.setOffset(currentOffset);
    }
  }

  /**
   * Deserializes binary data to collection format
   */
  public static deserialize(buffer: Buffer): {
    schema: MockRecordSchema;
    records: any[];
    indexes: IndexConfig[];
  } {
    const reader = new BinaryReader(buffer);

    // Read header
    const magic = reader.readUInt32();
    if (magic !== MAGIC_NUMBER) {
      throw new Error("Invalid binary format: magic number mismatch");
    }

    const version = reader.readUInt32();
    if (version !== FORMAT_VERSION) {
      throw new Error(`Unsupported format version: ${version}`);
    }

    const schemaOffset = reader.readUInt64();
    const indexOffset = reader.readUInt64();
    const dataOffset = reader.readUInt64();
    const recordCount = reader.readUInt64();

    // Read schema
    reader.setOffset(schemaOffset);
    const schema = this.readSchema(reader);

    // Read indexes
    reader.setOffset(indexOffset);
    const indexes = this.readIndexes(reader);

    // Read records
    reader.setOffset(dataOffset);
    const records = this.readRecords(reader, schema, recordCount);

    return { schema, records, indexes };
  }

  /**
   * Reads schema from binary format
   */
  private static readSchema(reader: BinaryReader): MockRecordSchema {
    const fieldCount = reader.readUInt32();
    const schema: MockRecordSchema = {};

    for (let i = 0; i < fieldCount; i++) {
      const fieldName = reader.readString();
      const typeCode = reader.readByte();

      let fieldType: "string" | "number" | "boolean" | "datetime";
      switch (typeCode) {
        case TypeCode.STRING:
          fieldType = "string";
          break;
        case TypeCode.NUMBER:
          fieldType = "number";
          break;
        case TypeCode.BOOLEAN:
          fieldType = "boolean";
          break;
        case TypeCode.DATETIME:
          fieldType = "datetime";
          break;
        default:
          fieldType = "string";
      }

      schema[fieldName] = fieldType;
    }

    return schema;
  }

  /**
   * Reads indexes from binary format
   */
  private static readIndexes(reader: BinaryReader): IndexConfig[] {
    const indexCount = reader.readUInt32();
    const indexes: IndexConfig[] = [];

    for (let i = 0; i < indexCount; i++) {
      const name = reader.readString();
      const field = reader.readString();
      const flags = reader.readByte();

      indexes.push({
        name,
        field,
        unique: (flags & 1) !== 0,
      });
    }

    return indexes;
  }

  /**
   * Reads records from binary format
   */
  private static readRecords(
    reader: BinaryReader,
    schema: MockRecordSchema,
    recordCount: number
  ): any[] {
    const records: any[] = [];

    for (let i = 0; i < recordCount; i++) {
      const recordLength = reader.readUInt32();
      const id = reader.readString();
      const record: any = { id };

      for (const [fieldName, fieldType] of Object.entries(schema)) {
        const valueType = reader.readByte();

        if (valueType === TypeCode.NULL) {
          reader.readUInt32(); // Skip length
          record[fieldName] = null;
          continue;
        }

        const valueLength = reader.readUInt32();

        switch (fieldType) {
          case "string":
            reader.setOffset(reader.getOffset() - 4); // Rewind to re-read as string
            record[fieldName] = reader.readString();
            break;

          case "number":
            record[fieldName] = reader.readDouble();
            break;

          case "boolean":
            record[fieldName] = reader.readByte() !== 0;
            break;

          case "datetime":
            const timestamp = reader.readDouble();
            record[fieldName] = new Date(timestamp);
            break;
        }
      }

      records.push(record);
    }

    return records;
  }

  /**
   * Estimates the size of serialized data
   */
  public static estimateSize<T extends MockRecordSchema>(
    schema: T,
    records: MockView<InferSchemaType<T>>[],
    indexes: IndexConfig[]
  ): number {
    let size = HEADER_SIZE;

    // Schema size
    size += 4; // field count
    for (const [fieldName] of Object.entries(schema)) {
      size += 4 + Buffer.byteLength(fieldName, "utf8") + 1;
    }

    // Index size
    size += 4; // index count
    for (const index of indexes) {
      size += 4 + Buffer.byteLength(index.name, "utf8");
      size += 4 + Buffer.byteLength(index.field, "utf8");
      size += 1; // flags
    }

    // Records size (rough estimate)
    size += records.length * 100; // Average ~100 bytes per record

    return size;
  }
}
