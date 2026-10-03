import { handleWriteRequest, validateWriteToolParams } from "./write";

type NodeType = "FRAME" | "TEXT" | "RECTANGLE" | "INSTANCE";
type SceneSpec = { ref: string; type: NodeType; props: Record<string, unknown>; children: SceneSpec[] };
const REF_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const LAYOUT = ["layoutMode","layoutSizingHorizontal","layoutSizingVertical","primaryAxisSizingMode","counterAxisSizingMode","primaryAxisAlignItems","counterAxisAlignItems","layoutWrap","layoutPositioning","minWidth","maxWidth","minHeight","maxHeight"];
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
function validateLayoutDeps(node:SceneSpec, parent?:SceneSpec): void {
  const mode=node.props.layoutMode;
  if (parent) {
    const pMode=parent.props.layoutMode;
    for (const axis of ["Horizontal","Vertical"] as const) {
      const childSize=axisSizing(node,axis);
      if (childSize === "FILL" && pMode !== "HORIZONTAL" && pMode !== "VERTICAL") fail(`${node.ref} FILL requires auto-layout parent`);
      if (childSize === "FILL" && pMode === (axis === "Horizontal" ? "VERTICAL" : "HORIZONTAL")) fail(`${node.ref} FILL axis incompatible with parent layout`);
      if (childSize === "FILL" && axisSizing(parent,axis) === "HUG") fail(`${node.ref} FILL conflicts with parent HUG sizing`);
    }
  }
  if (mode !== undefined && mode !== "NONE" && mode !== "HORIZONTAL" && mode !== "VERTICAL") fail(`Invalid layoutMode on ${node.ref}`);
  for (const c of node.children) validateLayoutDeps(c,node);
}

async function preflight(roots:SceneSpec[], parentId?:string) {
  const refs=new Set<string>(), state={count:0}; const normalized=roots.map(r=>parseTree(r,1,refs,state));
  if (parentId !== undefined && (typeof parentId !== "string" || !/^\d+:\d+$/.test(parentId))) fail("parentId must use colon format");
  if (parentId) {
    const p=await figma.getNodeByIdAsync(parentId); if (!p || !("appendChild" in p)) fail("parentId must reference a container", "INVALID_PARENT");
    if (pageOf(p)!==figma.currentPage) fail("parentId must be on current page", "INVALID_PARENT");
  }
  normalized.forEach(n=>validateLayoutDeps(n));
  const fonts=new Map<string,{family:string;style:string}>(); const all:SceneSpec[]=[];
  const visit=(n:SceneSpec)=>{ all.push(n); if(n.type==="TEXT"){const st=isObj(n.props.style)?n.props.style:{}; const family=typeof st.fontFamily==="string"?st.fontFamily:"Inter"; const style=typeof st.fontStyle==="string"?st.fontStyle:"Regular"; fonts.set(`${family}\0${style}`,{family,style});} n.children.forEach(visit)}; normalized.forEach(visit);
  for (const n of all) {
    validateWriteToolParams(writeType(n.type), undefined, n.type==="INSTANCE"?{...n.props,componentId:n.props.componentId}:{...n.props});
    if (n.type==="INSTANCE") {
      const id=n.props.componentId; if(typeof id!=="string"||!/^\d+:\d+$/.test(id)) fail(`${n.ref}.props.componentId is required`);
      const source:any=await figma.getNodeByIdAsync(id); if(!source||source.type!=="COMPONENT") fail(`${n.ref}.componentId must reference a COMPONENT`,"INVALID_COMPONENT");
      if (n.props.properties!==undefined) {
        if(!isObj(n.props.properties)) fail(`${n.ref}.properties must be an object`);
        const defs=source.componentPropertyDefinitions||{};
        for(const [name,val] of Object.entries(n.props.properties)) { const def=defs[name]; if(!def) fail(`Unknown component property ${name}`); const kind=def.type; if(kind==="BOOLEAN" && typeof val!=="boolean") fail(`Property ${name} must be boolean`); if(kind!=="BOOLEAN" && typeof val!=="string") fail(`Property ${name} must be string`); }
      }
    }
  }
  for(const f of fonts.values()){try{await figma.loadFontAsync(f)}catch{fail(`Unable to load font ${f.family} ${f.style}`,"FONT_LOAD_FAILED")}}
  return {normalized,all,fonts:[...fonts.values()]};
}

function splitProps(props:Record<string,unknown>){ const initial={...props}, deferred:Record<string,unknown>={}; for(const k of SIZE_KEYS) if(k in initial){deferred[k]=initial[k];delete initial[k]} return [initial,deferred] as const; }
function errorWithCleanup(error:unknown, attempted:string[], removed:string[], failed:string[]):never { const base:any=isObj(error)&&"mutationError" in error?(error as any).mutationError:{code:"PLUGIN_ERROR",message:error instanceof Error?error.message:String(error)}; throw Object.assign(new Error(base.message),{mutationError:{...base,details:{...(isObj(base.details)?base.details:{}),cleanup:{attempted,removed,failed}}}}); }

export async function createScene(params:Record<string,unknown>|undefined):Promise<unknown>{
  if(!isObj(params)) fail("params must be an object");
  for (const k of Object.keys(params)) if (!["parentId","nodes","dryRun"].includes(k)) fail(`Unknown top-level field ${k}`);
  if(typeof params.dryRun!=="undefined"&&typeof params.dryRun!=="boolean") fail("dryRun must be a boolean");
  if(params.parentId!==undefined&&typeof params.parentId!=="string") fail("parentId must be a string");
  if(!Array.isArray(params.nodes)||params.nodes.length===0) fail("nodes must be a non-empty array");
  const pre=await preflight(params.nodes as SceneSpec[],params.parentId as string|undefined); const dryRun=params.dryRun!==false;
  if(dryRun) return {dryRun:true,nodeCount:pre.all.length,rootNodeIds:[],createdNodeIds:[],refs:pre.all.map(n=>({ref:n.ref,type:n.type})),fonts:pre.fonts};
  const refs:Record<string,string>={}, created:string[]=[];
  try {
    const create=async(n:SceneSpec,parent:string|undefined)=>{ const [initial,deferred]=splitProps(n.props); initial.parentId=parent; if(n.type==="INSTANCE") delete initial.properties; const result:any=await handleWriteRequest(writeType(n.type),undefined,{...initial,compact:true}); if(!result||typeof result.nodeId!=="string") fail(`Creation failed for ${n.ref}`); refs[n.ref]=result.nodeId; created.push(result.nodeId); for(const c of n.children) await create(c,result.nodeId); if(Object.keys(deferred).length) await handleWriteRequest("set_layout_mode",[result.nodeId],{...deferred,compact:true}); if(n.type==="INSTANCE"&&isObj(n.props.properties)) await handleWriteRequest("set_component_properties",undefined,{instanceId:result.nodeId,properties:n.props.properties,compact:true}); };
    for(const n of pre.normalized) await create(n,params.parentId as string|undefined);
    return {dryRun:false,nodeCount:pre.all.length,rootNodeIds:pre.normalized.map(n=>refs[n.ref]),createdNodeIds:created,refs};
  } catch(error){ const attempted=[...created], removed:string[]=[], failed:string[]=[]; for(const id of [...created].reverse()){ try{ await handleWriteRequest("delete_node",[id],{nodeId:id,compact:true}); removed.push(id); }catch{ failed.push(id); } } return errorWithCleanup(error,attempted,removed,failed); }
}
