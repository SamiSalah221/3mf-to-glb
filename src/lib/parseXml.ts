// XML parsing abstraction so the rest of the library is environment-agnostic.
//
// In the browser, the global `DOMParser` is used by default — no extra deps.
// In Node, the CLI entry calls `setDefaultDomParser(new XmldomParser())` to
// inject `@xmldom/xmldom`. We deliberately do not `import('@xmldom/xmldom')`
// from this file so it stays out of the browser bundle.

export type DomParserLike = {
  parseFromString(xml: string, mimeType: string): Document;
};

let defaultParser: DomParserLike | null = null;

export function setDefaultDomParser(parser: DomParserLike): void {
  defaultParser = parser;
}

export function getDefaultDomParser(): DomParserLike {
  if (defaultParser) return defaultParser;
  if (typeof DOMParser !== 'undefined') {
    defaultParser = new DOMParser();
    return defaultParser;
  }
  throw new Error(
    "No DOMParser available. In Node, import '@xmldom/xmldom' and call " +
      'setDefaultDomParser(new DOMParser()) before calling parse3MF.',
  );
}

export function parseXml(xml: string): Document {
  return getDefaultDomParser().parseFromString(xml, 'application/xml');
}

// Prefixes that are always available and must never be redeclared.
const RESERVED_PREFIXES = new Set(['xml', 'xmlns']);

// Placeholder namespace for prefixes a vendor used without declaring. The URI
// is never matched against, it only exists so a strict parser stops objecting.
const PLACEHOLDER_NS = 'urn:printproof:undeclared-prefix:';

/** Every namespace prefix used by an element or attribute name in the document. */
function usedPrefixes(xml: string): string[] {
  const found = new Set<string>();
  // Element names: <slic3rpe:shape ...> or </slic3rpe:shape>
  for (const m of xml.matchAll(/<\/?([A-Za-z_][\w.-]*):/g)) found.add(m[1]);
  // Attribute names: slic3rpe:foo="bar"
  for (const m of xml.matchAll(/[\s"']([A-Za-z_][\w.-]*):[A-Za-z_][\w.-]*\s*=/g)) found.add(m[1]);
  return [...found].filter((p) => !RESERVED_PREFIXES.has(p));
}

/** Inject xmlns declarations for the given prefixes into the root element's open tag. */
function declarePrefixes(xml: string, prefixes: string[]): string | null {
  // Find the first real element, skipping the XML declaration, comments,
  // processing instructions, and the doctype.
  const rootTag = /<(?![?!])([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)/.exec(xml);
  if (!rootTag) return null;

  // Walk to the end of that open tag, respecting quoted attribute values so a
  // ">" inside an attribute does not end the tag early.
  let i = rootTag.index + rootTag[0].length;
  let quote: string | null = null;
  for (; i < xml.length; i++) {
    const ch = xml[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      break;
    }
  }
  if (i >= xml.length) return null;

  // Insert before the ">", and before a self-closing "/" if there is one.
  let insertAt = i;
  while (insertAt > 0 && /\s/.test(xml[insertAt - 1])) insertAt--;
  if (xml[insertAt - 1] === '/') insertAt--;

  const decls = prefixes.map((p) => ` xmlns:${p}="${PLACEHOLDER_NS}${p}"`).join('');
  return xml.slice(0, insertAt) + decls + xml.slice(insertAt);
}

/**
 * Parse XML, tolerating undeclared namespace prefixes.
 *
 * Bambu and Snapmaker write `Metadata/model_settings.config` with elements like
 * `<slic3rpe:shape>` inside a plain `<config>` root that declares no namespaces.
 * The browser DOMParser accepts that; strict parsers (@xmldom/xmldom, used by
 * the CLI) throw `NamespaceError: prefix is non-null and namespace is null`.
 *
 * That mattered because the caller swallowed the error and silently lost every
 * plate but the first on Node. We retry once with placeholder xmlns declarations
 * injected into the root element. If the retry also fails the document is broken
 * for some other reason, so the ORIGINAL error is rethrown.
 */
export function parseXmlLenient(xml: string): Document {
  try {
    return parseXml(xml);
  } catch (originalError) {
    const declared = new Set(
      [...xml.matchAll(/xmlns:([A-Za-z_][\w.-]*)\s*=/g)].map((m) => m[1]),
    );
    const undeclared = usedPrefixes(xml).filter((p) => !declared.has(p));
    if (undeclared.length === 0) throw originalError;

    const patched = declarePrefixes(xml, undeclared);
    if (patched === null) throw originalError;

    try {
      return parseXml(patched);
    } catch {
      throw originalError;
    }
  }
}
