const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// lib/mpd-parser.js is a vendored UMD bundle (mpd-parser 0.9.0). In a CJS
// module scope its UMD wrapper would take the CommonJS branch and require
// "global/window" and "xmldom", neither of which is installed. Loading it via
// new Function keeps exports/module out of scope, so the wrapper falls through
// to the browser branch and installs global.mpdParser with window as both the
// window and the xmldom stand-in. stringToMpdXml then resolves
// window.DOMParser — the minimal stub below.

// A minimal XML subset sufficient for the parser's traversal: elements with
// tagName/textContent/childNodes/attributes and getElementsByTagName. Malformed
// input produces a <parsererror> document, mirroring browser DOMParser.
function parseXml(string) {
  function makeElement(tagName) {
    return {
      tagName,
      attributes: [],
      childNodes: [],
      textContent: "",
      getElementsByTagName(name) {
        const found = [];
        const walk = (node) => {
          for (const child of node.childNodes || []) {
            if (child.tagName === name) found.push(child);
            walk(child);
          }
        };
        walk(this);
        return found;
      },
    };
  }

  function parseTag(source, start) {
    const end = source.indexOf(">", start);
    if (end === -1) return null;
    let body = source.slice(start + 1, end);
    let selfClosing = body.endsWith("/");
    if (selfClosing) body = body.slice(0, -1);
    const nameMatch = body.match(/^([^\s/>]+)/);
    if (!nameMatch) return null;
    const element = makeElement(nameMatch[1]);
    const attrRegex = /([^\s=]+)="([^"]*)"/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(body))) {
      element.attributes.push({ name: attrMatch[1], value: attrMatch[2] });
    }
    return { element, next: end + 1, selfClosing };
  }

  const root = makeElement("#document");
  const stack = [root];
  let i = 0;
  try {
    while (i < string.length) {
      const open = string.indexOf("<", i);
      if (open === -1) break;
      const text = string.slice(i, open).trim();
      if (text && stack.length > 0) {
        const top = stack[stack.length - 1];
        top.childNodes.push({ tagName: "#text", textContent: text, childNodes: [], attributes: [] });
        top.textContent = (top.textContent || "") + text;
      }
      if (string.startsWith("<?", open) || string.startsWith("<!", open)) {
        i = string.indexOf(">", open) + 1;
        continue;
      }
      const close = string.startsWith("</", open);
      if (close) {
        stack.pop();
        i = string.indexOf(">", open) + 1;
        continue;
      }
      const parsed = parseTag(string, open);
      if (!parsed) throw new Error("malformed");
      stack[stack.length - 1].childNodes.push(parsed.element);
      if (!parsed.selfClosing) stack.push(parsed.element);
      i = parsed.next;
    }
    if (stack.length !== 1) throw new Error("unclosed tags");
  } catch {
    // Malformed input: mimic a browser parsererror document.
    const errorRoot = makeElement("parsererror");
    root.childNodes = [errorRoot];
  }
  return { documentElement: root.childNodes[0] || root };
}

global.window = global;
global.DOMParser = function () {
  this.parseFromString = parseXml;
};

new Function(
  fs.readFileSync(path.join(__dirname, "..", "lib", "mpd-parser.js"), "utf8")
)();

const mpdParser = global.mpdParser;

const MINIMAL_MPD = `<?xml version="1.0" encoding="utf-8"?>
<MPD type="static" mediaPresentationDuration="PT8S">
  <Period id="0">
    <AdaptationSet contentType="video" mimeType="video/mp4" codecs="avc1.640028">
      <BaseURL>video/</BaseURL>
      <SegmentList duration="4" timescale="1">
        <Initialization sourceURL="init.mp4"/>
        <SegmentURL media="segment-0.m4s"/>
        <SegmentURL media="segment-1.m4s"/>
      </SegmentList>
      <Representation id="v0" bandwidth="5000000" width="1920" height="1080"/>
    </AdaptationSet>
  </Period>
</MPD>`;

test("exposes the expected parsing surface and version", () => {
  assert.ok(mpdParser.VERSION);
  assert.strictEqual(typeof mpdParser.parse, "function");
  assert.strictEqual(typeof mpdParser.parseUTCTiming, "function");
  assert.strictEqual(typeof mpdParser.stringToMpdXml, "function");
  assert.strictEqual(typeof mpdParser.toPlaylists, "function");
  assert.strictEqual(typeof mpdParser.inheritAttributes, "function");
});

test("stringToMpdXml returns the MPD document element", () => {
  const mpd = mpdParser.stringToMpdXml(MINIMAL_MPD);
  assert.strictEqual(mpd.tagName, "MPD");
});

test("stringToMpdXml throws DASH_EMPTY_MANIFEST for an empty manifest", () => {
  assert.throws(() => mpdParser.stringToMpdXml(""), /DASH_EMPTY_MANIFEST/);
});

test("stringToMpdXml throws DASH_INVALID_XML for malformed XML", () => {
  assert.throws(
    () => mpdParser.stringToMpdXml("<MPD><Period></MPD>"),
    /DASH_INVALID_XML/
  );
});

test("stringToMpdXml throws DASH_INVALID_XML for a non-MPD root", () => {
  assert.throws(
    () => mpdParser.stringToMpdXml("<foo/>"),
    /DASH_INVALID_XML/
  );
});

test("parseUTCTiming returns null when no UTCTiming node is present", () => {
  assert.strictEqual(mpdParser.parseUTCTiming(MINIMAL_MPD), null);
});

test("parseUTCTiming parses a http-head scheme into a HEAD method", () => {
  const mpd = `<?xml version="1.0"?>
<MPD>
  <UTCTiming schemeIdUri="urn:mpeg:dash:utc:http-head:2014" value="/time" />
</MPD>`;
  const utcTiming = mpdParser.parseUTCTiming(mpd);
  assert.ok(utcTiming);
  assert.strictEqual(utcTiming.schemeIdUri, "urn:mpeg:dash:utc:http-head:2014");
  assert.strictEqual(utcTiming.method, "HEAD");
  assert.strictEqual(utcTiming.value, "/time");
});

test("parse of a minimal SegmentList MPD yields one playlist with segments", () => {
  const parsed = mpdParser.parse(MINIMAL_MPD, { manifestUri: "/x.mpd" });
  assert.ok(Array.isArray(parsed.playlists));
  assert.strictEqual(parsed.playlists.length, 1);
  const playlist = parsed.playlists[0];
  assert.strictEqual(playlist.attributes.CODECS, "avc1.640028");
  assert.strictEqual(playlist.targetDuration, 4);
  assert.strictEqual(playlist.segments.length, 2);
  assert.strictEqual(playlist.segments[0].resolvedUri, "/video/segment-0.m4s");
  assert.strictEqual(playlist.segments[1].resolvedUri, "/video/segment-1.m4s");
  assert.strictEqual(playlist.segments[0].map.resolvedUri, "/video/init.mp4");
  assert.strictEqual(playlist.attributes.NAME, "v0");
});

test("parse without any Period throws INVALID_NUMBER_OF_PERIOD", () => {
  assert.throws(
    () => mpdParser.parse("<MPD/>", { manifestUri: "/x.mpd" }),
    /INVALID_NUMBER_OF_PERIOD/
  );
});
