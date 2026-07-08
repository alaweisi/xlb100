import { runSeeds } from "./seedRunner.js";

const result = await runSeeds();
console.log(JSON.stringify(result, null, 2));
