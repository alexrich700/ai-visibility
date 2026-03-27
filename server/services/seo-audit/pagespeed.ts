import { fetchWithTimeout, DailyQuotaTracker } from './http-client';
import type { CrawlSummary } from './dataforseo';

const PSI_API_KEY = () => process.env.GOOGLE_PSI_API_KEY || '';

const pageSpeedDailyQuota = new DailyQuotaTracker(25000);

export interface PageSpeedData {
  lighthouseResult: {
    categories: {
      performance: { score: number };
      accessibility?: { score: number };
      seo?: { score: number };
      'best-practices'?: { score: number };
    };
    audits: Record<string, {
      numericValue?: number;
      score?: number | null;
      details?: Record<string, unknown>;
    }>;
  };
  loadingExperience?: {
    metrics?: Record<string, {
      percentile: number;
      category: string;
    }>;
  };
}

const PSI_MAX_RETRIES = 3;
const PSI_INITIAL_BACKOFF_MS = 2000;

export async function getPageSpeedInsights(url: string, strategy: 'mobile' | 'desktop' = 'mobile'): Promise<PageSpeedData> {
  if (!pageSpeedDailyQuota.canMakeRequest()) {
    throw new Error(`PageSpeed Insights daily quota exhausted (${pageSpeedDailyQuota.getUsed()} used of 25,000/day). Try again tomorrow.`);
  }

  const params = new URLSearchParams({
    url,
    strategy,
    category: 'performance',
  });

  const apiKey = PSI_API_KEY();
  if (apiKey) params.append('key', apiKey);

  const requestUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;

  for (let attempt = 0; attempt <= PSI_MAX_RETRIES; attempt++) {
    const response = await fetchWithTimeout(requestUrl, { timeoutMs: 60000 });

    pageSpeedDailyQuota.recordRequest();

    if (response.ok) {
      return await response.json() as PageSpeedData;
    }

    if (response.status === 429 && attempt < PSI_MAX_RETRIES) {
      const delay = PSI_INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      console.warn(`[PageSpeed] Rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${PSI_MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }

    const text = await response.text();
    if (response.status === 429) {
      throw new Error(`PageSpeed Insights rate limit exceeded after ${PSI_MAX_RETRIES} retries. The API quota may be exhausted — try again later.`);
    }
    throw new Error(`PageSpeed Insights API error ${response.status}: ${text}`);
  }

  throw new Error('PageSpeed Insights: max retries exceeded');
}

export function getPageSpeedQuotaStatus(): { used: number; remaining: number } {
  return {
    used: pageSpeedDailyQuota.getUsed(),
    remaining: pageSpeedDailyQuota.getRemaining(),
  };
}

export interface TechnicalFinding {
  category: string;
  check_name: string;
  status: 'pass' | 'fail' | 'warning';
  value: string;
  threshold: string;
  description?: string;
  impact: 'high' | 'medium' | 'low';
}

export function runTechnicalChecks(psiData: PageSpeedData, crawlData?: CrawlSummary | null): TechnicalFinding[] {
  const findings: TechnicalFinding[] = [];
  const audits = psiData.lighthouseResult?.audits || {};

  const lcp = audits['largest-contentful-paint']?.numericValue || 0;
  findings.push({
    category: 'speed',
    check_name: 'Largest Contentful Paint (LCP)',
    status: lcp <= 2500 ? 'pass' : lcp <= 4000 ? 'warning' : 'fail',
    value: `${(lcp / 1000).toFixed(1)}s`,
    threshold: '≤ 2.5s',
    description: 'Time until the largest content element is rendered',
    impact: lcp > 4000 ? 'high' : 'medium',
  });

  const inp = audits['interaction-to-next-paint']?.numericValue || audits['total-blocking-time']?.numericValue || 0;
  findings.push({
    category: 'speed',
    check_name: 'Interaction to Next Paint (INP)',
    status: inp <= 200 ? 'pass' : inp <= 500 ? 'warning' : 'fail',
    value: `${Math.round(inp)}ms`,
    threshold: '≤ 200ms',
    description: 'Responsiveness to user interactions',
    impact: inp > 500 ? 'high' : 'medium',
  });

  const cls = audits['cumulative-layout-shift']?.numericValue || 0;
  findings.push({
    category: 'speed',
    check_name: 'Cumulative Layout Shift (CLS)',
    status: cls <= 0.1 ? 'pass' : cls <= 0.25 ? 'warning' : 'fail',
    value: cls.toFixed(3),
    threshold: '≤ 0.1',
    description: 'Visual stability of the page',
    impact: cls > 0.25 ? 'high' : 'medium',
  });

  const perfScore = (psiData.lighthouseResult?.categories?.performance?.score || 0) * 100;
  findings.push({
    category: 'speed',
    check_name: 'Overall Performance Score',
    status: perfScore >= 90 ? 'pass' : perfScore >= 50 ? 'warning' : 'fail',
    value: `${Math.round(perfScore)}/100`,
    threshold: '≥ 90',
    description: 'Lighthouse performance score',
    impact: perfScore < 50 ? 'high' : 'medium',
  });

  const fcp = audits['first-contentful-paint']?.numericValue || 0;
  findings.push({
    category: 'speed',
    check_name: 'First Contentful Paint (FCP)',
    status: fcp <= 1800 ? 'pass' : fcp <= 3000 ? 'warning' : 'fail',
    value: `${(fcp / 1000).toFixed(1)}s`,
    threshold: '≤ 1.8s',
    description: 'Time until first content is painted',
    impact: fcp > 3000 ? 'high' : 'medium',
  });

  const si = audits['speed-index']?.numericValue || 0;
  findings.push({
    category: 'speed',
    check_name: 'Speed Index',
    status: si <= 3400 ? 'pass' : si <= 5800 ? 'warning' : 'fail',
    value: `${(si / 1000).toFixed(1)}s`,
    threshold: '≤ 3.4s',
    description: 'How quickly content is visually displayed',
    impact: si > 5800 ? 'high' : 'medium',
  });

  const tbt = audits['total-blocking-time']?.numericValue || 0;
  findings.push({
    category: 'speed',
    check_name: 'Total Blocking Time (TBT)',
    status: tbt <= 200 ? 'pass' : tbt <= 600 ? 'warning' : 'fail',
    value: `${Math.round(tbt)}ms`,
    threshold: '≤ 200ms',
    description: 'Sum of blocking time for long tasks',
    impact: tbt > 600 ? 'high' : 'medium',
  });

  const ttfb = audits['server-response-time']?.numericValue || 0;
  findings.push({
    category: 'speed',
    check_name: 'Time to First Byte (TTFB)',
    status: ttfb <= 800 ? 'pass' : ttfb <= 1800 ? 'warning' : 'fail',
    value: `${Math.round(ttfb)}ms`,
    threshold: '≤ 800ms',
    description: 'Server response time for the initial request',
    impact: ttfb > 1800 ? 'high' : 'medium',
  });

  findings.push({
    category: 'onpage',
    check_name: 'Image Optimization',
    status: audits['uses-optimized-images']?.score === 1 || audits['uses-optimized-images']?.score === null ? 'pass' : 'warning',
    value: audits['uses-optimized-images']?.score === 1 || audits['uses-optimized-images']?.score === null ? 'Optimized' : 'Unoptimized images found',
    threshold: 'All optimized',
    description: 'Images are properly compressed and sized',
    impact: 'medium',
  });

  findings.push({
    category: 'security',
    check_name: 'HTTPS',
    status: audits['is-on-https']?.score === 1 ? 'pass' : 'fail',
    value: audits['is-on-https']?.score === 1 ? 'Yes' : 'No',
    threshold: 'Required',
    description: 'Site serves content over HTTPS',
    impact: 'high',
  });

  findings.push({
    category: 'security',
    check_name: 'No Mixed Content',
    status: audits['is-on-https']?.score === 1 ? 'pass' : 'warning',
    value: audits['is-on-https']?.score === 1 ? 'Clean' : 'Mixed content detected',
    threshold: 'No mixed content',
    description: 'All resources loaded over HTTPS',
    impact: 'medium',
  });

  findings.push({
    category: 'mobile',
    check_name: 'Viewport Meta Tag',
    status: audits['viewport']?.score === 1 ? 'pass' : 'fail',
    value: audits['viewport']?.score === 1 ? 'Present' : 'Missing',
    threshold: 'Required',
    description: 'Mobile viewport is properly configured',
    impact: 'high',
  });

  findings.push({
    category: 'mobile',
    check_name: 'Font Size Legibility',
    status: audits['font-size']?.score === 1 || audits['font-size']?.score === null ? 'pass' : 'warning',
    value: audits['font-size']?.score === 1 || audits['font-size']?.score === null ? 'Readable' : 'Too small',
    threshold: '≥ 12px',
    description: 'Text is large enough to read on mobile',
    impact: 'medium',
  });

  findings.push({
    category: 'mobile',
    check_name: 'Tap Targets',
    status: audits['tap-targets']?.score === 1 || audits['tap-targets']?.score === null ? 'pass' : 'warning',
    value: audits['tap-targets']?.score === 1 || audits['tap-targets']?.score === null ? 'Sized properly' : 'Too small',
    threshold: '≥ 48px',
    description: 'Interactive elements are large enough to tap',
    impact: 'medium',
  });

  findings.push({
    category: 'onpage',
    check_name: 'Document Title',
    status: audits['document-title']?.score === 1 ? 'pass' : 'fail',
    value: audits['document-title']?.score === 1 ? 'Present' : 'Missing',
    threshold: 'Required',
    description: 'Page has a title tag',
    impact: 'high',
  });

  findings.push({
    category: 'onpage',
    check_name: 'Meta Description',
    status: audits['meta-description']?.score === 1 ? 'pass' : 'warning',
    value: audits['meta-description']?.score === 1 ? 'Present' : 'Missing',
    threshold: 'Recommended',
    description: 'Page has a meta description',
    impact: 'medium',
  });

  findings.push({
    category: 'onpage',
    check_name: 'Image Alt Text',
    status: audits['image-alt']?.score === 1 ? 'pass' : 'warning',
    value: audits['image-alt']?.score === 1 ? 'All images have alt text' : 'Some images missing alt text',
    threshold: 'All images',
    description: 'Images have descriptive alt text',
    impact: 'medium',
  });

  findings.push({
    category: 'onpage',
    check_name: 'Heading Order',
    status: audits['heading-order']?.score === 1 || audits['heading-order']?.score === null ? 'pass' : 'warning',
    value: audits['heading-order']?.score === 1 || audits['heading-order']?.score === null ? 'Correct' : 'Out of order',
    threshold: 'Sequential',
    description: 'Headings follow a logical order (H1 > H2 > H3)',
    impact: 'low',
  });

  findings.push({
    category: 'onpage',
    check_name: 'Link Text',
    status: audits['link-text']?.score === 1 || audits['link-text']?.score === null ? 'pass' : 'warning',
    value: audits['link-text']?.score === 1 || audits['link-text']?.score === null ? 'Descriptive' : 'Generic',
    threshold: 'Descriptive',
    description: 'Links use descriptive text instead of generic phrases',
    impact: 'low',
  });

  findings.push({
    category: 'crawlability',
    check_name: 'HTTP Status Code',
    status: audits['http-status-code']?.score === 1 ? 'pass' : 'fail',
    value: audits['http-status-code']?.score === 1 ? '200 OK' : 'Error',
    threshold: '200',
    description: 'Page returns a valid HTTP status code',
    impact: 'high',
  });

  findings.push({
    category: 'crawlability',
    check_name: 'Crawlable Links',
    status: audits['crawlable-anchors']?.score === 1 || audits['crawlable-anchors']?.score === null ? 'pass' : 'warning',
    value: audits['crawlable-anchors']?.score === 1 || audits['crawlable-anchors']?.score === null ? 'All crawlable' : 'Some uncrawlable',
    threshold: 'All links crawlable',
    description: 'Links can be followed by search engines',
    impact: 'medium',
  });

  findings.push({
    category: 'crawlability',
    check_name: 'Canonical Tag',
    status: audits['canonical']?.score === 1 || audits['canonical']?.score === null ? 'pass' : 'warning',
    value: audits['canonical']?.score === 1 || audits['canonical']?.score === null ? 'Present' : 'Missing',
    threshold: 'Recommended',
    description: 'Page specifies a canonical URL',
    impact: 'medium',
  });

  findings.push({
    category: 'crawlability',
    check_name: 'Robots.txt Valid',
    status: audits['robots-txt']?.score === 1 || audits['robots-txt']?.score === null ? 'pass' : 'warning',
    value: audits['robots-txt']?.score === 1 || audits['robots-txt']?.score === null ? 'Valid' : 'Issues found',
    threshold: 'Valid',
    description: 'robots.txt file is properly configured',
    impact: 'high',
  });

  if (crawlData) {
    findings.push({
      category: 'crawlability',
      check_name: 'Has robots.txt',
      status: crawlData.has_robots_txt ? 'pass' : 'fail',
      value: crawlData.has_robots_txt ? 'Yes' : 'No',
      threshold: 'Required',
      description: 'Site has a robots.txt file',
      impact: 'high',
    });

    findings.push({
      category: 'crawlability',
      check_name: 'Has XML Sitemap',
      status: crawlData.has_sitemap ? 'pass' : 'fail',
      value: crawlData.has_sitemap ? 'Yes' : 'No',
      threshold: 'Required',
      description: 'Site has an XML sitemap',
      impact: 'medium',
    });

    findings.push({
      category: 'crawlability',
      check_name: 'Broken Links',
      status: (crawlData.broken_links_count || 0) === 0 ? 'pass'
             : (crawlData.broken_links_count || 0) <= 5 ? 'warning' : 'fail',
      value: `${crawlData.broken_links_count || 0} broken links`,
      threshold: '0',
      description: 'Number of broken links found on the site',
      impact: (crawlData.broken_links_count || 0) > 10 ? 'high' : 'medium',
    });

    findings.push({
      category: 'crawlability',
      check_name: 'Redirect Chains',
      status: (crawlData.redirect_count || 0) <= 3 ? 'pass' : 'warning',
      value: `${crawlData.redirect_count || 0} redirects`,
      threshold: '≤ 3',
      description: 'Number of redirect chains found',
      impact: 'medium',
    });

    findings.push({
      category: 'crawlability',
      check_name: 'Non-Indexable Pages',
      status: (crawlData.non_indexable_count || 0) === 0 ? 'pass' : 'warning',
      value: `${crawlData.non_indexable_count || 0}`,
      threshold: '0 unexpected',
      description: 'Pages blocked from indexing',
      impact: 'medium',
    });

    findings.push({
      category: 'onpage',
      check_name: 'Pages Missing Title Tags',
      status: (crawlData.pages_with_no_title || 0) === 0 ? 'pass' : 'fail',
      value: `${crawlData.pages_with_no_title || 0}`,
      threshold: '0',
      description: 'Pages without title tags',
      impact: 'high',
    });

    findings.push({
      category: 'onpage',
      check_name: 'Pages Missing Meta Descriptions',
      status: (crawlData.pages_with_no_description || 0) === 0 ? 'pass' : 'warning',
      value: `${crawlData.pages_with_no_description || 0}`,
      threshold: '0',
      description: 'Pages without meta descriptions',
      impact: 'medium',
    });

    findings.push({
      category: 'onpage',
      check_name: 'Pages Missing H1',
      status: (crawlData.pages_with_no_h1 || 0) === 0 ? 'pass' : 'fail',
      value: `${crawlData.pages_with_no_h1 || 0}`,
      threshold: '0',
      description: 'Pages without H1 headings',
      impact: 'high',
    });

    findings.push({
      category: 'onpage',
      check_name: 'Duplicate Titles',
      status: (crawlData.duplicate_title_count || 0) === 0 ? 'pass' : 'warning',
      value: `${crawlData.duplicate_title_count || 0}`,
      threshold: '0',
      description: 'Pages with duplicate title tags',
      impact: 'medium',
    });

    findings.push({
      category: 'onpage',
      check_name: 'Duplicate Meta Descriptions',
      status: (crawlData.duplicate_description_count || 0) === 0 ? 'pass' : 'warning',
      value: `${crawlData.duplicate_description_count || 0}`,
      threshold: '0',
      description: 'Pages with duplicate meta descriptions',
      impact: 'low',
    });

    findings.push({
      category: 'onpage',
      check_name: 'Large Page Size',
      status: (crawlData.pages_with_large_page_size || 0) === 0 ? 'pass' : 'warning',
      value: `${crawlData.pages_with_large_page_size || 0}`,
      threshold: '0',
      description: 'Pages with excessive file size',
      impact: 'medium',
    });

    findings.push({
      category: 'onpage',
      check_name: 'Duplicate Content',
      status: (crawlData.duplicate_content_count || 0) === 0 ? 'pass' : 'warning',
      value: `${crawlData.duplicate_content_count || 0}`,
      threshold: '0',
      description: 'Pages with duplicate content detected',
      impact: 'medium',
    });

    findings.push({
      category: 'schema',
      check_name: 'Structured Data Present',
      status: crawlData.have_schema_markup ? 'pass' : 'fail',
      value: crawlData.have_schema_markup ? 'Yes' : 'No',
      threshold: 'Required',
      description: 'Site uses structured data markup (schema.org)',
      impact: 'high',
    });

    findings.push({
      category: 'schema',
      check_name: 'LocalBusiness Schema',
      status: crawlData.have_local_business_schema ? 'pass' : 'fail',
      value: crawlData.have_local_business_schema ? 'Present' : 'Missing',
      threshold: 'Required for local',
      description: 'LocalBusiness schema markup for local SEO',
      impact: 'high',
    });
  }

  return findings;
}

export function calculateSiteHealthGrade(findings: TechnicalFinding[]): string {
  const total = findings.length;
  if (total === 0) return 'N/A';
  const passed = findings.filter(f => f.status === 'pass').length;
  const ratio = passed / total;

  if (ratio >= 0.9) return 'A';
  if (ratio >= 0.8) return 'B';
  if (ratio >= 0.65) return 'C';
  if (ratio >= 0.5) return 'D';
  return 'F';
}