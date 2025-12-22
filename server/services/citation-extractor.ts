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
 * Normalize citations to array format (handles JSON strings, arrays, and legacy formats)
 */
function normalizeCitations(citations: unknown): ExtractedCitation[] {
  if (!citations) return [];
  
  let citationArray: any[];
  
  if (typeof citations === 'string') {
    try { citationArray = JSON.parse(citations); } catch { return []; }
  } else if (Array.isArray(citations)) {
    citationArray = citations;
  } else {
    return [];
  }
  
  if (!Array.isArray(citationArray)) return [];
  
  const results: ExtractedCitation[] = [];
  
  for (const c of citationArray) {
    if (!c) continue;
    
    // Handle legacy string entries (plain URL strings)
    if (typeof c === 'string') {
      if (c.startsWith('http://') || c.startsWith('https://')) {
        results.push({
          url: c,
          domain: extractDomain(c),
        });
      } else if (c.includes('.')) {
        // Likely a domain
        results.push({
          url: `https://${c}`,
          domain: c.replace(/^www\./, ''),
        });
      }
      continue;
    }
    
    // Handle object entries
    if (typeof c === 'object' && (c.url || c.domain)) {
      results.push({
        url: c.url || c.domain || '',
        title: c.title || undefined,
        domain: c.domain || (c.url ? extractDomain(c.url) : ''),
      });
    }
  }
  
  return results;
}

/**
 * Deduplicate citations by URL
 */
function deduplicateCitations(citations: ExtractedCitation[]): ExtractedCitation[] {
  const seen = new Set<string>();
  const unique: ExtractedCitation[] = [];
  
  for (const citation of citations) {
    if (!citation.url) continue;
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
    // Helper to extract annotations from content items
    const extractFromAnnotations = (annotations: any[]) => {
      for (const annotation of annotations) {
        if (annotation.type === 'url_citation' && annotation.url) {
          citations.push({
            url: annotation.url,
            title: annotation.title || undefined,
            domain: extractDomain(annotation.url),
          });
        }
      }
    };
    
    // Path 1: Navigate through response.output array
    const output = response.output;
    if (Array.isArray(output)) {
      for (const item of output) {
        if (item.type === 'message' && Array.isArray(item.content)) {
          for (const contentItem of item.content) {
            if (contentItem.type === 'output_text' && Array.isArray(contentItem.annotations)) {
              extractFromAnnotations(contentItem.annotations);
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
    }
    
    // Path 2: Check run_steps for tool call outputs
    if (Array.isArray(response.run_steps)) {
      for (const step of response.run_steps) {
        const toolCalls = step?.step_details?.tool_calls;
        if (Array.isArray(toolCalls)) {
          for (const toolCall of toolCalls) {
            // Check tool call outputs for annotations (nested in content)
            if (toolCall.outputs && Array.isArray(toolCall.outputs)) {
              for (const output of toolCall.outputs) {
                // Direct annotations on output
                if (output.annotations && Array.isArray(output.annotations)) {
                  extractFromAnnotations(output.annotations);
                }
                // Nested annotations in output.content[].annotations
                if (output.content && Array.isArray(output.content)) {
                  for (const contentItem of output.content) {
                    if (contentItem.annotations && Array.isArray(contentItem.annotations)) {
                      extractFromAnnotations(contentItem.annotations);
                    }
                  }
                }
              }
            }
            // Check web search results in tool call
            if (toolCall.type === 'web_search' && toolCall.results) {
              for (const result of toolCall.results) {
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
        }
      }
    }
    
    // Path 3: Direct response structure (legacy or alternative formats)
    if (response.choices && Array.isArray(response.choices)) {
      for (const choice of response.choices) {
        if (choice.message?.annotations && Array.isArray(choice.message.annotations)) {
          extractFromAnnotations(choice.message.annotations);
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
    // Helper to extract from groundingMetadata object
    const extractFromGroundingMetadata = (gm: any) => {
      if (!gm) return;
      
      // Check groundingChunks (primary source of citations)
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
      
      // Check groundingSupports for webSearchResult or direct web data
      if (Array.isArray(gm.groundingSupports)) {
        for (const support of gm.groundingSupports) {
          // Check support.support.webSearchResult (nested structure)
          if (support.support?.webSearchResult?.uri) {
            citations.push({
              url: support.support.webSearchResult.uri,
              title: support.support.webSearchResult.title || undefined,
              domain: extractDomain(support.support.webSearchResult.uri),
            });
          }
          // Check direct web property
          if (support.web?.uri) {
            citations.push({
              url: support.web.uri,
              title: support.web.title || undefined,
              domain: extractDomain(support.web.uri),
            });
          }
        }
      }
      
      // Check retrievalMetadata for sources
      if (gm.retrievalMetadata?.sources) {
        for (const source of gm.retrievalMetadata.sources) {
          if (source.uri) {
            citations.push({
              url: source.uri,
              title: source.title || undefined,
              domain: extractDomain(source.uri),
            });
          }
        }
      }
    };
    
    // Helper to extract citationMetadata from content parts
    const extractFromCitationMetadata = (parts: any[]) => {
      for (const part of parts) {
        if (part.citationMetadata?.citations) {
          for (const citation of part.citationMetadata.citations) {
            if (citation.uri) {
              citations.push({
                url: citation.uri,
                title: citation.title || undefined,
                domain: extractDomain(citation.uri),
              });
            }
          }
        }
      }
    };
    
    // Path 1: groundingMetadata in candidates
    const candidates = response.candidates;
    if (Array.isArray(candidates)) {
      for (const candidate of candidates) {
        // Extract from groundingMetadata
        extractFromGroundingMetadata(candidate.groundingMetadata);
        
        // Extract from content.parts[].citationMetadata
        if (candidate.content?.parts && Array.isArray(candidate.content.parts)) {
          extractFromCitationMetadata(candidate.content.parts);
        }
      }
    }
    
    // Path 2: Direct response structure (some SDK versions)
    extractFromGroundingMetadata(response.groundingMetadata);
    
    // Path 3: content[].parts[].citationMetadata at top level
    if (response.content?.parts && Array.isArray(response.content.parts)) {
      extractFromCitationMetadata(response.content.parts);
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
 * Handles mixed types (arrays and JSON strings)
 */
export function mergeCitations(
  structured: ExtractedCitation[] | unknown,
  textBased: ExtractedCitation[] | unknown
): ExtractedCitation[] {
  // Always normalize inputs to handle legacy string arrays
  const structuredArr = normalizeCitations(structured);
  const textBasedArr = normalizeCitations(textBased);
  
  const structuredUrls = new Set(
    structuredArr.filter(c => c.url).map(c => c.url.toLowerCase().replace(/\/$/, ''))
  );
  
  const merged = [...structuredArr];
  
  for (const citation of textBasedArr) {
    if (!citation.url) continue;
    const normalizedUrl = citation.url.toLowerCase().replace(/\/$/, '');
    if (!structuredUrls.has(normalizedUrl)) {
      merged.push(citation);
    }
  }
  
  return deduplicateCitations(merged);
}

/**
 * Normalize and parse citations from unknown format
 * Exported for use by downstream consumers
 */
export { normalizeCitations };
