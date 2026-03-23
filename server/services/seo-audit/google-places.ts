import { pooledFetch, placesLimiter } from './http-client';

const PLACES_API_KEY = () => process.env.GOOGLE_PLACES_API_KEY || '';

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number | null;
  types: string[];
}

export interface PlaceReview {
  author: string;
  rating: number;
  text: string;
  time: number;
  relativeTimeDescription: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number | null;
  reviews: PlaceReview[];
  website: string | null;
  phone: string | null;
  types: string[];
}

export async function searchPlace(query: string): Promise<PlaceResult | null> {
  const apiKey = PLACES_API_KEY();
  if (!apiKey) {
    console.warn('[GooglePlaces] API key not configured, skipping place search');
    return null;
  }

  try {
    const params = new URLSearchParams({
      input: query,
      inputtype: 'textquery',
      fields: 'place_id,name,formatted_address,rating,user_ratings_total,types',
      key: apiKey,
    });

    await placesLimiter.acquire();
    const response = await pooledFetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params.toString()}`,
      { timeoutMs: 15000 }
    );

    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];

    if (!candidate) return null;

    return {
      placeId: candidate.place_id,
      name: candidate.name,
      address: candidate.formatted_address || '',
      rating: candidate.rating || null,
      reviewCount: candidate.user_ratings_total || null,
      types: candidate.types || [],
    };
  } catch (error) {
    console.error('[GooglePlaces] Search failed:', error);
    return null;
  }
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const apiKey = PLACES_API_KEY();
  if (!apiKey) {
    console.warn('[GooglePlaces] API key not configured, skipping place details');
    return null;
  }

  try {
    const params = new URLSearchParams({
      place_id: placeId,
      fields: 'place_id,name,formatted_address,rating,user_ratings_total,reviews,website,formatted_phone_number,types',
      key: apiKey,
    });

    await placesLimiter.acquire();
    const response = await pooledFetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`,
      { timeoutMs: 15000 }
    );

    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.result;

    if (!result) return null;

    return {
      placeId: result.place_id,
      name: result.name,
      address: result.formatted_address || '',
      rating: result.rating || null,
      reviewCount: result.user_ratings_total || null,
      reviews: (result.reviews || []).map((r: any) => ({
        author: r.author_name || '',
        rating: r.rating || 0,
        text: r.text || '',
        time: r.time || 0,
        relativeTimeDescription: r.relative_time_description || '',
      })),
      website: result.website || null,
      phone: result.formatted_phone_number || null,
      types: result.types || [],
    };
  } catch (error) {
    console.error('[GooglePlaces] Details fetch failed:', error);
    return null;
  }
}

export async function getBusinessReviews(businessName: string, address?: string): Promise<PlaceDetails | null> {
  const query = address ? `${businessName} ${address}` : businessName;
  const place = await searchPlace(query);
  if (!place) return null;
  return getPlaceDetails(place.placeId);
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = PLACES_API_KEY();
  if (!apiKey) {
    console.warn('[GooglePlaces] API key not configured, cannot geocode');
    return null;
  }

  try {
    const params = new URLSearchParams({
      address,
      key: apiKey,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error(`Geocoding API error: ${response.status}`);
    }

    const data = await response.json();
    const location = data.results?.[0]?.geometry?.location;

    if (!location) return null;

    return {
      lat: location.lat,
      lng: location.lng,
    };
  } catch (error) {
    console.error('[GooglePlaces] Geocoding failed:', error);
    return null;
  }
}