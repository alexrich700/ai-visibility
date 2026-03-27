import { useState, useCallback, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2, Globe, MapPin, ArrowRight, ArrowLeft,
  Plus, Trash2, Loader2, Check, DollarSign, Play,
  Users, Grid3X3, Search, MapPinned, Sparkles, Info,
  MessageSquare
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, Rectangle, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const defaultIcon = new L.Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const wizardSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  businessUrl: z.string().min(1, "Website URL is required").refine(
    (v) => /^https?:\/\/.+/.test(v) || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v),
    "Enter a valid URL (e.g. https://example.com)"
  ),
  businessAddress: z.string().optional(),
  businessLat: z.number().optional(),
  businessLng: z.number().optional(),
  businessType: z.enum(["local", "national"]),
  industry: z.string().optional(),
  primaryCategories: z.array(z.string()).default([]),
  otherBusinessDescription: z.string().optional(),
  serviceAreaCities: z.array(z.string()).default([]),
  services: z.array(z.object({
    name: z.string().min(1),
    customKeywords: z.array(z.string()).default([]),
  })).default([]),
  competitors: z.array(z.object({
    name: z.string().default(""),
    domain: z.string().default(""),
  })).max(3).default([]),
  geoGridKeywords: z.array(z.string()).default([]),
  geoGridSize: z.number().int().min(3).max(25).default(13),
  geoGridSpacingMiles: z.number().min(0.1).max(10).default(1),
});

type WizardFormData = z.infer<typeof wizardSchema>;

interface KeywordResult {
  keyword: string;
  estVolume: number;
  intent: string;
  service: string;
  selected: boolean;
}

const INDUSTRIES = [
  "Plumbing", "HVAC", "Electrical", "Roofing", "Landscaping",
  "Dental", "Legal", "Real Estate", "Restaurant", "Auto Repair",
  "Home Cleaning", "Pest Control", "Moving", "Photography",
  "Veterinary", "Fitness", "Accounting", "Insurance", "Marketing",
  "Other",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

const STATE_NAME_TO_CODE: Record<string, string> = {
  "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA",
  "Colorado":"CO","Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA",
  "Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS",
  "Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA",
  "Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT",
  "Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM",
  "New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK",
  "Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC",
  "South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT",
  "Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY",
};

const GRID_SIZES = [
  { value: 7, label: "7x7 (49 points)" },
  { value: 13, label: "13x13 (169 points)" },
  { value: 15, label: "15x15 (225 points)" },
];

const SPACING_OPTIONS = [
  { value: 0.5, label: "0.5 mi" },
  { value: 1, label: "1 mi" },
  { value: 2, label: "2 mi" },
  { value: 3, label: "3 mi" },
];

const STEPS = [
  "Describe Business",
  "Business Info",
  "Service Area",
  "Service Categories",
  "Keyword Research",
  "Competitors",
  "Geo Grid",
  "Review & Run",
];

const geocodeCache: Record<string, [number, number] | null> = {};

async function geocodeCityAsync(city: string): Promise<[number, number] | null> {
  if (city in geocodeCache) return geocodeCache[city];
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=1&countrycodes=us`,
      { headers: { "User-Agent": "MotiventSEOAudit/1.0" } }
    );
    const results = await resp.json();
    if (results.length > 0) {
      const coords: [number, number] = [parseFloat(results[0].lat), parseFloat(results[0].lon)];
      geocodeCache[city] = coords;
      return coords;
    }
  } catch { /* skip */ }
  geocodeCache[city] = null;
  return null;
}

function estimateCost(data: WizardFormData): { total: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  breakdown["Site Crawl"] = 0.10;
  breakdown["PageSpeed"] = 0;
  breakdown["Keyword Research"] = 0;
  const kwCount = Math.max(data.services.length * 3, 10);
  breakdown["SERP Rankings"] = kwCount * 0.014;
  if (data.businessType === "local" && data.geoGridKeywords.length > 0) {
    const gridPoints = data.geoGridSize * data.geoGridSize;
    breakdown["Geo Grid"] = data.geoGridKeywords.length * gridPoints * 0.002;
  }
  const compCount = data.competitors.filter(c => c.domain).length;
  breakdown["Competitive Intel"] = compCount * 0.05;
  breakdown["AI Visibility"] = kwCount * 0.01;
  breakdown["LLM Processing"] = 0.30;
  const total = Object.values(breakdown).reduce((s, v) => s + v, 0);
  return { total: Math.round(total * 100) / 100, breakdown };
}

function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, bounds]);
  return null;
}

function MapClickHandler({ onAddCity, onError }: { onAddCity: (cityLabel: string) => void; onError?: (msg: string) => void }) {
  const [isResolving, setIsResolving] = useState(false);

  useMapEvents({
    click: async (e) => {
      if (isResolving) return;
      setIsResolving(true);
      try {
        const { lat, lng } = e.latlng;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
          { headers: { "Accept-Language": "en", "User-Agent": "MotivientSEOAuditTool/1.0" } }
        );
        if (!res.ok) {
          onError?.("Could not look up that location. Please try again.");
          return;
        }
        const data = await res.json();
        const addr = data.address;
        const city = addr?.city || addr?.town || addr?.village || addr?.hamlet || addr?.county;
        const rawState = (addr?.["ISO3166-2-lvl4"]?.split("-")[1] || addr?.state_code || addr?.state || "").trim();
        const upperRaw = rawState.toUpperCase();
        const stateCode = rawState && (US_STATES.includes(upperRaw) ? upperRaw : STATE_NAME_TO_CODE[rawState]);
        if (city && stateCode) {
          onAddCity(`${city}, ${stateCode}`);
        } else {
          onError?.("Could not identify a US city at that location. Try clicking closer to a city.");
        }
      } catch {
        onError?.("Could not look up that location. Please try again.");
      } finally {
        setIsResolving(false);
      }
    },
  });

  return null;
}

function ServiceAreaMap({ cities, onAddCity, onError }: { cities: string[]; onAddCity?: (cityLabel: string) => void; onError?: (msg: string) => void }) {
  const [markers, setMarkers] = useState<Array<{ city: string; coords: [number, number] }>>([]);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      const results: Array<{ city: string; coords: [number, number] }> = [];
      for (const city of cities) {
        const coords = await geocodeCityAsync(city);
        if (coords && !cancelled) {
          results.push({ city, coords });
        }
      }
      if (!cancelled) setMarkers(results);
    }
    resolve();
    return () => { cancelled = true; };
  }, [cities]);

  const defaultCenter: [number, number] = [39.8283, -98.5795];

  if (markers.length === 0 && cities.length === 0 && onAddCity) {
    return (
      <div>
        <p className="text-xs text-gray-400 mt-2 mb-1 flex items-center gap-1">
          <MapPin className="w-3 h-3" /> Click anywhere on the map to add a city
        </p>
        <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height: 250 }}>
          <MapContainer
            center={defaultCenter}
            zoom={4}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {onAddCity && <MapClickHandler onAddCity={onAddCity} onError={onError} />}
          </MapContainer>
        </div>
      </div>
    );
  }

  if (markers.length === 0) {
    if (cities.length > 0) {
      return (
        <div className="rounded-lg border border-gray-200 mt-4 flex items-center justify-center" style={{ height: 120 }}>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Locating cities on map...
          </div>
        </div>
      );
    }
    return null;
  }

  const bounds = L.latLngBounds(markers.map(m => m.coords));

  return (
    <div>
      {onAddCity && (
        <p className="text-xs text-gray-400 mt-2 mb-1 flex items-center gap-1">
          <MapPin className="w-3 h-3" /> Click anywhere on the map to add a city
        </p>
      )}
      <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height: 250 }}>
        <MapContainer
          center={markers[0].coords}
          zoom={10}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {markers.map(m => (
            <Marker key={m.city} position={m.coords} icon={defaultIcon}>
              <Popup>{m.city}</Popup>
            </Marker>
          ))}
          {markers.length > 1 && <FitBounds bounds={bounds} />}
          {onAddCity && <MapClickHandler onAddCity={onAddCity} onError={onError} />}
        </MapContainer>
      </div>
    </div>
  );
}

function GeoGridPreviewMap({
  lat, lng, gridSize, spacingMiles, keywords,
}: { lat: number; lng: number; gridSize: number; spacingMiles: number; keywords: string[] }) {
  const mileToLat = 1 / 69.0;
  const mileToLng = 1 / (69.0 * Math.cos((lat * Math.PI) / 180));
  const halfSpan = ((gridSize - 1) / 2) * spacingMiles;
  const topLeft: [number, number] = [lat + halfSpan * mileToLat, lng - halfSpan * mileToLng];
  const bottomRight: [number, number] = [lat - halfSpan * mileToLat, lng + halfSpan * mileToLng];
  const bounds: L.LatLngBoundsExpression = [topLeft, bottomRight];

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 mt-4" style={{ height: 250 }}>
      <MapContainer
        center={[lat, lng]}
        zoom={12}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[lat, lng]} icon={defaultIcon}>
          <Popup>Business Location</Popup>
        </Marker>
        <Rectangle bounds={bounds} pathOptions={{ color: "#ff5800", weight: 2, fillOpacity: 0.08 }} />
        <FitBounds bounds={L.latLngBounds(topLeft, bottomRight).pad(0.2)} />
      </MapContainer>
    </div>
  );
}

export default function SeoAuditWizard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [cityInput, setCityInput] = useState("");
  const [cityState, setCityState] = useState("");
  const [compName, setCompName] = useState("");
  const [compDomain, setCompDomain] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [generatedGroups, setGeneratedGroups] = useState<Array<{ name: string; description: string; isActive: boolean; isHighLevelCategory: boolean }>>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [groupsGenerated, setGroupsGenerated] = useState(false);
  const [manualServiceInput, setManualServiceInput] = useState("");
  const [lastGenerationInputs, setLastGenerationInputs] = useState("");
  const [showOtherDescription, setShowOtherDescription] = useState(false);
  const [businessDescription, setBusinessDescription] = useState("");
  const [isParsingBusiness, setIsParsingBusiness] = useState(false);
  const [businessParsed, setBusinessParsed] = useState(false);
  const [keywordResults, setKeywordResults] = useState<KeywordResult[]>([]);
  const [isLoadingKeywords, setIsLoadingKeywords] = useState(false);
  const [keywordsGenerated, setKeywordsGenerated] = useState(false);
  const [lastKeywordInputs, setLastKeywordInputs] = useState("");
  const [customGeoKeyword, setCustomGeoKeyword] = useState("");
  const [customResearchKeyword, setCustomResearchKeyword] = useState("");

  const form = useForm<WizardFormData>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      businessName: "",
      businessUrl: "",
      businessAddress: "",
      businessType: "local",
      industry: "",
      primaryCategories: [],
      otherBusinessDescription: "",
      serviceAreaCities: [],
      services: [],
      competitors: [],
      geoGridKeywords: [],
      geoGridSize: 13,
      geoGridSpacingMiles: 1,
    },
  });

  const { fields: competitorFields, append: appendCompetitor, remove: removeCompetitor } = useFieldArray({
    control: form.control,
    name: "competitors",
  });

  const watchedData = form.watch();

  const geocodeAddress = useCallback(async (address: string) => {
    if (!address || address.length < 5) return;
    setIsGeocoding(true);
    try {
      const resp = await apiRequest("POST", "/api/seo-audits/geocode", { address }, { useAdminAuth: true });
      const { lat, lng } = await resp.json();
      form.setValue("businessLat", lat);
      form.setValue("businessLng", lng);
      toast({ title: "Location found", description: `Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (message.startsWith("401")) {
        toast({ title: "Authentication error", description: "Please log in again to use geocoding.", variant: "destructive" });
      } else if (message.startsWith("404")) {
        toast({ title: "Location not found", description: "Could not geocode this address. You can set coordinates manually.", variant: "destructive" });
      } else {
        toast({ title: "Geocoding failed", description: "An error occurred during geocoding. Please try again.", variant: "destructive" });
      }
    } finally {
      setIsGeocoding(false);
    }
  }, [form, toast]);

  const generateGroupsMutation = useMutation({
    mutationFn: async () => {
      const categories = form.getValues("primaryCategories");
      const otherDesc = form.getValues("otherBusinessDescription");
      const categoriesToUse = categories.length > 0 ? categories : (otherDesc ? [otherDesc] : []);
      const businessName = form.getValues("businessName");
      const businessUrl = form.getValues("businessUrl");
      const scope = form.getValues("businessType");
      const cities = form.getValues("serviceAreaCities");
      const domain = businessUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const response = await apiRequest("POST", "/api/monitoring/generate-groups", {
        businessName,
        domain,
        industry: categoriesToUse[0] || "",
        primaryCategories: categoriesToUse.length > 1 ? categoriesToUse : undefined,
        scope,
        city: cities.length > 0 ? cities[0] : undefined,
      });
      return await response.json() as {
        groups: { name: string; description: string; isHighLevelCategory?: boolean }[];
        isMultiCategory?: boolean;
      };
    },
    onSuccess: (data) => {
      const newGroups = data.groups.map((g) => ({
        name: g.name,
        description: g.description,
        isActive: true,
        isHighLevelCategory: g.isHighLevelCategory || false,
      }));
      setGeneratedGroups(newGroups);
      setIsLoadingGroups(false);
      setGroupsGenerated(true);
    },
    onError: (error: Error) => {
      setIsLoadingGroups(false);
      toast({ title: "Failed to generate categories", description: error.message, variant: "destructive" });
    },
  });

  const parseBusinessMutation = useMutation({
    mutationFn: async (description: string) => {
      const existingUrl = form.getValues("businessUrl");
      const response = await apiRequest("POST", "/api/seo-audits/parse-business", {
        description,
        ...(existingUrl ? { businessUrl: existingUrl } : {}),
      }, { useAdminAuth: true });
      return await response.json() as {
        businessName: string;
        businessUrl: string;
        industry: string;
        businessType: "local" | "national";
        serviceAreaCities: string[];
        primaryCategories: string[];
      };
    },
    onSuccess: (data) => {
      const hasMeaningfulData = !!(data.businessName || data.businessUrl || data.primaryCategories?.length > 0);
      if (data.businessName) form.setValue("businessName", data.businessName);
      if (data.businessUrl) form.setValue("businessUrl", data.businessUrl);
      if (data.industry) form.setValue("industry", data.industry);
      if (data.businessType) form.setValue("businessType", data.businessType);
      if (data.serviceAreaCities?.length > 0) form.setValue("serviceAreaCities", data.serviceAreaCities);
      if (data.primaryCategories?.length > 0) {
        form.setValue("primaryCategories", data.primaryCategories);
        if (data.primaryCategories[0] && !data.industry) {
          form.setValue("industry", data.primaryCategories[0]);
        }
      }
      setIsParsingBusiness(false);
      if (hasMeaningfulData) {
        setBusinessParsed(true);
        toast({ title: "Business info extracted", description: "We've pre-filled the form based on your description. Review and adjust as needed." });
      } else {
        setBusinessParsed(false);
        toast({ title: "Couldn't extract info", description: "Try providing more detail about the business name, website, and services.", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      setIsParsingBusiness(false);
      toast({ title: "Failed to parse description", description: error.message, variant: "destructive" });
    },
  });

  const keywordResearchMutation = useMutation({
    mutationFn: async () => {
      const activeGroups = generatedGroups.filter(g => g.isActive && !g.isHighLevelCategory);
      const categories = activeGroups.map(g => g.name);
      const response = await apiRequest("POST", "/api/seo-audits/keyword-research", {
        categories,
        businessName: form.getValues("businessName"),
        businessUrl: form.getValues("businessUrl"),
        businessType: form.getValues("businessType"),
        cities: form.getValues("serviceAreaCities"),
      }, { useAdminAuth: true });
      return await response.json() as { keywords: Array<{ keyword: string; estVolume: number; intent: string; service: string }> };
    },
    onSuccess: (data) => {
      const results = data.keywords.map(k => ({ ...k, selected: true }));
      setKeywordResults(results);
      setIsLoadingKeywords(false);
      setKeywordsGenerated(true);

      const services = form.getValues("services");
      const serviceNames = new Set(services.map(s => s.name));
      const newServices = [...services];
      for (const kw of results) {
        if (kw.service && !serviceNames.has(kw.service)) {
          newServices.push({ name: kw.service, customKeywords: [] });
          serviceNames.add(kw.service);
        }
      }
      form.setValue("services", newServices);
    },
    onError: (error: Error) => {
      setIsLoadingKeywords(false);
      toast({ title: "Failed to generate keywords", description: error.message, variant: "destructive" });
    },
  });

  const createAndRunMutation = useMutation({
    mutationFn: async (formData: WizardFormData) => {
      let url = formData.businessUrl;
      if (!/^https?:\/\//.test(url)) url = `https://${url}`;

      const allServices = new Set(formData.services.map(s => s.name));
      const selectedKeywords = keywordResults.filter(k => k.selected);
      for (const kw of selectedKeywords) {
        allServices.add(kw.keyword);
      }

      const res = await apiRequest("POST", "/api/seo-audits", {
        businessName: formData.businessName,
        businessUrl: url,
        businessAddress: formData.businessAddress || undefined,
        businessType: formData.businessType,
        industry: formData.primaryCategories.length > 0 ? formData.primaryCategories[0] : (formData.otherBusinessDescription || formData.industry || undefined),
        serviceAreaCities: formData.serviceAreaCities,
        services: Array.from(allServices),
        competitors: formData.competitors.filter(c => c.name || c.domain),
        geoGridKeywords: formData.geoGridKeywords,
        geoGridSize: formData.geoGridSize,
        geoGridSpacingMiles: formData.geoGridSpacingMiles,
      }, { useAdminAuth: true });
      const audit = await res.json();

      if (formData.businessLat && formData.businessLng) {
        await apiRequest("POST", `/api/seo-audits/${audit.id}/configure`, {
          businessLat: formData.businessLat,
          businessLng: formData.businessLng,
        }, { useAdminAuth: true });
      }

      await apiRequest("POST", `/api/seo-audits/${audit.id}/run`, undefined, { useAdminAuth: true });
      return audit;
    },
    onSuccess: (audit) => {
      queryClient.invalidateQueries({ queryKey: ["/api/seo-audits"] });
      toast({ title: "Audit started", description: `Pipeline queued for ${audit.businessName}` });
      navigate(`/admin/seo-audits/${audit.id}/progress`);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to start audit", description: error.message, variant: "destructive" });
    },
  });

  const stepFieldMap: Record<number, Array<keyof WizardFormData>> = {
    0: [],
    1: ["businessName", "businessUrl"],
    2: ["businessType", "serviceAreaCities"],
    3: [],
    4: [],
    5: [],
    6: [],
    7: [],
  };

  const canAdvance = (): boolean => {
    switch (step) {
      case 0: return true;
      case 1: {
        const hasCats = watchedData.primaryCategories.length > 0;
        const hasOther = (watchedData.otherBusinessDescription || "").trim().length > 0;
        return watchedData.businessName.length > 0 && watchedData.businessUrl.length > 0 && (hasCats || hasOther);
      }
      case 2: return watchedData.businessType === "national" || watchedData.serviceAreaCities.length > 0;
      case 3: return generatedGroups.some(g => g.isActive && !g.isHighLevelCategory);
      case 4: return keywordResults.some(k => k.selected);
      case 5: return true;
      case 6: return true;
      case 7: return true;
      default: return false;
    }
  };

  const handleNext = async () => {
    const fields = stepFieldMap[step] || [];
    if (fields.length > 0) {
      const valid = await form.trigger(fields);
      if (!valid) return;
    }

    if (step === 0) {
      setStep(1);
      return;
    }

    if (step === 2) {
      setStep(3);
      const currentInputs = JSON.stringify({
        url: form.getValues("businessUrl"),
        cats: form.getValues("primaryCategories"),
        desc: form.getValues("otherBusinessDescription"),
        type: form.getValues("businessType"),
        cities: form.getValues("serviceAreaCities"),
      });
      const inputsChanged = currentInputs !== lastGenerationInputs;
      if (!groupsGenerated || inputsChanged) {
        setIsLoadingGroups(true);
        setGroupsGenerated(false);
        setGeneratedGroups([]);
        setLastGenerationInputs(currentInputs);
        generateGroupsMutation.mutate();
      }
      return;
    }

    if (step === 3) {
      const activeGroups = generatedGroups.filter(g => g.isActive && !g.isHighLevelCategory);
      const allGroupNames = new Set(generatedGroups.map(g => g.name));
      const currentServices = form.getValues("services");
      const manualServices = currentServices.filter(s => !allGroupNames.has(s.name));
      const groupServices = activeGroups.map(g => {
        const existing = currentServices.find(s => s.name === g.name);
        return existing || { name: g.name, customKeywords: [] as string[] };
      });
      form.setValue("services", [...groupServices, ...manualServices]);

      setStep(4);
      const kwInputs = JSON.stringify({
        groups: activeGroups.map(g => g.name),
        name: form.getValues("businessName"),
        url: form.getValues("businessUrl"),
        type: form.getValues("businessType"),
        cities: form.getValues("serviceAreaCities"),
      });
      const kwChanged = kwInputs !== lastKeywordInputs;
      if (!keywordsGenerated || kwChanged) {
        setIsLoadingKeywords(true);
        setKeywordsGenerated(false);
        setKeywordResults([]);
        setLastKeywordInputs(kwInputs);
        keywordResearchMutation.mutate();
      }
      return;
    }

    setStep(s => s + 1);
  };

  const handleParseBusiness = () => {
    if (!businessDescription.trim()) {
      toast({ title: "Please describe the business", description: "Enter a description of the business to get started.", variant: "destructive" });
      return;
    }
    setIsParsingBusiness(true);
    setBusinessParsed(false);
    parseBusinessMutation.mutate(businessDescription);
  };

  const addCategory = () => {
    const trimmed = newCategoryInput.trim();
    if (trimmed) {
      const current = form.getValues("primaryCategories");
      if (!current.includes(trimmed)) {
        form.setValue("primaryCategories", [...current, trimmed]);
        if (current.length === 0) {
          form.setValue("industry", trimmed);
        }
      }
    }
    setNewCategoryInput("");
  };

  const removeCategory = (category: string) => {
    const current = form.getValues("primaryCategories");
    const updated = current.filter(c => c !== category);
    form.setValue("primaryCategories", updated);
    if (updated.length > 0) {
      form.setValue("industry", updated[0]);
    } else {
      form.setValue("industry", "");
    }
  };

  const toggleGroupActive = (index: number) => {
    setGeneratedGroups(prev => prev.map((g, i) => i === index ? { ...g, isActive: !g.isActive } : g));
  };

  const addManualGroup = () => {
    const trimmed = manualServiceInput.trim();
    if (trimmed && !generatedGroups.some(g => g.name === trimmed)) {
      setGeneratedGroups(prev => [...prev, { name: trimmed, description: "", isActive: true, isHighLevelCategory: false }]);
    }
    setManualServiceInput("");
  };

  const regenerateGroups = () => {
    setIsLoadingGroups(true);
    setGroupsGenerated(false);
    setGeneratedGroups([]);
    generateGroupsMutation.mutate();
  };

  const addCity = () => {
    const city = cityState ? `${cityInput.trim()}, ${cityState}` : cityInput.trim();
    const current = form.getValues("serviceAreaCities");
    if (city && !current.includes(city)) {
      form.setValue("serviceAreaCities", [...current, city]);
    }
    setCityInput("");
    setCityState("");
  };

  const removeCity = (city: string) => {
    const current = form.getValues("serviceAreaCities");
    form.setValue("serviceAreaCities", current.filter(c => c !== city));
  };

  const addCompetitor = () => {
    if ((compName.trim() || compDomain.trim()) && competitorFields.length < 3) {
      appendCompetitor({ name: compName.trim(), domain: compDomain.trim() });
    }
    setCompName("");
    setCompDomain("");
  };

  const toggleKeywordSelected = (index: number) => {
    setKeywordResults(prev => prev.map((k, i) => i === index ? { ...k, selected: !k.selected } : k));
  };

  const addCustomResearchKeyword = () => {
    const trimmed = customResearchKeyword.trim();
    if (trimmed && !keywordResults.some(k => k.keyword.toLowerCase() === trimmed.toLowerCase())) {
      setKeywordResults(prev => [...prev, {
        keyword: trimmed,
        estVolume: 0,
        intent: "transactional",
        service: "Custom",
        selected: true,
      }]);
      setCustomResearchKeyword("");
    }
  };

  const toggleGeoKeyword = (kw: string) => {
    const current = form.getValues("geoGridKeywords");
    if (current.includes(kw)) {
      form.setValue("geoGridKeywords", current.filter(k => k !== kw));
    } else if (current.length < 5) {
      form.setValue("geoGridKeywords", [...current, kw]);
    }
  };

  const allGeoKeywords = useMemo(() => {
    const kws: Array<{ keyword: string; source: string; service: string; estVolume: number }> = [];
    const seen = new Set<string>();

    for (const kr of keywordResults) {
      const key = kr.keyword.toLowerCase();
      if (!seen.has(key)) {
        kws.push({ keyword: kr.keyword, source: "research", service: kr.service, estVolume: kr.estVolume });
        seen.add(key);
      }
    }

    for (const svc of watchedData.services) {
      const key = svc.name.toLowerCase();
      if (!seen.has(key)) {
        kws.push({ keyword: svc.name, source: "service", service: svc.name, estVolume: 0 });
        seen.add(key);
      }
    }

    return kws.sort((a, b) => b.estVolume - a.estVolume);
  }, [keywordResults, watchedData.services]);

  const keywordsByService = useMemo(() => {
    const grouped: Record<string, KeywordResult[]> = {};
    for (const kw of keywordResults) {
      const svc = kw.service || "Other";
      if (!grouped[svc]) grouped[svc] = [];
      grouped[svc].push(kw);
    }
    for (const svc of Object.keys(grouped)) {
      grouped[svc].sort((a, b) => b.estVolume - a.estVolume);
    }
    return grouped;
  }, [keywordResults]);

  const cost = estimateCost(watchedData);
  const hasLatLng = watchedData.businessLat !== undefined && watchedData.businessLng !== undefined && watchedData.businessLat !== 0;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/seo-audits")} data-testid="button-back-to-list">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Audits
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-4" data-testid="text-wizard-title">New SEO Audit</h1>
        <div className="flex items-center gap-1 flex-wrap">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center">
              <button
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  i === step
                    ? "bg-[#ff5800] text-white"
                    : i < step
                    ? "bg-green-100 text-green-700 cursor-pointer hover:bg-green-200"
                    : "bg-gray-100 text-gray-400"
                }`}
                data-testid={`step-${i}`}
              >
                {i < step ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
                <span className="hidden sm:inline">{label}</span>
              </button>
              {i < STEPS.length - 1 && <div className="w-4 h-px bg-gray-300 mx-1" />}
            </div>
          ))}
        </div>
      </div>

      <Form {...form}>
        <div>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="p-6">

              {step === 0 && (
                <div className="space-y-5">
                  <CardHeader className="px-0 pt-0">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <MessageSquare className="w-5 h-5 text-[#ff5800]" />
                      Describe the Business
                    </CardTitle>
                  </CardHeader>

                  <div className="flex items-center gap-2 bg-blue-50 text-blue-700 text-sm rounded-lg px-4 py-3">
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>
                      Tell us about the business in your own words. We'll extract the key details and pre-fill the audit form for you. You can always adjust anything afterward.
                    </span>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Business Description</Label>
                    <Textarea
                      value={businessDescription}
                      onChange={e => setBusinessDescription(e.target.value)}
                      placeholder={"Example: \"This is Acme Plumbing, a local plumbing company based in Minneapolis, MN. They also service St. Paul and Bloomington. Their website is acmeplumbing.com. They offer residential and commercial plumbing services including drain cleaning, water heater installation, and pipe repair.\""}
                      rows={6}
                      className="resize-none"
                      data-testid="input-business-description-intake"
                    />
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        onClick={handleParseBusiness}
                        disabled={isParsingBusiness || !businessDescription.trim()}
                        className="bg-[#ff5800] hover:bg-[#e04f00]"
                        data-testid="button-parse-business"
                      >
                        {isParsingBusiness ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Extract Business Info
                          </>
                        )}
                      </Button>
                      {businessParsed && (
                        <span className="text-sm text-green-600 flex items-center gap-1">
                          <Check className="w-4 h-4" />
                          Info extracted and pre-filled
                        </span>
                      )}
                    </div>
                  </div>

                  {businessParsed && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                      <h4 className="text-sm font-medium text-green-800">Pre-filled Information</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm text-green-700">
                        {watchedData.businessName && <div><span className="font-medium">Name:</span> {watchedData.businessName}</div>}
                        {watchedData.businessUrl && <div><span className="font-medium">URL:</span> {watchedData.businessUrl}</div>}
                        {watchedData.businessType && <div><span className="font-medium">Type:</span> {watchedData.businessType}</div>}
                        {watchedData.primaryCategories.length > 0 && (
                          <div className="col-span-2"><span className="font-medium">Categories:</span> {watchedData.primaryCategories.join(", ")}</div>
                        )}
                        {watchedData.serviceAreaCities.length > 0 && (
                          <div className="col-span-2"><span className="font-medium">Service Areas:</span> {watchedData.serviceAreaCities.join(", ")}</div>
                        )}
                      </div>
                      <p className="text-xs text-green-600 mt-1">You can adjust these in the following steps.</p>
                    </div>
                  )}

                  <p className="text-xs text-gray-400">
                    You can also skip this step and fill in the details manually.
                  </p>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  <CardHeader className="px-0 pt-0">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Building2 className="w-5 h-5 text-[#ff5800]" />
                      Business Information
                    </CardTitle>
                  </CardHeader>

                  <div className="space-y-4">
                    <FormField control={form.control} name="businessName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Name *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Acme Plumbing Co." data-testid="input-business-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="businessUrl" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website URL *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="https://acmeplumbing.com" data-testid="input-business-url" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="businessAddress" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Address</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input {...field} placeholder="123 Main St, Minneapolis, MN 55401" data-testid="input-business-address" />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => geocodeAddress(field.value || "")}
                            disabled={isGeocoding || !field.value}
                            data-testid="button-geocode"
                          >
                            {isGeocoding ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPinned className="w-4 h-4" />}
                          </Button>
                        </div>
                        {hasLatLng && (
                          <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                            <Check className="w-3 h-3" />
                            Located: {watchedData.businessLat?.toFixed(4)}, {watchedData.businessLng?.toFixed(4)}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="businessType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Type</FormLabel>
                        <FormControl>
                          <RadioGroup
                            value={field.value}
                            onValueChange={field.onChange}
                            className="flex gap-4 mt-2"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="local" id="type-local" data-testid="radio-type-local" />
                              <Label htmlFor="type-local" className="font-normal">Local Business</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="national" id="type-national" data-testid="radio-type-national" />
                              <Label htmlFor="type-national" className="font-normal">National / Online</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                      </FormItem>
                    )} />

                    <div>
                      <Label className="text-sm font-medium">Business Type / Categories *</Label>
                      <p className="text-xs text-gray-500 mb-2">
                        Add one or more categories that describe this business (e.g., Plumbing, HVAC, Roofing).
                      </p>
                      {watchedData.primaryCategories.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {watchedData.primaryCategories.map((category) => (
                            <Badge
                              key={category}
                              variant="secondary"
                              className="bg-[#ff5800] text-white hover:bg-[#e04f00] px-3 py-1.5 flex items-center gap-1"
                            >
                              {category}
                              <button
                                type="button"
                                onClick={() => removeCategory(category)}
                                className="ml-1 hover:text-red-200"
                                data-testid={`button-remove-category-${category}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Select
                          value=""
                          onValueChange={(val) => {
                            if (val === "__other__") {
                              setShowOtherDescription(true);
                              return;
                            }
                            const current = form.getValues("primaryCategories");
                            if (!current.includes(val)) {
                              form.setValue("primaryCategories", [...current, val]);
                              if (current.length === 0) form.setValue("industry", val);
                            }
                          }}
                        >
                          <SelectTrigger className="flex-1" data-testid="select-business-type">
                            <SelectValue placeholder="Select a category..." />
                          </SelectTrigger>
                          <SelectContent>
                            {INDUSTRIES.filter(ind => ind !== "Other").map(ind => (
                              <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                            ))}
                            <SelectItem value="__other__">Other...</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex gap-1">
                          <Input
                            value={newCategoryInput}
                            onChange={e => setNewCategoryInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addCategory())}
                            placeholder="Or type custom..."
                            className="w-40"
                            data-testid="input-custom-category"
                          />
                          <Button type="button" variant="outline" size="icon" onClick={addCategory} data-testid="button-add-category">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      {(showOtherDescription || (watchedData.otherBusinessDescription || "").trim().length > 0) && (
                        <div className="mt-3">
                          <Label className="text-sm font-medium">Describe this business</Label>
                          <FormField control={form.control} name="otherBusinessDescription" render={({ field }) => (
                            <FormItem className="mt-1">
                              <FormControl>
                                <Textarea
                                  {...field}
                                  placeholder="Describe the business type and what it offers (e.g., 'A full-service roofing company specializing in residential and commercial roof repair, replacement, and installation')"
                                  rows={3}
                                  data-testid="input-business-description"
                                />
                              </FormControl>
                            </FormItem>
                          )} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <CardHeader className="px-0 pt-0">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <MapPin className="w-5 h-5 text-[#ff5800]" />
                      Service Area
                    </CardTitle>
                  </CardHeader>

                  {watchedData.businessType === "national" ? (
                    <div className="text-center py-8 text-gray-500">
                      <Globe className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-lg font-medium text-gray-700">National / Online Business</p>
                      <p className="text-sm">Service area configuration is skipped for national businesses.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <Input
                          value={cityInput}
                          onChange={e => setCityInput(e.target.value)}
                          placeholder="City name"
                          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addCity())}
                          className="flex-1"
                          data-testid="input-city"
                        />
                        <Select value={cityState} onValueChange={setCityState}>
                          <SelectTrigger className="w-24" data-testid="select-state">
                            <SelectValue placeholder="State" />
                          </SelectTrigger>
                          <SelectContent className="z-[9999]">
                            {US_STATES.map(st => (
                              <SelectItem key={st} value={st}>{st}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" onClick={addCity} variant="outline" data-testid="button-add-city">
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>

                      {watchedData.serviceAreaCities.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {watchedData.serviceAreaCities.map(city => (
                            <Badge key={city} variant="secondary" className="flex items-center gap-1 px-3 py-1.5">
                              <MapPin className="w-3 h-3" />
                              {city}
                              <button
                                type="button"
                                onClick={() => removeCity(city)}
                                className="ml-1 hover:text-red-500"
                                data-testid={`button-remove-city-${city}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">Add at least one city to your service area.</p>
                      )}

                      <ServiceAreaMap
                        cities={watchedData.serviceAreaCities}
                        onAddCity={(cityLabel) => {
                          const current = form.getValues("serviceAreaCities");
                          if (!current.includes(cityLabel)) {
                            form.setValue("serviceAreaCities", [...current, cityLabel]);
                          }
                        }}
                        onError={(msg) => toast({ title: "Map Lookup", description: msg, variant: "destructive" })}
                      />
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <CardHeader className="px-0 pt-0">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Sparkles className="w-5 h-5 text-[#ff5800]" />
                      Service Categories
                    </CardTitle>
                  </CardHeader>

                  <div className="space-y-4">
                    {isLoadingGroups && (
                      <div className="text-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#ff5800]" />
                        <p className="text-sm font-medium text-gray-700">Analyzing website & generating service categories...</p>
                        <p className="text-xs text-gray-400 mt-1">This may take 15-30 seconds</p>
                      </div>
                    )}

                    {!isLoadingGroups && generatedGroups.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 bg-blue-50 text-blue-700 text-sm rounded-lg px-4 py-3">
                          <Sparkles className="w-4 h-4 shrink-0" />
                          <span>
                            We analyzed the website and identified these service categories. Select the ones that apply to this business.
                          </span>
                        </div>

                        <div className="space-y-2">
                          {generatedGroups.map((group, idx) => (
                            <div
                              key={`${group.name}-${idx}`}
                              className={`flex items-start gap-3 rounded-lg px-4 py-3 cursor-pointer transition-colors ${
                                group.isActive ? "bg-orange-50 border border-orange-200" : "bg-gray-50 border border-gray-200 opacity-60"
                              }`}
                              onClick={() => toggleGroupActive(idx)}
                              data-testid={`group-toggle-${idx}`}
                            >
                              <Checkbox
                                checked={group.isActive}
                                onCheckedChange={() => {}}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-0.5 pointer-events-none"
                                data-testid={`checkbox-group-${idx}`}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{group.name}</span>
                                  {group.isHighLevelCategory && (
                                    <Badge variant="outline" className="text-[10px]">Category</Badge>
                                  )}
                                </div>
                                {group.description && (
                                  <p className="text-xs text-gray-500 mt-0.5">{group.description}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {!isLoadingGroups && generatedGroups.length === 0 && groupsGenerated && (
                      <div className="flex items-center gap-2 bg-amber-50 text-amber-700 text-sm rounded-lg px-4 py-3">
                        <Info className="w-4 h-4 shrink-0" />
                        <span>No categories were generated. You can add service categories manually below or try regenerating.</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Input
                        value={manualServiceInput}
                        onChange={e => setManualServiceInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addManualGroup())}
                        placeholder="Add a custom category..."
                        className="flex-1"
                        data-testid="input-manual-group"
                      />
                      <Button type="button" variant="outline" onClick={addManualGroup} data-testid="button-add-manual-group">
                        <Plus className="w-4 h-4 mr-1" /> Add
                      </Button>
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{generatedGroups.filter(g => g.isActive).length} of {generatedGroups.length} selected</span>
                      <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={regenerateGroups} disabled={isLoadingGroups} data-testid="button-regenerate-groups">
                        <Loader2 className={`w-3 h-3 mr-1 ${isLoadingGroups ? "animate-spin" : ""}`} /> Regenerate
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5">
                  <CardHeader className="px-0 pt-0">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Search className="w-5 h-5 text-[#ff5800]" />
                      Keyword Research
                    </CardTitle>
                  </CardHeader>

                  {isLoadingKeywords && (
                    <div className="text-center py-8">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#ff5800]" />
                      <p className="text-sm font-medium text-gray-700">Generating keyword research for your service categories...</p>
                      <p className="text-xs text-gray-400 mt-1">This may take 15-30 seconds</p>
                    </div>
                  )}

                  {!isLoadingKeywords && keywordResults.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 bg-blue-50 text-blue-700 text-sm rounded-lg px-4 py-3">
                        <Sparkles className="w-4 h-4 shrink-0" />
                        <span>
                          We generated keyword suggestions based on your service categories and location. Select the keywords you want to target. These will be used for SERP tracking and geo grid analysis.
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                        <span>{keywordResults.filter(k => k.selected).length} of {keywordResults.length} keywords selected</span>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => setKeywordResults(prev => prev.map(k => ({ ...k, selected: true })))}
                            data-testid="button-select-all-keywords"
                          >
                            Select All
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => setKeywordResults(prev => prev.map(k => ({ ...k, selected: false })))}
                            data-testid="button-deselect-all-keywords"
                          >
                            Deselect All
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                        {Object.entries(keywordsByService).map(([service, keywords]) => (
                          <div key={service} className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-700">{service}</span>
                              <Badge variant="outline" className="text-xs">{keywords.filter(k => k.selected).length}/{keywords.length}</Badge>
                            </div>
                            <div className="divide-y divide-gray-100">
                              {keywords.map((kw) => {
                                const globalIndex = keywordResults.indexOf(kw);
                                return (
                                  <div
                                    key={`${kw.keyword}-${globalIndex}`}
                                    className="flex items-center justify-between px-4 py-2 hover:bg-gray-50"
                                  >
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        checked={kw.selected}
                                        onCheckedChange={() => toggleKeywordSelected(globalIndex)}
                                        data-testid={`checkbox-keyword-${globalIndex}`}
                                      />
                                      <span className="text-sm">{kw.keyword}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-gray-400 tabular-nums">
                                        ~{kw.estVolume.toLocaleString()}/mo
                                      </span>
                                      <Badge variant="outline" className="text-[10px]">
                                        {kw.intent}
                                      </Badge>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {!isLoadingKeywords && keywordResults.length === 0 && keywordsGenerated && (
                    <div className="flex items-center gap-2 bg-amber-50 text-amber-700 text-sm rounded-lg px-4 py-3">
                      <Info className="w-4 h-4 shrink-0" />
                      <span>No keywords were generated. Go back and adjust your service categories, then try again.</span>
                    </div>
                  )}

                  {!isLoadingKeywords && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          value={customResearchKeyword}
                          onChange={e => setCustomResearchKeyword(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addCustomResearchKeyword();
                            }
                          }}
                          placeholder="Add a custom keyword..."
                          className="flex-1"
                          data-testid="input-custom-research-keyword"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={addCustomResearchKeyword}
                          disabled={!customResearchKeyword.trim()}
                          data-testid="button-add-custom-research-keyword"
                        >
                          <Plus className="w-4 h-4 mr-1" /> Add
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setIsLoadingKeywords(true);
                          setKeywordsGenerated(false);
                          setKeywordResults([]);
                          keywordResearchMutation.mutate();
                        }}
                        disabled={isLoadingKeywords}
                        data-testid="button-regenerate-keywords"
                      >
                        <Loader2 className={`w-3 h-3 mr-1 ${isLoadingKeywords ? "animate-spin" : ""}`} /> Regenerate Keywords
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {step === 5 && (
                <div className="space-y-5">
                  <CardHeader className="px-0 pt-0">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Users className="w-5 h-5 text-[#ff5800]" />
                      Competitors (up to 3)
                    </CardTitle>
                  </CardHeader>

                  <p className="text-sm text-gray-500">
                    Add up to 3 competitors to compare against. Leave blank to skip competitive analysis.
                  </p>

                  {competitorFields.length < 3 && (
                    <div className="flex gap-2">
                      <Input
                        value={compName}
                        onChange={e => setCompName(e.target.value)}
                        placeholder="Business name"
                        className="flex-1"
                        data-testid="input-competitor-name"
                      />
                      <Input
                        value={compDomain}
                        onChange={e => setCompDomain(e.target.value)}
                        placeholder="domain.com"
                        className="flex-1"
                        data-testid="input-competitor-domain"
                      />
                      <Button type="button" onClick={addCompetitor} variant="outline" data-testid="button-add-competitor">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  )}

                  {competitorFields.length > 0 ? (
                    <div className="space-y-2">
                      {competitorFields.map((field, i) => (
                        <div key={field.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <Building2 className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-medium">{watchedData.competitors[i]?.name || "\u2014"}</span>
                            <span className="text-sm text-gray-400">{watchedData.competitors[i]?.domain}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCompetitor(i)}
                            className="text-gray-400 hover:text-red-500"
                            data-testid={`button-remove-competitor-${i}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No competitors added — competitive analysis will be skipped.</p>
                  )}
                </div>
              )}

              {step === 6 && (
                <div className="space-y-5">
                  <CardHeader className="px-0 pt-0">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Grid3X3 className="w-5 h-5 text-[#ff5800]" />
                      Geo Grid Configuration
                    </CardTitle>
                  </CardHeader>

                  {watchedData.businessType === "national" ? (
                    <div className="text-center py-8 text-gray-500">
                      <Globe className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-lg font-medium text-gray-700">Skipped for National Businesses</p>
                      <p className="text-sm">Geo grid analysis is only available for local businesses.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <Label className="text-sm font-medium mb-3 block">
                          Keywords to Map (select up to 5)
                        </Label>
                        <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                          <Info className="w-3 h-3" />
                          Keywords from your keyword research. Select the ones you want to track on the geo grid.
                        </p>
                        {allGeoKeywords.length > 0 ? (
                          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-2">
                            {allGeoKeywords.map((item, idx) => (
                              <div key={`${item.keyword}-${idx}`} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`geo-kw-${idx}`}
                                    checked={watchedData.geoGridKeywords.includes(item.keyword)}
                                    onCheckedChange={() => toggleGeoKeyword(item.keyword)}
                                    disabled={!watchedData.geoGridKeywords.includes(item.keyword) && watchedData.geoGridKeywords.length >= 5}
                                    data-testid={`checkbox-geo-keyword-${item.keyword}`}
                                  />
                                  <Label htmlFor={`geo-kw-${idx}`} className="font-normal text-sm">{item.keyword}</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  {item.estVolume > 0 && (
                                    <span className="text-xs text-gray-400 tabular-nums" data-testid={`volume-${idx}`}>
                                      ~{item.estVolume.toLocaleString()}/mo
                                    </span>
                                  )}
                                  <Badge variant="outline" className="text-[10px]">
                                    {item.source === "research" ? "Research" : "Service"}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400">No keywords available. Complete the keyword research step first.</p>
                        )}

                        <div className="flex gap-2 mt-3">
                          <Input
                            value={customGeoKeyword}
                            onChange={e => setCustomGeoKeyword(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const kw = customGeoKeyword.trim();
                                if (kw && watchedData.geoGridKeywords.length < 5) {
                                  toggleGeoKeyword(kw);
                                  setCustomGeoKeyword("");
                                }
                              }
                            }}
                            placeholder="Add a custom keyword..."
                            className="flex-1"
                            data-testid="input-custom-geo-keyword"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const kw = customGeoKeyword.trim();
                              if (kw && watchedData.geoGridKeywords.length < 5) {
                                toggleGeoKeyword(kw);
                                setCustomGeoKeyword("");
                              }
                            }}
                            disabled={watchedData.geoGridKeywords.length >= 5}
                            data-testid="button-add-custom-geo-keyword"
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>

                        <p className="text-xs text-gray-400 mt-2">
                          {watchedData.geoGridKeywords.length}/5 selected
                        </p>
                      </div>

                      <div>
                        <Label className="text-sm font-medium mb-3 block">Grid Size</Label>
                        <RadioGroup
                          value={String(watchedData.geoGridSize)}
                          onValueChange={v => form.setValue("geoGridSize", parseInt(v))}
                          className="flex flex-wrap gap-3"
                        >
                          {GRID_SIZES.map(g => (
                            <div key={g.value} className="flex items-center space-x-2">
                              <RadioGroupItem value={String(g.value)} id={`grid-${g.value}`} data-testid={`radio-grid-${g.value}`} />
                              <Label htmlFor={`grid-${g.value}`} className="font-normal text-sm">{g.label}</Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>

                      <div>
                        <Label className="text-sm font-medium mb-3 block">Point Spacing</Label>
                        <RadioGroup
                          value={String(watchedData.geoGridSpacingMiles)}
                          onValueChange={v => form.setValue("geoGridSpacingMiles", parseFloat(v))}
                          className="flex flex-wrap gap-3"
                        >
                          {SPACING_OPTIONS.map(s => (
                            <div key={s.value} className="flex items-center space-x-2">
                              <RadioGroupItem value={String(s.value)} id={`spacing-${s.value}`} data-testid={`radio-spacing-${s.value}`} />
                              <Label htmlFor={`spacing-${s.value}`} className="font-normal text-sm">{s.label}</Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>

                      {watchedData.geoGridKeywords.length > 0 && (
                        <div className="bg-blue-50 rounded-lg p-4">
                          <div className="flex items-center gap-2 text-blue-700 text-sm font-medium mb-1">
                            <Grid3X3 className="w-4 h-4" />
                            Grid Preview
                          </div>
                          <p className="text-sm text-blue-600">
                            {watchedData.geoGridKeywords.length} keyword{watchedData.geoGridKeywords.length !== 1 ? "s" : ""} x {watchedData.geoGridSize}x{watchedData.geoGridSize} grid ({watchedData.geoGridSize * watchedData.geoGridSize} points) @ {watchedData.geoGridSpacingMiles}mi spacing
                          </p>
                          <p className="text-xs text-blue-500 mt-1">
                            Total API calls: {watchedData.geoGridKeywords.length * watchedData.geoGridSize * watchedData.geoGridSize}
                          </p>
                        </div>
                      )}

                      {hasLatLng && watchedData.businessLat && watchedData.businessLng && (
                        <GeoGridPreviewMap
                          lat={watchedData.businessLat}
                          lng={watchedData.businessLng}
                          gridSize={watchedData.geoGridSize}
                          spacingMiles={watchedData.geoGridSpacingMiles}
                          keywords={watchedData.geoGridKeywords}
                        />
                      )}

                      {!hasLatLng && watchedData.geoGridKeywords.length > 0 && (
                        <div className="flex items-start gap-2 bg-amber-50 text-amber-700 text-sm rounded-lg px-4 py-3">
                          <Info className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>
                            Set a business address in Step 2 and geocode it to see the grid overlay on the map.
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {step === 7 && (
                <div className="space-y-5">
                  <CardHeader className="px-0 pt-0">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Check className="w-5 h-5 text-[#ff5800]" />
                      Review & Run Audit
                    </CardTitle>
                  </CardHeader>

                  <div className="space-y-4">
                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                      <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Business</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-gray-500">Name:</span> <span className="font-medium">{watchedData.businessName}</span></div>
                        <div><span className="text-gray-500">URL:</span> <span className="font-medium">{watchedData.businessUrl}</span></div>
                        <div><span className="text-gray-500">Type:</span> <span className="font-medium">{watchedData.businessType}</span></div>
                        {watchedData.primaryCategories.length > 0 && (
                          <div className="col-span-2">
                            <span className="text-gray-500">Categories:</span>{" "}
                            <span className="font-medium">{watchedData.primaryCategories.join(", ")}</span>
                          </div>
                        )}
                        {(watchedData.otherBusinessDescription || "").trim() && (
                          <div className="col-span-2">
                            <span className="text-gray-500">Description:</span>{" "}
                            <span className="font-medium">{watchedData.otherBusinessDescription}</span>
                          </div>
                        )}
                        {watchedData.businessAddress && <div className="col-span-2"><span className="text-gray-500">Address:</span> <span className="font-medium">{watchedData.businessAddress}</span></div>}
                        {hasLatLng && <div className="col-span-2"><span className="text-gray-500">Coordinates:</span> <span className="font-medium text-green-600">{watchedData.businessLat?.toFixed(4)}, {watchedData.businessLng?.toFixed(4)}</span></div>}
                      </div>
                    </div>

                    {watchedData.serviceAreaCities.length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">Service Area</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {watchedData.serviceAreaCities.map(c => (
                            <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {generatedGroups.filter(g => g.isActive).length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">
                          Service Categories ({generatedGroups.filter(g => g.isActive).length})
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {generatedGroups.filter(g => g.isActive).map(g => (
                            <Badge key={g.name} variant="outline" className="text-xs">
                              {g.name}
                              {g.isHighLevelCategory && <span className="ml-1 text-gray-400">(category)</span>}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {keywordResults.filter(k => k.selected).length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">
                          Target Keywords ({keywordResults.filter(k => k.selected).length})
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {keywordResults.filter(k => k.selected).map(k => (
                            <Badge key={k.keyword} variant="outline" className="text-xs">
                              {k.keyword}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {watchedData.competitors.length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">Competitors ({watchedData.competitors.length})</h4>
                        {watchedData.competitors.map((c, i) => (
                          <div key={i} className="text-sm">{c.name} — <span className="text-gray-500">{c.domain}</span></div>
                        ))}
                      </div>
                    )}

                    {watchedData.businessType === "local" && watchedData.geoGridKeywords.length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">Geo Grid</h4>
                        <div className="text-sm space-y-1">
                          <div><span className="text-gray-500">Keywords:</span> {watchedData.geoGridKeywords.join(", ")}</div>
                          <div><span className="text-gray-500">Grid:</span> {watchedData.geoGridSize}x{watchedData.geoGridSize} @ {watchedData.geoGridSpacingMiles}mi</div>
                        </div>
                      </div>
                    )}

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <h4 className="text-sm font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        Estimated Cost
                      </h4>
                      <div className="space-y-1">
                        {Object.entries(cost.breakdown).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-sm">
                            <span className="text-amber-700">{k}</span>
                            <span className="font-medium text-amber-900">${v.toFixed(2)}</span>
                          </div>
                        ))}
                        <div className="border-t border-amber-300 pt-1 flex justify-between text-sm font-bold">
                          <span className="text-amber-800">Total</span>
                          <span className="text-amber-900">${cost.total.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
              data-testid="button-prev"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>

            {step < STEPS.length - 1 ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={!canAdvance() || generateGroupsMutation.isPending}
                className="bg-[#ff5800] hover:bg-[#e04f00]"
                data-testid="button-next"
              >
                Next <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={async () => {
                  const valid = await form.trigger();
                  if (valid) createAndRunMutation.mutate(form.getValues());
                }}
                disabled={createAndRunMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
                data-testid="button-run-audit"
              >
                {createAndRunMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Run Audit
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </Form>
    </div>
  );
}
