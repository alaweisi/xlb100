import type { CapacitorConfig } from "@capacitor/cli";
import { toCapacitorConfig } from "@xlb/mobile-foundation/capacitor";
import metadata from "./mobile-app.metadata.json";

const config: CapacitorConfig = toCapacitorConfig(metadata);

export default config;
