import { Prisma } from "@prisma/client";

/**
 * Helpers for jsonb columns.
 *
 * Prisma draws a distinction the rest of the codebase does not care about:
 * writing `null` to a nullable Json column means "the JSON value null", and
 * clearing it needs `Prisma.DbNull`. Reads come back as a wide `JsonValue`
 * union that has to be narrowed before use.
 */

/** Write helper: `undefined`/`null` clear the column instead of storing JSON null. */
export function jsonOrDbNull(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined
    ? Prisma.DbNull
    : (value as Prisma.InputJsonValue);
}

/** Narrows a jsonb read to an object, or null when it holds anything else. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Narrows a jsonb read to an array of T, or an empty array. */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Reads one field off a jsonb column as an array. */
export function arrayField<T>(value: unknown, key: string): T[] {
  const record = asRecord(value);
  return record ? asArray<T>(record[key]) : [];
}

/** Reads one numeric field off a jsonb column. */
export function numberField(value: unknown, key: string): number | null {
  const record = asRecord(value);
  return record && typeof record[key] === "number" ? (record[key] as number) : null;
}
