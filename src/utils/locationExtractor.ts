/**
 * Client-side location extraction from Reddit content.
 * Scans subreddit names and text content for known countries, cities, and regions.
 * Supplements the HF model's spaCy NER which can misfire on small text chunks.
 */

// ── Known locations (countries, major cities, regions) ──────────────────────

const LOCATIONS: string[] = [
  // Countries
  'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Armenia', 'Australia',
  'Austria', 'Azerbaijan', 'Bahrain', 'Bangladesh', 'Belarus', 'Belgium',
  'Bolivia', 'Bosnia', 'Brazil', 'Brunei', 'Bulgaria', 'Cambodia', 'Cameroon',
  'Canada', 'Chile', 'China', 'Colombia', 'Congo', 'Costa Rica', 'Croatia',
  'Cuba', 'Cyprus', 'Czechia', 'Denmark', 'Ecuador', 'Egypt', 'England',
  'Estonia', 'Ethiopia', 'Finland', 'France', 'Georgia', 'Germany', 'Ghana',
  'Greece', 'Guatemala', 'Honduras', 'Hungary', 'Iceland', 'India',
  'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica',
  'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Korea', 'Kosovo', 'Kuwait',
  'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Libya', 'Lithuania',
  'Luxembourg', 'Madagascar', 'Malaysia', 'Maldives', 'Mali', 'Malta',
  'Mexico', 'Moldova', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique',
  'Myanmar', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Nigeria',
  'Norway', 'Oman', 'Pakistan', 'Palestine', 'Panama', 'Paraguay', 'Peru',
  'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia',
  'Rwanda', 'Saudi Arabia', 'Scotland', 'Senegal', 'Serbia', 'Singapore',
  'Slovakia', 'Slovenia', 'Somalia', 'South Africa', 'Spain', 'Sri Lanka',
  'Sudan', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan',
  'Tanzania', 'Thailand', 'Tunisia', 'Turkey', 'Turkmenistan', 'Uganda',
  'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States',
  'Uruguay', 'Uzbekistan', 'Venezuela', 'Vietnam', 'Wales', 'Yemen',
  'Zambia', 'Zimbabwe',

  // Common abbreviations
  'USA', 'UK', 'UAE',

  // Regions / disputed territories
  'Kashmir', 'Crimea', 'Tibet', 'Hong Kong', 'Macau', 'Puerto Rico',
  'Europe', 'Asia', 'Africa', 'Middle East',

  // Major cities — Pakistan
  'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Peshawar', 'Faisalabad',
  'Multan', 'Quetta', 'Hyderabad', 'Sialkot', 'Gujranwala', 'Bahawalpur',
  'Abbottabad', 'Mardan', 'Sukkur', 'Larkana', 'Swat',

  // Major cities — India
  'Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad',
  'Jaipur', 'Lucknow', 'Chandigarh', 'Srinagar', 'Goa',

  // Major cities — Middle East
  'Dubai', 'Abu Dhabi', 'Doha', 'Riyadh', 'Jeddah', 'Mecca', 'Medina',
  'Kuwait City', 'Muscat', 'Tehran', 'Baghdad', 'Beirut', 'Amman', 'Damascus',

  // Major cities — Europe
  'London', 'Manchester', 'Birmingham', 'Liverpool', 'Edinburgh', 'Glasgow',
  'Dublin', 'Belfast', 'Paris', 'Berlin', 'Munich', 'Frankfurt', 'Rome',
  'Milan', 'Madrid', 'Barcelona', 'Amsterdam', 'Brussels', 'Zurich',
  'Geneva', 'Vienna', 'Warsaw', 'Prague', 'Budapest', 'Copenhagen',
  'Stockholm', 'Oslo', 'Helsinki', 'Athens', 'Bucharest', 'Lisbon',
  'Moscow', 'Kyiv', 'Istanbul', 'Ankara',

  // Major cities — Americas
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'San Francisco',
  'Seattle', 'Boston', 'Miami', 'Atlanta', 'Dallas', 'Denver', 'Detroit',
  'Philadelphia', 'Washington DC', 'San Diego', 'Portland', 'Austin',
  'Nashville', 'Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa',
  'Mexico City', 'São Paulo', 'Rio de Janeiro', 'Buenos Aires', 'Santiago',
  'Lima', 'Bogota',

  // Major cities — Asia-Pacific
  'Tokyo', 'Seoul', 'Beijing', 'Shanghai', 'Shenzhen', 'Guangzhou',
  'Bangkok', 'Jakarta', 'Manila', 'Ho Chi Minh City', 'Kuala Lumpur',
  'Taipei', 'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Auckland',
  'Wellington',

  // Major cities — Africa
  'Cairo', 'Casablanca', 'Lagos', 'Nairobi', 'Johannesburg', 'Cape Town',
  'Addis Ababa', 'Dar es Salaam', 'Accra', 'Tunis', 'Algiers',

  // US states (commonly referenced)
  'California', 'Texas', 'Florida', 'New York', 'Ohio', 'Michigan',
  'Pennsylvania', 'Illinois', 'Virginia', 'Colorado', 'Oregon', 'Washington',
  'Massachusetts', 'Minnesota', 'Wisconsin', 'Arizona', 'Nevada', 'Tennessee',
  'North Carolina', 'South Carolina',

  // Pakistani provinces
  'Sindh', 'Punjab', 'Balochistan', 'Gilgit',

  // Indian states
  'Kerala', 'Gujarat', 'Maharashtra', 'Rajasthan', 'Tamil Nadu', 'Karnataka',
  'Bihar', 'Bengal',
];

// Build lookup structures once
const _singleWordMap = new Map<string, string>();
const _multiWordPatterns: { regex: RegExp; name: string }[] = [];

LOCATIONS.forEach(loc => {
  if (loc.includes(' ')) {
    // Multi-word: build regex (case-insensitive, word-boundary)
    const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    _multiWordPatterns.push({
      regex: new RegExp(`\\b${escaped}\\b`, 'i'),
      name: loc,
    });
  } else {
    _singleWordMap.set(loc.toLowerCase(), loc);
  }
});

// Words that spaCy NER commonly misidentifies as locations
const FALSE_POSITIVE_FILTER = new Set([
  'hai', 'bhai', 'yar', 'bro', 'dude', 'man', 'god', 'sir',
  'op', 'mod', 'admin', 'user', 'me', 'you', 'we', 'app',
  'the', 'will', 'may', 'can', 'just', 'like', 'also',
]);

/**
 * Extract locations from Reddit content (subreddits + text).
 * Runs entirely client-side — no API calls.
 */
export function extractLocationsFromContent(
  posts: any[],
  comments: any[]
): string[] {
  const found = new Set<string>();

  // ── 1. Subreddit names as location signals ────────────────────────────
  const seenSubs = new Set<string>();
  [...posts, ...comments].forEach((item: any) => {
    if (item.subreddit) seenSubs.add(item.subreddit.toLowerCase());
  });

  seenSubs.forEach(sub => {
    if (_singleWordMap.has(sub)) {
      found.add(_singleWordMap.get(sub)!);
    }
    // Also check multi-word (rare but possible, e.g. "newyork")
    _multiWordPatterns.forEach(({ regex, name }) => {
      if (regex.test(sub)) found.add(name);
    });
  });

  // ── 2. Text content scan ──────────────────────────────────────────────
  const texts = [
    ...posts.map((p: any) => `${p.title || ''} ${p.selftext || ''}`),
    ...comments.map((c: any) => c.body || ''),
  ];
  const combined = texts.join(' ');

  // Tokenize for single-word lookup (O(n) scan)
  const words = combined.split(/\W+/);
  words.forEach(w => {
    if (w.length < 3) return; // skip very short tokens
    const lower = w.toLowerCase();
    if (_singleWordMap.has(lower)) {
      found.add(_singleWordMap.get(lower)!);
    }
  });

  // Multi-word patterns (regex on full text)
  _multiWordPatterns.forEach(({ regex, name }) => {
    if (regex.test(combined)) found.add(name);
  });

  return Array.from(found);
}

/**
 * Filter HF/spaCy locations to remove known false positives.
 * Returns only locations that pass basic validation.
 */
export function filterHfLocations(locations: string[]): string[] {
  return locations.filter(loc => {
    if (!loc || loc.length < 3) return false;
    if (FALSE_POSITIVE_FILTER.has(loc.toLowerCase())) return false;
    if (loc === 'No specific locations detected') return false;
    if (loc === 'Location detection failed') return false;
    return true;
  });
}

/**
 * Merge local + HF locations, deduplicate (case-insensitive).
 */
export function mergeLocations(local: string[], hf: string[]): string[] {
  const seen = new Map<string, string>(); // lowercase → proper-case
  // Local results have priority for casing
  local.forEach(l => seen.set(l.toLowerCase(), l));
  hf.forEach(l => {
    const lower = l.toLowerCase();
    if (!seen.has(lower)) seen.set(lower, l);
  });
  return Array.from(seen.values());
}
