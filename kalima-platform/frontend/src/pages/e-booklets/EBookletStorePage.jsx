import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  CircleDollarSign,
  Eye,
  FileText,
  ImageIcon,
  LockKeyhole,
  Search,
  ShieldCheck,
  ShoppingBag,
  Video,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatTimeUntilRelease } from "@/lib/storeUtils";
import { useEBookletCart, useEBookletStore } from "@/hooks/useEBooklets";
import { useTranslation } from "react-i18next";

const formatMoney = (amount, currency = "EGP", language = "en") => {
  return new Intl.NumberFormat(language?.startsWith("ar") ? "ar-EG" : "en-EG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
};

const formatDate = (value, language = "en") => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(language?.startsWith("ar") ? "ar-EG" : "en-EG", {
    dateStyle: "medium",
  }).format(date);
};

function StoreSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr]">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "rounded-lg border border-border/70 bg-card p-4",
            index === 0 && "md:col-span-2 xl:row-span-2",
          )}
        >
          <Skeleton className="aspect-[4/3] w-full rounded-md" />
          <Skeleton className="mt-5 h-5 w-2/3" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}

function EBookletCover({ template, featured = false, t }) {
  if (template.coverUrl) {
    return (
      <img
        src={template.coverUrl}
        alt={`${template.title} cover`}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col justify-between bg-[linear-gradient(135deg,#f8fafc,#ecfdf5_55%,#fff7ed)] p-5 text-slate-900">
      <div className="flex items-center justify-between">
        <span className="rounded-full border border-slate-300/70 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Kalima
        </span>
        <BookOpenCheck className={cn("text-emerald-700", featured ? "h-8 w-8" : "h-6 w-6")} />
      </div>
      <div>
        <div className={cn("font-bold leading-tight", featured ? "text-3xl" : "text-xl")}>
          {t("store.coverFallback")}
        </div>
        <div className="mt-2 h-1 w-14 rounded-full bg-emerald-600" />
      </div>
    </div>
  );
}

function EBookletCard({ template, featured, onAdd, t, language }) {
  const expiryLabel = formatDate(template.accessExpiresAt, language);
  const isReleased = template.is_released !== false;
  const countdownText = !isReleased
    ? formatTimeUntilRelease(template.time_until_release_ms, t)
    : null;

  return (
    <article
      className={cn(
        "group grid min-h-full grid-rows-[auto_1fr] overflow-hidden rounded-lg border border-border/70 bg-card transition duration-300 hover:-translate-y-0.5 hover:border-emerald-600/40 hover:shadow-[0_18px_50px_-28px_rgba(15,23,42,0.45)]",
      )}
    >
      <Link
        to={`/e-booklets/${template.template_id || template.id}`}
        className={cn(
          "block aspect-[4/3] overflow-hidden bg-muted",
        )}
      >
        <EBookletCover template={template} featured={featured} t={t} />
      </Link>

      <div className="flex min-w-0 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-md bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
            {t("common.eBooklet")}
          </Badge>
          {!isReleased && (
            <Badge className="rounded-md bg-amber-100 text-amber-900 hover:bg-amber-100">
              {t("common.comingSoonWithTime", { time: countdownText })}
            </Badge>
          )}
          {template.categoryTitle && (
            <span className="text-xs font-medium text-muted-foreground">
              {template.categoryTitle}
            </span>
          )}
          {template.teacherName && (
            <span className="text-xs font-medium text-muted-foreground">
              {template.teacherName}
            </span>
          )}
        </div>

        <Link
          to={`/e-booklets/${template.template_id || template.id}`}
          className={cn(
            "mt-4 line-clamp-2 font-bold tracking-tight text-foreground transition-colors group-hover:text-emerald-800",
            featured ? "text-2xl md:text-3xl" : "text-xl",
          )}
        >
          {template.title}
        </Link>

        <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
          {template.description || t("store.cardDescription")}
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div className="rounded-md border border-border/70 px-3 py-2">
            <FileText className="mb-1 h-4 w-4 text-foreground" />
            <span>
              {template.pageCount
                ? t("common.pageCount", { count: template.pageCount })
                : t("common.pages")}
            </span>
          </div>
          <div className="rounded-md border border-border/70 px-3 py-2">
            <Video className="mb-1 h-4 w-4 text-foreground" />
            <span>{t("common.hotspotCount", { count: template.hotspotCount || 0 })}</span>
          </div>
          <div className="rounded-md border border-border/70 px-3 py-2">
            <LockKeyhole className="mb-1 h-4 w-4 text-foreground" />
            <span>
              {Number.isFinite(Number(template.seatsRemaining))
                ? t("store.seatsRemaining", { count: template.seatsRemaining, defaultValue: "{{count}} seats" })
                : t("common.noDownload")}
            </span>
          </div>
        </div>

        <div className="mt-3 rounded-md border border-border/70 px-3 py-2 text-xs text-muted-foreground">
          <CalendarDays className="mb-1 h-4 w-4 text-foreground" />
          <span>
            {expiryLabel
              ? t("store.accessExpires", { value: expiryLabel, defaultValue: "Expires {{value}}" })
              : t("store.noExpiry", { defaultValue: "No expiry" })}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-4 pt-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("common.price")}
            </div>
            <div className="text-lg font-bold text-foreground">
              {formatMoney(template.price, template.currency, language)}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild type="button" variant="outline" disabled={!template.activeVersion?.id || !isReleased} className="active:scale-[0.98]">
              <Link to={`/e-booklets/${template.template_id || template.id}/preview`}>
                <Eye className="h-4 w-4" />
                {t("store.preview")}
              </Link>
            </Button>
            <Button
              type="button"
              onClick={() => onAdd(template)}
              disabled={!template.activeVersion?.id || !isReleased}
              className="active:scale-[0.98]"
            >
              <ShoppingBag className="h-4 w-4" />
              {t("store.add")}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function EmptyState({ onClearSearch, t }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-800">
        <BookOpenCheck className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-2xl font-bold tracking-tight">
        {t("store.emptyTitle")}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        {t("store.emptyDescription")}
      </p>
      <Button type="button" variant="outline" onClick={onClearSearch} className="mt-6">
        {t("common.clearSearch")}
      </Button>
    </div>
  );
}

export default function EBookletStorePage() {
  const { t, i18n } = useTranslation("eBooklets");
  const navigate = useNavigate();
  const { addTemplate } = useEBookletCart();
  const [searchValue, setSearchValue] = useState("");
  const {
    templates,
    filters,
    loading,
    pagination,
    setSearch,
    setPage,
  } = useEBookletStore({ limit: 12 });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleSearch = (event) => {
    event.preventDefault();
    setSearch(searchValue.trim());
  };

  const handleAddToCart = (template) => {
    addTemplate(template);
    navigate("/e-booklet-cart");
  };

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pagination.limit));

  return (
    <main className="bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(255,255,255,1)_42%)] pt-24 text-foreground">
      <section className="mx-auto grid max-w-[1400px] gap-10 px-4 pb-10 pt-8 md:grid-cols-[1.05fr_0.95fr] md:px-6 lg:pt-14">
        <div className="max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-700/20 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-900">
            <ShieldCheck className="h-4 w-4" />
            {t("store.badge")}
          </div>
          <h1 className="text-4xl font-black leading-tight tracking-tight text-slate-950 md:text-6xl">
            {t("store.heroTitle")}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
            {t("store.heroDescription")}
          </p>
        </div>

        <div className="grid content-end gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_20px_70px_-45px_rgba(15,23,42,0.45)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("store.accessModel")}
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">
                  {t("store.templatePlusPdf")}
                </h2>
              </div>
              <LockKeyhole className="h-8 w-8 text-emerald-800" />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
              {[
                { label: t("store.features.text"), Icon: FileText },
                { label: t("store.features.image"), Icon: ImageIcon },
                { label: t("store.features.video"), Icon: Video },
                { label: t("store.features.audio"), Icon: Volume2 },
                { label: t("store.features.private"), Icon: LockKeyhole },
                { label: t("store.features.quota"), Icon: CircleDollarSign },
              ].map(({ label, Icon }) => (
                <div key={label} className="rounded-md border border-border/70 p-3">
                  <Icon className="mb-2 h-4 w-4 text-emerald-800" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 pb-20 md:px-6">
        <div className="mb-7 flex flex-col gap-4 border-t border-border/80 pt-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t("store.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("store.description")}
            </p>
          </div>
          <form onSubmit={handleSearch} className="relative w-full md:w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={t("store.searchPlaceholder")}
              className="h-11 pl-9"
            />
          </form>
        </div>

        {filters.search && (
          <div className="mb-5 flex items-center justify-between rounded-md border border-border/70 bg-muted/30 px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {t("common.searchResultsFor")}{" "}
              <strong className="text-foreground">{filters.search}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchValue("");
                setSearch("");
              }}
              className="font-semibold text-emerald-800 hover:text-emerald-950"
            >
              {t("common.clear")}
            </button>
          </div>
        )}

        {loading ? (
          <StoreSkeleton />
        ) : templates.length === 0 ? (
          <EmptyState
            t={t}
            onClearSearch={() => {
              setSearchValue("");
              setSearch("");
            }}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr]">
              {templates.map((template, index) => (
                <EBookletCard
                  key={template.id}
                  template={template}
                  featured={index === 0}
                  onAdd={handleAddToCart}
                  t={t}
                  language={i18n.language}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-between border-t border-border pt-5 text-sm">
                <span className="text-muted-foreground">
                  {t("common.pageOf", { page: pagination.page, total: totalPages })}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage(pagination.page - 1)}
                  >
                    {t("common.previous")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pagination.page >= totalPages}
                    onClick={() => setPage(pagination.page + 1)}
                  >
                    {t("common.next")}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
