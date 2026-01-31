export * from "./github";
export * from "./vercel";

// Re-export Figma integration from existing location
export {
  getFigmaAuthUrl,
  exchangeFigmaCode,
  saveFigmaIntegration,
  getFigmaIntegration,
  deleteFigmaIntegration,
  getFigmaUser,
} from "@/lib/figma/oauth";
