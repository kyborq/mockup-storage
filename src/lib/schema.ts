/**
 * Unified schema system with full metadata support
 * This is now the primary and only way to define schemas
 */

import { MockRecordSchema } from "./record";

/**
 * Relation types
 */
export type RelationType =
  | "one-to-one"
  | "one-to-many"
  | "many-to-one"
  | "many-to-many";

/**
 * Relation configuration in field definition
 */
export interface FieldRelation {
  /** Target collection name */
  collection: string;
  /** Relation type */
  type: RelationType;
  /** Cascade behavior on delete */
  onDelete?: "cascade" | "set-null" | "restrict";
}

/**
 * Field definition with complete metadata
 */
export interface FieldDefinition {
  /** Field type */
  type: "string" | "number" | "boolean" | "datetime";
  /** Create index on this field */
  index?: boolean;
  /** Field must be unique */
  unique?: boolean;
  /** Field is required */
  required?: boolean;
  /** Default value */
  default?: any;
  /** Relation definition (for foreign keys) */
  relation?: FieldRelation;
}

/**
 * Collection schema - uses field definitions
 */
export type CollectionSchema = Record<string, FieldDefinition>;

/**
 * Database schemas - collection name to schema mapping
 */
export type DatabaseSchemas = Record<string, CollectionSchema>;

/**
 * Converts collection schema to simple MockRecordSchema format
 */
export function toSimpleSchema(schema: CollectionSchema): MockRecordSchema {
  const simpleSchema: MockRecordSchema = {};
  for (const [key, value] of Object.entries(schema)) {
    simpleSchema[key] = value.type;
  }
  return simpleSchema;
}

/**
 * Extracts index configurations from schema
 */
export function extractIndexConfigs(
  schema: CollectionSchema
): Array<{ name: string; field: string; unique: boolean }> {
  const indexes: Array<{ name: string; field: string; unique: boolean }> = [];

  for (const [fieldName, fieldDef] of Object.entries(schema)) {
    if (fieldDef.index || fieldDef.unique) {
      indexes.push({
        name: `${fieldName}_idx`,
        field: fieldName,
        unique: fieldDef.unique || false,
      });
    }
  }

  return indexes;
}

/**
 * Extracts relation configurations from schema
 */
export function extractRelationConfigs(
  collectionName: string,
  schema: CollectionSchema
): Array<{
  name: string;
  sourceCollection: string;
  targetCollection: string;
  sourceField: string;
  targetField: string;
  type: RelationType;
  onDelete?: "cascade" | "set-null" | "restrict";
}> {
  const relations: Array<{
    name: string;
    sourceCollection: string;
    targetCollection: string;
    sourceField: string;
    targetField: string;
    type: RelationType;
    onDelete?: "cascade" | "set-null" | "restrict";
  }> = [];

  for (const [fieldName, fieldDef] of Object.entries(schema)) {
    if (fieldDef.relation) {
      relations.push({
        name: `${collectionName}_${fieldName}_${fieldDef.relation.collection}`,
        sourceCollection: collectionName,
        targetCollection: fieldDef.relation.collection,
        sourceField: fieldName,
        targetField: "id", // By convention, relations point to ID
        type: fieldDef.relation.type,
        onDelete: fieldDef.relation.onDelete || "restrict",
      });
    }
  }

  return relations;
}

/**
 * Type helper to infer TypeScript type from field type
 */
type InferFieldType<T extends FieldDefinition["type"]> = T extends "string"
  ? string
  : T extends "number"
  ? number
  : T extends "boolean"
  ? boolean
  : T extends "datetime"
  ? Date
  : never;

/**
 * Type helper to infer record type from collection schema
 */
export type InferRecordType<T extends CollectionSchema> = {
  [K in keyof T]: InferFieldType<T[K]["type"]>;
};
