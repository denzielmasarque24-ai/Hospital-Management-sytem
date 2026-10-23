"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/ui/Modal";

import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

export function AuthModal({ open, mode, onClose, onModeChange, message }) {
  const [activeMode, setActiveMode] = useState(mode);

  useEffect(() => {
    setActiveMode(mode);
  }, [mode]);

  const handleSwitchToRegister = () => {
    setActiveMode("register");
    onModeChange("register");
  };

  const handleSwitchToLogin = () => {
    setActiveMode("login");
    onModeChange("login");
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className={`auth-modal-shell${activeMode === "login" ? " auth-modal-login" : ""}`}>
        <button type="button" className="modal-close" aria-label="Close account dialog" onClick={onClose}><span aria-hidden="true">×</span></button>
        <div className="auth-modal-brand" aria-label="MedWell Medical Hospital logo">
          <div className="auth-modal-brand-copy">
            <span className="auth-modal-brand-main">MedWell</span>
            <span className="auth-modal-brand-sub">MEDICAL HOSPITAL</span>
          </div>
        </div>
        <div className="auth-modal-header">
          <h2 id="auth-modal-title">{activeMode === "login" ? "Welcome Back" : "Create Your Account"}</h2>
          <p>{activeMode === "login" ? "Sign in to your MedWell Medical Hospital account." : "Enter your details to create a patient account."}</p>
        </div>
        {message ? <p className="auth-success" role="status">{message}</p> : null}
        {activeMode === "login" ? (
          <LoginForm onClose={onClose} onSwitchToRegister={handleSwitchToRegister} />
        ) : (
          <RegisterForm onClose={onClose} onSwitchToLogin={handleSwitchToLogin} variant="modal" />
        )}
      </div>
    </Modal>
  );
}
