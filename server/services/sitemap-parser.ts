import { createLogger } from "../utils/logger";

const logger = createLogger("sitemap-parser");

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

export interface SitemapCategory {
  name: string;
  urls: SitemapUrl[];
}

export interface ParsedSitemap {
  domain: string;
  totalUrls: number;
  categories: SitemapCategory[];
  allUrls: SitemapUrl[];
  errors: string[];
}

function extractTagContent(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "gi");
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1].trim());
  }
  return matches;
}

function extractSitemapUrls(xml: string): SitemapUrl[] {
  const urls: SitemapUrl[] = [];
  const urlBlockRegex = /<url>([\s\S]*?)<\/url>/gi;
  let match;
  while ((match = urlBlockRegex.exec(xml)) !== null) {
    const block = match[1];
    const locs = extractTagContent(block, "loc");
    if (locs.length > 0) {
      const lastmods = extractTagContent(block, "lastmod");
      const changefreqs = extractTagContent(block, "changefreq");
      const priorities = extractTagContent(block, "priority");
      urls.push({
        loc: locs[0],
        lastmod: lastmods[0] || undefined,
        changefreq: changefreqs[0] || undefined,
        priority: priorities[0] || undefined,
      });
    }
  }
  return urls;
}

function extractSitemapIndexUrls(xml: string): string[] {
  const sitemapBlockRegex = /<sitemap>([\s\S]*?)<\/sitemap>/gi;
  const sitemapUrls: string[] = [];
  let match;
  while ((match = sitemapBlockRegex.exec(xml)) !== null) {
    const locs = extractTagContent(match[1], "loc");
    if (locs.length > 0) {
      sitemapUrls.push(locs[0]);
    }
  }
  return sitemapUrls;
}

function categorizeSitemapName(sitemapUrl: string): string {
  const url = sitemapUrl.toLowerCase();
  if (url.includes("post") || url.includes("blog")) return "Blog Posts";
  if (url.includes("page")) return "Pages";
  if (url.includes("product")) return "Products";
  if (url.includes("categor")) return "Categories";
  if (url.includes("tag")) return "Tags";
  if (url.includes("service")) return "Services";
  if (url.includes("location") || url.includes("city")) return "Locations";
  if (url.includes("image") || url.includes("media")) return "Media";
  if (url.includes("video")) return "Videos";
  if (url.includes("news")) return "News";
  if (url.includes("faq")) return "FAQ";
  const filename = sitemapUrl.split("/").pop()?.replace(/\.xml.*$/, "") || "Other";
  return filename.replace(/[-_]/g, " ").replace(/sitemap/gi, "").trim() || "Other";
}

function categorizeByPath(url: string): string {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts.length === 0) return "Home";
    const firstSegment = pathParts[0].toLowerCase();
    if (firstSegment === "blog" || firstSegment === "posts" || firstSegment === "news" || firstSegment === "articles") return "Blog Posts";
    if (firstSegment === "services" || firstSegment === "service") return "Services";
    if (firstSegment === "products" || firstSegment === "product" || firstSegment === "shop") return "Products";
    if (firstSegment === "about" || firstSegment === "team" || firstSegment === "staff") return "About";
    if (firstSegment === "contact" || firstSegment === "locations" || firstSegment === "location") return "Contact/Locations";
    if (firstSegment === "faq" || firstSegment === "help" || firstSegment === "support") return "FAQ/Support";
    if (firstSegment === "portfolio" || firstSegment === "projects" || firstSegment === "work" || firstSegment === "gallery") return "Portfolio";
    if (firstSegment === "testimonials" || firstSegment === "reviews") return "Testimonials";
    if (firstSegment === "category" || firstSegment === "categories" || firstSegment === "tag" || firstSegment === "tags") return "Categories/Tags";
    return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
  } catch {
    return "Other";
  }
}

function isUrlSafeForFetch(url: string, allowedDomain: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" ||
        hostname.startsWith("10.") || hostname.startsWith("172.") || hostname.startsWith("192.168.") ||
        hostname === "[::1]" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
      return false;
    }
    const normalizedAllowed = allowedDomain.replace(/^www\./, "");
    const normalizedHost = hostname.replace(/^www\./, "");
    if (normalizedHost !== normalizedAllowed && !normalizedHost.endsWith(`.${normalizedAllowed}`)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

let _activeFetchDomain = "";

async function fetchXml(url: string): Promise<string | null> {
  if (_activeFetchDomain && !isUrlSafeForFetch(url, _activeFetchDomain)) {
    logger.warn(`Blocked fetch to non-allowed URL: ${url} (allowed domain: ${_activeFetchDomain})`);
    return null;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AIVisibilityAudit/1.0)",
        "Accept": "application/xml, text/xml, */*",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    logger.error(`Failed to fetch ${url}:`, error);
    return null;
  }
}

function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

export async function parseSitemap(domain: string): Promise<ParsedSitemap> {
  const normalizedDomain = normalizeDomain(domain);
  const baseUrl = `https://${normalizedDomain}`;
  const errors: string[] = [];
  const allUrls: SitemapUrl[] = [];
  const categorizedUrls: Map<string, SitemapUrl[]> = new Map();

  const sitemapIndexUrl = `${baseUrl}/sitemap_index.xml`;
  const sitemapUrl = `${baseUrl}/sitemap.xml`;
  const robotsTxtUrl = `${baseUrl}/robots.txt`;

  let foundSitemap = false;

  _activeFetchDomain = normalizedDomain;
  logger.info(`Parsing sitemap for ${normalizedDomain}`);

  try {

  const indexXml = await fetchXml(sitemapIndexUrl);
  if (indexXml && indexXml.includes("<sitemapindex")) {
    foundSitemap = true;
    const childSitemapUrls = extractSitemapIndexUrls(indexXml);
    logger.info(`Found sitemap index with ${childSitemapUrls.length} child sitemaps`);

    const fetchPromises = childSitemapUrls.slice(0, 50).map(async (childUrl) => {
      const categoryName = categorizeSitemapName(childUrl);
      const childXml = await fetchXml(childUrl);
      if (childXml) {
        const urls = extractSitemapUrls(childXml);
        return { categoryName, urls };
      } else {
        errors.push(`Failed to fetch child sitemap: ${childUrl}`);
        return null;
      }
    });

    const results = await Promise.all(fetchPromises);
    for (const result of results) {
      if (result) {
        allUrls.push(...result.urls);
        const existing = categorizedUrls.get(result.categoryName) || [];
        existing.push(...result.urls);
        categorizedUrls.set(result.categoryName, existing);
      }
    }
  }

  if (!foundSitemap) {
    const mainXml = await fetchXml(sitemapUrl);
    if (mainXml) {
      foundSitemap = true;
      if (mainXml.includes("<sitemapindex")) {
        const childSitemapUrls = extractSitemapIndexUrls(mainXml);
        const fetchPromises = childSitemapUrls.slice(0, 50).map(async (childUrl) => {
          const categoryName = categorizeSitemapName(childUrl);
          const childXml = await fetchXml(childUrl);
          if (childXml) {
            const urls = extractSitemapUrls(childXml);
            return { categoryName, urls };
          } else {
            errors.push(`Failed to fetch child sitemap: ${childUrl}`);
            return null;
          }
        });
        const results = await Promise.all(fetchPromises);
        for (const result of results) {
          if (result) {
            allUrls.push(...result.urls);
            const existing = categorizedUrls.get(result.categoryName) || [];
            existing.push(...result.urls);
            categorizedUrls.set(result.categoryName, existing);
          }
        }
      } else {
        const urls = extractSitemapUrls(mainXml);
        allUrls.push(...urls);
        for (const url of urls) {
          const category = categorizeByPath(url.loc);
          const existing = categorizedUrls.get(category) || [];
          existing.push(url);
          categorizedUrls.set(category, existing);
        }
      }
    }
  }

  if (!foundSitemap) {
    const robotsTxt = await fetchXml(robotsTxtUrl);
    if (robotsTxt) {
      const sitemapLines = robotsTxt.split("\n").filter((line) =>
        line.toLowerCase().startsWith("sitemap:")
      );
      for (const line of sitemapLines.slice(0, 10)) {
        const sitemapLoc = line.replace(/^sitemap:\s*/i, "").trim();
        if (sitemapLoc) {
          const xml = await fetchXml(sitemapLoc);
          if (xml) {
            foundSitemap = true;
            const urls = extractSitemapUrls(xml);
            allUrls.push(...urls);
            const categoryName = categorizeSitemapName(sitemapLoc);
            const existing = categorizedUrls.get(categoryName) || [];
            existing.push(...urls);
            categorizedUrls.set(categoryName, existing);
          }
        }
      }
    }
  }

  if (!foundSitemap) {
    errors.push("No sitemap found. Checked sitemap_index.xml, sitemap.xml, and robots.txt");
  }

  const categories: SitemapCategory[] = Array.from(categorizedUrls.entries())
    .map(([name, urls]) => ({ name, urls }))
    .sort((a, b) => b.urls.length - a.urls.length);

  logger.info(`Parsed ${allUrls.length} URLs across ${categories.length} categories for ${normalizedDomain}`);

  return {
    domain: normalizedDomain,
    totalUrls: allUrls.length,
    categories,
    allUrls,
    errors,
  };

  } finally {
    _activeFetchDomain = "";
  }
}
