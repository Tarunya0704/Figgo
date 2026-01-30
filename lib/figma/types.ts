// ============================================================================
// FIGMA API TYPES
// ============================================================================

export interface FigmaFile {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  document: FigmaNode;
  components: Record<string, FigmaComponent>;
  styles: Record<string, FigmaStyle>;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: FigmaNodeType;
  visible?: boolean;
  children?: FigmaNode[];
  absoluteBoundingBox?: BoundingBox;
  fills?: Paint[];
  strokes?: Paint[];
  strokeWeight?: number;
  cornerRadius?: number;
  effects?: Effect[];
  blendMode?: string;
  opacity?: number;
  constraints?: Constraints;
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  primaryAxisSizingMode?: "FIXED" | "AUTO";
  counterAxisSizingMode?: "FIXED" | "AUTO";
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  style?: TypeStyle;
  characters?: string;
  componentId?: string; // For INSTANCE nodes
}

export type FigmaNodeType =
  | "DOCUMENT"
  | "CANVAS"
  | "FRAME"
  | "GROUP"
  | "VECTOR"
  | "BOOLEAN_OPERATION"
  | "STAR"
  | "LINE"
  | "ELLIPSE"
  | "REGULAR_POLYGON"
  | "RECTANGLE"
  | "TEXT"
  | "SLICE"
  | "COMPONENT"
  | "COMPONENT_SET"
  | "INSTANCE";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Paint {
  type: "SOLID" | "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND" | "IMAGE" | "EMOJI";
  visible?: boolean;
  opacity?: number;
  color?: Color;
  blendMode?: string;
  gradientStops?: GradientStop[];
  scaleMode?: string;
  imageRef?: string;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface GradientStop {
  position: number;
  color: Color;
}

export interface Effect {
  type: "INNER_SHADOW" | "DROP_SHADOW" | "LAYER_BLUR" | "BACKGROUND_BLUR";
  visible?: boolean;
  radius?: number;
  color?: Color;
  offset?: { x: number; y: number };
  spread?: number;
}

export interface Constraints {
  vertical: "TOP" | "BOTTOM" | "CENTER" | "TOP_BOTTOM" | "SCALE";
  horizontal: "LEFT" | "RIGHT" | "CENTER" | "LEFT_RIGHT" | "SCALE";
}

export interface TypeStyle {
  fontFamily: string;
  fontPostScriptName?: string;
  fontWeight: number;
  fontSize: number;
  textAlignHorizontal?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
  textAlignVertical?: "TOP" | "CENTER" | "BOTTOM";
  letterSpacing?: number;
  lineHeightPx?: number;
  lineHeightPercent?: number;
  lineHeightUnit?: "PIXELS" | "FONT_SIZE_%" | "INTRINSIC_%";
}

export interface FigmaComponent {
  key: string;
  name: string;
  description: string;
  documentationLinks?: string[];
}

export interface FigmaStyle {
  key: string;
  name: string;
  description: string;
  styleType: "FILL" | "TEXT" | "EFFECT" | "GRID";
}

// ============================================================================
// FIGMA OAUTH TYPES
// ============================================================================

export interface FigmaOAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: string;
}

export interface FigmaUser {
  id: string;
  email: string;
  handle: string;
  img_url: string;
}

// ============================================================================
// FIGMA WEBHOOK TYPES
// ============================================================================

export type WebhookEventType =
  | "FILE_UPDATE"
  | "FILE_DELETE"
  | "FILE_VERSION_UPDATE"
  | "LIBRARY_PUBLISH"
  | "FILE_COMMENT"
  | "PING";

export interface WebhookPayload {
  event_type: WebhookEventType;
  passcode: string;
  timestamp: string;
  webhook_id: string;

  // FILE_UPDATE event
  file_key?: string;
  file_name?: string;
  modified_at?: string;
  triggered_by?: {
    id: string;
    handle: string;
  };

  // FILE_VERSION_UPDATE event
  version_id?: string;
  label?: string;
  description?: string;
  created_at?: string;

  // LIBRARY_PUBLISH event
  library_items?: LibraryItem[];

  // FILE_COMMENT event
  comment?: CommentPayload[];

  // PING event
  retries?: number;
}

export interface LibraryItem {
  key: string;
  name: string;
}

export interface CommentPayload {
  id: string;
  text: string;
  user: {
    id: string;
    handle: string;
  };
  created_at: string;
}

export interface WebhookRegistration {
  id: string;
  team_id: string;
  event_type: WebhookEventType;
  client_id: string;
  endpoint: string;
  passcode: string;
  status: "ACTIVE" | "PAUSED";
  description: string;
  protocol_version: string;
}

// ============================================================================
// DESIGN TOKEN TYPES (Normalized)
// ============================================================================

export interface DesignTokens {
  colors: ColorToken[];
  typography: TypographyToken[];
  spacing: SpacingToken[];
  shadows: ShadowToken[];
  borders: BorderToken[];
}

export interface ColorToken {
  name: string;
  hex: string;
  rgba: { r: number; g: number; b: number; a: number };
  usage: "fill" | "stroke" | "text";
  nodeId: string;
}

export interface TypographyToken {
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight?: number;
  letterSpacing?: number;
  nodeId: string;
}

export interface SpacingToken {
  name: string;
  value: number;
  type: "padding" | "margin" | "gap";
  nodeId: string;
}

export interface ShadowToken {
  name: string;
  type: "drop" | "inner";
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  nodeId: string;
}

export interface BorderToken {
  name: string;
  width: number;
  color: string;
  radius?: number;
  nodeId: string;
}
