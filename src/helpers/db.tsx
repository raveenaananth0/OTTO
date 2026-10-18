// Local compile adapter for the schema already provisioned in Floot.
import{Kysely,PostgresDialect,type Generated,type ColumnType}from"kysely";import{Pool}from"pg";
type Timestamp=ColumnType<Date,Date|string|undefined,Date|string>;
type WorkspaceTable={sessionHash:string;data:unknown;updatedAt:Timestamp};type ActionTable={id:string;sessionHash:string;actionKey:string;kind:string;amount:number|null;status:Generated<string>;externalId:string|null;detail:string|null;createdAt:Timestamp};
export const db=new Kysely<{ottoWorkspaces:WorkspaceTable;ottoActions:ActionTable}>({dialect:new PostgresDialect({pool:new Pool({connectionString:process.env.FLOOT_DATABASE_URL})})});
