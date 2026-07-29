/**
 * NOVOOI Tilbudsagent — Cloudflare Worker
 *
 * Routes:
 *   POST /          → Anthropic API proxy (tilbudsgenerering)
 *   GET  /woo?q=    → WooCommerce produktsøk (navn + brand)
 *   GET  /woo/variations?id= → WooCommerce varianter
 *   GET  /img?url=  → Bildeproxy (base64 for PDF-eksport)
 *
 * Secrets (Worker → Settings → Variables → Encrypted):
 *   ANTHROPIC_API_KEY
 *   WOO_CONSUMER_KEY
 *   WOO_CONSUMER_SECRET
 */

const WOO_BASE = "https://www.novooi.com/wp-json/wc/v3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // ── Image proxy (base64) — bypasses CORS for PDF export ─────────────────
    if (url.pathname === "/img") {
      if (request.method !== "GET") return json({ error: "GET only" }, 405);
      const imgUrl = url.searchParams.get("url");
      if (!imgUrl) return json({ error: "Missing ?url=" }, 400);

      try {
        const imgRes = await fetch(imgUrl, {
          headers: { "Accept": "image/*" }
        });
        if (!imgRes.ok) return json({ error: "Image fetch failed: " + imgRes.status }, 502);

        const contentType = imgRes.headers.get("content-type") || "image/jpeg";
        const buffer = await imgRes.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const b64 = btoa(binary);
        return json({ data: `data:${contentType};base64,${b64}`, type: contentType });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // ── WooCommerce variations ──────────────────────────────────────────────
    if (url.pathname === "/woo/variations") {
      if (request.method !== "GET") return json({ error: "GET only" }, 405);
      const productId = url.searchParams.get("id");
      if (!productId) return json({ error: "Missing ?id=" }, 400);
      const perPage = url.searchParams.get("per_page") || "50";
      const auth = btoa(`${env.WOO_CONSUMER_KEY}:${env.WOO_CONSUMER_SECRET}`);
      const varUrl = `${WOO_BASE}/products/${productId}/variations?per_page=${perPage}&status=publish`;
      try {
        const res = await fetch(varUrl, {
          headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" }
        });
        const body = await res.text();
        if (!res.ok) return json({ error: `WooCommerce ${res.status}`, detail: body.slice(0, 200) }, 502);
        const variations = JSON.parse(body);
        const slim = variations.map(v => ({
          id: v.id,
          price: v.price || "",
          sku: v.sku || "",
          image: v.image ? { src: v.image.src } : null,
          attributes: (v.attributes || []).map(a => ({ name: a.name, option: a.option })),
        }));
        return json(slim);
      } catch (e) { return json({ error: e.message }, 500); }
    }

    // ── WooCommerce product search ────────────────────────────────────────
    if (url.pathname === "/woo") {
      if (request.method !== "GET") return json({ error: "GET only" }, 405);

      const q = url.searchParams.get("q") || "";
      if (!q) return json({ error: "Missing query param: q" }, 400);

      const perPage = parseInt(url.searchParams.get("per_page") || "24");
      const auth = btoa(`${env.WOO_CONSUMER_KEY}:${env.WOO_CONSUMER_SECRET}`);
      const headers = {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      };

      try {
        // Run name search and brand lookup in parallel
        const nameUrl  = `${WOO_BASE}/products?search=${encodeURIComponent(q)}&per_page=${perPage}&status=publish&orderby=popularity&order=desc`;
        const brandUrl = `${WOO_BASE}/products/brands?search=${encodeURIComponent(q)}&per_page=5`;

        const [nameRes, brandRes] = await Promise.all([
          fetch(nameUrl, { headers }),
          fetch(brandUrl, { headers }).catch(() => null), // endpoint may not exist on older WooCommerce
        ]);

        const nameBody = await nameRes.text();
        if (!nameRes.ok) {
          return json({ error: `WooCommerce ${nameRes.status}`, detail: nameBody.slice(0, 300) }, 502);
        }

        let products = JSON.parse(nameBody);

        // If brand endpoint responded with matches, also fetch products by brand
        if (brandRes && brandRes.ok) {
          const brands = await brandRes.json().catch(() => []);
          if (Array.isArray(brands) && brands.length > 0) {
            const brandIds = brands.map(b => b.id).join(",");
            const byBrandUrl = `${WOO_BASE}/products?brand=${encodeURIComponent(brandIds)}&per_page=${perPage}&status=publish&orderby=popularity&order=desc`;
            const byBrandRes = await fetch(byBrandUrl, { headers }).catch(() => null);
            if (byBrandRes && byBrandRes.ok) {
              const byBrandProducts = await byBrandRes.json().catch(() => []);
              // Merge, deduplicate by id — brand results first so they appear at the top
              const seen = new Set(products.map(p => p.id));
              const fresh = byBrandProducts.filter(p => !seen.has(p.id));
              products = [...fresh, ...products]; // brand hits first
            }
          }
        }

        const slim = products.map(p => ({
          id: p.id,
          name: p.name,
          sku: p.sku || "",
          price: p.price || "",
          regular_price: p.regular_price || "",
          permalink: p.permalink || "",
          type: p.type || "simple",
          variations: p.variations || [],
          images: (p.images || []).slice(0, 1).map(img => ({ src: img.src })),
          brands: p.brands || [],
          categories: (p.categories || []).map(c => c.name),
          _brand: extractBrand(p),
        }));

        return json(slim);
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // ── Anthropic API proxy ───────────────────────────────────────────────
    if (url.pathname === "/" && request.method === "POST") {
      try {
        const body = await request.json();
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return json(data, res.status);
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    return json({ error: "Not found" }, 404);
  },
};

function extractBrand(p) {
  if (p.brands && p.brands[0]) return p.brands[0].name;
  if (p.attributes) {
    const a = p.attributes.find(x =>
      ["brand", "merke", "merkevare"].includes(x.name.toLowerCase())
    );
    if (a && a.options && a.options[0]) return a.options[0];
  }
  if (p.sku && p.sku.includes("-")) {
    const prefix = p.sku.split("-")[0];
    if (prefix.length > 2 && prefix.length < 12) return prefix;
  }
  return "";
}
