/**
 * Citation Extractor Module
 * 
 * Extracts cited URLs from AI platform responses:
 * - OpenAI Responses API (web_search tool): Parses url_citation annotations
 * - Gemini (Google Search grounding): Parses grounding metadata
 */

export interface ExtractedCitation {
  url: string;
  title?: string;
  domain: string;
}

/**
 * Extract domain from a URL
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    // If URL parsing fails, try to extract domain from the string
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/i);
    return match?.[1]?.replace(/^www\./, '') || url;
  }
}

/**
 * Deduplicate citations by URL
 */
function deduplicateCitations(citations: ExtractedCitation[]): ExtractedCitation[] {
  const seen = new Set<string>();
  const unique: ExtractedCitation[] = [];
  
  for (const citation of citations) {
    const normalizedUrl = citation.url.toLowerCase().replace(/\/$/, '');
    if (!seen.has(normalizedUrl)) {
      seen.add(normalizedUrl);
      unique.push(citation);
    }
  }
  
  return unique;
}

/**
 * Extract citations from OpenAI Responses API response
 * 
 * The Responses API with web_search tool returns annotations with type "url_citation"
 * in the output array's content items.
 * 
 * Structure:
 * response.output = [
 *   {
 *     type: "message",
 *     content: [
 *       {
 *         type: "output_text",
 *         text: "...",
 *         annotations: [
 *           { type: "url_citation", url: "https://...", title: "...", start_index: N, end_index: M }
 *         ]
 *       }
 *     ]
 *   }
 * ]
 */
export function extractOpenAICitations(response: any): ExtractedCitation[] {
  const citations: ExtractedCitation[] = [];
  
  if (!response) return citations;
  
  try {
    // Navigate through the response structure
    const output = response.output;
    if (!Array.isArray(output)) return citations;
    
    for (const item of output) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const contentItem of item.content) {
          if (contentItem.type === 'output_text' && Array.isArray(contentItem.annotations)) {
            for (const annotation of contentItem.annotations) {
              if (annotation.type === 'url_citation' && annotation.url) {
                citations.push({
                  url: annotation.url,
                  title: annotation.title || undefined,
                  domain: extractDomain(annotation.url),
                });
              }
            }
          }
        }
      }
      
      // Also check for web_search_call results which may contain sources
      if (item.type === 'web_search_call' && item.results) {
        for (const result of item.results) {
          if (result.url) {
            citations.push({
              url: result.url,
              title: result.title || undefined,
              domain: extractDomain(result.url),
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('[citation-extractor] Error parsing OpenAI response:', error);
  }
  
  return deduplicateCitations(citations);
}

/**
 * Extract citations from Gemini response with Google Search grounding
 * 
 * Gemini returns grounding metadata in the response when using googleSearch tool.
 * 
 * Structure varies, but commonly includes:
 * response.candidates[0].groundingMetadata.groundingChunks = [
 *   { web: { uri: "https://...", title: "..." } }
 * ]
 * 
 * Or via searchEntryPoint / groundingSupports
 */
export function extractGeminiCitations(response: any): ExtractedCitation[] {
  const citations: ExtractedCitation[] = [];
  
  if (!response) return citations;
  
  try {
    // Try multiple paths where Gemini stores grounding data
    
    // Path 1: groundingMetadata in candidates
    const candidates = response.candidates;
    if (Array.isArray(candidates)) {
      for (const candidate of candidates) {
        const groundingMetadata = candidate.groundingMetadata;
        if (!groundingMetadata) continue;
        
        // Check groundingChunks
        if (Array.isArray(groundingMetadata.groundingChunks)) {
          for (const chunk of groundingMetadata.groundingChunks) {
            if (chunk.web?.uri) {
              citations.push({
                url: chunk.web.uri,
                title: chunk.web.title || undefined,
                domain: extractDomain(chunk.web.uri),
              });
            }
          }
        }
        
        // Check groundingSupports
        if (Array.isArray(groundingMetadata.groundingSupports)) {
          for (const support of groundingMetadata.groundingSupports) {
            if (Array.isArray(support.groundingChunkIndices)) {
              // These reference chunks already processed above
              continue;
            }
            if (support.segment?.text && support.web?.uri) {
              citations.push({
                url: support.web.uri,
                title: support.web.title || undefined,
                domain: extractDomain(support.web.uri),
              });
            }
          }
        }
        
        // Check webSearchQueries for context
        if (Array.isArray(groundingMetadata.webSearchQueries)) {
          // These are the queries used, not citations, so skip
        }
      }
    }
    
    // Path 2: Direct response structure (some SDK versions)
    if (response.groundingMetadata) {
      const gm = response.groundingMetadata;
      if (Array.isArray(gm.groundingChunks)) {
        for (const chunk of gm.groundingChunks) {
          if (chunk.web?.uri) {
            citations.push({
              url: chunk.web.uri,
              title: chunk.web.title || undefined,
              domain: extractDomain(chunk.web.uri),
            });
          }
        }
      }
    }
    
    // Path 3: Check for searchEntryPoint (Google Search entry)
    if (response.searchEntryPoint?.renderedContent) {
      // This is the rendered search widget, not direct citations
    }
    
  } catch (error) {
    console.error('[citation-extractor] Error parsing Gemini response:', error);
  }
  
  return deduplicateCitations(citations);
}

/**
 * Extract URLs directly from response text as fallback
 * 
 * Uses regex to find URLs in the text when structured citation data isn't available
 */
export function extractUrlsFromText(text: string): ExtractedCitation[] {
  const citations: ExtractedCitation[] = [];
  
  if (!text) return citations;
  
  // Match URLs in various formats
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const matches = text.match(urlRegex) || [];
  
  for (const url of matches) {
    // Clean up trailing punctuation
    const cleanUrl = url.replace(/[.,;:!?)]+$/, '');
    citations.push({
      url: cleanUrl,
      domain: extractDomain(cleanUrl),
    });
  }
  
  return deduplicateCitations(citations);
}

/**
 * Combine structured citations with text-extracted URLs
 * Structured citations take priority (they have titles)
 */
export function mergeCitations(
  structured: ExtractedCitation[],
  textBased: ExtractedCitation[]
): ExtractedCitation[] {
  const structuredUrls = new Set(structured.map(c => c.url.toLowerCase().replace(/\/$/, '')));
  
  const merged = [...structured];
  
  for (const citation of textBased) {
    const normalizedUrl = citation.url.toLowerCase().replace(/\/$/, '');
    if (!structuredUrls.has(normalizedUrl)) {
      merged.push(citation);
    }
  }
  
  return merged;
}
