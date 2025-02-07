import type { Plugin } from "@hiveai/core";
import { EmailClientInterface } from "./clients/emailClient";

export const emailPlugin: Plugin = {
    name: "email",
    description: "Email plugin for Eliza",
    clients: [EmailClientInterface],
    actions: [],
    evaluators: [],
    services: [],
};

export * from "./types";

export default emailPlugin;
