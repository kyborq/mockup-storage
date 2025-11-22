/**
 * Relations system for creating foreign key relationships between collections
 * Similar to SQL foreign keys and JOIN operations
 */

import { MockRecordSchema, InferSchemaType, MockView } from "./record";
import { MockCollection } from "./collection";

/**
 * Relation types
 */
export type RelationType = "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";

/**
 * Relation configuration
 * @template SourceSchema - Source collection schema
 * @template TargetSchema - Target collection schema
 */
export interface RelationConfig<
  SourceSchema extends MockRecordSchema,
  TargetSchema extends MockRecordSchema
> {
  /** Name of the relation */
  name: string;
  /** Source collection */
  sourceCollection: MockCollection<SourceSchema>;
  /** Target collection */
  targetCollection: MockCollection<TargetSchema>;
  /** Source field (foreign key field) - TypeScript will autocomplete available fields */
  sourceField: keyof InferSchemaType<SourceSchema>;
  /** Target field (usually 'id' or unique field) - TypeScript will autocomplete available fields */
  targetField: keyof InferSchemaType<TargetSchema>;
  /** Type of relation */
  type: RelationType;
  /** Cascade delete (default: false) */
  onDelete?: "cascade" | "set-null" | "restrict";
}

/**
 * Type-safe relation configuration builder
 * Provides full type hints and autocomplete for field names
 */
export type TypedRelationConfig<
  SourceSchema extends MockRecordSchema,
  TargetSchema extends MockRecordSchema,
  SourceField extends keyof InferSchemaType<SourceSchema>,
  TargetField extends keyof InferSchemaType<TargetSchema>
> = {
  /** Name of the relation */
  name: string;
  /** Source collection */
  sourceCollection: MockCollection<SourceSchema>;
  /** Target collection */
  targetCollection: MockCollection<TargetSchema>;
  /** Source field (foreign key field) - fully typed */
  sourceField: SourceField;
  /** Target field (usually 'id' or unique field) - fully typed */
  targetField: TargetField;
  /** Type of relation */
  type: RelationType;
  /** Cascade delete (default: false) */
  onDelete?: "cascade" | "set-null" | "restrict";
};

/**
 * JOIN types
 */
export type JoinType = "inner" | "left" | "right" | "full";

/**
 * JOIN result - combines two record types
 */
export type JoinResult<S1 extends MockRecordSchema, S2 extends MockRecordSchema> = MockView<
  InferSchemaType<S1>
> & {
  joined: MockView<InferSchemaType<S2>> | null;
};

/**
 * Relation class representing a foreign key relationship
 */
export class Relation<
  SourceSchema extends MockRecordSchema,
  TargetSchema extends MockRecordSchema
> {
  private config: Required<RelationConfig<SourceSchema, TargetSchema>>;

  constructor(config: RelationConfig<SourceSchema, TargetSchema>) {
    this.config = {
      onDelete: "restrict",
      ...config,
    };

    // Validate that target field has an index for efficient lookups
    this.validateRelation();
  }

  /**
   * Validates the relation configuration
   */
  private validateRelation(): void {
    const targetField = this.config.targetField as string;
    const indexes = this.config.targetCollection.listIndexes();
    const hasIndex = this.config.targetCollection
      .getIndexStats()
      .some((idx) => idx.field === targetField);

    if (!hasIndex) {
      console.warn(
        `Warning: No index on target field "${targetField}". ` +
          `Consider creating an index for better JOIN performance.`
      );
    }
  }

  /**
   * Performs an INNER JOIN
   * Returns only records that have matching records in both collections
   */
  public async innerJoin(): Promise<JoinResult<SourceSchema, TargetSchema>[]> {
    const sourceRecords = await this.config.sourceCollection.all();
    const results: JoinResult<SourceSchema, TargetSchema>[] = [];

    for (const sourceRecord of sourceRecords) {
      const foreignKeyValue = sourceRecord[
        this.config.sourceField as keyof typeof sourceRecord
      ] as any;

      const targetRecord = await this.config.targetCollection.findByField(
        this.config.targetField,
        foreignKeyValue
      );

      if (targetRecord) {
        results.push({
          ...sourceRecord,
          joined: targetRecord,
        });
      }
    }

    return results;
  }

  /**
   * Performs a LEFT JOIN
   * Returns all records from source, with matched target records (or null)
   */
  public async leftJoin(): Promise<JoinResult<SourceSchema, TargetSchema>[]> {
    const sourceRecords = await this.config.sourceCollection.all();
    const results: JoinResult<SourceSchema, TargetSchema>[] = [];

    for (const sourceRecord of sourceRecords) {
      const foreignKeyValue = sourceRecord[
        this.config.sourceField as keyof typeof sourceRecord
      ] as any;

      const targetRecord = await this.config.targetCollection.findByField(
        this.config.targetField,
        foreignKeyValue
      );

      results.push({
        ...sourceRecord,
        joined: targetRecord || null,
      });
    }

    return results;
  }

  /**
   * Performs a RIGHT JOIN
   * Returns all records from target, with matched source records (or null)
   */
  public async rightJoin(): Promise<
    Array<
      MockView<InferSchemaType<TargetSchema>> & {
        joined: MockView<InferSchemaType<SourceSchema>> | null;
      }
    >
  > {
    const targetRecords = await this.config.targetCollection.all();
    const results: Array<
      MockView<InferSchemaType<TargetSchema>> & {
        joined: MockView<InferSchemaType<SourceSchema>> | null;
      }
    > = [];

    for (const targetRecord of targetRecords) {
      const targetValue = targetRecord[
        this.config.targetField as keyof typeof targetRecord
      ] as any;

      // Find all source records that reference this target
      const sourceRecords = await this.config.sourceCollection.find(
        (record) =>
          (record as any)[this.config.sourceField as string] === targetValue
      );

      if (sourceRecords.length > 0) {
        for (const sourceRecord of sourceRecords) {
          results.push({
            ...targetRecord,
            joined: sourceRecord,
          });
        }
      } else {
        results.push({
          ...targetRecord,
          joined: null,
        });
      }
    }

    return results;
  }

  /**
   * Gets all target records related to a source record
   * For one-to-many relationships
   */
  public async getRelated(
    sourceRecord: MockView<InferSchemaType<SourceSchema>>
  ): Promise<MockView<InferSchemaType<TargetSchema>>[]> {
    const foreignKeyValue = sourceRecord[
      this.config.sourceField as keyof typeof sourceRecord
    ] as any;

    if (this.config.type === "one-to-one") {
      const record = await this.config.targetCollection.findByField(
        this.config.targetField,
        foreignKeyValue
      );
      return record ? [record] : [];
    }

    // For one-to-many and many-to-many
    return this.config.targetCollection.find(
      (record) => (record as any)[this.config.targetField as string] === foreignKeyValue
    );
  }

  /**
   * Validates referential integrity
   * Checks if all foreign keys reference existing records
   */
  public async validateIntegrity(): Promise<{
    valid: boolean;
    orphanedRecords: Array<{ id: string; field: string; value: any }>;
  }> {
    const sourceRecords = await this.config.sourceCollection.all();
    const orphanedRecords: Array<{ id: string; field: string; value: any }> = [];

    for (const sourceRecord of sourceRecords) {
      const foreignKeyValue = sourceRecord[
        this.config.sourceField as keyof typeof sourceRecord
      ] as any;

      if (foreignKeyValue !== null && foreignKeyValue !== undefined) {
        const targetRecord = await this.config.targetCollection.findByField(
          this.config.targetField,
          foreignKeyValue
        );

        if (!targetRecord) {
          orphanedRecords.push({
            id: sourceRecord.id,
            field: this.config.sourceField as string,
            value: foreignKeyValue,
          });
        }
      }
    }

    return {
      valid: orphanedRecords.length === 0,
      orphanedRecords,
    };
  }

  /**
   * Handles cascade delete
   * When a target record is deleted, handle source records
   */
  public async handleDelete(
    targetValue: any
  ): Promise<{ deleted: number; updated: number }> {
    const sourceRecords = await this.config.sourceCollection.find(
      (record) => (record as any)[this.config.sourceField as string] === targetValue
    );

    let deleted = 0;
    let updated = 0;

    switch (this.config.onDelete) {
      case "cascade":
        // Delete all referencing records
        for (const record of sourceRecords) {
          await this.config.sourceCollection.remove(record.id);
          deleted++;
        }
        break;

      case "set-null":
        // Set foreign key to null (not implemented in current architecture)
        // Would require update functionality
        console.warn("SET NULL not yet implemented");
        break;

      case "restrict":
        // Prevent deletion if there are referencing records
        if (sourceRecords.length > 0) {
          throw new Error(
            `Cannot delete: ${sourceRecords.length} record(s) reference this target`
          );
        }
        break;
    }

    return { deleted, updated };
  }

  /**
   * Returns relation metadata
   */
  public getMetadata() {
    return {
      name: this.config.name,
      type: this.config.type,
      sourceField: this.config.sourceField,
      targetField: this.config.targetField,
      onDelete: this.config.onDelete,
    };
  }
}

/**
 * Relation manager for handling multiple relations
 */
export class RelationManager {
  private relations: Map<string, Relation<any, any>> = new Map();

  /**
   * Defines a new relation
   */
  public defineRelation<
    SourceSchema extends MockRecordSchema,
    TargetSchema extends MockRecordSchema
  >(
    config: RelationConfig<SourceSchema, TargetSchema>
  ): Relation<SourceSchema, TargetSchema> {
    if (this.relations.has(config.name)) {
      throw new Error(`Relation "${config.name}" already exists`);
    }

    const relation = new Relation(config);
    this.relations.set(config.name, relation);
    return relation;
  }

  /**
   * Gets a relation by name
   */
  public getRelation(name: string): Relation<any, any> | undefined {
    return this.relations.get(name);
  }

  /**
   * Lists all relations
   */
  public listRelations(): string[] {
    return Array.from(this.relations.keys());
  }

  /**
   * Removes a relation
   */
  public removeRelation(name: string): boolean {
    return this.relations.delete(name);
  }

  /**
   * Validates integrity of all relations
   */
  public async validateAllIntegrity(): Promise<
    Record<
      string,
      { valid: boolean; orphanedRecords: Array<{ id: string; field: string; value: any }> }
    >
  > {
    const results: Record<
      string,
      { valid: boolean; orphanedRecords: Array<{ id: string; field: string; value: any }> }
    > = {};

    for (const [name, relation] of this.relations.entries()) {
      results[name] = await relation.validateIntegrity();
    }

    return results;
  }

  /**
   * Gets relation metadata for all relations
   */
  public getAllMetadata() {
    const metadata: Record<string, any> = {};
    for (const [name, relation] of this.relations.entries()) {
      metadata[name] = relation.getMetadata();
    }
    return metadata;
  }
}

/**
 * Helper function to create type-safe relation with full autocomplete
 * @example
 * const postsToUsers = createRelation({
 *   name: 'posts_user',
 *   sourceCollection: posts,
 *   targetCollection: users,
 *   sourceField: 'userId', // TypeScript autocompletes available fields
 *   targetField: 'id',     // TypeScript autocompletes available fields
 *   type: 'many-to-one'
 * });
 */
export function createRelation<
  SourceSchema extends MockRecordSchema,
  TargetSchema extends MockRecordSchema
>(
  config: RelationConfig<SourceSchema, TargetSchema> | {
    name: string;
    sourceCollection: any;
    targetCollection: any;
    sourceField: any;
    targetField: any;
    type: RelationType;
    onDelete?: "cascade" | "set-null" | "restrict";
  }
): Relation<SourceSchema, TargetSchema> {
  return new Relation(config as RelationConfig<SourceSchema, TargetSchema>);
}

