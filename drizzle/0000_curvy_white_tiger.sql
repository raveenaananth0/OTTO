CREATE TABLE `grow_locks` (
	`pair` text PRIMARY KEY NOT NULL,
	`operation` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `grow_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`phase` text NOT NULL,
	`amount` integer NOT NULL,
	`payload` text NOT NULL,
	`receipt` text,
	`error` text,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
