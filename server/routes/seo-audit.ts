import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { requireAdminAuth, isAdminRequest } from '../middleware/auth';
import { enqueuePipelineRun, getPipelineEmitter, type PipelineEvent } from '../services/seo-audit/pipeline';
import { auditQueue } from '../services/seo-audit/queue';

const router = Router();

async function requireAdminOrMagicLink(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (await isAdminRequest(req)) {
    next();
    return;
  }

  const token = req.query.token as string | undefined
    || req.headers['x-audit-token'] as string | undefined;

  if (!token) {
    res.status(401).json({ error: 'Authorization required. Provide admin auth or a valid audit token.' });
    return;
  }

  const audit = await storage.getSeoAuditByMagicLink(token);
  if (!audit) {
    res.status(401).json({ error: 'Invalid or expired audit token' });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (!isNaN(id) && audit.id !== id) {
    res.status(403).json({ error: 'Token does not match requested audit' });
    return;
  }

  next();
}

const createAuditSchema = z.object({
  businessName: z.string().min(1),
  businessUrl: z.string().url(),
  businessAddress: z.string().optional(),
  businessType: z.enum(['local', 'national']).default('local'),
  industry: z.string().optional(),
  serviceAreaCities: z.array(z.string()).default([]),
  services: z.array(z.string()).default([]),
  geoGridKeywords: z.array(z.string()).default([]),
  geoGridSize: z.number().int().min(3).max(25).default(13),
  geoGridSpacingMiles: z.number().min(0.1).max(10).default(1.0),
  competitors: z.array(z.object({
    name: z.string().optional(),
    domain: z.string().optional(),
  })).default([]),
});

const configureAuditSchema = createAuditSchema.partial().extend({
  businessLat: z.number().optional(),
  businessLng: z.number().optional(),
});

const VALID_SECTIONS = [
  'snapshot', 'geogrid', 'geo_visibility', 'rankings',
  'revenue', 'technical', 'content_gaps', 'backlinks',
  'reviews', 'action_plan',
] as const;

type SectionName = typeof VALID_SECTIONS[number];

router.post('/', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const body = createAuditSchema.parse(req.body);
    const audit = await storage.createSeoAudit({
      ...body,
      status: 'draft',
    });
    res.status(201).json(audit);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    console.error('[SeoAudit] Create error:', error);
    res.status(500).json({ error: 'Failed to create audit' });
  }
});

router.get('/', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
    const offset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : undefined;
    const audits = await storage.getSeoAudits({ status, limit, offset });
    res.json(audits);
  } catch (error) {
    console.error('[SeoAudit] List error:', error);
    res.status(500).json({ error: 'Failed to list audits' });
  }
});

router.get('/view/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const audit = await storage.getSeoAuditByMagicLink(token);
    if (!audit) {
      res.status(404).json({ error: 'Invalid or expired link' });
      return;
    }
    res.json(audit);
  } catch (error) {
    console.error('[SeoAudit] View error:', error);
    res.status(500).json({ error: 'Failed to load audit' });
  }
});

router.get('/queue/status', requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const status = auditQueue.getStatus();
    const runningJobs = auditQueue.getRunningJobs();
    const queuedJobs = auditQueue.getQueuedJobs();
    res.json({
      ...status,
      runningJobs: runningJobs.map(j => ({ id: j.id, auditId: j.auditId, createdAt: j.createdAt })),
      queuedJobs: queuedJobs.map(j => ({ id: j.id, auditId: j.auditId, createdAt: j.createdAt })),
    });
  } catch (error) {
    console.error('[SeoAudit] Queue status error:', error);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

router.get('/:id', requireAdminOrMagicLink, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid audit ID' });
      return;
    }
    const audit = await storage.getSeoAuditById(id);
    if (!audit) {
      res.status(404).json({ error: 'Audit not found' });
      return;
    }
    res.json(audit);
  } catch (error) {
    console.error('[SeoAudit] Get error:', error);
    res.status(500).json({ error: 'Failed to get audit' });
  }
});

router.delete('/:id', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid audit ID' });
      return;
    }
    const audit = await storage.getSeoAuditById(id);
    if (!audit) {
      res.status(404).json({ error: 'Audit not found' });
      return;
    }
    if (audit.status === 'running') {
      res.status(409).json({ error: 'Cannot delete a running audit' });
      return;
    }
    await storage.deleteSeoAudit(id);
    res.json({ message: 'Audit deleted', id });
  } catch (error) {
    console.error('[SeoAudit] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete audit' });
  }
});

router.post('/:id/configure', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid audit ID' });
      return;
    }
    const existing = await storage.getSeoAuditById(id);
    if (!existing) {
      res.status(404).json({ error: 'Audit not found' });
      return;
    }
    if (existing.status === 'running') {
      res.status(409).json({ error: 'Cannot configure a running audit' });
      return;
    }

    const body = configureAuditSchema.parse(req.body);
    const updated = await storage.updateSeoAudit(id, body);
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    console.error('[SeoAudit] Configure error:', error);
    res.status(500).json({ error: 'Failed to configure audit' });
  }
});

router.post('/:id/run', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid audit ID' });
      return;
    }
    const audit = await storage.getSeoAuditById(id);
    if (!audit) {
      res.status(404).json({ error: 'Audit not found' });
      return;
    }
    if (audit.status === 'running') {
      res.status(409).json({ error: 'Audit is already running' });
      return;
    }

    enqueuePipelineRun(id);
    await storage.updateSeoAudit(id, { status: 'queued' });

    const queueStatus = auditQueue.getStatus();
    res.json({
      message: 'Audit pipeline enqueued',
      auditId: id,
      status: 'queued',
      queuePosition: queueStatus.queued,
      queueStatus,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('already in the queue') || errMsg.includes('Queue is full')) {
      res.status(409).json({ error: errMsg });
      return;
    }
    console.error('[SeoAudit] Run error:', error);
    res.status(500).json({ error: 'Failed to start audit pipeline' });
  }
});

router.get('/:id/status', requireAdminOrMagicLink, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid audit ID' });
    return;
  }

  const audit = await storage.getSeoAuditById(id);
  if (!audit) {
    res.status(404).json({ error: 'Audit not found' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  if (req.socket) {
    req.socket.setNoDelay(true);
  }

  let isConnected = true;

  const sendEvent = (data: unknown) => {
    if (!isConnected) return;
    try {
      const payload = `data: ${JSON.stringify(data)}\n\n`;
      res.write(payload);
      if (typeof (res as unknown as Record<string, unknown>).flush === 'function') {
        (res as unknown as { flush: () => void }).flush();
      }
    } catch {
      isConnected = false;
    }
  };

  sendEvent({ type: 'connected', auditId: id, currentStatus: audit.status, currentStage: audit.currentStage });

  const emitter = getPipelineEmitter();
  const eventName = `audit:${id}`;

  const onEvent = (event: PipelineEvent) => {
    sendEvent(event);
    if (event.type === 'pipeline_complete' || event.type === 'pipeline_error') {
      cleanup();
    }
  };

  emitter.on(eventName, onEvent);

  const heartbeat = setInterval(() => {
    sendEvent({ type: 'heartbeat', timestamp: Date.now() });
  }, 15000);

  const cleanup = () => {
    isConnected = false;
    clearInterval(heartbeat);
    emitter.removeListener(eventName, onEvent);
    try { res.end(); } catch { /* noop */ }
  };

  req.on('close', cleanup);

  if (audit.status === 'completed' || audit.status === 'completed_with_errors') {
    sendEvent({ type: 'pipeline_complete', auditId: id, hadErrors: audit.status === 'completed_with_errors', timestamp: Date.now() });
    cleanup();
  } else if (audit.status === 'failed') {
    sendEvent({ type: 'pipeline_error', auditId: id, error: 'Pipeline previously failed', timestamp: Date.now() });
    cleanup();
  }
});

router.get('/:id/sections/:section', requireAdminOrMagicLink, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const section = req.params.section as SectionName;

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid audit ID' });
      return;
    }
    if (!VALID_SECTIONS.includes(section)) {
      res.status(400).json({ error: `Invalid section. Valid sections: ${VALID_SECTIONS.join(', ')}` });
      return;
    }

    const audit = await storage.getSeoAuditById(id);
    if (!audit) {
      res.status(404).json({ error: 'Audit not found' });
      return;
    }

    const data = await getSectionData(id, section, audit);
    res.json(data);
  } catch (error) {
    console.error('[SeoAudit] Section error:', error);
    res.status(500).json({ error: 'Failed to get section data' });
  }
});

router.get('/:id/geogrid/:keyword', requireAdminOrMagicLink, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const keyword = decodeURIComponent(req.params.keyword);

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid audit ID' });
      return;
    }

    const grids = await storage.getAuditGeoGridsByAuditId(id);
    const grid = grids.find(g => g.keyword === keyword);
    if (!grid) {
      res.status(404).json({ error: 'Geo grid not found for this keyword' });
      return;
    }

    const points = await storage.getAuditGeoGridPointsByGridId(grid.id);
    res.json({ grid, points });
  } catch (error) {
    console.error('[SeoAudit] Geogrid error:', error);
    res.status(500).json({ error: 'Failed to get geo grid data' });
  }
});

router.post('/:id/share', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid audit ID' });
      return;
    }

    const audit = await storage.getSeoAuditById(id);
    if (!audit) {
      res.status(404).json({ error: 'Audit not found' });
      return;
    }

    let token = audit.magicLinkToken;
    if (!token) {
      const { randomBytes } = await import('crypto');
      token = randomBytes(24).toString('hex');
      await storage.updateSeoAudit(id, { magicLinkToken: token });
    }

    res.json({ token, url: `/api/seo-audit/view/${token}` });
  } catch (error) {
    console.error('[SeoAudit] Share error:', error);
    res.status(500).json({ error: 'Failed to generate share link' });
  }
});

async function getSectionData(
  auditId: number,
  section: SectionName,
  audit: NonNullable<Awaited<ReturnType<typeof storage.getSeoAuditById>>>
): Promise<Record<string, unknown>> {
  switch (section) {
    case 'snapshot': {
      const competitors = await storage.getAuditCompetitorsByAuditId(auditId);
      return {
        businessName: audit.businessName,
        businessUrl: audit.businessUrl,
        siteHealthGrade: audit.siteHealthGrade,
        shareOfLocalVoice: audit.shareOfLocalVoice,
        averageGridRank: audit.averageGridRank,
        marketPositionScore: audit.marketPositionScore,
        totalKeywordGaps: audit.totalKeywordGaps,
        totalContentGaps: audit.totalContentGaps,
        competitorCount: competitors.length,
      };
    }
    case 'geogrid': {
      const grids = await storage.getAuditGeoGridsByAuditId(auditId);
      return {
        grids: grids.map(g => ({
          id: g.id,
          keyword: g.keyword,
          clientSolv: g.clientSolv,
          clientAvgRank: g.clientAvgRank,
          competitorName: g.competitorName,
          competitorSolv: g.competitorSolv,
        })),
        summary: {
          shareOfLocalVoice: audit.shareOfLocalVoice,
          averageGridRank: audit.averageGridRank,
        },
      };
    }
    case 'geo_visibility': {
      const geoData = audit.geoVisibilityData as Record<string, unknown> | null;
      return {
        aiVisibilityScore: audit.aiVisibilityScore,
        totalChecked: geoData?.totalChecked ?? 0,
        chatGptVisibility: geoData?.chatGptVisibility ?? 0,
        geminiVisibility: geoData?.geminiVisibility ?? 0,
        overallVisibility: geoData?.overallVisibility ?? 0,
        foundInChatGpt: geoData?.foundInChatGpt ?? 0,
        foundInGemini: geoData?.foundInGemini ?? 0,
        citedInChatGpt: geoData?.citedInChatGpt ?? 0,
        citedInGemini: geoData?.citedInGemini ?? 0,
      };
    }
    case 'rankings': {
      const keywords = await storage.getAuditKeywordsByAuditId(auditId);
      const ranked = keywords.filter(k => k.currentOrganicRank !== null);
      const page1 = ranked.filter(k => k.currentOrganicRank! <= 10);
      const page2 = ranked.filter(k => k.currentOrganicRank! > 10 && k.currentOrganicRank! <= 20);
      const aiOverview = keywords.filter(k => k.inAiOverview);
      return {
        totalTracked: keywords.length,
        ranked: ranked.length,
        page1Count: page1.length,
        page2Count: page2.length,
        aiOverviewCount: aiOverview.length,
        keywords: keywords.map(k => ({
          keyword: k.keyword,
          searchVolume: k.searchVolume,
          currentOrganicRank: k.currentOrganicRank,
          inAiOverview: k.inAiOverview,
          intent: k.intent,
          pageType: k.pageType,
          targetService: k.targetService,
          targetCity: k.targetCity,
          competitorRanks: k.competitorRanks,
        })),
      };
    }
    case 'revenue': {
      const forecasts = await storage.getAuditPpcForecastsByAuditId(auditId);
      const totalClicks = forecasts.reduce((s, f) => s + (f.estimatedClicks || 0), 0);
      const totalCost = forecasts.reduce((s, f) => s + (f.estimatedCost || 0), 0);
      const totalConversions = forecasts.reduce((s, f) => s + (f.estimatedConversions || 0), 0);
      return {
        forecasts,
        summary: {
          totalClicks: Math.round(totalClicks),
          totalCost: Math.round(totalCost),
          totalConversions: Math.round(totalConversions),
          avgCpc: totalClicks > 0 ? Math.round((totalCost / totalClicks) * 100) / 100 : 0,
        },
      };
    }
    case 'technical': {
      const findings = await storage.getAuditTechnicalFindingsByAuditId(auditId);
      const passCount = findings.filter(f => f.status === 'pass').length;
      const failCount = findings.filter(f => f.status === 'fail').length;
      return {
        grade: audit.siteHealthGrade,
        totalChecks: findings.length,
        passCount,
        failCount,
        passRate: findings.length > 0 ? Math.round((passCount / findings.length) * 100) : 0,
        findings,
      };
    }
    case 'content_gaps': {
      const gaps = await storage.getAuditContentGapsByAuditId(auditId);
      const byType: Record<string, number> = {};
      for (const g of gaps) {
        byType[g.gapType] = (byType[g.gapType] || 0) + 1;
      }
      return {
        totalGaps: gaps.length,
        byType,
        gaps,
      };
    }
    case 'backlinks': {
      const competitors = await storage.getAuditCompetitorsByAuditId(auditId);
      return {
        competitors: competitors.map(c => ({
          domain: c.domain,
          businessName: c.businessName,
          domainRating: c.domainRating,
          referringDomains: c.referringDomains,
          backlinkSummary: c.backlinkSummary,
          topBacklinks: c.topBacklinks,
        })),
      };
    }
    case 'reviews': {
      const reviews = await storage.getAuditReviewsByAuditId(auditId);
      const clientReview = reviews.find(r => r.entityType === 'client');
      const competitorReviews = reviews.filter(r => r.entityType === 'competitor');
      return {
        client: clientReview || null,
        competitors: competitorReviews,
        totalReviews: reviews.length,
      };
    }
    case 'action_plan': {
      const deliverables = await storage.getAuditDeliverablesByAuditId(auditId);
      const phases: Record<number, typeof deliverables> = {};
      for (const d of deliverables) {
        if (!phases[d.phase]) phases[d.phase] = [];
        phases[d.phase].push(d);
      }
      return {
        executiveNarrative: audit.executiveNarrative,
        totalDeliverables: audit.totalDeliverables,
        estimatedTotalHours: audit.estimatedTotalHours,
        estimatedMonthlyInvestment: audit.estimatedMonthlyInvestment,
        phases,
        deliverables,
      };
    }
    default:
      return {};
  }
}

export default router;
