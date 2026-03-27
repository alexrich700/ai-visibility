import { fetchWithTimeout, dataForSeoLimiter } from './http-client';

const D4SEO_LOGIN = () => process.env.DATAFORSEO_LOGIN || '';
const D4SEO_PASSWORD = () => process.env.DATAFORSEO_PASSWORD || '';
const BASE_URL = 'https://api.dataforseo.com/v3';

function getAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${D4SEO_LOGIN()}:${D4SEO_PASSWORD()}`).toString('base64');
}

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const SERP_BATCH_SIZE = 25;
const MAPS_BATCH_SIZE = 10;

export class DataForSEOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataForSEOAuthError';
  }
}

class DataForSEOApiError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'DataForSEOApiError';
  }
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('fetch failed') ||
           msg.includes('socket') ||
           msg.includes('econnreset') ||
           msg.includes('econnrefused') ||
           msg.includes('etimedout') ||
           msg.includes('network') ||
           msg.includes('abort');
  }
  return false;
}

function retryDelay(attempt: number): number {
  const base = RETRY_BASE_MS * Math.pow(2, attempt);
  const jitter = Math.random() * base * 0.3;
  return Math.min(base + jitter, 15000);
}

interface D4SeoApiResponse {
  status_code: number;
  status_message: string;
  tasks: D4SeoTask[];
}

interface D4SeoTask {
  id: string;
  status_code: number;
  status_message: string;
  data?: { tag?: string };
  result: D4SeoTaskResult[] | null;
}

interface D4SeoTaskResult {
  items: D4SeoItem[] | null;
  items_count: number;
  crawl_progress?: string;
  crawl_status?: Record<string, number>;
  [key: string]: unknown;
}

interface D4SeoItem {
  type: string;
  rank_absolute: number;
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
  rating?: { value: number; votes_count: number };
  address?: string;
  place_id?: string;
  [key: string]: unknown;
}

async function d4seoRequest(endpoint: string, body: unknown[], retries = MAX_RETRIES): Promise<D4SeoApiResponse> {
  const taskCount = body.length;
  await dataForSeoLimiter.acquire(taskCount);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        timeoutMs: 60000,
      });

      if (!response.ok) {
        const text = await response.text();
        if (response.status === 401) {
          throw new DataForSEOAuthError(`DataForSEO authentication failed (401): credentials missing or invalid`);
        }
        if (response.status === 429 && attempt < retries) {
          const delay = retryDelay(attempt);
          console.log(`[DataForSEO] Rate limited, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        if (response.status >= 400 && response.status < 500) {
          throw new DataForSEOApiError(`DataForSEO API error ${response.status}: ${text}`, response.status);
        }
        if (response.status >= 500 && attempt < retries) {
          const delay = retryDelay(attempt);
          console.log(`[DataForSEO] Server error ${response.status}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`DataForSEO API error ${response.status}: ${text}`);
      }

      const data = await response.json() as D4SeoApiResponse;
      if (data.status_code !== 20000) {
        throw new DataForSEOApiError(
          `DataForSEO error: ${data.status_message || 'Unknown error'} (code ${data.status_code})`,
          data.status_code
        );
      }
      return data;
    } catch (error) {
      if (error instanceof DataForSEOAuthError || error instanceof DataForSEOApiError) {
        throw error;
      }
      if (attempt < retries && isNetworkError(error)) {
        const delay = retryDelay(attempt);
        console.log(`[DataForSEO] Network error (${error instanceof Error ? error.message : 'unknown'}), retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('DataForSEO: max retries exceeded');
}

async function d4seoGet(endpoint: string, retries = MAX_RETRIES): Promise<D4SeoApiResponse> {
  await dataForSeoLimiter.acquire();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
        headers: {
          'Authorization': getAuthHeader(),
        },
        timeoutMs: 60000,
      });

      if (response.status === 401) {
        throw new DataForSEOAuthError(`DataForSEO authentication failed (401): credentials missing or invalid`);
      }
      if (response.status === 429 && attempt < retries) {
        const delay = retryDelay(attempt);
        console.log(`[DataForSEO] GET rate limited, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      if (!response.ok) {
        if (response.status >= 500 && attempt < retries) {
          const delay = retryDelay(attempt);
          console.log(`[DataForSEO] GET server error ${response.status}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`DataForSEO GET error: ${response.status}`);
      }

      const data = await response.json() as D4SeoApiResponse;
      if (data.status_code !== 20000) {
        throw new DataForSEOApiError(
          `DataForSEO GET error: ${data.status_message || 'Unknown error'} (code ${data.status_code})`,
          data.status_code
        );
      }
      return data;
    } catch (error) {
      if (error instanceof DataForSEOAuthError || error instanceof DataForSEOApiError) {
        throw error;
      }
      if (attempt < retries && isNetworkError(error)) {
        const delay = retryDelay(attempt);
        console.log(`[DataForSEO] GET network error (${error instanceof Error ? error.message : 'unknown'}), retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('DataForSEO GET: max retries exceeded');
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export interface SerpResult {
  keyword: string;
  locationName: string;
  items: D4SeoItem[];
}

export async function getOrganicSerp(params: { keyword: string; locationName: string; languageCode?: string }): Promise<SerpResult> {
  const data = await d4seoRequest('/serp/google/organic/live/advanced', [{
    keyword: params.keyword,
    location_name: params.locationName,
    language_code: params.languageCode || 'en',
    depth: 100,
  }]);

  const task = data.tasks?.[0];
  return {
    keyword: params.keyword,
    locationName: params.locationName,
    items: task?.result?.[0]?.items || [],
  };
}

export async function batchOrganicSerp(pairs: Array<{ keyword: string; locationName: string }>): Promise<SerpResult[]> {
  const batches = chunk(pairs, SERP_BATCH_SIZE);
  const allResults: SerpResult[] = [];
  let failedBatches = 0;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    try {
      const tasks = batch.map(p => ({
        keyword: p.keyword,
        location_name: p.locationName,
        language_code: 'en',
        depth: 100,
      }));

      const data = await d4seoRequest('/serp/google/organic/live/advanced', tasks);

      for (let i = 0; i < batch.length; i++) {
        const task = data.tasks?.[i];
        allResults.push({
          keyword: batch[i].keyword,
          locationName: batch[i].locationName,
          items: task?.result?.[0]?.items || [],
        });
      }
    } catch (error) {
      if (error instanceof DataForSEOAuthError) {
        throw error;
      }
      failedBatches++;
      console.warn(`[DataForSEO] SERP batch ${batchIdx + 1}/${batches.length} failed: ${error instanceof Error ? error.message : 'unknown'}`);
      for (const pair of batch) {
        allResults.push({
          keyword: pair.keyword,
          locationName: pair.locationName,
          items: [],
        });
      }
    }
  }

  if (failedBatches > 0 && failedBatches === batches.length) {
    throw new Error(`DataForSEO: all ${batches.length} SERP batches failed — no results available`);
  }
  if (failedBatches > 0) {
    console.warn(`[DataForSEO] ${failedBatches}/${batches.length} SERP batches failed — returning partial results`);
  }

  return Object.assign(allResults, {
    partialFailure: failedBatches > 0 ? { failedBatches, totalBatches: batches.length } : null,
  });
}

export interface MapsSerpResult {
  keyword: string;
  lat: number;
  lng: number;
  items: D4SeoItem[];
}

export async function getMapsSerp(params: { keyword: string; lat: number; lng: number; depth?: number }): Promise<MapsSerpResult> {
  const data = await d4seoRequest('/serp/google/maps/live/advanced', [{
    keyword: params.keyword,
    location_coordinate: `${params.lat},${params.lng},17z`,
    language_code: 'en',
    depth: params.depth || 20,
  }]);

  const task = data.tasks?.[0];
  return {
    keyword: params.keyword,
    lat: params.lat,
    lng: params.lng,
    items: task?.result?.[0]?.items || [],
  };
}

export interface GridPoint {
  lat: number;
  lng: number;
  row: number;
  col: number;
}

const EARTH_RADIUS_MILES = 3958.8;

function haversineDestination(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceMiles: number
): { lat: number; lng: number } {
  const latRad = lat * Math.PI / 180;
  const lngRad = lng * Math.PI / 180;
  const bearingRad = bearingDeg * Math.PI / 180;
  const angularDist = distanceMiles / EARTH_RADIUS_MILES;

  const destLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angularDist) +
    Math.cos(latRad) * Math.sin(angularDist) * Math.cos(bearingRad)
  );

  const destLngRad = lngRad + Math.atan2(
    Math.sin(bearingRad) * Math.sin(angularDist) * Math.cos(latRad),
    Math.cos(angularDist) - Math.sin(latRad) * Math.sin(destLatRad)
  );

  return {
    lat: parseFloat((destLatRad * 180 / Math.PI).toFixed(7)),
    lng: parseFloat((destLngRad * 180 / Math.PI).toFixed(7)),
  };
}

export function generateGridPoints(centerLat: number, centerLng: number, gridSize: number, spacingMiles: number): GridPoint[] {
  const points: GridPoint[] = [];
  const halfGrid = Math.floor(gridSize / 2);

  for (let row = -halfGrid; row <= halfGrid; row++) {
    for (let col = -halfGrid; col <= halfGrid; col++) {
      const nsDist = Math.abs(row) * spacingMiles;
      const nsBearing = row >= 0 ? 0 : 180;
      const nsPoint = nsDist > 0
        ? haversineDestination(centerLat, centerLng, nsBearing, nsDist)
        : { lat: centerLat, lng: centerLng };

      const ewDist = Math.abs(col) * spacingMiles;
      const ewBearing = col >= 0 ? 90 : 270;
      const finalPoint = ewDist > 0
        ? haversineDestination(nsPoint.lat, nsPoint.lng, ewBearing, ewDist)
        : nsPoint;

      points.push({
        lat: finalPoint.lat,
        lng: finalPoint.lng,
        row: row + halfGrid,
        col: col + halfGrid,
      });
    }
  }
  return points;
}

export function findRank(items: Array<{ title?: string; rank_absolute: number }>, businessName: string): number | null {
  if (!items || !businessName) return null;
  const normalized = businessName.toLowerCase().trim();
  for (const item of items) {
    if (item.title && item.title.toLowerCase().includes(normalized)) {
      return item.rank_absolute;
    }
  }
  return null;
}

export interface GridMetrics {
  clientSoLV: string;
  clientAvgRank: string | null;
  competitorSoLV: string;
  competitorAvgRank: string | null;
  totalPoints: number;
  clientVisiblePoints: number;
  clientTop3Points: number;
}

export interface GridPointResult {
  row: number;
  col: number;
  lat: number;
  lng: number;
  clientRank: number | null;
  competitorRank: number | null;
  topResults: Array<{
    rank: number;
    name: string;
    rating: number | null;
    reviews: number | null;
    domain: string | null;
  }>;
}

interface GridTag {
  keyword: string;
  row: number;
  col: number;
  lat: number;
  lng: number;
}

export async function runGeoGrid(params: {
  centerLat: number;
  centerLng: number;
  gridSize: number;
  spacingMiles: number;
  keywords: string[];
  clientBusinessName: string;
  competitorBusinessName?: string;
}): Promise<{ gridResults: Record<string, GridPointResult[]>; metrics: Record<string, GridMetrics>; partialFailure: { failedBatches: number; totalBatches: number } | null }> {
  const points = generateGridPoints(params.centerLat, params.centerLng, params.gridSize, params.spacingMiles);

  const allTasks: Array<{
    keyword: string;
    location_coordinate: string;
    language_code: string;
    depth: number;
    tag: string;
  }> = [];

  for (const keyword of params.keywords) {
    for (const point of points) {
      allTasks.push({
        keyword,
        location_coordinate: `${point.lat},${point.lng},17z`,
        language_code: 'en',
        depth: 20,
        tag: JSON.stringify({ keyword, row: point.row, col: point.col, lat: point.lat, lng: point.lng }),
      });
    }
  }

  const batches = chunk(allTasks, MAPS_BATCH_SIZE);

  interface GeoGridResult {
    tag: string;
    items: D4SeoItem[];
  }

  const allResults: GeoGridResult[] = [];
  let failedBatches = 0;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    try {
      const data = await d4seoRequest('/serp/google/maps/live/advanced', batch);
      if (data.tasks) {
        for (let taskIdx = 0; taskIdx < data.tasks.length; taskIdx++) {
          const task = data.tasks[taskIdx];
          if (task.result) {
            const taskTag = task.data?.tag || batch[taskIdx]?.tag;
            if (!taskTag) {
              console.error(`[DataForSEO] Missing tag for task index ${taskIdx}`);
              continue;
            }
            for (const result of task.result) {
              allResults.push({
                tag: taskTag,
                items: result.items || [],
              });
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof DataForSEOAuthError) {
        throw error;
      }
      failedBatches++;
      console.warn(`[DataForSEO] Geo grid batch ${batchIdx + 1}/${batches.length} failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  if (failedBatches > 0 && failedBatches === batches.length) {
    throw new Error(`DataForSEO: all ${batches.length} geo grid batches failed — no results available`);
  }
  if (failedBatches > 0) {
    console.warn(`[DataForSEO] ${failedBatches}/${batches.length} geo grid batches failed — returning partial results`);
  }

  const partialFailure = failedBatches > 0 ? { failedBatches, totalBatches: batches.length } : null;

  const gridResults: Record<string, GridPointResult[]> = {};
  const metrics: Record<string, GridMetrics> = {};

  for (const result of allResults) {
    try {
      const tagData: GridTag = JSON.parse(result.tag);
      const { keyword, row, col, lat, lng } = tagData;
      const clientRank = findRank(result.items, params.clientBusinessName);
      const competitorRank = params.competitorBusinessName
        ? findRank(result.items, params.competitorBusinessName)
        : null;

      if (!gridResults[keyword]) gridResults[keyword] = [];
      gridResults[keyword].push({
        row, col, lat, lng,
        clientRank,
        competitorRank,
        topResults: (result.items || []).slice(0, 5).map((item: D4SeoItem) => ({
          rank: item.rank_absolute,
          name: item.title || '',
          rating: item.rating?.value || null,
          reviews: item.rating?.votes_count || null,
          domain: item.domain || null,
        })),
      });
    } catch (e) {
      console.error('[DataForSEO] Failed to parse grid result tag:', e);
    }
  }

  for (const [keyword, pointResults] of Object.entries(gridResults)) {
    const total = pointResults.length;
    const clientTop3 = pointResults.filter(p => p.clientRank !== null && p.clientRank <= 3).length;
    const clientRanked = pointResults.filter(p => p.clientRank !== null);
    const compTop3 = pointResults.filter(p => p.competitorRank !== null && p.competitorRank <= 3).length;
    const compRanked = pointResults.filter(p => p.competitorRank !== null);

    metrics[keyword] = {
      clientSoLV: total > 0 ? ((clientTop3 / total) * 100).toFixed(1) : '0.0',
      clientAvgRank: clientRanked.length > 0
        ? (clientRanked.reduce((s, p) => s + (p.clientRank || 0), 0) / clientRanked.length).toFixed(1)
        : null,
      competitorSoLV: total > 0 ? ((compTop3 / total) * 100).toFixed(1) : '0.0',
      competitorAvgRank: compRanked.length > 0
        ? (compRanked.reduce((s, p) => s + (p.competitorRank || 0), 0) / compRanked.length).toFixed(1)
        : null,
      totalPoints: total,
      clientVisiblePoints: clientRanked.length,
      clientTop3Points: clientTop3,
    };
  }

  return { gridResults, metrics, partialFailure };
}

export async function startSiteCrawl(params: { targetUrl: string; maxPages?: number }): Promise<string> {
  const data = await d4seoRequest('/on_page/task_post', [{
    target: params.targetUrl,
    max_crawl_pages: params.maxPages || 500,
    load_resources: true,
    enable_javascript: true,
    enable_browser_rendering: true,
  }]);

  const taskId = data.tasks?.[0]?.id;
  if (!taskId) throw new Error('DataForSEO: No task ID returned from crawl');
  return taskId;
}

export interface CrawlSummary {
  crawl_progress: string;
  crawl_status: Record<string, number>;
  pages_count: number;
  pages_crawled: number;
  broken_links_count?: number;
  redirect_count?: number;
  non_indexable_count?: number;
  pages_with_no_title?: number;
  pages_with_no_description?: number;
  pages_with_no_h1?: number;
  duplicate_title_count?: number;
  duplicate_description_count?: number;
  duplicate_content_count?: number;
  pages_with_large_page_size?: number;
  has_robots_txt?: boolean;
  has_sitemap?: boolean;
  have_schema_markup?: boolean;
  have_local_business_schema?: boolean;
  [key: string]: unknown;
}

export async function getCrawlSummary(taskId: string): Promise<CrawlSummary | null> {
  const data = await d4seoGet(`/on_page/summary/${taskId}`);
  const result = data.tasks?.[0]?.result?.[0];
  if (!result) return null;
  return result as unknown as CrawlSummary;
}

export interface CrawlPage {
  url: string;
  status_code: number;
  resource_type: string;
  meta?: { title?: string; description?: string };
  [key: string]: unknown;
}

export async function getCrawlPages(taskId: string, filters?: Record<string, string | number>): Promise<CrawlPage[]> {
  const body: Record<string, unknown> = { id: taskId, limit: 1000 };
  if (filters) {
    const filterArray: Array<[string, string, string | number]> = [];
    if (filters.status_code) {
      filterArray.push(['resource_type', '=', 'html']);
      filterArray.push(['status_code', '=', filters.status_code]);
    }
    if (filterArray.length > 0) body.filters = filterArray;
  }

  const data = await d4seoRequest('/on_page/pages', [body]);
  const items = data.tasks?.[0]?.result?.[0]?.items;
  if (!items) return [];
  return items as unknown as CrawlPage[];
}

export interface BacklinkSummary {
  total_backlinks: number;
  referring_domains: number;
  referring_main_domains: number;
  rank: number;
  broken_backlinks: number;
  [key: string]: unknown;
}

export async function getBacklinkSummary(domain: string): Promise<BacklinkSummary> {
  const data = await d4seoRequest('/backlinks/summary/live', [{
    target: domain,
    internal_list_limit: 0,
    backlinks_status_type: 'live',
  }]);

  const result = data.tasks?.[0]?.result?.[0];
  if (!result) return {} as BacklinkSummary;
  return result as unknown as BacklinkSummary;
}

export interface BacklinkItem {
  url_from: string;
  url_to: string;
  domain_from: string;
  rank: number;
  anchor: string;
  dofollow: boolean;
  [key: string]: unknown;
}

export async function getTopBacklinks(domain: string, limit = 10): Promise<BacklinkItem[]> {
  const data = await d4seoRequest('/backlinks/backlinks/live', [{
    target: domain,
    limit,
    order_by: ['rank,desc'],
    backlinks_status_type: 'live',
    filters: [['dofollow', '=', true]],
  }]);

  const items = data.tasks?.[0]?.result?.[0]?.items;
  if (!items) return [];
  return items as unknown as BacklinkItem[];
}
