import { findCanvasSlot } from "./canvasSlot";
import { handleWriteRequest, validateWriteToolParams } from "./write";

type NodeType = "FRAME" | "TEXT" | "RECTANGLE" | "INSTANCE";
type SceneSpec = { ref: string; type: NodeType; props: Record<string, unknown>; children: SceneSpec[] };
type FontDescriptor = { family: string; style: string };
type FontResolutionWarning = {
  code: "FONT_STYLE_FALLBACK";
  requested: FontDescriptor;
  resolved: FontDescriptor;
  attemptedCandidates: FontDescriptor[];
};
export class FontResolutionError extends Error {
  readonly requested: FontDescriptor;
  readonly attemptedCandidates: FontDescriptor[];

  constructor(requested: FontDescriptor, attemptedCandidates: FontDescriptor[]) {
    super(`Unable to load font ${requested.family} ${requested.style}`);
    this.name = "FontResolutionError";
    this.requested = requested;
    this.attemptedCandidates = attemptedCandidates;
  }
}
const REF_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const LAYOUT = ["layoutMode","layoutSizingHorizontal","layoutSizingVertical","primaryAxisSizingMode","counterAxisSizingMode","primaryAxisAlignItems","counterAxisAlignItems","layoutWrap","layoutPositioning","minWidth","maxWidth","minHeight","maxHeight"];
const FONT_STYLE_ALIASES: Record<string, readonly string[]> = {
  SemiBold: ["Semi Bold", "Bold", "Regular"],
  "Semi Bold": ["Semi Bold", "Bold", "Regular"],
  ExtraBold: ["Extra Bold", "Bold", "Regular"],
  "Extra Bold": ["Extra Bold", "Bold", "Regular"],
  UltraLight: ["Ultra Light", "Light", "Regular"],
  "Ultra Light": ["Ultra Light", "Light", "Regular"],
};

function fontKey(font: FontDescriptor): string {
  return `${font.family}\0${font.style}`;
}

export function normalizeFontStyle(style: string): string {
  return style.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function fontCandidates(requested: FontDescriptor): FontDescriptor[] {
  const styles = FONT_STYLE_ALIASES[requested.style] ??
    FONT_STYLE_ALIASES[normalizeFontStyle(requested.style)] ??
    [requested.style];
  const candidates: FontDescriptor[] = [];
  for (const style of [requested.style, normalizeFontStyle(requested.style), ...styles]) {
    const candidate = { family: requested.family, style };
    if (!candidates.some((entry) => fontKey(entry) === fontKey(candidate))) candidates.push(candidate);
  }
  return candidates;
}

export async function resolveFontDescriptor(
  requested: FontDescriptor,
  load: (font: FontDescriptor) => Promise<void> = (font) => figma.loadFontAsync(font),
): Promise<{ font: FontDescriptor; attemptedCandidates: FontDescriptor[] }> {
  const attemptedCandidates: FontDescriptor[] = [];
  for (const candidate of fontCandidates(requested)) {
    attemptedCandidates.push(candidate);
    try {
      await load(candidate);
      return { font: candidate, attemptedCandidates };
    } catch {
      // Continue only through the explicit candidates for this known alias.
    }
  }
  throw new FontResolutionError(requested, attemptedCandidates);
}

const SIZE_KEYS = ["layoutSizingHorizontal","layoutSizingVertical","primaryAxisSizingMode","counterAxisSizingMode","minWidth","maxWidth","minHeight","maxHeight"];
const CONTAINER = ["name","x","y","width","height","fills","strokes","cornerRadius","clipsContent","padding","itemSpacing",...LAYOUT];
const ALLOWED: Record<NodeType,string[]> = { FRAME: CONTAINER, TEXT:["name","x","y","width","height","characters","style","fills",...LAYOUT], RECTANGLE:["name","x","y","width","height","fills","strokes","cornerRadius",...LAYOUT], INSTANCE:["name","x","y","width","height","componentId","properties",...LAYOUT] };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function fail(message:string, code="INVALID_INPUT", details?:unknown): never { throw Object.assign(new Error(message), { mutationError:{ code, message, details } }); }
const writeType = (t:NodeType) => ({FRAME:"create_frame",TEXT:"create_text",RECTANGLE:"create_rectangle",INSTANCE:"create_instance"}[t]);

function parseTree(raw: unknown, depth:number, refs:Set<string>, state:{count:number}, parent?:SceneSpec): SceneSpec {
  if (!isObj(raw)) fail("Each node must be an object");
  for (const k of Object.keys(raw)) if (!["ref","type","props","children"].includes(k)) fail(`Unknown node field ${k}`);
  if (++state.count > 100) fail("Scene cannot contain more than 100 nodes");
  if (depth > 16) fail("Scene nesting exceeds 16 levels");
  const ref=raw.ref, type=raw.type;
  if (typeof ref!=="string" || !REF_RE.test(ref)) fail("ref must match /^[A-Za-z][A-Za-z0-9_-]{0,63}$/");
  if (refs.has(ref)) fail(`Duplicate ref: ${ref}`); refs.add(ref);
  if (!["FRAME","TEXT","RECTANGLE","INSTANCE"].includes(type as string)) fail(`Unsupported node type: ${String(type)}`);
  const props = raw.props === undefined ? {} : raw.props;
  if (!isObj(props)) fail(`${ref}.props must be an object`);
  for (const k of Object.keys(props)) if (!(ALLOWED[type as NodeType] || []).includes(k) || ["parentId","ref"].includes(k)) fail(`Unknown or forbidden property ${k} on ${type}`);
  if (type === "TEXT" && isObj(props.style)) {
    const styleAllowed=["fontFamily","fontStyle","fontSize","lineHeight","letterSpacing","textDecoration","textAlignHorizontal","textAlignVertical","textAutoResize"];
    for (const k of Object.keys(props.style)) if (!styleAllowed.includes(k)) fail(`Unknown style property ${k}`);
  }
  const childrenRaw = raw.children === undefined ? [] : raw.children;
  if (!Array.isArray(childrenRaw)) fail(`${ref}.children must be an array`);
  if (type !== "FRAME" && childrenRaw.length) fail(`${type} nodes cannot have children`);
  const node:SceneSpec={ref,type:type as NodeType,props,children:[]};
  for (const c of childrenRaw) node.children.push(parseTree(c,depth+1,refs,state,node));
  return node;
}

function pageOf(node:any): any { let n=node; while (n && n.type !== "PAGE" && n.type !== "DOCUMENT") n=n.parent; return n?.type === "PAGE" ? n : undefined; }
function axisSizing(node:SceneSpec, axis:"Horizontal"|"Vertical"): unknown { return node.props[`layoutSizing${axis}`]; }
function validateAbsoluteDependency(node:SceneSpec, parentRef:string, layoutMode:unknown, path:string[]): void {
  const mode=layoutMode ?? "NONE";
  if (mode !== "NONE" || node.props.layoutPositioning !== "ABSOLUTE") return;
  fail(`${node.ref} layoutPositioning=ABSOLUTE requires auto-layout on parent ${parentRef} (layoutMode=NONE)`, "INVALID_LAYOUT_DEPENDENCY", {
    childRef: node.ref, parentRef, path, parentProps: { layoutMode: mode },
    childProps: { layoutPositioning: node.props.layoutPositioning },
  });
}

function validateLayoutDeps(node:SceneSpec, parent?:SceneSpec, path:string[]=[node.ref]): void {
  const mode=node.props.layoutMode;
  if (parent) {
    const pMode=parent.props.layoutMode ?? "NONE";
    validateAbsoluteDependency(node,parent.ref,pMode,path);
    for (const axis of ["Horizontal","Vertical"] as const) {
      const childSize=axisSizing(node,axis);
      if (childSize === "FILL" && pMode !== "HORIZONTAL" && pMode !== "VERTICAL") fail(`${node.ref} FILL requires auto-layout parent`);
      if (childSize === "FILL" && axisSizing(parent,axis) === "HUG") fail(`${node.ref} FILL conflicts with parent HUG sizing`);
    }
  }
  if (mode !== undefined && mode !== "NONE" && mode !== "HORIZONTAL" && mode !== "VERTICAL") fail(`Invalid layoutMode on ${node.ref}`);
  for (const c of node.children) validateLayoutDeps(c,node,[...path,c.ref]);
}

async function preflight(roots:SceneSpec[], parentId?:string) {
  const refs=new Set<string>(), state={count:0}; const normalized=roots.map(r=>parseTree(r,1,refs,state));
  if (parentId !== undefined && (typeof parentId !== "string" || !/^\d+:\d+$/.test(parentId))) fail("parentId must use colon format");
  let parentRef=figma.currentPage.id;
  let parentMode:unknown="NONE";
  if (parentId && parentId !== figma.currentPage.id) {
    const p=await figma.getNodeByIdAsync(parentId);
    if (!p) fail("parentId was not found", "NOT_FOUND");
    if (p.type === "DOCUMENT" || !("appendChild" in p)) fail("parentId must reference a container", "INVALID_PARENT");
    if (pageOf(p)?.id !== figma.currentPage.id) fail("parentId must be on current page", "OUT_OF_SCOPE");
    parentRef=p.id;
    parentMode="layoutMode" in p ? p.layoutMode : "NONE";
  }
  normalized.forEach(n=>validateAbsoluteDependency(n,parentRef,parentMode,[parentRef,n.ref]));
  normalized.forEach(n=>validateLayoutDeps(n));
  const fonts = new Map<string, FontDescriptor>();
  const all: SceneSpec[] = [];
  const visit = (n: SceneSpec) => {
    all.push(n);
    if (n.type === "TEXT") {
      const st = isObj(n.props.style) ? n.props.style : {};
      const family = typeof st.fontFamily === "string" ? st.fontFamily : "Inter";
      const style = typeof st.fontStyle === "string" ? st.fontStyle : "Regular";
      fonts.set(`${family}\0${style}`, { family, style });
    }
    n.children.forEach(visit);
  };
  normalized.forEach(visit);
  for (const n of all) {
    validateWriteToolParams(writeType(n.type), undefined, n.type === "INSTANCE" ? { ...n.props, componentId: n.props.componentId } : { ...n.props });
    if (n.type === "INSTANCE") {
      const id = n.props.componentId;
      if (typeof id !== "string" || !/^\d+:\d+$/.test(id)) fail(`${n.ref}.props.componentId is required`);
      const source: any = await figma.getNodeByIdAsync(id);
      if (!source || source.type !== "COMPONENT") fail(`${n.ref}.componentId must reference a COMPONENT`, "INVALID_COMPONENT");
      if (n.props.properties !== undefined) {
        if (!isObj(n.props.properties)) fail(`${n.ref}.properties must be an object`);
        const defs = source.componentPropertyDefinitions || {};
        for (const [name, val] of Object.entries(n.props.properties)) {
          const def = defs[name];
          if (!def) fail(`Unknown component property ${name}`);
          const kind = def.type;
          if (kind === "BOOLEAN" && typeof val !== "boolean") fail(`Property ${name} must be boolean`);
          if (kind !== "BOOLEAN" && typeof val !== "string") fail(`Property ${name} must be string`);
        }
      }
    }
  }
  const resolvedFonts = new Map<string, FontDescriptor>();
  const warnings: FontResolutionWarning[] = [];
  for (const requested of fonts.values()) {
    try {
      const resolution = await resolveFontDescriptor(requested);
      resolvedFonts.set(fontKey(requested), resolution.font);
      if (fontKey(requested) !== fontKey(resolution.font)) {
        warnings.push({ code: "FONT_STYLE_FALLBACK", requested, resolved: resolution.font, attemptedCandidates: resolution.attemptedCandidates });
      }
    } catch (error) {
      if (error instanceof FontResolutionError) {
        fail(`Unable to load font ${requested.family} ${requested.style}`, "FONT_LOAD_FAILED", {
          requested: error.requested,
          attemptedCandidates: error.attemptedCandidates,
        });
      }
      throw error;
    }
  }
  for (const n of all) {
    if (n.type !== "TEXT") continue;
    const style = isObj(n.props.style) ? n.props.style : {};
    const requested = {
      family: typeof style.fontFamily === "string" ? style.fontFamily : "Inter",
      style: typeof style.fontStyle === "string" ? style.fontStyle : "Regular",
    };
    const resolved = resolvedFonts.get(fontKey(requested));
    if (resolved && (style.fontFamily !== undefined || style.fontStyle !== undefined)) {
      n.props.style = { ...style, fontFamily: resolved.family, fontStyle: resolved.style };
    }
  }
  return { normalized, all, fonts: [...fonts.values()], warnings };
}

function splitProps(props:Record<string,unknown>){ const initial={...props}, deferred:Record<string,unknown>={}; for(const k of SIZE_KEYS) if(k in initial){deferred[k]=initial[k];delete initial[k]} return [initial,deferred] as const; }
function errorWithCleanup(error:unknown, attempted:string[], removed:string[], failed:string[]):never { const base:any=isObj(error)&&"mutationError" in error?(error as any).mutationError:{code:"PLUGIN_ERROR",message:error instanceof Error?error.message:String(error)}; throw Object.assign(new Error(base.message),{mutationError:{...base,details:{...(isObj(base.details)?base.details:{}),cleanup:{attempted,removed,failed}}}}); }

export async function createScene(params:Record<string,unknown>|undefined):Promise<unknown>{
  if(!isObj(params)) fail("params must be an object");
  for (const k of Object.keys(params)) if (!["parentId","nodes","dryRun","position"].includes(k)) fail(`Unknown top-level field ${k}`);
  if(typeof params.dryRun!=="undefined"&&typeof params.dryRun!=="boolean") fail("dryRun must be a boolean");
  if(params.position!==undefined&&params.position!=="auto") fail("position must be auto");
  if(params.parentId!==undefined&&typeof params.parentId!=="string") fail("parentId must be a string");
  if(!Array.isArray(params.nodes)||params.nodes.length===0) fail("nodes must be a non-empty array");
  const pre=await preflight(params.nodes as SceneSpec[],params.parentId as string|undefined);
  let plannedPosition: { x: number; y: number; strategy: string } | undefined;
  if (params.position === "auto") {
    if (pre.normalized.length !== 1 || pre.normalized[0].type !== "FRAME") fail("position=auto requires exactly one root FRAME");
    const root = pre.normalized[0];
    if (root.props.x !== undefined || root.props.y !== undefined) fail("position=auto cannot be combined with explicit root x/y");
    const parentId = params.parentId as string | undefined;
    const parent = parentId && parentId !== figma.currentPage.id
      ? await figma.getNodeByIdAsync(parentId)
      : figma.currentPage;
    if (!parent || !("children" in parent)) fail("position=auto parent must be a container");
    const slot = await findCanvasSlot({
      width: typeof root.props.width === "number" ? root.props.width : 100,
      height: typeof root.props.height === "number" ? root.props.height : 100,
    }, parent as PageNode | (BaseNode & ChildrenMixin));
    plannedPosition = { x: slot.x, y: slot.y, strategy: slot.strategy };
    root.props = { ...root.props, x: slot.x, y: slot.y };
  }
  const dryRun=params.dryRun!==false;
  if(dryRun) return {dryRun:true,nodeCount:pre.all.length,rootNodeIds:[],createdNodeIds:[],refs:pre.all.map(n=>({ref:n.ref,type:n.type})),fonts:pre.fonts,warnings:pre.warnings,...(plannedPosition ? { plannedPosition } : {})};
  const refs:Record<string,string>={}, created:string[]=[];
  try {
    const create=async(n:SceneSpec,parent:string|undefined)=>{ const [initial,deferred]=splitProps(n.props); initial.parentId=parent; if(n.type==="INSTANCE") delete initial.properties; const result:any=await handleWriteRequest(writeType(n.type),undefined,{...initial,compact:true}); if(!result||typeof result.nodeId!=="string") fail(`Creation failed for ${n.ref}`); refs[n.ref]=result.nodeId; created.push(result.nodeId); for(const c of n.children) await create(c,result.nodeId); if(Object.keys(deferred).length) await handleWriteRequest("set_layout_mode",[result.nodeId],{...deferred,compact:true}); if(n.type==="INSTANCE"&&isObj(n.props.properties)) await handleWriteRequest("set_component_properties",undefined,{instanceId:result.nodeId,properties:n.props.properties,compact:true}); };
    for(const n of pre.normalized) await create(n,params.parentId as string|undefined);
    return {dryRun:false,nodeCount:pre.all.length,rootNodeIds:pre.normalized.map(n=>refs[n.ref]),createdNodeIds:created,refs,warnings:pre.warnings,...(plannedPosition ? { plannedPosition } : {})};
  } catch(error){ const attempted=[...created], removed:string[]=[], failed:string[]=[]; for(const id of [...created].reverse()){ try{ await handleWriteRequest("delete_node",[id],{nodeId:id,compact:true}); removed.push(id); }catch{ failed.push(id); } } return errorWithCleanup(error,attempted,removed,failed); }
}
