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
