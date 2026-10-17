"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/ui/Modal";

import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

export function AuthModal({ open, mode, onClose, onModeChange }) {
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
      <div className="auth-modal-shell">
        <button type="button" className="modal-close" aria-label="Close login modal" onClick={onClose}>×</button>
        <div className="auth-modal-brand" aria-label="MediWell Pharma logo">
          <div className="auth-modal-brand-copy">
            <span className="auth-modal-brand-main">MediWell</span>
            <span className="auth-modal-brand-sub">PHARMA</span>
          </div>
        </div>
        <div className="auth-modal-header">
          <h2>{activeMode === "login" ? "Welcome Back" : "Create Your Account"}</h2>
          <p>{activeMode === "login" ? "Sign in to your MediWell Pharma account." : "Create your MediWell Pharma account."}</p>
        </div>
        {activeMode === "login" ? (
          <LoginForm onClose={onClose} onSwitchToRegister={handleSwitchToRegister} />
        ) : (
          <RegisterForm onClose={onClose} onSwitchToLogin={handleSwitchToLogin} />
        )}
      </div>
    </Modal>
  );
}