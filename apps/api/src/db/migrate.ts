import { closeDatabase, runMigrations } from "./database.js";

runMigrations();
console.log("[tinyfish-demo] database migrations applied successfully.");
closeDatabase();
