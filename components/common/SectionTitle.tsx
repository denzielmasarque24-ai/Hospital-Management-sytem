type SectionTitleProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  centered?: boolean;
  light?: boolean;
};

export function SectionTitle({
  eyebrow,
  title,
  description,
  centered = false,
  light = false,
}: SectionTitleProps) {
  return (
    <div className={centered ? "section-heading section-heading-centered" : "section-heading"}>
      {eyebrow ? <span className={light ? "section-eyebrow light" : "section-eyebrow"}>{eyebrow}</span> : null}
      <h2 dangerouslySetInnerHTML={{ __html: title }} />
      {description ? <p>{description}</p> : null}
    </div>
  );
}
