import { pooledFetch } from './http-client';

const D4SEO_LOGIN = () => process.env.DATAFORSEO_LOGIN || '';
const D4SEO_PASSWORD = () => process.env.DATAFORSEO_PASSWORD || '';
const BASE_URL = 'https://api.dataforseo.com/v3';

function getAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${D4SEO_LOGIN()}:${D4SEO_PASSWORD()}`).toString('base64');
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];
const BATCH_SIZE = 100;

async function d4seoRequest<T>(endpoint: string, body: any[], retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await pooledFetch(`${BASE_URL}${endpoint}`, {
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
        if (response.status === 429 && attempt < retries) {
          const delay = RETRY_DELAYS[attempt] || 4000;
          console.log(`[DataForSEO] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`DataForSEO API error ${response.status}: ${text}`);
      }

      const data = await response.json();
      if (data.status_code !== 20000) {
        throw new Error(`DataForSEO error: ${data.status_message || 'Unknown error'}`);
      }
      return data as T;
    } catch (error) {
      if (attempt < retries && !(error instanceof Error && error.message.includes('API error 4'))) {
        const delay = RETRY_DELAYS[attempt] || 4000;
        console.log(`[DataForSEO] Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('DataForSEO: max retries exceeded');
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
  items: Array<{
    type: string;
    rank_absolute: number;
    url?: string;
    domain?: string;
    title?: string;
    description?: string;
  }>;
}

export async function getOrganicSerp(params: { keyword: string; locationName: string; languageCode?: string }): Promise<SerpResult> {
  const data = await d4seoRequest<any>('/serp/google/organic/live/advanced', [{
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
  const batches = chunk(pairs, BATCH_SIZE);
  const allResults: SerpResult[] = [];

  for (const batch of batches) {
    const tasks = batch.map(p => ({
      keyword: p.keyword,
      location_name: p.locationName,
      language_code: 'en',
      depth: 100,
    }));

    const data = await d4seoRequest<any>('/serp/google/organic/live/advanced', tasks);

    for (let i = 0; i < batch.length; i++) {
      const task = data.tasks?.[i];
      allResults.push({
        keyword: batch[i].keyword,
        locationName: batch[i].locationName,
        items: task?.result?.[0]?.items || [],
      });
    }
  }

  return allResults;
}

export interface MapsSerpResult {
  keyword: string;
  lat: number;
  lng: number;
  items: Array<{
    rank_absolute: number;
    title: string;
    domain?: string;
    url?: string;
    rating?: { value: number; votes_count: number };
    address?: string;
    place_id?: string;
  }>;
}

export async function getMapsSerp(params: { keyword: string; lat: number; lng: number; depth?: number }): Promise<MapsSerpResult> {
  const data = await d4seoRequest<any>('/serp/google/maps/live/advanced', [{
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
  const match = items.find(item =>
    item.title && item.title.toLowerCase().includes(normalized)
  );
  return match ? match.rank_absolute : null;
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

export async function runGeoGrid(params: {
  centerLat: number;
  centerLng: number;
  gridSize: number;
  spacingMiles: number;
  keywords: string[];
  clientBusinessName: string;
  competitorBusinessName?: string;
}): Promise<{ gridResults: Record<string, GridPointResult[]>; metrics: Record<string, GridMetrics> }> {
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

  const batches = chunk(allTasks, BATCH_SIZE);
  const allResults: any[] = [];

  for (const batch of batches) {
    try {
      const data = await d4seoRequest<any>('/serp/google/maps/live/advanced', batch);
      if (data.tasks) {
        for (const task of data.tasks) {
          if (task.result) {
            for (const result of task.result) {
              allResults.push({
                tag: task.data?.tag || batch[0]?.tag,
                items: result.items || [],
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`[DataForSEO] Geo grid batch failed:`, error);
    }
  }

  const gridResults: Record<string, GridPointResult[]> = {};
  const metrics: Record<string, GridMetrics> = {};

  for (const result of allResults) {
    try {
      const tagData = JSON.parse(result.tag);
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
        topResults: (result.items || []).slice(0, 5).map((i: any) => ({
          rank: i.rank_absolute,
          name: i.title || '',
          rating: i.rating?.value || null,
          reviews: i.rating?.votes_count || null,
          domain: i.domain || null,
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

  return { gridResults, metrics };
}

export async function startSiteCrawl(params: { targetUrl: string; maxPages?: number }): Promise<string> {
  const data = await d4seoRequest<any>('/on_page/task_post', [{
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

export async function getCrawlSummary(taskId: string): Promise<any> {
  const response = await fetch(`${BASE_URL}/on_page/summary/${taskId}`, {
    headers: { 'Authorization': getAuthHeader() },
  });

  if (!response.ok) throw new Error(`DataForSEO crawl summary error: ${response.status}`);
  const data = await response.json();
  return data.tasks?.[0]?.result?.[0] || null;
}

export async function getCrawlPages(taskId: string, filters?: Record<string, any>): Promise<any[]> {
  const body: any = { id: taskId, limit: 1000 };
  if (filters) {
    const filterArray: any[] = [];
    if (filters.status_code) {
      filterArray.push(['resource_type', '=', 'html']);
      filterArray.push(['status_code', '=', filters.status_code]);
    }
    if (filterArray.length > 0) body.filters = filterArray;
  }

  const data = await d4seoRequest<any>('/on_page/pages', [body]);
  return data.tasks?.[0]?.result?.[0]?.items || [];
}

export async function getBacklinkSummary(domain: string): Promise<any> {
  const data = await d4seoRequest<any>('/backlinks/summary/live', [{
    target: domain,
    internal_list_limit: 0,
    backlinks_status_type: 'live',
  }]);

  return data.tasks?.[0]?.result?.[0] || {};
}

export async function getTopBacklinks(domain: string, limit = 10): Promise<any[]> {
  const data = await d4seoRequest<any>('/backlinks/backlinks/live', [{
    target: domain,
    limit,
    order_by: ['rank,desc'],
    backlinks_status_type: 'live',
    filters: [['dofollow', '=', true]],
  }]);

  return data.tasks?.[0]?.result?.[0]?.items || [];
}