import axios, { AxiosInstance } from "axios";
import type {
  FigmaFile,
  FigmaNode,
  DesignTokens,
  ColorToken,
  TypographyToken,
  SpacingToken,
  ShadowToken,
  BorderToken,
  Color,
} from "./types";

// ============================================================================
// FIGMA API SERVICE
// ============================================================================

export class FigmaService {
  private client: AxiosInstance;

  constructor(accessToken: string) {
    this.client = axios.create({
      baseURL: "https://api.figma.com/v1",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  // ==========================================================================
  // FILE OPERATIONS
  // ==========================================================================

  async getFile(fileKey: string): Promise<FigmaFile> {
    const response = await this.client.get(`/files/${fileKey}`);
    return response.data;
  }

  async getFileVersions(fileKey: string): Promise<{
    versions: Array<{
      id: string;
      created_at: string;
      label: string;
      description: string;
      user: { id: string; handle: string };
    }>;
  }> {
    const response = await this.client.get(`/files/${fileKey}/versions`);
    return response.data;
  }

  async getNodes(
    fileKey: string,
    nodeIds: string[]
  ): Promise<Record<string, { document: FigmaNode }>> {
    const ids = nodeIds.join(",");
    const response = await this.client.get(`/files/${fileKey}/nodes`, {
      params: { ids },
    });
    return response.data.nodes;
  }

  async getImages(
    fileKey: string,
    nodeIds: string[],
    options: {
      scale?: number;
      format?: "jpg" | "png" | "svg" | "pdf";
    } = {}
  ): Promise<Record<string, string>> {
    const response = await this.client.get(`/images/${fileKey}`, {
      params: {
        ids: nodeIds.join(","),
        scale: options.scale ?? 2,
        format: options.format ?? "png",
      },
    });
    return response.data.images;
  }

  // ==========================================================================
  // COMPONENT OPERATIONS
  // ==========================================================================

  async getTeamComponents(teamId: string): Promise<{
    meta: { components: Array<{ key: string; name: string; description: string }> };
  }> {
    const response = await this.client.get(`/teams/${teamId}/components`);
    return response.data;
  }

  async getFileComponents(fileKey: string): Promise<{
    meta: { components: Array<{ key: string; name: string; file_key: string; node_id: string }> };
  }> {
    const response = await this.client.get(`/files/${fileKey}/components`);
    return response.data;
  }

  // ==========================================================================
  // DESIGN TOKEN EXTRACTION
  // ==========================================================================

  extractDesignTokens(node: FigmaNode, parentPath: string = ""): DesignTokens {
    const tokens: DesignTokens = {
      colors: [],
      typography: [],
      spacing: [],
      shadows: [],
      borders: [],
    };

    this.traverseNode(node, parentPath, tokens);
    return this.deduplicateTokens(tokens);
  }

  private traverseNode(
    node: FigmaNode,
    path: string,
    tokens: DesignTokens
  ): void {
    const currentPath = path ? `${path}/${node.name}` : node.name;

    // Extract colors from fills
    if (node.fills) {
      node.fills.forEach((fill, index) => {
        if (fill.type === "SOLID" && fill.color && fill.visible !== false) {
          tokens.colors.push({
            name: `${currentPath}-fill-${index}`,
            hex: this.colorToHex(fill.color),
            rgba: {
              r: Math.round(fill.color.r * 255),
              g: Math.round(fill.color.g * 255),
              b: Math.round(fill.color.b * 255),
              a: fill.opacity ?? fill.color.a ?? 1,
            },
            usage: "fill",
            nodeId: node.id,
          });
        }
      });
    }

    // Extract colors from strokes
    if (node.strokes) {
      node.strokes.forEach((stroke, index) => {
        if (stroke.type === "SOLID" && stroke.color && stroke.visible !== false) {
          tokens.colors.push({
            name: `${currentPath}-stroke-${index}`,
            hex: this.colorToHex(stroke.color),
            rgba: {
              r: Math.round(stroke.color.r * 255),
              g: Math.round(stroke.color.g * 255),
              b: Math.round(stroke.color.b * 255),
              a: stroke.opacity ?? stroke.color.a ?? 1,
            },
            usage: "stroke",
            nodeId: node.id,
          });
        }
      });

      // Extract border
      if (node.strokeWeight) {
        tokens.borders.push({
          name: `${currentPath}-border`,
          width: node.strokeWeight,
          color: node.strokes[0]?.color ? this.colorToHex(node.strokes[0].color) : "#000000",
          radius: node.cornerRadius,
          nodeId: node.id,
        });
      }
    }

    // Extract typography
    if (node.type === "TEXT" && node.style) {
      tokens.typography.push({
        name: `${currentPath}-text`,
        fontFamily: node.style.fontFamily,
        fontSize: node.style.fontSize,
        fontWeight: node.style.fontWeight,
        lineHeight: node.style.lineHeightPx,
        letterSpacing: node.style.letterSpacing,
        nodeId: node.id,
      });
    }

    // Extract spacing from auto-layout
    if (node.layoutMode && node.layoutMode !== "NONE") {
      if (node.paddingLeft !== undefined) {
        tokens.spacing.push({
          name: `${currentPath}-padding-left`,
          value: node.paddingLeft,
          type: "padding",
          nodeId: node.id,
        });
      }
      if (node.paddingRight !== undefined) {
        tokens.spacing.push({
          name: `${currentPath}-padding-right`,
          value: node.paddingRight,
          type: "padding",
          nodeId: node.id,
        });
      }
      if (node.paddingTop !== undefined) {
        tokens.spacing.push({
          name: `${currentPath}-padding-top`,
          value: node.paddingTop,
          type: "padding",
          nodeId: node.id,
        });
      }
      if (node.paddingBottom !== undefined) {
        tokens.spacing.push({
          name: `${currentPath}-padding-bottom`,
          value: node.paddingBottom,
          type: "padding",
          nodeId: node.id,
        });
      }
      if (node.itemSpacing !== undefined) {
        tokens.spacing.push({
          name: `${currentPath}-gap`,
          value: node.itemSpacing,
          type: "gap",
          nodeId: node.id,
        });
      }
    }

    // Extract shadows
    if (node.effects) {
      node.effects.forEach((effect, index) => {
        if (
          (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") &&
          effect.visible !== false
        ) {
          tokens.shadows.push({
            name: `${currentPath}-shadow-${index}`,
            type: effect.type === "DROP_SHADOW" ? "drop" : "inner",
            color: effect.color ? this.colorToHex(effect.color) : "#000000",
            offsetX: effect.offset?.x ?? 0,
            offsetY: effect.offset?.y ?? 0,
            blur: effect.radius ?? 0,
            spread: effect.spread ?? 0,
            nodeId: node.id,
          });
        }
      });
    }

    // Traverse children
    if (node.children) {
      node.children.forEach((child) => {
        this.traverseNode(child, currentPath, tokens);
      });
    }
  }

  private colorToHex(color: Color): string {
    const r = Math.round(color.r * 255)
      .toString(16)
      .padStart(2, "0");
    const g = Math.round(color.g * 255)
      .toString(16)
      .padStart(2, "0");
    const b = Math.round(color.b * 255)
      .toString(16)
      .padStart(2, "0");
    return `#${r}${g}${b}`;
  }

  private deduplicateTokens(tokens: DesignTokens): DesignTokens {
    const uniqueColors = new Map<string, ColorToken>();
    tokens.colors.forEach((color) => {
      const key = color.hex.toLowerCase();
      if (!uniqueColors.has(key)) {
        uniqueColors.set(key, color);
      }
    });

    const uniqueTypography = new Map<string, TypographyToken>();
    tokens.typography.forEach((typo) => {
      const key = `${typo.fontFamily}-${typo.fontSize}-${typo.fontWeight}`;
      if (!uniqueTypography.has(key)) {
        uniqueTypography.set(key, typo);
      }
    });

    const uniqueSpacing = new Map<string, SpacingToken>();
    tokens.spacing.forEach((space) => {
      const key = `${space.type}-${space.value}`;
      if (!uniqueSpacing.has(key)) {
        uniqueSpacing.set(key, space);
      }
    });

    return {
      colors: Array.from(uniqueColors.values()),
      typography: Array.from(uniqueTypography.values()),
      spacing: Array.from(uniqueSpacing.values()),
      shadows: tokens.shadows,
      borders: tokens.borders,
    };
  }

  // ==========================================================================
  // COMPONENT TREE EXTRACTION
  // ==========================================================================

  extractComponents(node: FigmaNode): Array<{
    nodeId: string;
    name: string;
    type: string;
    boundingBox?: { width: number; height: number };
    children: string[];
  }> {
    const components: Array<{
      nodeId: string;
      name: string;
      type: string;
      boundingBox?: { width: number; height: number };
      children: string[];
    }> = [];

    const traverse = (n: FigmaNode) => {
      // Include FRAME, COMPONENT, COMPONENT_SET, and INSTANCE as potential components
      if (["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE"].includes(n.type)) {
        components.push({
          nodeId: n.id,
          name: n.name,
          type: n.type,
          boundingBox: n.absoluteBoundingBox
            ? {
                width: n.absoluteBoundingBox.width,
                height: n.absoluteBoundingBox.height,
              }
            : undefined,
          children: n.children?.map((c) => c.id) ?? [],
        });
      }

      if (n.children) {
        n.children.forEach(traverse);
      }
    };

    traverse(node);
    return components;
  }
}

// ============================================================================
// URL PARSING UTILITIES
// ============================================================================

export function parseFigmaUrl(url: string): {
  fileKey: string;
  nodeId?: string;
} | null {
  try {
    const urlObj = new URL(url);

    // Handle figma.com/file/KEY/name format
    const fileMatch = urlObj.pathname.match(/\/(?:file|design)\/([a-zA-Z0-9]+)/);
    if (!fileMatch) {
      return null;
    }

    const fileKey = fileMatch[1];

    // Extract node-id from query params or hash
    let nodeId: string | undefined;

    const nodeIdParam = urlObj.searchParams.get("node-id");
    if (nodeIdParam) {
      // Convert URL format (1-23) to API format (1:23)
      nodeId = nodeIdParam.replace("-", ":");
    }

    return { fileKey, nodeId };
  } catch {
    return null;
  }
}

export function buildFigmaUrl(fileKey: string, nodeId?: string): string {
  let url = `https://www.figma.com/file/${fileKey}`;
  if (nodeId) {
    // Convert API format (1:23) to URL format (1-23)
    url += `?node-id=${nodeId.replace(":", "-")}`;
  }
  return url;
}
