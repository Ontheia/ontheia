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
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginFormProps = React.ComponentPropsWithoutRef<"form"> & {
  isSubmitting?: boolean;
  errorMessage?: string | null;
};

export function LoginForm({
  className,
  isSubmitting = false,
  errorMessage,
  ...props
}: LoginFormProps) {
  const { t } = useTranslation(["auth"]);

  return (
    <form className={cn("flex flex-col gap-6", className)} {...props}>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">{t("login")}</h1>
        <p className="text-balance text-sm text-muted-foreground">
          {t("enterEmailPassword")}
        </p>
      </div>
      {errorMessage ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="name@example.com"
            autoComplete="email"
            required
            disabled={isSubmitting}
            className="auth-input"
          />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center">
            <Label htmlFor="password">{t("password")}</Label>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={isSubmitting}
            className="auth-input"
          />
        </div>
        <Button type="submit" className="w-full btn-default" disabled={isSubmitting}>
          {isSubmitting ? t("loggingIn") : t("loginAction")}
        </Button>
      </div>
      <div className="text-center text-sm">
        {t("noAccount")}
        <Link to="/signup" className="underline underline-offset-4 ml-1">
          {t("registerNow")}
        </Link>
      </div>
    </form>
  );
}
