import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductImage } from "./ProductImage";
export { ProductImageFallback } from "./ProductImage";

type ProductCardProps = {
  name: string;
  category: string;
  description: string;
  price: string;
  image: string;
  slug?: string;
  stock?: number;
  available?: boolean;
  href?: string;
  onView?: () => void;
};

export function ProductCard({
  name,
  category,
  description,
  price,
  image,
  slug,
  stock,
  available,
  href = "/products",
  onView,
}: ProductCardProps) {
  return (
    <article className="product-card">
      <div className="product-image-wrap">
        <ProductImage src={image} slug={slug} alt={name} className="product-image" fill />
      </div>
      <div className="product-content">
        <span className="product-tag">{category}</span>
        <h3>{name}</h3>
        <p>{description}</p>
        {stock !== undefined && <span className={`product-stock ${stock === 0 ? "is-out" : available === false ? "is-unavailable" : "is-in"}`}>{stock === 0 ? "Out of Stock" : available === false ? "Unavailable" : "In Stock"}</span>}
        <div className="product-meta">
          <strong>{price}</strong>
          {onView ? (
            <button type="button" onClick={onView} className="btn-outline compact product-view-button">View Product <ArrowRight size={14} aria-hidden="true" /></button>
          ) : (
            <Link href={href} className="btn-outline compact product-view-button">View Product <ArrowRight size={14} aria-hidden="true" /></Link>
          )}
        </div>
      </div>
    </article>
  );
}
