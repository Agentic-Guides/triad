/**
 * Channel3 Adapter — universal AI-ready product catalog.
 *
 * Channel3 exposes 50M+ structured, deduplicated products across partner brands
 * and retailers, designed for AI agents to search/compare/monetize. This adapter
 * gives TRIAD's Advocate a real product to argue about.
 *
 * Falls back to a curated MOCK catalog when no CHANNEL3_API_KEY is present,
 * so the demo always runs.
 */

const CHANNEL3_BASE = 'https://api.trychannel3.com';

// Curated fallback catalog (representative categories the tribunal can debate).
const MOCK_CATALOG = [
  { id: 'ch3_hp_001', title: 'Sony WH-1000XM5 Wireless Headphones', brand: 'Sony', price: 348.00, currency: 'USD', category: 'audio', rating: 4.7, url: 'https://example.com/sony-xm5' },
  { id: 'ch3_hp_002', title: 'Refurbished Bose QuietComfort 45', brand: 'Bose', price: 149.00, currency: 'USD', category: 'audio', rating: 4.5, url: 'https://example.com/bose-qc45' },
  { id: 'ch3_laptop_001', title: 'MacBook Air M3 13"', brand: 'Apple', price: 1099.00, currency: 'USD', category: 'computers', rating: 4.8, url: 'https://example.com/mba-m3' },
  { id: 'ch3_laptop_002', title: 'Refurbished ThinkPad X1 Carbon', brand: 'Lenovo', price: 549.00, currency: 'USD', category: 'computers', rating: 4.4, url: 'https://example.com/thinkpad-x1' },
  { id: 'ch3_watch_001', title: 'Seiko Prospex Automatic Diver', brand: 'Seiko', price: 450.00, currency: 'USD', category: 'watches', rating: 4.6, url: 'https://example.com/seiko-diver' },
  { id: 'ch3_watch_002', title: 'Casio G-Shock GA-2100', brand: 'Casio', price: 99.00, currency: 'USD', category: 'watches', rating: 4.5, url: 'https://example.com/gshock' },
  { id: 'ch3_lens_001', title: 'Canon RF 50mm f/1.8 STM', brand: 'Canon', price: 199.00, currency: 'USD', category: 'cameras', rating: 4.7, url: 'https://example.com/canon-rf50' },
  { id: 'ch3_cam_001', title: 'Fujifilm X-T5 Body', brand: 'Fujifilm', price: 1699.00, currency: 'USD', category: 'cameras', rating: 4.8, url: 'https://example.com/xt5' },
  { id: 'ch3_chair_001', title: 'Steelcase Series 2 Office Chair', brand: 'Steelcase', price: 415.00, currency: 'USD', category: 'furniture', rating: 4.5, url: 'https://example.com/steelcase-2' },
  { id: 'ch3_desk_001', title: 'Autonomous SmartDesk Core', brand: 'Autonomous', price: 399.00, currency: 'USD', category: 'furniture', rating: 4.3, url: 'https://example.com/smartdesk' },
];

export class Channel3 {
  constructor(apiKey = process.env.CHANNEL3_API_KEY, { base = CHANNEL3_BASE, mock = false } = {}) {
    this.apiKey = apiKey;
    this.base = base;
    this.mock = mock || !apiKey;
  }

  static fromEnv() {
    return new Channel3(process.env.CHANNEL3_API_KEY);
  }

  get mode() { return this.mock ? 'MOCK' : 'LIVE'; }

  /**
   * Search the product catalog.
   * @param {object} q { query, category, maxPrice, minRating, limit }
   */
  async search(q = {}) {
    if (this.mock) return this._mockSearch(q);

    const params = new URLSearchParams();
    if (q.query) params.set('query', q.query);
    if (q.category) params.set('category', q.category);
    if (q.maxPrice) params.set('max_price', String(q.maxPrice));
    if (q.limit) params.set('limit', String(q.limit || 10));

    const res = await fetch(`${this.base}/v1/search?${params}`, {
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Channel3 ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return this._normalize(data);
  }

  async _mockSearch(q = {}) {
    let items = [...MOCK_CATALOG];
    // Category aliases so free-text categories ("laptop", "headphones") resolve.
    const ALIASES = {
      laptop: 'computers', laptops: 'computers', computer: 'computers', macbook: 'computers',
      headphones: 'audio', headphone: 'audio', speaker: 'audio', earbuds: 'audio',
      watch: 'watches', timepiece: 'watches',
      camera: 'cameras', lens: 'cameras',
      chair: 'furniture', desk: 'furniture', 'office chair': 'furniture', 'standing desk': 'furniture',
    };
    const key = q.category ? String(q.category).toLowerCase().trim() : null;
    const cat = key ? (ALIASES[key] || q.category) : null;
    if (cat) items = items.filter(i => i.category === cat);
    if (q.query) {
      const s = q.query.toLowerCase();
      items = items.filter(i => (i.title + ' ' + i.brand + ' ' + i.category).toLowerCase().includes(s));
    }
    if (q.maxPrice) items = items.filter(i => i.price <= q.maxPrice);
    if (q.minRating) items = items.filter(i => i.rating >= q.minRating);
    return items.slice(0, q.limit || 10);
  }

  _normalize(data) {
    const list = data.products || data.results || data.data || (Array.isArray(data) ? data : []);
    return list.map(p => ({
      id: p.id || p.product_id || `ch3_${Math.random().toString(36).slice(2, 8)}`,
      title: p.title || p.name || 'Unknown product',
      brand: p.brand || p.merchant || '',
      price: Number(p.price || p.lowest_price || 0),
      currency: p.currency || 'USD',
      category: p.category || '',
      rating: Number(p.rating || 0),
      url: p.url || p.link || '',
    }));
  }
}
