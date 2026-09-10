/**
 * Expands a PokeAByte mapper XML into the flat property list the REST API serves.
 *
 * Used for two things:
 *   1. building synthetic fixtures for a mapper nobody has recorded yet
 *      (parity-harness.md section 3 / plan Phase 0 checklist step 4);
 *   2. checking a MapperProfile against the mapper it claims to support -- a profile
 *      that names a path the mapper does not have is a silent runtime hole.
 *
 * The XML shape (verified against DEPRECATED/gen1, DEPRECATED/gen2, ST/gen3-4 and
 * STANDARD/gen5 in %APPDATA%\PokeAByte\Mappers):
 *
 *   <mapper id name platform version>
 *     <memory><read start end/>...</memory>
 *     <classes><typeName><property .../>...</typeName>...</classes>
 *     <properties>
 *       <player>                              <!-- element name = path segment -->
 *         <property name="name" type="string" address="0xD157" length="11"/>
 *         <team><class name="0" type="pokemonInParty" var:address="0xD16A"/></team>
 *       </player>
 *     </properties>
 *     <references><refName><entry key="0" value="Off"/></refName></references>
 *
 * Addresses inside a class are expressions over the `var:` values (`{address} + 5`).
 */
import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";

export interface MapperProperty {
  path: string;
  type: string;
  address: number;
  length: number;
  size: number | null;
  reference: string | null;
  bits: string | null;
  description: string | null;
  memoryContainer: string | null;
  /** `<property value="Yellow"/>`: a constant the mapper asserts, not a RAM read.
   *  This is how every gen identifies its game (mapper-matrix.md). */
  staticValue: string | null;
}

export interface MapperDefinition {
  meta: { id: string; gameName: string; gamePlatform: string; version: string; path: string };
  properties: MapperProperty[];
  glossary: Record<string, { key: unknown; value: unknown }[]>;
}

type Node = Record<string, unknown>;

const ATTR = ":@";

export function parseMapperXml(file: string, mapperPath: string): MapperDefinition {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    preserveOrder: true,
    parseAttributeValue: false,
    trimValues: true,
  });
  const doc = parser.parse(readFileSync(file, "utf8")) as Node[];
  const mapper = findChild(doc, "mapper");
  if (!mapper) throw new Error(`${file} has no <mapper> element`);
  const mapperAttrs = attrs(mapper);

  const classes = new Map<string, Node[]>();
  const classesNode = findChild(children(mapper, "mapper"), "classes");
  if (classesNode) {
    for (const child of children(classesNode, "classes")) {
      const tag = tagOf(child);
      if (tag && tag !== ATTR) classes.set(tag, children(child, tag));
    }
  }

  const properties: MapperProperty[] = [];
  const propsNode = findChild(children(mapper, "mapper"), "properties");
  if (propsNode) walk(children(propsNode, "properties"), [], {}, classes, properties);

  const glossary: MapperDefinition["glossary"] = {};
  const refsNode = findChild(children(mapper, "mapper"), "references");
  if (refsNode) {
    for (const ref of children(refsNode, "references")) {
      const name = tagOf(ref);
      if (!name || name === ATTR) continue;
      glossary[name] = children(ref, name)
        .filter((entry) => tagOf(entry) === "entry")
        .map((entry) => {
          const a = attrs(entry);
          return { key: numberOrString(a.key), value: a.value ?? null };
        });
    }
  }

  return {
    meta: {
      id: mapperAttrs.id ?? "",
      gameName: mapperAttrs.name ?? "",
      gamePlatform: mapperAttrs.platform ?? "",
      version: mapperAttrs.version ?? "",
      path: mapperPath,
    },
    properties,
    glossary,
  };
}

function walk(
  nodes: Node[],
  prefix: string[],
  vars: Record<string, string>,
  classes: Map<string, Node[]>,
  out: MapperProperty[],
): void {
  for (const node of nodes) {
    const tag = tagOf(node);
    if (!tag || tag === ATTR) continue;
    const a = attrs(node);

    if (tag === "property") {
      out.push(toProperty([...prefix, a.name].join("."), a, vars));
      continue;
    }
    if (tag === "class") {
      const template = classes.get(a.type ?? "");
      if (!template) continue;
      const childVars: Record<string, string> = { ...vars };
      for (const [key, value] of Object.entries(a)) {
        if (key.startsWith("var:")) childVars[key.slice(4)] = value;
      }
      walk(template, [...prefix, a.name], childVars, classes, out);
      continue;
    }
    // Any other element name is a path segment.
    walk(children(node, tag), [...prefix, tag], vars, classes, out);
  }
}

function toProperty(path: string, a: Record<string, string>, vars: Record<string, string>): MapperProperty {
  return {
    path,
    type: a.type ?? "int",
    address: evaluateAddress(a.address ?? "0", vars),
    length: a.length ? Number(a.length) : 1,
    size: a.size ? Number(a.size) : null,
    reference: a.reference ?? null,
    bits: a.bits ?? null,
    description: a.description ?? null,
    memoryContainer: a.memoryContainer ?? null,
    staticValue: a.value ?? null,
  };
}

/** `{address} + 5`, `0xD16A`, `{base} + {offset}` -- the only forms the mappers use. */
export function evaluateAddress(expression: string, vars: Record<string, string>): number {
  const substituted = expression.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? "0");
  let total = 0;
  let sign = 1;
  for (const token of substituted.split(/([+-])/)) {
    const t = token.trim();
    if (t === "+") sign = 1;
    else if (t === "-") sign = -1;
    else if (t) total += sign * (t.startsWith("0x") || t.startsWith("0X") ? parseInt(t, 16) : Number(t) || 0);
  }
  return total;
}

// --- preserveOrder node helpers ------------------------------------------------

function tagOf(node: Node): string | null {
  const keys = Object.keys(node).filter((k) => k !== ATTR);
  return keys[0] ?? null;
}

function children(node: Node, tag: string): Node[] {
  const value = node[tag];
  return Array.isArray(value) ? (value as Node[]) : [];
}

function attrs(node: Node): Record<string, string> {
  return ((node[ATTR] as Record<string, string>) ?? {}) as Record<string, string>;
}

function findChild(nodes: Node[], tag: string): Node | null {
  return nodes.find((n) => tagOf(n) === tag) ?? null;
}

function numberOrString(value: string | undefined): unknown {
  if (value === undefined) return null;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}
