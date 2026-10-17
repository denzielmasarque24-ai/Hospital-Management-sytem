import Link from "next/link";

type NavItem = {
  href: string;
  label: string;
};

type MobileMenuProps = {
  items: NavItem[];
  currentPath: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenAuth: (mode: "login" | "register") => void;
};

export function MobileMenu({ items, currentPath, isOpen, onClose, onOpenAuth }: MobileMenuProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="mobile-panel" role="dialog" aria-modal="true" aria-label="Mobile menu">
      <div className="mobile-panel-inner">
        {items.map((item) => {
          const isActive =
            currentPath === item.href ||
            (item.href !== "/" && currentPath.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={isActive ? "mobile-link active" : "mobile-link"}
            >
              {item.label}
            </Link>
          );
        })}

        <div className="mobile-auth-links">
          <button type="button" onClick={() => { onOpenAuth("login"); onClose(); }} className="mobile-auth-link">
            Log In
          </button>
          <button type="button" onClick={() => { onOpenAuth("register"); onClose(); }} className="mobile-auth-link accent">
            Register
          </button>
        </div>
      </div>
    </div>
  );
}
