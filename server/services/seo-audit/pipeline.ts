import { EventEmitter } from 'events';
import { storage } from '../../storage';
import { runStageWithLogging, auditQueue, type StageResult } from './queue';
import {
  startSiteCrawl,
  getCrawlSummary,
  getCrawlPages,
  batchOrganicSerp,
  runGeoGrid,
  getBacklinkSummary,
  getTopBacklinks,
  DataForSEOAuthError,
  type CrawlSummary,
  type CrawlPage,
  type SerpResult,
  type GridPointResult,
  type GridMetrics,
} from './dataforseo';
import {
  getPageSpeedInsights,
  runTechnicalChecks,
  calculateSiteHealthGrade,
  type TechnicalFinding,
} from './pagespeed';
import {
  getBusinessReviews,
  geocodeAddress,
  type PlaceDetails,
} from './google-places';
import {
  generateKeywordIdeas,
  generateForecast,
  lookupGeoTarget,
} from './keyword-planner';
import {
  classifyKeywords,
  scorePage,
  analyzeReviews,
  generateActionPlanNarrative,
  extractServicesFromPages,
} from './llm';
import { runPromptCheck } from '../../ai-services';
import type {
  SeoAudit,
  InsertAuditKeyword,
  InsertAuditGeoGridPoint,
  InsertAuditTechnicalFinding,
  InsertAuditCompetitor,
  InsertAuditContentGap,
  InsertAuditReview,
  InsertAuditDeliverable,
  InsertAuditPpcForecast,
} from '@shared/schema';
import { randomBytes } from 'crypto';

export interface PipelineEvent {
  type: 'stage_start' | 'stage_complete' | 'stage_error' | 'pipeline_complete' | 'pipeline_error';
  auditId: number;
  stage?: string;
  stageIndex?: number;
  totalStages?: number;
  error?: string;
  timestamp: number;
}

const PIPELINE_STAGES = [
  'intake',
  'technical_audit',
  'keyword_research',
  'serp_rankings',
  'geo_grid',
  'competitive_intel',
  'geo_visibility',
  'review_health',
  'gap_analysis',
  'content_scoring',
  'scoping_engine',
  'report_generation',
] as const;

export type StageName = typeof PIPELINE_STAGES[number];

const STAGE_LABELS: Record<StageName, string> = {
  intake: 'Site Crawl & Intake',
  technical_audit: 'Technical Audit',
  keyword_research: 'Keyword Research',
  serp_rankings: 'SERP Rankings',
  geo_grid: 'Geo Grid Analysis',
  competitive_intel: 'Competitive Intelligence',
  geo_visibility: 'AI/GEO Visibility',
  review_health: 'Review Health',
  gap_analysis: 'Gap Analysis',
  content_scoring: 'Content Scoring',
  scoping_engine: 'Scoping Engine',
  report_generation: 'Report Generation',
};

interface GeoGridStageResult {
  keyword: string;
  gridSize: number;
  spacingMiles: number;
  centerLat: number;
  centerLng: number;
  points: GridPointResult[];
  metrics: GridMetrics;
}

class SEOAuditPipeline extends EventEmitter {
  private crawlSummary: CrawlSummary | null = null;
  private crawlPages: CrawlPage[] = [];
  private crawlSkipped = false;
  private serpResults: SerpResult[] = [];
  private geoGridStageResults: GeoGridStageResult[] = [];
  private technicalFindings: TechnicalFinding[] = [];

  async run(auditId: number): Promise<void> {
    const audit = await storage.getSeoAuditById(auditId);
    if (!audit) throw new Error(`Audit ${auditId} not found`);

    await this.cleanupPriorRunData(auditId);

    await storage.updateSeoAudit(auditId, {
      status: 'running',
      currentStage: 'intake',
    });

    const totalStages = PIPELINE_STAGES.length;
    let hadStageErrors = false;

    for (let i = 0; i < PIPELINE_STAGES.length; i++) {
      const stageName = PIPELINE_STAGES[i];
      const label = STAGE_LABELS[stageName];

      this.emit('event', {
        type: 'stage_start',
        auditId,
        stage: stageName,
        stageIndex: i,
        totalStages,
        timestamp: Date.now(),
      } satisfies PipelineEvent);

      await storage.updateSeoAudit(auditId, { currentStage: stageName });

      try {
        await runStageWithLogging(auditId, stageName, i, async () => {
          const freshAudit = await storage.getSeoAuditById(auditId);
          if (!freshAudit) throw new Error(`Audit ${auditId} not found`);
          return await this.runStage(stageName, freshAudit);
        });

        this.emit('event', {
          type: 'stage_complete',
          auditId,
          stage: stageName,
          stageIndex: i,
          totalStages,
          timestamp: Date.now(),
        } satisfies PipelineEvent);
      } catch (error) {
        hadStageErrors = true;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Pipeline] Stage ${stageName} failed for audit ${auditId}:`, errorMsg);

        this.emit('event', {
          type: 'stage_error',
          auditId,
          stage: stageName,
          stageIndex: i,
          totalStages,
          error: errorMsg,
          timestamp: Date.now(),
        } satisfies PipelineEvent);
      }
    }

    await storage.updateSeoAudit(auditId, {
      status: hadStageErrors ? 'completed_with_errors' : 'completed',
      currentStage: null,
    });

    this.emit('event', {
      type: 'pipeline_complete',
      auditId,
      totalStages,
      timestamp: Date.now(),
    } satisfies PipelineEvent);
  }

  private async runStage(stage: StageName, audit: SeoAudit): Promise<StageResult | void> {
    switch (stage) {
      case 'intake': return this.stageIntake(audit);
      case 'technical_audit': return this.stageTechnicalAudit(audit);
      case 'keyword_research': return this.stageKeywordResearch(audit);
      case 'serp_rankings': return this.stageSerpRankings(audit);
      case 'geo_grid': return this.stageGeoGrid(audit);
      case 'competitive_intel': return this.stageCompetitiveIntel(audit);
      case 'geo_visibility': return this.stageGeoVisibility(audit);
      case 'review_health': return this.stageReviewHealth(audit);
      case 'gap_analysis': return this.stageGapAnalysis(audit);
      case 'content_scoring': return this.stageContentScoring(audit);
      case 'scoping_engine': return this.stageScopingEngine(audit);
      case 'report_generation': return this.stageReportGeneration(audit);
    }
  }

  private async cleanupPriorRunData(auditId: number): Promise<void> {
    await Promise.all([
      storage.deleteAuditKeywordsByAuditId(auditId),
      storage.deleteAuditGeoGridsByAuditId(auditId),
      storage.deleteAuditTechnicalFindingsByAuditId(auditId),
      storage.deleteAuditCompetitorsByAuditId(auditId),
      storage.deleteAuditContentGapsByAuditId(auditId),
      storage.deleteAuditReviewsByAuditId(auditId),
      storage.deleteAuditDeliverablesByAuditId(auditId),
      storage.deleteAuditPpcForecastsByAuditId(auditId),
      storage.deleteAuditStageLogsByAuditId(auditId),
    ]);

    await storage.updateSeoAudit(auditId, {
      siteHealthGrade: null,
      shareOfLocalVoice: null,
      averageGridRank: null,
      totalKeywordGaps: null,
      totalContentGaps: null,
      totalDeliverables: null,
      estimatedTotalHours: null,
      estimatedMonthlyInvestment: null,
      aiVisibilityScore: null,
      geoVisibilityData: null,
      executiveNarrative: null,
    });
  }

  private async stageIntake(audit: SeoAudit): Promise<StageResult | void> {
    if (!audit.businessLat || !audit.businessLng) {
      if (audit.businessAddress) {
        const coords = await geocodeAddress(audit.businessAddress);
        if (coords) {
          await storage.updateSeoAudit(audit.id, {
            businessLat: coords.lat,
            businessLng: coords.lng,
          });
        }
      }
    }

    try {
      const taskId = await startSiteCrawl({ targetUrl: audit.businessUrl, maxPages: 200 });
      await storage.updateSeoAudit(audit.id, { crawlTaskId: taskId });

      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 10000));
        const summary = await getCrawlSummary(taskId);
        if (summary && summary.crawl_progress === 'finished') {
          this.crawlSummary = summary;
          break;
        }
        attempts++;
      }

      if (this.crawlSummary) {
        const pages = await getCrawlPages(taskId);
        this.crawlPages = pages;

        const pagesForExtraction = pages.slice(0, 50).map(p => ({
          url: p.url,
          title: p.meta?.title,
          meta_description: p.meta?.description,
        }));

        if (pagesForExtraction.length > 0) {
          try {
            const extractedServices = await extractServicesFromPages(pagesForExtraction);
            const currentServices = (audit.services as string[]) || [];
            const newServiceNames = extractedServices.map(s => s.name);
            const uniqueServices: string[] = [];
            const seen = new Set<string>();
            for (const s of [...currentServices, ...newServiceNames]) {
              if (!seen.has(s)) { seen.add(s); uniqueServices.push(s); }
            }
            await storage.updateSeoAudit(audit.id, { services: uniqueServices });
          } catch (e) {
            console.error('[Pipeline] Service extraction failed:', e);
          }
        }
      }
    } catch (error) {
      if (error instanceof DataForSEOAuthError) {
        console.warn('[Pipeline] DataForSEO credentials missing or invalid — skipping crawl/intake stage. Downstream stages will adapt.');
        this.crawlSkipped = true;
        return { skipped: true, skipReason: 'DataForSEO credentials missing or invalid — crawl skipped' };
      }
      throw error;
    }
  }

  private async stageTechnicalAudit(audit: SeoAudit): Promise<void> {
    if (this.crawlSkipped) {
      console.warn('[Pipeline] Technical audit running without crawl data (DataForSEO credentials missing)');
    }
    const psiData = await getPageSpeedInsights(audit.businessUrl, 'mobile');
    const findings = runTechnicalChecks(psiData, this.crawlSkipped ? null : this.crawlSummary);
    this.technicalFindings = findings;
    const grade = calculateSiteHealthGrade(findings);

    const findingsToInsert: InsertAuditTechnicalFinding[] = findings.map(f => ({
      auditId: audit.id,
      category: f.category,
      checkName: f.check_name,
      status: f.status,
      value: f.value ?? null,
      threshold: f.threshold ?? null,
      description: f.description ?? null,
      impact: f.impact ?? null,
    }));

    if (findingsToInsert.length > 0) {
      await storage.createAuditTechnicalFindings(findingsToInsert);
    }

    await storage.updateSeoAudit(audit.id, { siteHealthGrade: grade });
  }

  private async stageKeywordResearch(audit: SeoAudit): Promise<void> {
    const services = (audit.services as string[]) || [];
    const cities = (audit.serviceAreaCities as string[]) || [];
    const seedKeywords = this.buildSeedKeywords(services, cities, audit.industry);

    let geoTargetId = 2840;
    if (cities.length > 0) {
      const geoTarget = await lookupGeoTarget(cities[0]);
      if (geoTarget) geoTargetId = geoTarget.id;
    }

    const keywordIdeas = await generateKeywordIdeas({
      seedKeywords: seedKeywords.slice(0, 20),
      url: audit.businessUrl,
      geoTargetId,
    });

    const allKeywords: Array<{ keyword: string; searchVolume?: number; cpc?: number }> = keywordIdeas.length > 0
      ? keywordIdeas.map(ki => ({
          keyword: ki.keyword,
          searchVolume: ki.avgMonthlySearches,
          cpc: ki.highTopOfPageBidMicros / 1_000_000,
        }))
      : seedKeywords.map(kw => ({ keyword: kw }));

    const classified = await classifyKeywords(allKeywords, services, cities);

    const keywordsToInsert: InsertAuditKeyword[] = classified.map(c => {
      const meta = allKeywords.find(k => k.keyword === c.keyword);
      return {
        auditId: audit.id,
        keyword: c.keyword,
        searchVolume: meta?.searchVolume ?? null,
        cpc: meta?.cpc ?? null,
        intent: c.intent,
        pageType: c.page_type,
        targetService: c.target_service,
        targetCity: c.target_city,
        priority: 'medium',
      };
    });

    if (keywordsToInsert.length > 0) {
      await storage.createAuditKeywords(keywordsToInsert);
    }

    if (keywordIdeas.length > 0) {
      const forecasts = await generateForecast({
        keywords: keywordsToInsert.slice(0, 50).map(k => k.keyword),
        geoTargetId,
      });

      const forecastsToInsert: InsertAuditPpcForecast[] = forecasts.map(f => ({
        auditId: audit.id,
        keyword: f.keyword,
        estimatedClicks: f.clicks,
        estimatedImpressions: f.impressions,
        estimatedCpc: f.averageCpcMicros / 1_000_000,
        estimatedCost: f.costMicros / 1_000_000,
        estimatedConversions: f.conversions,
        forecastPeriodDays: 90,
      }));

      if (forecastsToInsert.length > 0) {
        await storage.createAuditPpcForecasts(forecastsToInsert);
      }
    }
  }

  private async stageSerpRankings(audit: SeoAudit): Promise<StageResult | void> {
    const keywords = await storage.getAuditKeywordsByAuditId(audit.id);
    if (keywords.length === 0) return;

    const cities = (audit.serviceAreaCities as string[]) || [];
    const locationName = cities[0] || 'United States';

    const serpPairs = keywords.slice(0, 100).map(k => ({
      keyword: k.keyword,
      locationName,
    }));

    try {
      const serpResponse = await batchOrganicSerp(serpPairs);
      this.serpResults = serpResponse.results;
      if (serpResponse.partialFailure) {
        console.warn(`[Pipeline] SERP rankings: ${serpResponse.partialFailure.failedBatches}/${serpResponse.partialFailure.totalBatches} batches failed — continuing with partial data`);
      }
    } catch (error) {
      if (error instanceof DataForSEOAuthError) {
        console.warn('[Pipeline] DataForSEO credentials missing or invalid — skipping SERP rankings stage.');
        return { skipped: true, skipReason: 'DataForSEO credentials missing or invalid — SERP rankings skipped' };
      }
      throw error;
    }

    const clientDomain = extractDomain(audit.businessUrl);
    const competitors = (audit.competitors as Array<{ domain?: string; name?: string }>) || [];
    const competitorDomains = competitors
      .map(c => c.domain)
      .filter((d): d is string => !!d);

    const crawlPageUrls = this.crawlPages.map(p => p.url);

    for (let i = 0; i < this.serpResults.length; i++) {
      const result = this.serpResults[i];
      const keyword = keywords[i];
      if (!keyword || !result) continue;

      let clientRank: number | null = null;
      let existingPageUrl: string | null = null;
      let inAiOverview = false;
      const competitorRanks: Record<string, number | null> = {};

      for (const item of result.items) {
        if (item.type === 'ai_overview') {
          inAiOverview = true;
          continue;
        }

        if (!item.url) continue;
        const itemDomain = extractDomain(item.url);

        if (itemDomain === clientDomain) {
          if (clientRank === null) {
            clientRank = item.rank_absolute;
            existingPageUrl = item.url;
          }
        }

        for (const cd of competitorDomains) {
          if (itemDomain === cd && !competitorRanks[cd]) {
            competitorRanks[cd] = item.rank_absolute;
          }
        }
      }

      if (!existingPageUrl) {
        const matchedCrawlPage = crawlPageUrls.find(url => {
          const normalizedUrl = url.toLowerCase();
          const kwSlug = keyword.keyword.toLowerCase().replace(/\s+/g, '-');
          return normalizedUrl.includes(kwSlug) ||
            (keyword.targetService && normalizedUrl.includes(keyword.targetService.toLowerCase().replace(/\s+/g, '-')));
        });
        if (matchedCrawlPage) {
          existingPageUrl = matchedCrawlPage;
        }
      }

      await storage.updateAuditKeyword(keyword.id, {
        currentOrganicRank: clientRank,
        existingPageUrl,
        inAiOverview,
        competitorRanks,
      });
    }
  }

  private async stageGeoGrid(audit: SeoAudit): Promise<StageResult | void> {
    if (audit.businessType === 'national') return;
    if (!audit.businessLat || !audit.businessLng) return;

    const geoGridKeywords = (audit.geoGridKeywords as string[]) || [];
    const services = (audit.services as string[]) || [];
    const keywordsToRun = geoGridKeywords.length > 0
      ? geoGridKeywords
      : services.slice(0, 3);

    if (keywordsToRun.length === 0) return;

    const competitors = (audit.competitors as Array<{ name?: string; domain?: string }>) || [];
    const topCompetitorName = competitors.length > 0 ? competitors[0].name : undefined;

    try {
      const result = await runGeoGrid({
        centerLat: audit.businessLat,
        centerLng: audit.businessLng,
        gridSize: audit.geoGridSize || 13,
        spacingMiles: audit.geoGridSpacingMiles || 1.0,
        keywords: keywordsToRun,
        clientBusinessName: audit.businessName,
        competitorBusinessName: topCompetitorName,
      });

      if (result.partialFailure) {
        console.warn(`[Pipeline] Geo grid: ${result.partialFailure.failedBatches}/${result.partialFailure.totalBatches} batches failed — continuing with partial data`);
      }

      for (const keyword of keywordsToRun) {
        const points = result.gridResults[keyword];
        const metrics = result.metrics[keyword];
        if (!points || !metrics) continue;

        this.geoGridStageResults.push({
          keyword,
          gridSize: audit.geoGridSize || 13,
          spacingMiles: audit.geoGridSpacingMiles || 1.0,
          centerLat: audit.businessLat,
          centerLng: audit.businessLng,
          points,
          metrics,
        });

        const clientSolv = parseFloat(metrics.clientSoLV) || 0;
        const clientAvgRank = metrics.clientAvgRank ? parseFloat(metrics.clientAvgRank) : null;
        const compSolv = parseFloat(metrics.competitorSoLV) || 0;
        const compAvgRank = metrics.competitorAvgRank ? parseFloat(metrics.competitorAvgRank) : null;

        const grid = await storage.createAuditGeoGrid({
          auditId: audit.id,
          keyword,
          gridSize: audit.geoGridSize || 13,
          spacingMiles: audit.geoGridSpacingMiles || 1.0,
          centerLat: audit.businessLat,
          centerLng: audit.businessLng,
          clientSolv,
          clientAvgRank,
          competitorSolv: compSolv,
          competitorName: topCompetitorName ?? null,
          competitorAvgRank: compAvgRank,
        });

        const pointsToInsert: InsertAuditGeoGridPoint[] = points.map(p => ({
          gridId: grid.id,
          gridRow: p.row,
          gridCol: p.col,
          lat: p.lat,
          lng: p.lng,
          clientRank: p.clientRank,
          competitorRank: p.competitorRank ?? null,
          localPackResults: p.topResults,
        }));

        if (pointsToInsert.length > 0) {
          await storage.createAuditGeoGridPoints(pointsToInsert);
        }
      }
    } catch (e) {
      if (e instanceof DataForSEOAuthError) {
        console.warn('[Pipeline] DataForSEO credentials missing or invalid — skipping geo grid stage.');
        return { skipped: true, skipReason: 'DataForSEO credentials missing or invalid — geo grid skipped' };
      }
      console.error(`[Pipeline] Geo grid failed:`, e);
      throw e;
    }

    if (this.geoGridStageResults.length > 0) {
      const avgSolv = this.geoGridStageResults.reduce((s, r) => s + parseFloat(r.metrics.clientSoLV), 0) / this.geoGridStageResults.length;
      const rankedResults = this.geoGridStageResults.filter(r => r.metrics.clientAvgRank !== null);
      const avgRank = rankedResults.length > 0
        ? rankedResults.reduce((s, r) => s + parseFloat(r.metrics.clientAvgRank!), 0) / rankedResults.length
        : null;
      await storage.updateSeoAudit(audit.id, {
        shareOfLocalVoice: Math.round(avgSolv * 100) / 100,
        averageGridRank: avgRank !== null ? Math.round(avgRank * 100) / 100 : null,
      });
    }
  }

  private async stageCompetitiveIntel(audit: SeoAudit): Promise<void> {
    const competitors = (audit.competitors as Array<{ name?: string; domain?: string }>) || [];
    if (competitors.length === 0) return;

    const compsToAnalyze = competitors.slice(0, 3);
    const competitorsToInsert: InsertAuditCompetitor[] = [];

    for (const comp of compsToAnalyze) {
      if (!comp.domain) continue;

      try {
        const [backlinkSummary, topBacklinks] = await Promise.all([
          getBacklinkSummary(comp.domain),
          getTopBacklinks(comp.domain, 10),
        ]);

        let reviewData: PlaceDetails | null = null;
        if (comp.name) {
          reviewData = await getBusinessReviews(comp.name);
        }

        competitorsToInsert.push({
          auditId: audit.id,
          domain: comp.domain,
          businessName: comp.name ?? null,
          domainRating: backlinkSummary.rank ?? null,
          referringDomains: backlinkSummary.referring_domains ?? null,
          googleReviewCount: reviewData?.reviewCount ?? null,
          googleReviewRating: reviewData?.rating ?? null,
          backlinkSummary: backlinkSummary,
          topBacklinks: topBacklinks,
        });
      } catch (e) {
        console.error(`[Pipeline] Competitor analysis failed for ${comp.domain}:`, e);
        competitorsToInsert.push({
          auditId: audit.id,
          domain: comp.domain,
          businessName: comp.name ?? null,
        });
      }
    }

    if (competitorsToInsert.length > 0) {
      await storage.createAuditCompetitors(competitorsToInsert);
    }
  }

  private async stageGeoVisibility(audit: SeoAudit): Promise<void> {
    const keywords = await storage.getAuditKeywordsByAuditId(audit.id);
    const services = (audit.services as string[]) || [];
    const cities = (audit.serviceAreaCities as string[]) || [];
    const domain = new URL(audit.businessUrl).hostname.replace(/^www\./, '');

    const highIntentKeywords = keywords
      .filter(k => k.intent === 'transactional' || k.intent === 'commercial' || k.priority === 'high')
      .slice(0, 20);

    const keywordsToCheck = highIntentKeywords.length > 0
      ? highIntentKeywords.map(k => k.keyword)
      : services.slice(0, 10).flatMap(svc =>
          cities.length > 0
            ? [`best ${svc} in ${cities[0]}`, `${svc} near me`]
            : [`best ${svc}`, `top ${svc} companies`]
        ).slice(0, 20);

    if (keywordsToCheck.length === 0) return;

    let totalChecked = 0;
    let foundInChatGpt = 0;
    let foundInGemini = 0;
    let citedInChatGpt = 0;
    let citedInGemini = 0;

    const location = cities[0] || undefined;

    const batchSize = 3;
    for (let i = 0; i < keywordsToCheck.length; i += batchSize) {
      const batch = keywordsToCheck.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(kw => runPromptCheck(kw, audit.businessName, domain, location))
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          totalChecked++;
          if (result.value.chatgpt.found) foundInChatGpt++;
          if (result.value.googleAI.found) foundInGemini++;
          if (result.value.chatgpt.cited) citedInChatGpt++;
          if (result.value.googleAI.cited) citedInGemini++;
        }
      }
    }

    if (totalChecked > 0) {
      const chatGptVisibility = Math.round((foundInChatGpt / totalChecked) * 100);
      const geminiVisibility = Math.round((foundInGemini / totalChecked) * 100);
      const overallVisibility = Math.round(((foundInChatGpt + foundInGemini) / (totalChecked * 2)) * 100);

      await storage.updateSeoAudit(audit.id, {
        aiVisibilityScore: overallVisibility,
        geoVisibilityData: {
          totalChecked,
          chatGptVisibility,
          geminiVisibility,
          overallVisibility,
          foundInChatGpt,
          foundInGemini,
          citedInChatGpt,
          citedInGemini,
        },
      });
    }
  }

  private async stageReviewHealth(audit: SeoAudit): Promise<void> {
    const reviewsToInsert: InsertAuditReview[] = [];

    try {
      const clientReviews = await getBusinessReviews(
        audit.businessName,
        audit.businessAddress ?? undefined
      );

      if (clientReviews) {
        let sentimentSummary: Record<string, unknown> | null = null;
        if (clientReviews.reviews && clientReviews.reviews.length > 0) {
          try {
            const sentiment = await analyzeReviews(
              clientReviews.reviews.map(r => ({
                text: r.text,
                rating: r.rating,
              })),
              audit.businessName
            );
            sentimentSummary = sentiment as unknown as Record<string, unknown>;
          } catch (e) {
            console.error('[Pipeline] Review sentiment analysis failed:', e);
          }
        }

        reviewsToInsert.push({
          auditId: audit.id,
          entityType: 'client',
          entityName: audit.businessName,
          platform: 'google',
          reviewCount: clientReviews.reviewCount,
          averageRating: clientReviews.rating,
          sentimentSummary,
        });
      }
    } catch (e) {
      console.error('[Pipeline] Client review health failed:', e);
    }

    const dbCompetitors = await storage.getAuditCompetitorsByAuditId(audit.id);
    for (const comp of dbCompetitors) {
      if (!comp.businessName) continue;
      if (comp.googleReviewCount !== null || comp.googleReviewRating !== null) {
        reviewsToInsert.push({
          auditId: audit.id,
          entityType: 'competitor',
          entityName: comp.businessName,
          platform: 'google',
          reviewCount: comp.googleReviewCount,
          averageRating: comp.googleReviewRating,
        });
      }
    }

    if (reviewsToInsert.length > 0) {
      await storage.createAuditReviews(reviewsToInsert);
    }
  }

  private async stageGapAnalysis(audit: SeoAudit): Promise<void> {
    const keywords = await storage.getAuditKeywordsByAuditId(audit.id);
    const services = (audit.services as string[]) || [];
    const cities = (audit.serviceAreaCities as string[]) || [];

    const gapsToInsert: InsertAuditContentGap[] = [];

    const keywordsByService = new Map<string, typeof keywords>();
    for (const kw of keywords) {
      const svc = kw.targetService || 'general';
      if (!keywordsByService.has(svc)) keywordsByService.set(svc, []);
      keywordsByService.get(svc)!.push(kw);
    }

    for (const service of services) {
      const serviceKeywords = keywordsByService.get(service) || [];
      const hasServicePage = serviceKeywords.some(k => k.existingPageUrl && k.pageType === 'service_page');
      if (!hasServicePage) {
        gapsToInsert.push({
          auditId: audit.id,
          gapType: 'service_page',
          targetService: service,
          targetKeyword: service,
          searchVolume: serviceKeywords.reduce((s, k) => s + (k.searchVolume || 0), 0) || null,
          priority: 'high',
          estimatedHours: 4,
          status: 'missing',
        });
      }
    }

    for (const city of cities) {
      for (const service of services.slice(0, 5)) {
        const hasCityPage = keywords.some(k =>
          k.targetCity === city &&
          k.targetService === service &&
          k.existingPageUrl &&
          k.pageType === 'city_page'
        );
        if (!hasCityPage) {
          gapsToInsert.push({
            auditId: audit.id,
            gapType: 'city_page',
            targetService: service,
            targetCity: city,
            targetKeyword: `${service} ${city}`,
            priority: 'medium',
            estimatedHours: 3,
            status: 'missing',
          });
        }
      }
    }

    if (gapsToInsert.length > 0) {
      await storage.createAuditContentGaps(gapsToInsert);
      await storage.updateSeoAudit(audit.id, { totalContentGaps: gapsToInsert.length });
    }
  }

  private async stageContentScoring(audit: SeoAudit): Promise<void> {
    const keywords = await storage.getAuditKeywordsByAuditId(audit.id);
    const keywordsWithPages = keywords.filter(k => k.existingPageUrl);

    const pageMap = new Map<string, Array<typeof keywords[number]>>();
    for (const kw of keywordsWithPages) {
      const url = kw.existingPageUrl!;
      if (!pageMap.has(url)) pageMap.set(url, []);
      pageMap.get(url)!.push(kw);
    }

    const entries = Array.from(pageMap.entries());
    for (const [url, pageKeywords] of entries) {
      const crawlPage = this.crawlPages.find(p => p.url === url);
      if (!crawlPage) continue;

      const primaryKeyword = pageKeywords[0];
      if (!primaryKeyword) continue;

      try {
        await scorePage(
          url,
          crawlPage.meta?.title || '',
          primaryKeyword.keyword,
          primaryKeyword.intent || 'informational'
        );
      } catch (e) {
        console.error(`[Pipeline] Content scoring failed for ${url}:`, e);
      }
    }
  }

  private async stageScopingEngine(audit: SeoAudit): Promise<void> {
    const contentGaps = await storage.getAuditContentGapsByAuditId(audit.id);
    const technicalFindings = await storage.getAuditTechnicalFindingsByAuditId(audit.id);
    const keywords = await storage.getAuditKeywordsByAuditId(audit.id);

    const deliverables: InsertAuditDeliverable[] = [];
    let sortOrder = 0;

    const failedTechnical = technicalFindings.filter(f => f.status === 'fail');
    if (failedTechnical.length > 0) {
      deliverables.push({
        auditId: audit.id,
        phase: 1,
        category: 'Technical SEO',
        title: `Fix ${failedTechnical.length} Technical Issues`,
        description: `Address ${failedTechnical.length} technical SEO issues affecting site health grade.`,
        estimatedHours: Math.max(4, failedTechnical.length * 0.5),
        priority: 'high',
        sortOrder: sortOrder++,
      });
    }

    const missingServicePages = contentGaps.filter(g => g.gapType === 'service_page');
    if (missingServicePages.length > 0) {
      deliverables.push({
        auditId: audit.id,
        phase: 1,
        category: 'Content',
        title: `Create ${missingServicePages.length} Service Pages`,
        description: `Build dedicated service pages to capture high-intent traffic.`,
        estimatedHours: missingServicePages.length * 4,
        priority: 'high',
        sortOrder: sortOrder++,
      });
    }

    const missingCityPages = contentGaps.filter(g => g.gapType === 'city_page');
    if (missingCityPages.length > 0) {
      const batch1 = missingCityPages.filter(g => g.priority === 'high' || g.priority === 'medium');
      deliverables.push({
        auditId: audit.id,
        phase: 2,
        category: 'Local SEO',
        title: `Create ${batch1.length} City/Location Pages`,
        description: `Build city-specific landing pages for local search visibility.`,
        estimatedHours: batch1.length * 3,
        priority: 'medium',
        sortOrder: sortOrder++,
      });
    }

    const lowRankKeywords = keywords.filter(k =>
      k.currentOrganicRank && k.currentOrganicRank > 10 && k.currentOrganicRank <= 30
    );
    if (lowRankKeywords.length > 0) {
      deliverables.push({
        auditId: audit.id,
        phase: 2,
        category: 'Content Optimization',
        title: `Optimize ${lowRankKeywords.length} Underperforming Pages`,
        description: `Improve pages ranking 11-30 to push them into page 1.`,
        estimatedHours: lowRankKeywords.length * 2,
        priority: 'medium',
        sortOrder: sortOrder++,
      });
    }

    deliverables.push({
      auditId: audit.id,
      phase: 3,
      category: 'Link Building',
      title: 'Monthly Link Building Campaign',
      description: 'Ongoing backlink acquisition targeting high-authority domains.',
      estimatedHours: 10,
      priority: 'medium',
      sortOrder: sortOrder++,
    });

    deliverables.push({
      auditId: audit.id,
      phase: 3,
      category: 'Review Management',
      title: 'Review Generation & Response System',
      description: 'Implement review solicitation and monitoring workflow.',
      estimatedHours: 4,
      priority: 'low',
      sortOrder: sortOrder++,
    });

    if (deliverables.length > 0) {
      await storage.createAuditDeliverables(deliverables);
    }

    const totalHours = deliverables.reduce((s, d) => s + d.estimatedHours, 0);
    const monthlyInvestment = totalHours * 150;

    await storage.updateSeoAudit(audit.id, {
      totalDeliverables: deliverables.length,
      estimatedTotalHours: totalHours,
      estimatedMonthlyInvestment: monthlyInvestment,
    });
  }

  private async stageReportGeneration(audit: SeoAudit): Promise<void> {
    const freshAudit = await storage.getSeoAuditById(audit.id);
    if (!freshAudit) return;

    const keywordGaps = await storage.getAuditKeywordsByAuditId(audit.id);
    const totalKeywordGaps = keywordGaps.filter(k => !k.existingPageUrl).length;

    await storage.updateSeoAudit(audit.id, { totalKeywordGaps });

    const topFindings: string[] = [];
    if (freshAudit.siteHealthGrade) topFindings.push(`Site health grade: ${freshAudit.siteHealthGrade}`);
    if (freshAudit.shareOfLocalVoice !== null) topFindings.push(`Share of local voice: ${freshAudit.shareOfLocalVoice}%`);
    if (freshAudit.totalContentGaps) topFindings.push(`${freshAudit.totalContentGaps} content gaps identified`);
    if (totalKeywordGaps > 0) topFindings.push(`${totalKeywordGaps} keyword opportunities found`);

    try {
      const narrative = await generateActionPlanNarrative({
        businessName: freshAudit.businessName,
        businessUrl: freshAudit.businessUrl,
        siteHealthGrade: freshAudit.siteHealthGrade ?? undefined,
        shareOfLocalVoice: freshAudit.shareOfLocalVoice ?? undefined,
        averageGridRank: freshAudit.averageGridRank ?? undefined,
        totalKeywordGaps,
        totalContentGaps: freshAudit.totalContentGaps ?? undefined,
        totalDeliverables: freshAudit.totalDeliverables ?? undefined,
        estimatedTotalHours: freshAudit.estimatedTotalHours ?? undefined,
        estimatedMonthlyInvestment: freshAudit.estimatedMonthlyInvestment ?? undefined,
        topFindings,
      });

      await storage.updateSeoAudit(audit.id, { executiveNarrative: narrative });
    } catch (e) {
      console.error('[Pipeline] Narrative generation failed:', e);
    }

    const token = randomBytes(24).toString('hex');
    await storage.updateSeoAudit(audit.id, { magicLinkToken: token });
  }

  private buildSeedKeywords(services: string[], cities: string[], industry: string | null): string[] {
    const keywords: string[] = [];
    for (const service of services.slice(0, 10)) {
      keywords.push(service);
      if (cities.length > 0) {
        keywords.push(`${service} ${cities[0]}`);
        keywords.push(`${service} near me`);
      }
    }
    if (industry) {
      keywords.push(industry);
      if (cities.length > 0) keywords.push(`${industry} ${cities[0]}`);
    }
    return keywords;
  }
}

const pipelineEmitter = new EventEmitter();
pipelineEmitter.setMaxListeners(200);

export function getPipelineEmitter(): EventEmitter {
  return pipelineEmitter;
}

export function enqueuePipelineRun(auditId: number): void {
  auditQueue.enqueue(auditId, async (id) => {
    const pipeline = new SEOAuditPipeline();

    pipeline.on('event', (event: PipelineEvent) => {
      pipelineEmitter.emit(`audit:${id}`, event);
    });

    try {
      await pipeline.run(id);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Pipeline] Pipeline failed for audit ${id}:`, errorMsg);

      await storage.updateSeoAudit(id, { status: 'failed', currentStage: null });

      pipelineEmitter.emit(`audit:${id}`, {
        type: 'pipeline_error',
        auditId: id,
        error: errorMsg,
        timestamp: Date.now(),
      } satisfies PipelineEvent);
    } finally {
      pipeline.removeAllListeners();
    }
  });
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
