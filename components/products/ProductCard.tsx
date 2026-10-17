import Link from "next/link";

type ProductCardProps = {
  name: string;
  category: string;
  description: string;
  price: string;
  image: string;
  href?: string;
  onView?: () => void;
};

export function ProductCard({
  name,
  category,
  description,
  price,
  image,
  href = "/products",
  onView,
}: ProductCardProps) {
  return (
    <article className="product-card">
      <div className="product-image-wrap">
        {image ? <img src={image} alt={name} className="product-image" /> : <div className="product-image-placeholder">MediWell Pharma</div>}
      </div>
      <div className="product-content">
        <span className="product-tag">{category}</span>
        <h3>{name}</h3>
        <p>{description}</p>
        <div className="product-meta">
          <strong>{price}</strong>
          {onView ? (
            <button type="button" onClick={onView} className="btn-outline compact product-view-button">View Product</button>
          ) : (
            <Link href={href} className="btn-outline compact product-view-button">View Product</Link>
          )}
        </div>
      </div>
    </article>
  );
}
