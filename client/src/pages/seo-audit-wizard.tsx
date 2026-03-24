import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  Users, Grid3X3, Search
} from "lucide-react";

interface WizardData {
  businessName: string;
  businessUrl: string;
  businessAddress: string;
  businessType: "local" | "national";
  industry: string;
  serviceAreaCities: string[];
  services: string[];
  competitors: Array<{ name: string; domain: string }>;
  geoGridKeywords: string[];
  geoGridSize: number;
  geoGridSpacingMiles: number;
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

const GRID_SIZES = [
  { value: 7, label: "7×7 (49 points)" },
  { value: 13, label: "13×13 (169 points)" },
  { value: 15, label: "15×15 (225 points)" },
];

const SPACING_OPTIONS = [
  { value: 0.5, label: "0.5 mi" },
  { value: 1, label: "1 mi" },
  { value: 2, label: "2 mi" },
  { value: 3, label: "3 mi" },
];

const STEPS = ["Business Info", "Service Area", "Services", "Competitors", "Geo Grid", "Review & Run"];

function estimateCost(data: WizardData): { total: number; breakdown: Record<string, number> } {
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

export default function SeoAuditWizard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [cityInput, setCityInput] = useState("");
  const [cityState, setCityState] = useState("");
  const [serviceInput, setServiceInput] = useState("");
  const [compName, setCompName] = useState("");
  const [compDomain, setCompDomain] = useState("");

  const [data, setData] = useState<WizardData>({
    businessName: "",
    businessUrl: "",
    businessAddress: "",
    businessType: "local",
    industry: "",
    serviceAreaCities: [],
    services: [],
    competitors: [],
    geoGridKeywords: [],
    geoGridSize: 13,
    geoGridSpacingMiles: 1,
  });

  const update = useCallback((partial: Partial<WizardData>) => {
    setData(prev => ({ ...prev, ...partial }));
  }, []);

  const createAndRunMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/seo-audits", {
        businessName: data.businessName,
        businessUrl: data.businessUrl,
        businessAddress: data.businessAddress || undefined,
        businessType: data.businessType,
        industry: data.industry || undefined,
        serviceAreaCities: data.serviceAreaCities,
        services: data.services,
        competitors: data.competitors.filter(c => c.name || c.domain),
        geoGridKeywords: data.geoGridKeywords,
        geoGridSize: data.geoGridSize,
        geoGridSpacingMiles: data.geoGridSpacingMiles,
      }, { useAdminAuth: true });
      const audit = await res.json();

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

  const canAdvance = (): boolean => {
    switch (step) {
      case 0: return data.businessName.length > 0 && data.businessUrl.length > 0;
      case 1: return data.businessType === "national" || data.serviceAreaCities.length > 0;
      case 2: return data.services.length > 0;
      case 3: return true;
      case 4: return true;
      case 5: return true;
      default: return false;
    }
  };

  const addCity = () => {
    const city = cityState ? `${cityInput.trim()}, ${cityState}` : cityInput.trim();
    if (city && !data.serviceAreaCities.includes(city)) {
      update({ serviceAreaCities: [...data.serviceAreaCities, city] });
    }
    setCityInput("");
    setCityState("");
  };

  const addService = () => {
    const svc = serviceInput.trim();
    if (svc && !data.services.includes(svc)) {
      update({ services: [...data.services, svc] });
    }
    setServiceInput("");
  };

  const addCompetitor = () => {
    if ((compName.trim() || compDomain.trim()) && data.competitors.length < 3) {
      update({
        competitors: [...data.competitors, { name: compName.trim(), domain: compDomain.trim() }],
      });
    }
    setCompName("");
    setCompDomain("");
  };

  const toggleGeoKeyword = (kw: string) => {
    const current = data.geoGridKeywords;
    if (current.includes(kw)) {
      update({ geoGridKeywords: current.filter(k => k !== kw) });
    } else if (current.length < 5) {
      update({ geoGridKeywords: [...current, kw] });
    }
  };

  const cost = estimateCost(data);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/seo-audits")} data-testid="button-back-to-list">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Audits
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-4" data-testid="text-wizard-title">New SEO Audit</h1>
        <div className="flex items-center gap-1">
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

      <Card className="border border-gray-200 shadow-sm">
        <CardContent className="p-6">
          {step === 0 && (
            <div className="space-y-5">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building2 className="w-5 h-5 text-[#ff5800]" />
                  Business Information
                </CardTitle>
              </CardHeader>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="businessName">Business Name *</Label>
                  <Input
                    id="businessName"
                    value={data.businessName}
                    onChange={e => update({ businessName: e.target.value })}
                    placeholder="Acme Plumbing Co."
                    data-testid="input-business-name"
                  />
                </div>
                <div>
                  <Label htmlFor="businessUrl">Website URL *</Label>
                  <Input
                    id="businessUrl"
                    value={data.businessUrl}
                    onChange={e => update({ businessUrl: e.target.value })}
                    placeholder="https://acmeplumbing.com"
                    data-testid="input-business-url"
                  />
                </div>
                <div>
                  <Label htmlFor="businessAddress">Business Address</Label>
                  <Input
                    id="businessAddress"
                    value={data.businessAddress}
                    onChange={e => update({ businessAddress: e.target.value })}
                    placeholder="123 Main St, Minneapolis, MN 55401"
                    data-testid="input-business-address"
                  />
                </div>
                <div>
                  <Label>Business Type</Label>
                  <RadioGroup
                    value={data.businessType}
                    onValueChange={(v) => update({ businessType: v as "local" | "national" })}
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
                </div>
                <div>
                  <Label>Industry</Label>
                  <Select value={data.industry} onValueChange={(v) => update({ industry: v })}>
                    <SelectTrigger data-testid="select-industry">
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map(ind => (
                        <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MapPin className="w-5 h-5 text-[#ff5800]" />
                  Service Area
                </CardTitle>
              </CardHeader>

              {data.businessType === "national" ? (
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
                      <SelectContent>
                        {US_STATES.map(st => (
                          <SelectItem key={st} value={st}>{st}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={addCity} variant="outline" data-testid="button-add-city">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>

                  {data.serviceAreaCities.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {data.serviceAreaCities.map(city => (
                        <Badge key={city} variant="secondary" className="flex items-center gap-1 px-3 py-1.5">
                          <MapPin className="w-3 h-3" />
                          {city}
                          <button
                            onClick={() => update({ serviceAreaCities: data.serviceAreaCities.filter(c => c !== city) })}
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
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Search className="w-5 h-5 text-[#ff5800]" />
                  Services
                </CardTitle>
              </CardHeader>

              <p className="text-sm text-gray-500">
                Add the services this business offers. These will be used for keyword research and content gap analysis.
              </p>

              <div className="flex gap-2">
                <Input
                  value={serviceInput}
                  onChange={e => setServiceInput(e.target.value)}
                  placeholder="e.g. Drain Cleaning"
                  onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addService())}
                  className="flex-1"
                  data-testid="input-service"
                />
                <Button onClick={addService} variant="outline" data-testid="button-add-service">
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>

              {data.services.length > 0 ? (
                <div className="space-y-2">
                  {data.services.map((svc, i) => (
                    <div key={svc} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                      <span className="text-sm font-medium">{svc}</span>
                      <button
                        onClick={() => update({ services: data.services.filter((_, j) => j !== i) })}
                        className="text-gray-400 hover:text-red-500"
                        data-testid={`button-remove-service-${i}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Add at least one service.</p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="w-5 h-5 text-[#ff5800]" />
                  Competitors (up to 3)
                </CardTitle>
              </CardHeader>

              <p className="text-sm text-gray-500">
                Add up to 3 competitors to compare against. Leave blank if you want the pipeline to skip competitive analysis.
              </p>

              {data.competitors.length < 3 && (
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
                  <Button onClick={addCompetitor} variant="outline" data-testid="button-add-competitor">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {data.competitors.length > 0 ? (
                <div className="space-y-2">
                  {data.competitors.map((comp, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium">{comp.name || "—"}</span>
                        <span className="text-sm text-gray-400">{comp.domain}</span>
                      </div>
                      <button
                        onClick={() => update({ competitors: data.competitors.filter((_, j) => j !== i) })}
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

          {step === 4 && (
            <div className="space-y-5">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Grid3X3 className="w-5 h-5 text-[#ff5800]" />
                  Geo Grid Configuration
                </CardTitle>
              </CardHeader>

              {data.businessType === "national" ? (
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
                    {data.services.length > 0 ? (
                      <div className="space-y-2">
                        {data.services.map(svc => (
                          <div key={svc} className="flex items-center space-x-2">
                            <Checkbox
                              id={`geo-kw-${svc}`}
                              checked={data.geoGridKeywords.includes(svc)}
                              onCheckedChange={() => toggleGeoKeyword(svc)}
                              disabled={!data.geoGridKeywords.includes(svc) && data.geoGridKeywords.length >= 5}
                              data-testid={`checkbox-geo-keyword-${svc}`}
                            />
                            <Label htmlFor={`geo-kw-${svc}`} className="font-normal text-sm">{svc}</Label>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No services added. Go back to Step 3 to add services.</p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      {data.geoGridKeywords.length}/5 selected
                    </p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-3 block">Grid Size</Label>
                    <RadioGroup
                      value={String(data.geoGridSize)}
                      onValueChange={v => update({ geoGridSize: parseInt(v) })}
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
                      value={String(data.geoGridSpacingMiles)}
                      onValueChange={v => update({ geoGridSpacingMiles: parseFloat(v) })}
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

                  {data.geoGridKeywords.length > 0 && (
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-blue-700 text-sm font-medium mb-1">
                        <Grid3X3 className="w-4 h-4" />
                        Grid Preview
                      </div>
                      <p className="text-sm text-blue-600">
                        {data.geoGridKeywords.length} keyword{data.geoGridKeywords.length !== 1 ? "s" : ""} × {data.geoGridSize}×{data.geoGridSize} grid ({data.geoGridSize * data.geoGridSize} points) @ {data.geoGridSpacingMiles}mi spacing
                      </p>
                      <p className="text-xs text-blue-500 mt-1">
                        Total API calls: {data.geoGridKeywords.length * data.geoGridSize * data.geoGridSize}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 5 && (
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
                    <div><span className="text-gray-500">Name:</span> <span className="font-medium">{data.businessName}</span></div>
                    <div><span className="text-gray-500">URL:</span> <span className="font-medium">{data.businessUrl}</span></div>
                    <div><span className="text-gray-500">Type:</span> <span className="font-medium">{data.businessType}</span></div>
                    {data.industry && <div><span className="text-gray-500">Industry:</span> <span className="font-medium">{data.industry}</span></div>}
                    {data.businessAddress && <div className="col-span-2"><span className="text-gray-500">Address:</span> <span className="font-medium">{data.businessAddress}</span></div>}
                  </div>
                </div>

                {data.serviceAreaCities.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">Service Area</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {data.serviceAreaCities.map(c => (
                        <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">Services ({data.services.length})</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {data.services.map(s => (
                      <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                </div>

                {data.competitors.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">Competitors ({data.competitors.length})</h4>
                    {data.competitors.map((c, i) => (
                      <div key={i} className="text-sm">{c.name} — <span className="text-gray-500">{c.domain}</span></div>
                    ))}
                  </div>
                )}

                {data.businessType === "local" && data.geoGridKeywords.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">Geo Grid</h4>
                    <div className="text-sm space-y-1">
                      <div><span className="text-gray-500">Keywords:</span> {data.geoGridKeywords.join(", ")}</div>
                      <div><span className="text-gray-500">Grid:</span> {data.geoGridSize}×{data.geoGridSize} @ {data.geoGridSpacingMiles}mi</div>
                    </div>
                  </div>
                )}

                <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                  <h4 className="text-sm font-bold text-orange-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    Estimated Cost
                  </h4>
                  <div className="space-y-1">
                    {Object.entries(cost.breakdown).filter(([, v]) => v > 0).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-sm">
                        <span className="text-orange-700">{k}</span>
                        <span className="font-medium text-orange-800">${v.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-bold border-t border-orange-200 pt-1 mt-1">
                      <span className="text-orange-800">Total</span>
                      <span className="text-orange-900">${cost.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between mt-8 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
              data-testid="button-prev-step"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>

            {step < STEPS.length - 1 ? (
              <Button
                onClick={() => setStep(s => s + 1)}
                disabled={!canAdvance()}
                className="bg-[#ff5800] hover:bg-[#e04f00]"
                data-testid="button-next-step"
              >
                Next <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={() => createAndRunMutation.mutate()}
                disabled={createAndRunMutation.isPending}
                className="bg-[#ff5800] hover:bg-[#e04f00]"
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
        </CardContent>
      </Card>
    </div>
  );
}
