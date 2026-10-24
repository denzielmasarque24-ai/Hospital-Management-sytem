"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { loadProducts } from "@/lib/admin/products";
import { supabase } from "@/lib/supabase/client";
import { type Product } from "@/lib/admin/mockData";
import { formatPhp } from "@/lib/currency";
import { ProductCard } from "./ProductCard";
import { ProductImage, ProductImageFallback } from "./ProductImage";

const CATEGORY_ORDER = ["Prescription Medicines", "Over-the-Counter", "Vitamins & Supplements", "Medical Devices", "Personal Care", "Wellness Products", "Surgical Instruments", "Operating Room Supplies"];

function categoryKey(value: string) {
  const key = value.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
  if (key === "otc" || key === "over the counter products") return "over the counter";
  if (key === "prescription medicine") return "prescription medicines";
  return key;
}

export function ProductCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isSampleData, setIsSampleData] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<Product | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError(false);
    void loadProducts().then(({ products: rows, source, error }) => {
      if (!active) return;
      setProducts(source === "sample" ? [] : rows);
      setSelected((current) => current ? rows.find((row) => row.id === current.id) ?? null : null);
      setIsSampleData(source === "sample");
      setLoadError(Boolean(error));
      setIsLoading(false);
    }).catch(() => {
      if (!active) return;
      setProducts([]);
      setIsSampleData(false);
      setLoadError(true);
      setIsLoading(false);
    });
    return () => { active = false; };
  }, [reloadKey]);

  const categoryOptions = useMemo(() => {
    const options: string[] = [...CATEGORY_ORDER];
    for (const product of products) {
      const actual = product.category.trim();
      if (actual && !options.some((option) => categoryKey(option) === categoryKey(actual))) options.push(actual);
    }
    return options;
  }, [products]);

  const filteredProducts = useMemo(() => {
    const search = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === "All" || categoryKey(product.category) === categoryKey(category);
      const matchesSearch = !search || [product.name, product.category, product.sku, product.description]
        .some((value) => value.toLowerCase().includes(search));
      return matchesCategory && matchesSearch;
    });
  }, [products, category, query]);

  useEffect(() => {
    const refresh = () => setReloadKey((key) => key + 1);
    window.addEventListener("focus", refresh);
    const refreshVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", refreshVisible);
    const interval = window.setInterval(refreshVisible, 30_000);
    const channel = supabase?.channel("public-product-catalog").on("postgres_changes", { event: "*", schema: "public", table: "products" }, refresh).subscribe();
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.clearInterval(interval);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
      if (event.key === "Tab") { event.preventDefault(); closeRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      previousFocus?.focus();
    };
  }, [selected?.id]);

  const clearFilters = () => { setQuery(""); setCategory("All"); };

  return (
    <div className="catalog-shell">
      <div className="catalog-controls">
        <div className="catalog-search-wrap">
          <Search size={19} aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search medicines, medical supplies, and wellness products..." aria-label="Search products" />
          {query && <button type="button" className="catalog-search-clear" onClick={() => setQuery("")} aria-label="Clear product search"><X size={17} /></button>}
        </div>
        <div className="category-filter" aria-label="Choose product category">
          <button type="button" className={category === "All" ? "filter-chip active" : "filter-chip"} aria-pressed={category === "All"} onClick={() => setCategory("All")}>All Products</button>
          {categoryOptions.map((item) => <button key={item} type="button" className={category === item ? "filter-chip active" : "filter-chip"} aria-pressed={category === item} onClick={() => setCategory(category === item ? "All" : item)}>{item}</button>)}
        </div>
        {(category !== "All" || query) && <button type="button" className="catalog-reset" onClick={clearFilters}>Clear search and filters</button>}
      </div>

      {isSampleData && <p className="catalog-data-note" role="status">The live product catalog is not configured. Sample entries are hidden here.</p>}
      {isLoading && <div className="product-grid product-loading-grid" role="status" aria-label="Loading products">{Array.from({ length: 4 }).map((_, i) => <div className="product-loading-card" key={i}><span /><div><i /><i /><i /></div></div>)}</div>}
      {loadError && !isLoading && <div className="catalog-error" role="alert"><span>The product catalog is temporarily unavailable.</span><button type="button" onClick={() => setReloadKey((key) => key + 1)}>Retry</button></div>}

      {!isLoading && !loadError && !isSampleData && <>
        <p className="catalog-result-count" role="status">Showing <strong>{filteredProducts.length}</strong> of {products.length} products</p>
        {filteredProducts.length > 0 ? <div className="product-grid">
          {filteredProducts.map((product) => <ProductCard key={product.id} name={product.name} slug={product.slug} category={product.category} description={product.description} price={formatPhp(product.price)} image={product.image ?? ""} stock={product.stock} available={product.available} onView={() => setSelected(product)} />)}
        </div> : <div className="empty-state" role="status">{products.length === 0 ? "No products are currently listed in the hospital catalog." : "No products match your search or selected category."}</div>}
      </>}

      {selected && <div className="catalog-product-backdrop" onClick={() => setSelected(null)}>
        <section className="catalog-product-dialog" role="dialog" aria-modal="true" aria-labelledby="catalog-product-title" onClick={(event) => event.stopPropagation()}>
          <button type="button" ref={closeRef} className="catalog-product-close" onClick={() => setSelected(null)} aria-label="Close product details">×</button>
          <div className="catalog-product-visual"><ProductImage src={selected.image} slug={selected.slug} alt={selected.name} className="catalog-product-image" fill fallback={<ProductImageFallback />} /></div>
          <div className="catalog-product-info"><span className="product-tag">{selected.category}</span><h2 id="catalog-product-title">{selected.name}</h2><p>{selected.description}</p><strong>{formatPhp(selected.price)}</strong><p>{selected.stock === 0 ? "Out of Stock" : selected.available === false ? "Unavailable" : "In Stock"}</p>{selected.prescriptionRequired && <span className="product-prescription">Prescription required</span>}{selected.sku ? <small>SKU: {selected.sku}</small> : null}</div>
        </section>
      </div>}
    </div>
  );
}
