import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const growOperations = sqliteTable("grow_operations", {
  id: text("id").primaryKey(),
  phase: text("phase").notNull(),
  amount: integer("amount").notNull(),
  payload: text("payload").notNull(),
  receipt: text("receipt"),
  error: text("error"),
  created: integer("created").notNull(),
  updated: integer("updated").notNull(),
});
export const growLocks = sqliteTable("grow_locks", {
  pair: text("pair").primaryKey(),
  operation: text("operation").notNull(),
});
