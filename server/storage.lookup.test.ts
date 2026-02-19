import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBusinessNameForLookup,
  normalizeDomainForLookup,
} from "./storage";

test("normalizeBusinessNameForLookup trims and lowercases while preserving punctuation", () => {
  assert.equal(normalizeBusinessNameForLookup("  ACME Plumbing  "), "acme plumbing");
  assert.equal(normalizeBusinessNameForLookup("MiXeD Case Name"), "mixed case name");
  assert.equal(normalizeBusinessNameForLookup("O'Brien & Sons, LLC"), "o'brien & sons, llc");
});

test("normalizeBusinessNameForLookup returns empty string for blank input", () => {
  assert.equal(normalizeBusinessNameForLookup(""), "");
  assert.equal(normalizeBusinessNameForLookup("   \t  \n"), "");
});

test("normalizeDomainForLookup canonicalizes protocol, casing, whitespace, and trailing slashes", () => {
  assert.equal(normalizeDomainForLookup("  HTTPS://Example.COM///  "), "example.com");
  assert.equal(normalizeDomainForLookup("EXAMPLE.COM"), "example.com");
});

test("normalizeDomainForLookup preserves host details beyond basic canonicalization", () => {
  assert.equal(normalizeDomainForLookup("http://www.Example.com/path/"), "www.example.com/path");
  assert.equal(normalizeDomainForLookup("example.com:8080"), "example.com:8080");
  assert.equal(normalizeDomainForLookup("example.com/path?foo=bar"), "example.com/path?foo=bar");
});

test("normalizeDomainForLookup returns empty string for blank or slash-only input", () => {
  assert.equal(normalizeDomainForLookup(""), "");
  assert.equal(normalizeDomainForLookup("   "), "");
  assert.equal(normalizeDomainForLookup("///"), "");
});

test("normalizeDomainForLookup intentionally keeps www prefix", () => {
  assert.equal(normalizeDomainForLookup("www.example.com"), "www.example.com");
  assert.equal(normalizeDomainForLookup("example.com"), "example.com");
  assert.notEqual(normalizeDomainForLookup("www.example.com"), normalizeDomainForLookup("example.com"));
});
