import test from "node:test";
import assert from "node:assert/strict";
import { db } from "./db";
import {
  DatabaseStorage,
  normalizeBusinessNameForLookup,
  normalizeDomainForLookup,
} from "./storage";
import type { MonitoringClient } from "@shared/schema";

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

test("getMonitoringClientByBusinessNameAndDomain falls back to raw columns when normalized columns are not backfilled", async () => {
  const storage = new DatabaseStorage();

  const legacyClient = {
    id: 42,
    businessName: "Acme Plumbing",
    domain: "https://example.com/",
    normalizedBusinessName: "",
    normalizedDomain: "",
    industry: "Home Services",
    scope: "local",
    city: null,
    cities: null,
    primaryCategories: null,
    brandAliases: null,
    checkFrequencyDays: 14,
    lastCheckAt: null,
    nextCheckAt: null,
    isActive: true,
    clientAccessToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies MonitoringClient;

  let selectInvocation = 0;
  const originalSelect = db.select.bind(db);

  const fakeSelect = () => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: async () => {
            selectInvocation += 1;
            return selectInvocation === 1 ? [] : [legacyClient];
          },
        }),
      }),
    }),
  });

  Object.defineProperty(db, "select", {
    value: fakeSelect,
    configurable: true,
    writable: true,
  });

  try {
    const foundClient = await storage.getMonitoringClientByBusinessNameAndDomain("  ACME Plumbing ", "https://example.com/");

    assert.equal(foundClient?.id, legacyClient.id);
    assert.equal(selectInvocation, 2);
  } finally {
    Object.defineProperty(db, "select", {
      value: originalSelect,
      configurable: true,
      writable: true,
    });
  }
});
