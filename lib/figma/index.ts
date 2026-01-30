// Figma Integration Module
// Export all Figma-related functionality

export * from "./types";
export * from "./oauth";
export * from "./service";
export * from "./webhooks";

// Re-export main classes for convenience
export { FigmaService } from "./service";
export { FigmaWebhookService } from "./webhooks";
