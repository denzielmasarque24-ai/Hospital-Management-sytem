"use client";

import { useEffect, useMemo, useState } from "react";

import { loadProducts } from "@/lib/admin/products";
import { type Product } from "@/lib/admin/mockData";
import { formatPhp } from "@/lib/currency";
import { ProductCard } from "./ProductCard";

const categories = [
  "Prescription Medicines",
  "Over-the-Counter",
  "Vitamins & Supplements",
  "Medical Devices",
  "Personal Care",
  "Wellness Products",
];

export function ProductCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isSampleData, setIsSampleData] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<Product | null>(null);

  useEffect(() => {
    let active = true;
    void loadProducts().then(({ products: rows, source, error }) => {
      if (!active) return;
      setProducts(rows.filter((product) => product.status === "active"));
      setIsSampleData(source === "sample");
      setLoadError(error ?? "");
      setIsLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setLoadError(error instanceof Error ? error.message : "Products could not be loaded.");
      setIsLoading(false);
    });
    return () => { active = false; };
  }, []);

  const filteredProducts = useMemo(() => {
    const search = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === "All" || product.category === category;
      const matchesSearch = !search || [product.name, product.category, product.sku, product.description]
        .some((value) => value.toLowerCase().includes(search));
      return matchesCategory && matchesSearch;
    });
  }, [products, category, query]);

  return (
    <div className="catalog-shell">
      <div className="catalog-controls">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search medicines, wellness products, and more"
          aria-label="Search products"
        />

        <div className="category-filter" aria-label="Choose product category">
          <button type="button" className={category === "All" ? "filter-chip active" : "filter-chip"} aria-pressed={category === "All"} onClick={() => setCategory("All")}>All</button>
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              className={category === item ? "filter-chip active" : "filter-chip"}
              aria-pressed={category === item}
              onClick={() => setCategory(category === item ? "All" : item)}
            >
              {item}
            </button>
          ))}
        </div>
        {category !== "All" ? (
          <button type="button" className="catalog-reset" onClick={() => setCategory("All")}>
            Show all products
          </button>
        ) : null}
      </div>

      {isSampleData ? <p className="catalog-data-note">Showing sample products. Database changes are not connected in this session.</p> : null}
      {loadError ? <p className="catalog-error" role="alert">Products could not be loaded: {loadError}</p> : null}
      {isLoading ? <p className="empty-state" role="status">Loading products…</p> : null}

      <div className="product-grid">
        {filteredProducts.map((product) => (
          <ProductCard
            key={product.id}
            name={product.name}
            category={product.category}
            description={product.description}
            price={formatPhp(product.price)}
            image={product.image ?? ""}
            onView={() => setSelected(product)}
          />
        ))}
      </div>

      {!isLoading && filteredProducts.length === 0 ? (
        <div className="empty-state">{loadError ? "The catalog is temporarily unavailable." : "No products match your search."}</div>
      ) : null}

      {selected ? (
        <div className="catalog-product-backdrop" onClick={() => setSelected(null)}>
          <section className="catalog-product-dialog" role="dialog" aria-modal="true" aria-labelledby="catalog-product-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="catalog-product-close" onClick={() => setSelected(null)} aria-label="Close product details">×</button>
            {selected.image ? <img src={selected.image} alt={selected.name} /> : <div className="product-image-placeholder">MediWell Pharma</div>}
            <div className="catalog-product-info">
              <span className="product-tag">{selected.category}</span>
              <h2 id="catalog-product-title">{selected.name}</h2>
              <p>{selected.description}</p>
              <strong>{formatPhp(selected.price)}</strong>
              {selected.sku ? <small>SKU: {selected.sku}</small> : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
