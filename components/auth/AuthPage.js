"use client";

import { Suspense } from "react";

import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

export function AuthPage({ mode }) {
  const isLogin = mode === "login";

  return (
    <section className="auth-page">
      <div className="container">
        <div className="auth-layout">
          <div className="auth-visual">
            <div className="auth-visual-inner">
              <div className="auth-brand compact">
                <span className="auth-brand-icon">+</span>
                <span className="auth-brand-text"><strong>MediWell</strong><span>HOSPITAL</span></span>
              </div>
              <div className="auth-visual-copy">
                <h1>Your care, connected.</h1>
                <p>Sign in to manage your MediWell experience with care teams you can trust.</p>
              </div>
            </div>
          </div>
          <div className="auth-panel">
            <div className="auth-card">
              <div className="auth-header">
                <h1>{isLogin ? "Welcome Back" : "Create Your Account"}</h1>
                <p>{isLogin ? "Sign in with your registered email and password." : "Create a patient account to get started."}</p>
              </div>
              {isLogin ? (
                <Suspense fallback={null}>
                  <LoginForm />
                </Suspense>
              ) : (
                <RegisterForm />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}