/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Wolfgang Brangl <https://ontheia.ai>
 *
 * This file is part of Ontheia.
 *
 * Ontheia is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Ontheia is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Ontheia.  If not, see <https://www.gnu.org/licenses/>.
 *
 * For commercial licensing inquiries, please see LICENSE-COMMERCIAL.md
 * or contact https://ontheia.ai
 */
import { useEffect, useState } from "react"
import { Link, Navigate, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { LoginForm } from "@/components/login-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/auth-context"
import LogoOntheia from '@/assets/logo_anima_trans_60x60.png'
import { localizeError } from "@/lib/error-utils"

export function LoginPage() {
  const { t, i18n } = useTranslation(["auth", "errors"])
  const { login, loading, isAuthenticated } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/chat", { replace: true })
    }
  }, [loading, isAuthenticated, navigate])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") ?? "").trim()
    const password = String(formData.get("password") ?? "")

    if (!email || !password) {
      setError(t("emailPasswordRequired"))
      return
    }

    setSubmitting(true)
    try {
      await login({ email, password })
      navigate("/chat", { replace: true })
    } catch (err: any) {
      setError(localizeError(err, t, "loginFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  if (!loading && isAuthenticated) {
    return <Navigate to="/chat" replace />
  }

  return (
    <div className="flex min-h-screen relative">
      <div className="absolute top-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => i18n.changeLanguage('de')}
          className={`px-2 py-1 text-xs rounded border transition-colors ${
            i18n.language === 'de' 
              ? 'bg-sky-500/20 border-sky-500/50 text-sky-400' 
              : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
        >
          DE
        </button>
        <button
          onClick={() => i18n.changeLanguage('en')}
          className={`px-2 py-1 text-xs rounded border transition-colors ${
            i18n.language === 'en' 
              ? 'bg-sky-500/20 border-sky-500/50 text-sky-400' 
              : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
        >
          EN
        </button>
      </div>
      <div className="relative hidden flex-1 bg-muted lg:flex">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-500/30 via-background to-purple-600/20" />
        <div className="relative z-10 flex flex-1 flex-col justify-between p-10 text-muted-foreground">
          <div>
            <span className="text-sm uppercase tracking-wide text-muted-foreground/80">
              {t("welcomeBack")}
            </span>
            <h2 className="mt-3 text-3xl font-semibold text-foreground">
              {t("tagline")}
            </h2>
            <p className="mt-4 max-w-sm text-sm">
              {t("loginDescription")}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <img src={LogoOntheia} alt="Ontheia Logo" className="sidebar-logo-image" />
              <div className="sidebar-logo-text flex flex-col text-sm font-semibold leading-tight">
                <span className="sidebar-logo-primary">Ontheia</span>
              </div>
            </div>
            <div className="flex flex-col text-sm font-semibold leading-tight">
              <span className="sidebar-logo-sub text-[11px] font-medium text-muted-foreground leading-none tracking-wider">
                Enterprise Multi-Agent Orchestration
              </span>
              <span className="text-[11px] font-normal text-sky-400/60 italic mt-1.5">
                Build, Connect, Orchestrate.
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex w-full flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Card className="border-0 shadow-none lg:border lg:shadow">
            <CardHeader className="space-y-2 text-center">
              <CardTitle className="text-3xl font-semibold">{t("loginTitle")}</CardTitle>
              <CardDescription>
                {t("loginSubtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LoginForm
                className="mt-2"
                onSubmit={handleSubmit}
                isSubmitting={submitting}
                errorMessage={error}
              />
              <div className="mt-4 text-center text-xs text-muted-foreground">
                {t("termsNote")}
              </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
)
}
