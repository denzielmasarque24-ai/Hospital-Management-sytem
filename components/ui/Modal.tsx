"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ open, onClose, children }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "Tab" && panelRef.current) {
        const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter((element) => element.getAttribute("aria-hidden") !== "true");
        if (!focusable.length) {
          event.preventDefault();
          panelRef.current.focus();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !panelRef.current.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => {
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} className="modal-panel" onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="auth-modal-title" tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
