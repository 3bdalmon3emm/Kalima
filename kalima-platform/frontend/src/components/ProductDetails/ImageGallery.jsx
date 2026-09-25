import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { Video } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ImageGallery({ images, badge }) {
  const { t, i18n } = useTranslation("product");
  const [thumbApi, setThumbApi] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerZoom, setViewerZoom] = useState(1);

  const imagesList = useMemo(
    () => {
      if (!images) return [];
      const list = [images.main, ...(images.thumbnails ?? [])].filter(Boolean);
      return list;
    },
    [images],
  );

  useEffect(() => {
    if (!imagesList.length) {
      setSelectedIndex(0);
      return;
    }

    setSelectedIndex((previousIndex) =>
      Math.min(previousIndex, imagesList.length - 1),
    );
  }, [imagesList]);

  useEffect(() => {
    if (!thumbApi || imagesList.length < 2) return;
    thumbApi.scrollTo(selectedIndex);
  }, [thumbApi, selectedIndex, imagesList.length]);

  const onThumbClick = useCallback(
    (index) => {
      setSelectedIndex(index);
    },
    [],
  );

  const showPrevious = useCallback(() => {
    if (imagesList.length < 2) return;
    setSelectedIndex((previous) =>
      previous === 0 ? imagesList.length - 1 : previous - 1,
    );
  }, [imagesList.length]);

  const showNext = useCallback(() => {
    if (imagesList.length < 2) return;
    setSelectedIndex((previous) => (previous + 1) % imagesList.length);
  }, [imagesList.length]);

  const selectedMedia = imagesList[selectedIndex];
  const selectedMediaIsImage = selectedMedia && (
    typeof selectedMedia === "string" || selectedMedia.type !== "video"
  );
  // URL of the current image, used to paint a blurred backdrop so the letterbox
  // area around a "contain"-fitted image picks up the image's own colours.
  const selectedImageUrl = selectedMediaIsImage
    ? (typeof selectedMedia === "string" ? selectedMedia : selectedMedia?.url)
    : null;

  const openViewer = useCallback(() => {
    if (!selectedMediaIsImage) return;
    setViewerZoom(1);
    setViewerOpen(true);
  }, [selectedMediaIsImage]);

  const closeViewer = useCallback((open) => {
    setViewerOpen(open);
    if (!open) setViewerZoom(1);
  }, []);

  const adjustViewerZoom = useCallback((amount) => {
    setViewerZoom((previousZoom) => Math.min(3, Math.max(1, previousZoom + amount)));
  }, []);

  const fallbackImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23f3f4f6'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%239ca3af'%3ENo Image%3C/text%3E%3C/svg%3E";

  if (!imagesList.length) {
    return (
      <div className="flex flex-col gap-4">
        <div className="relative w-full aspect-square md:aspect-4/3 rounded-2xl overflow-hidden bg-muted flex items-center justify-center">
          <img src={fallbackImage} alt="No image available" className="w-full h-full object-cover opacity-50" />
        </div>
      </div>
    );
  }

  const renderMedia = (mediaItem, isThumbnail = false) => {
    // Legacy support for plain strings
    if (typeof mediaItem === 'string') {
      return (
        <img
          src={mediaItem}
          alt={isThumbnail ? t("info.thumbnail") : t("info.view")}
          className={`w-full h-full ${isThumbnail ? "object-cover" : "object-contain"}`}
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = fallbackImage;
          }}
        />
      );
    }

    const { type, url, thumbnail, source_type } = mediaItem;
    const isVideo = type === 'video';
    const isExternalVideoUrl = typeof url === "string" && (url.includes("youtube.com") || url.includes("youtu.be") || url.includes("vimeo.com"));
    const isExternal = isVideo && (source_type === 'external' || isExternalVideoUrl);

    // Thumbnail specific rendering
    if (isThumbnail) {
      if (isVideo) {
        if (thumbnail) {
          return (
            <div className="relative w-full h-full">
              <img src={thumbnail} alt="Video thumbnail" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <Video className="h-6 w-6 text-white drop-shadow-md" />
              </div>
            </div>
          );
        }
        return (
          <div className="w-full h-full bg-muted flex flex-col items-center justify-center text-muted-foreground border-border">
            <Video className="h-6 w-6 opacity-60 mb-1" />
            <span className="text-[10px] font-medium leading-tight px-1 text-center">Video</span>
          </div>
        );
      }

      return (
        <img
          src={url}
          alt={t("info.thumbnail")}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = fallbackImage;
          }}
        />
      );
    }

    // Main view rendering
    if (isVideo) {
      if (isExternal) {
        // Embed Youtube / Vimeo
        const isYoutube = url?.includes('youtube.com') || url?.includes('youtu.be');
        let embedUrl = url;
        if (isYoutube) {
          let videoId = '';
          try {
            if (url.includes('youtube.com/watch')) {
              videoId = new URL(url).searchParams.get('v');
            } else if (url.includes('youtu.be/')) {
              videoId = url.split('youtu.be/')[1].split(/[?#]/)[0];
            }
          } catch (_) {
            videoId = '';
          }
          if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0`;
        }
        return (
          <iframe
            src={embedUrl}
            className="w-full h-full border-0 absolute inset-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={t("media.externalVideo")}
          />
        );
      }
      return (
        <video
          src={url}
          className="w-full h-full object-contain bg-black"
          controls
          playsInline
        />
      );
    }

    return (
      <img
        src={url}
        alt={t("info.view")}
        className="w-full h-full object-contain"
        onError={(e) => {
          e.target.onerror = null;
          e.target.src = fallbackImage;
        }}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Main Slider */}
      <div className="relative w-full aspect-square md:aspect-4/3 rounded-2xl overflow-hidden bg-muted group">
        {selectedImageUrl && (
          <img
            src={selectedImageUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60"
          />
        )}
        {selectedMediaIsImage ? (
          <button
            type="button"
            onClick={openViewer}
            className="relative block h-full w-full cursor-zoom-in rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
            aria-label={t("actions.openImageViewer", { defaultValue: "Open image viewer" })}
            data-testid="product-gallery-main-button"
          >
            {renderMedia(selectedMedia, false)}
          </button>
        ) : (
          renderMedia(selectedMedia, false)
        )}

        {imagesList.length > 1 && (
          <>
            <div className="hidden md:block">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={showNext}
                className="absolute start-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 hover:bg-background"
                data-testid="product-gallery-prev-button"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Previous slide</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={showPrevious}
                className="absolute end-4 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 hover:bg-background"
                data-testid="product-gallery-next-button"
              >
                <ArrowRight className="h-4 w-4" />
                <span className="sr-only">Next slide</span>
              </Button>
            </div>

            {/* Mobile Dots */}
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 md:hidden">
              {imagesList.map((_, index) => (
                <button
                  key={index}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all",
                    index === selectedIndex ? "bg-primary w-4" : "bg-primary/30",
                  )}
                  onClick={() => setSelectedIndex(index)}
                  data-testid={`product-gallery-dot-${index}-button`}
                />
              ))}
            </div>
          </>
        )}

        {badge && (
          <div className="absolute top-4 start-4 z-10 pointer-events-none">
            <Badge className="rounded-full px-3">{badge}</Badge>
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {imagesList.length > 1 && (
        <div className="hidden md:block">
          <Carousel
            setApi={setThumbApi}
            opts={{
              align: "start",
              containScroll: "keepSnaps",
              dragFree: true,
              direction: i18n.dir(),
            }}
            className="w-full"
          >
          <CarouselContent className="-ms-2">
              {imagesList.map((thumb, index) => (
                <CarouselItem
                  key={index}
                  className="ps-2 basis-1/4 sm:basis-1/5 md:basis-1/6"
                >
                  <div
                    className={cn(
                      "cursor-pointer rounded-lg overflow-hidden border-2 transition-all aspect-square",
                      selectedIndex === index
                        ? "border-primary ring-2 ring-primary/20"
                        : "border-transparent hover:border-border",
                    )}
                    onClick={() => onThumbClick(index)}
                    data-testid={`product-gallery-thumb-${index}-button`}
                  >
                    {renderMedia(thumb, true)}
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>
      )}

      <Dialog open={viewerOpen} onOpenChange={closeViewer}>
        <DialogContent
          className="max-w-[min(96vw,1200px)] border-0 bg-black/95 p-3 text-white sm:p-5"
          data-testid="product-image-viewer"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>
              {t("actions.imageViewerTitle", { defaultValue: "Product image viewer" })}
            </DialogTitle>
          </DialogHeader>

          <div className="flex max-h-[76vh] min-h-[50vh] items-center justify-center overflow-auto rounded-lg bg-black/30 p-2">
            {selectedMediaIsImage && (
              <img
                src={typeof selectedMedia === "string" ? selectedMedia : selectedMedia.url}
                alt={t("info.view")}
                className="max-h-[72vh] max-w-full object-contain transition-transform duration-200 ease-out"
                style={{ transform: `scale(${viewerZoom})` }}
                data-testid="product-image-viewer-image"
              />
            )}
          </div>

          <div className="flex items-center justify-center gap-2" aria-label={t("actions.imageZoom", { defaultValue: "Image zoom controls" })}>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => adjustViewerZoom(-0.25)}
              disabled={viewerZoom === 1}
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              aria-label={t("actions.zoomOut", { defaultValue: "Zoom out" })}
              data-testid="product-image-zoom-out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="min-w-14 text-center text-sm tabular-nums" data-testid="product-image-zoom-level">
              {Math.round(viewerZoom * 100)}%
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => adjustViewerZoom(0.25)}
              disabled={viewerZoom === 3}
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              aria-label={t("actions.zoomIn", { defaultValue: "Zoom in" })}
              data-testid="product-image-zoom-in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setViewerZoom(1)}
              disabled={viewerZoom === 1}
              className="text-white hover:bg-white/20 hover:text-white"
              aria-label={t("actions.resetZoom", { defaultValue: "Reset zoom" })}
              data-testid="product-image-zoom-reset"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
