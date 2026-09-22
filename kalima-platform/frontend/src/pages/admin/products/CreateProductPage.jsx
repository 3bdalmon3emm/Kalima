import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import LoadingSpinner from '@/components/ui/loading-spinner';
import {
    ChevronLeft,
    X,
    Package,
    PlusCircle,
    Calendar as CalendarIcon,
    CircleHelp,
    Info,
    Tags,
    ListChecks,
    ImagePlus,
    TicketPercent,
    Save,
} from 'lucide-react';
import { format, startOfDay } from 'date-fns';
import { arSA } from 'react-day-picker/locale';

import { useAdminProducts } from '@/hooks/admin/useAdminProducts';
import { useAdminCoupons } from '@/hooks/admin/useAdminCoupons';
import { useAdminSampleSections } from '@/hooks/admin/useAdminSampleSections';
import { useCategories } from '@/hooks/useCategories';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import FileUploadProgress from '@/components/admin/settings/FileUploadProgress';


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateProductPage() {
    const { t, i18n } = useTranslation('admin');
    const navigate = useNavigate();
    const isRtl = i18n.dir() === 'rtl';

    // ─── Validation Schema ────────────────────────────────────────────────────────

    const createProductSchema = z.object({
        title: z.string().min(1, t('products.form.titleIsRequired')).max(255, t('products.form.titleMaxLength')),
        price: z.coerce.number().min(0, t('products.form.priceMustBeGreaterThan0')),
        type: z.enum(['Product', 'Book']),
        isFreePreview: z.boolean().optional(),
        description: z.string().optional(),
        price_after_discount: z.preprocess(
            (val) => (val === '' || val == null ? undefined : val),
            z.coerce.number().min(0, t('products.form.discountedPriceMustBeGreaterThan0')).optional()
        ),
        serial: z.string().max(100, t('products.form.serialMaxLength')).optional().or(z.literal('')),
        coupon_id: z.preprocess(
            (val) => (val === '' || val == null ? undefined : val),
            z.coerce.number().int(t('products.form.couponIdMustBeInteger')).positive(t('products.form.couponIdMustBeGreaterThan0')).optional()
        ),
        release_at: z.string().optional().or(z.literal('')),
        perks: z.string().optional().or(z.literal('')),
    }).refine(
        (data) => {
            if (data.isFreePreview) return data.price_after_discount === 0;
            if (data.price_after_discount == null) return true;
            if (data.price > 0) return data.price_after_discount < data.price;
            return data.price_after_discount === 0;
        },
        { message: t('products.form.discountedPriceMustBeLessThanOriginalPrice'), path: ['price_after_discount'] }
    ).refine(
        (data) => !data.release_at || new Date(data.release_at) >= startOfDay(new Date()),
        { message: t('products.form.releaseDateMustBeFuture', 'Release date must be today or in the future'), path: ['release_at'] }
    );

    const {
        createProduct,
        attachRequiredFields,
        fetchFieldDefinitions,
        fieldDefinitions,
        actionLoading,
        addGalleryImages,
        addGalleryVideo,
        addExternalGalleryVideo,
    } = useAdminProducts();

    const {
        createCoupon,
        generateCouponCode,
        apiLoading: couponLoading,
    } = useAdminCoupons();

    const {
        categories: roots = [],
        childCategories = {},
        fetchChildCategories = async () => [],
    } = useCategories();

    const [thumbnail, setThumbnail] = useState(null);
    const [hqSample, setHqSample] = useState(null);
    const [lqSample, setLqSample] = useState(null);
    const [sampleTitle, setSampleTitle] = useState('');
    const [sampleSectionId, setSampleSectionId] = useState('');
    const [mediaType, setMediaType] = useState('pdf');
    const [activeSection, setActiveSection] = useState('core');

    // Category picker state — single category only (up to 3 levels)
    const [selectedRootId, setSelectedRootId] = useState('');
    const [selectedChildId, setSelectedChildId] = useState('');
    const [selectedGrandchildId, setSelectedGrandchildId] = useState('');
    const [childrenLoading, setChildrenLoading] = useState(false);
    const [grandchildrenLoading, setGrandchildrenLoading] = useState(false);
    const [pickedCategory, setPickedCategory] = useState(null); // { id, title } | null

    // Required fields picker state
    const [selectedFieldDefId, setSelectedFieldDefId] = useState('');
    const [pickedFields, setPickedFields] = useState([]); // { id, label, field_type }[]

    // Upload progress state
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadFileName, setUploadFileName] = useState('');
    const [uploadError, setUploadError] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    // Quick coupon state
    const [quickCouponEnabled, setQuickCouponEnabled] = useState(false);
    const [quickCouponCode, setQuickCouponCode] = useState('');
    const [quickCouponType, setQuickCouponType] = useState('PERCENTAGE');
    const [quickCouponValue, setQuickCouponValue] = useState('');
    const [quickCouponExpiresAt, setQuickCouponExpiresAt] = useState('');
    const uploadAbortControllerRef = useRef(null);
    const createdProductIdRef = useRef(null);

    const thumbnailInputRef = useRef(null);
    const galleryInputRef = useRef(null);
    const galleryVideoInputRef = useRef(null);
    const hqSampleInputRef = useRef(null);
    const lqSampleInputRef = useRef(null);

    const [pendingGalleryImages, setPendingGalleryImages] = useState([]);
    const [pendingGalleryVideo, setPendingGalleryVideo] = useState(null);
    const [externalVideoUrl, setExternalVideoUrl] = useState('');

    const {
        sections: sampleSections,
        fetchSections: fetchSampleSections,
        createSample,
    } = useAdminSampleSections();

    // Fetch definitions and sections on mount
    useEffect(() => {
        fetchFieldDefinitions();
        fetchSampleSections();
    }, [fetchFieldDefinitions, fetchSampleSections]);

    const form = useForm({
        resolver: zodResolver(createProductSchema),
        defaultValues: {
            title: '',
            price: '',
            type: 'Product',
            isFreePreview: false,
            description: '',
            price_after_discount: '',
            serial: '',
            coupon_id: '',
            release_at: '',
            perks: '',
        },
    });

    // ─── Category helpers ─────────────────────────────────────────────────────

    const currentChildren = selectedRootId ? (childCategories[selectedRootId] ?? undefined) : undefined;
    const hasChildren = currentChildren && currentChildren.length > 0;

    // Grandchildren: stored in childCategories keyed by the selected child id
    const currentGrandchildren = selectedChildId ? (childCategories[selectedChildId] ?? undefined) : undefined;
    const hasGrandchildren = currentGrandchildren && currentGrandchildren.length > 0;

    const handleRootChange = async (rootId) => {
        setSelectedRootId(rootId);
        setSelectedChildId('');
        setSelectedGrandchildId('');
        if (rootId && !childCategories[rootId]) {
            setChildrenLoading(true);
            await fetchChildCategories(parseInt(rootId));
            setChildrenLoading(false);
        }
        // Update picked category to this root immediately (child may override)
        const label = roots.find(r => r.id === parseInt(rootId))?.title;
        if (rootId) {
            setPickedCategory({ id: parseInt(rootId), title: label });
        } else {
            setPickedCategory(null);
        }
    };

    const handleChildChange = async (childId) => {
        setSelectedChildId(childId);
        setSelectedGrandchildId('');
        if (childId) {
            const label = currentChildren?.find(c => c.id === parseInt(childId))?.title;
            setPickedCategory({ id: parseInt(childId), title: label });
            // Fetch grandchildren if not already cached
            if (!childCategories[childId]) {
                setGrandchildrenLoading(true);
                await fetchChildCategories(parseInt(childId));
                setGrandchildrenLoading(false);
            }
        } else {
            // Revert to root selection
            const label = roots.find(r => r.id === parseInt(selectedRootId))?.title;
            setPickedCategory(selectedRootId ? { id: parseInt(selectedRootId), title: label } : null);
        }
    };

    const handleGrandchildChange = (grandchildId) => {
        setSelectedGrandchildId(grandchildId);
        if (grandchildId) {
            const label = currentGrandchildren?.find(g => g.id === parseInt(grandchildId))?.title;
            setPickedCategory({ id: parseInt(grandchildId), title: label });
        } else {
            // Revert to child selection
            const label = currentChildren?.find(c => c.id === parseInt(selectedChildId))?.title;
            setPickedCategory(selectedChildId ? { id: parseInt(selectedChildId), title: label } : null);
        }
    };

    const handleClearCategory = () => {
        setPickedCategory(null);
        setSelectedRootId('');
        setSelectedChildId('');
        setSelectedGrandchildId('');
    };

    // ─── Required field helpers ───────────────────────────────────────────────

    const pickedFieldIds = new Set(pickedFields.map(f => f.id));
    const availableFieldDefs = fieldDefinitions.filter(def => !pickedFieldIds.has(def.id));

    const handleAddField = () => {
        if (!selectedFieldDefId) return;
        const def = fieldDefinitions.find(d => d.id === parseInt(selectedFieldDefId));
        if (!def || pickedFieldIds.has(def.id)) return;
        setPickedFields(prev => [...prev, { id: def.id, label: def.label, field_type: def.field_type, is_required: true }]);
        setSelectedFieldDefId('');
    };

    const handleToggleFieldRequired = (id, isRequired) => {
        setPickedFields(prev => prev.map(f => f.id === id ? { ...f, is_required: isRequired } : f));
    };

    const handleRemoveField = (id) => {
        setPickedFields(prev => prev.filter(f => f.id !== id));
    };

    // ─── Quick coupon helpers ────────────────────────────────────────────────

    const handleGenerateQuickCouponCode = async () => {
        const code = await generateCouponCode();
        if (code) {
            setQuickCouponCode(code);
        }
    };

    const buildQuickCouponPayload = (productId, productPrice) => {
        if (!quickCouponEnabled) return null;

        const code = quickCouponCode.trim().toUpperCase();
        const numericValue = Number(quickCouponValue);

        if (!code || !quickCouponValue || !quickCouponExpiresAt) {
            toast.error(t('products.quickCoupon.validationComplete'));
            return null;
        }

        if (!Number.isFinite(numericValue) || numericValue <= 0) {
            toast.error(t('products.quickCoupon.validationPositive'));
            return null;
        }

        if (quickCouponType === 'PERCENTAGE' && numericValue > 100) {
            toast.error(t('products.quickCoupon.validationPercentageMax'));
            return null;
        }

        if (
            quickCouponType === 'AMOUNT'
            && Number.isFinite(productPrice)
            && numericValue > productPrice
        ) {
            toast.error(t('products.quickCoupon.validationAmountExceedsPrice'));
            return null;
        }

        return {
            code,
            discount_type: quickCouponType,
            product_id: String(productId),
            expires_at: new Date(quickCouponExpiresAt).toISOString(),
            ...(quickCouponType === 'PERCENTAGE'
                ? { discount_percentage: numericValue }
                : { discount_amount: numericValue }),
        };
    };

    // ─── Submit ───────────────────────────────────────────────────────────────

    const handleCancelUpload = () => {
        if (uploadAbortControllerRef.current) {
            uploadAbortControllerRef.current.abort();
            uploadAbortControllerRef.current = null;
        }
        setIsUploading(false);
        setUploadProgress(0);
        setUploadError('');
    };

    const onSubmit = async (values) => {
        const quickCouponDraft = quickCouponEnabled
            ? buildQuickCouponPayload('__PENDING_PRODUCT_ID__', Number(values.price))
            : null;

        if (quickCouponEnabled && !quickCouponDraft) return;

        // ── Step 1: Create the product (guarded — skip if already created) ──
        let newProductId = createdProductIdRef.current;

        if (!newProductId) {
            const formData = new FormData();
            formData.append('title', values.title);
            formData.append('price', values.price);
            formData.append('type', values.type);
            if (values.description) formData.append('description', values.description);
            if (values.isFreePreview) {
                formData.append('price_after_discount', 0);
            } else if (values.price_after_discount != null && values.price_after_discount !== '') {
                formData.append('price_after_discount', values.price_after_discount);
            }
            if (values.serial) formData.append('serial', values.serial);
            if (values.coupon_id) formData.append('coupon_id', values.coupon_id);
            if (values.release_at) formData.append('release_at', new Date(values.release_at).toISOString());
            if (values.perks) formData.append('perks', values.perks);
            if (pickedCategory) {
                formData.append('category_id', String(pickedCategory.id));
                formData.append('category_ids', JSON.stringify([pickedCategory.id]));
            }
            if (thumbnail) formData.append('thumbnail', thumbnail);

            setUploadProgress(0);
            setUploadFileName(thumbnail?.name || t('products.create.dialogTitle'));
            setUploadError('');
            setIsUploading(true);
            const abortCtrl = new AbortController();
            uploadAbortControllerRef.current = abortCtrl;

            let res;
            try {
                res = await createProduct(formData, (progressEvent) => {
                    if (progressEvent.total) {
                        setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
                    }
                });
            } catch {
                setIsUploading(false);
                uploadAbortControllerRef.current = null;
                return;
            }

            setIsUploading(false);
            uploadAbortControllerRef.current = null;

            if (!res?.success) return;
            newProductId = res.data?.id;
            createdProductIdRef.current = newProductId; // guard against double-creation on retry
        }

        if (!newProductId) { navigate('/admin/products'); return; }

        // ── Step 2: Attach required fields ──
        if (pickedFields.length > 0) {
            await attachRequiredFields(
                newProductId,
                pickedFields.map(f => ({ field_definition_id: f.id, is_required: f.is_required }))
            );
        }

        // ── Step 3: Quick coupon ──
        if (quickCouponEnabled) {
            try {
                await createCoupon({ ...quickCouponDraft, product_id: String(newProductId) });
            } catch {
                toast.error(t('products.quickCoupon.createFailed'));
            }
        }

        // ── Step 4: Gallery images ──
        if (pendingGalleryImages.length > 0) {
            setUploadFileName(t('products.form.galleryImages', 'Gallery images'));
            setUploadProgress(0); setUploadError(''); setIsUploading(true);
            const abortCtrl = new AbortController();
            uploadAbortControllerRef.current = abortCtrl;
            const galleryFD = new FormData();
            pendingGalleryImages.forEach(f => galleryFD.append('gallery', f));
            try {
                await addGalleryImages(newProductId, galleryFD, (ev) => {
                    if (ev.total) setUploadProgress(Math.round((ev.loaded * 100) / ev.total));
                }, abortCtrl.signal);
            } catch { /* non-fatal */ }
            setIsUploading(false); uploadAbortControllerRef.current = null;
        }

        // ── Step 5: Gallery video ──
        if (pendingGalleryVideo) {
            setUploadFileName(pendingGalleryVideo.name);
            setUploadProgress(0); setUploadError(''); setIsUploading(true);
            const abortCtrl = new AbortController();
            uploadAbortControllerRef.current = abortCtrl;
            const videoFD = new FormData();
            videoFD.append('video', pendingGalleryVideo);
            try {
                await addGalleryVideo(newProductId, videoFD, (ev) => {
                    if (ev.total) setUploadProgress(Math.round((ev.loaded * 100) / ev.total));
                }, abortCtrl.signal);
            } catch { /* non-fatal */ }
            setIsUploading(false); uploadAbortControllerRef.current = null;
        }

        // ── Step 6: External video ──
        if (externalVideoUrl.trim()) {
            try { await addExternalGalleryVideo(newProductId, externalVideoUrl.trim()); } catch { /* non-fatal */ }
        }

        // ── Step 7: Sample ──
        if ((hqSample || lqSample) && sampleSectionId) {
            if (!sampleTitle.trim()) {
                toast.error(t('products.form.sampleTitleRequired', 'Sample title is required when attaching a sample'));
                setIsUploading(false);
                return;
            }
            setUploadProgress(0);
            setUploadFileName(hqSample?.name || lqSample?.name || 'Sample');
            setUploadError(''); setIsUploading(true);
            const abortCtrl = new AbortController();
            uploadAbortControllerRef.current = abortCtrl;
            const sampleFD = new FormData();
            sampleFD.append('product_id', newProductId);
            sampleFD.append('media_type', mediaType);
            if (sampleTitle) sampleFD.append('title', sampleTitle);
            if (hqSample) sampleFD.append('high_quality', hqSample);
            if (lqSample) sampleFD.append('low_quality', lqSample);
            toast.info(t('products.create.sampleUploading'));
            try {
                const sampleRes = await createSample(sampleSectionId, sampleFD, (ev) => {
                    if (ev.total) setUploadProgress(Math.round((ev.loaded * 100) / ev.total));
                }, abortCtrl.signal);
                if (sampleRes?.success) {
                    toast.success(t('products.create.sampleSuccess'));
                } else {
                    setUploadError(sampleRes?.message || 'Sample upload failed');
                }
            } catch (err) {
                if (err?.name !== 'AbortError' && err?.code !== 'ERR_CANCELED') {
                    setUploadError('Sample upload failed');
                }
            } finally {
                uploadAbortControllerRef.current = null;
                setIsUploading(false);
            }
        }

        createdProductIdRef.current = null;
        navigate(`/admin/products/${newProductId}`);
    };

    // ─── Render ───────────────────────────────────────────────────────────────

    const sectionStatus = {
        core: form.watch('title') && form.watch('price') ? t('products.create.status.complete') : t('products.create.status.required'),
        category: pickedCategory ? t('products.create.status.selected') : t('products.create.status.optional'),
        fields: pickedFields.length > 0 ? `${pickedFields.length}` : t('products.create.status.optional'),
        media: thumbnail || pendingGalleryImages.length || pendingGalleryVideo || externalVideoUrl || hqSample || lqSample
            ? t('products.create.status.added')
            : t('products.create.status.optional'),
        coupon: quickCouponEnabled ? t('products.create.status.enabled') : t('products.create.status.optional'),
    };

    const sectionCards = [
        { id: 'core', icon: Info, title: t('products.detail.info'), status: sectionStatus.core },
        { id: 'category', icon: Tags, title: t('products.detail.categories'), status: sectionStatus.category },
        { id: 'fields', icon: ListChecks, title: t('products.detail.requiredFields'), status: sectionStatus.fields },
        { id: 'media', icon: ImagePlus, title: t('products.detail.media'), status: sectionStatus.media },
        { id: 'coupon', icon: TicketPercent, title: t('products.quickCoupon.title'), status: sectionStatus.coupon },
    ];

    return (
        <div className="space-y-6 min-w-0 overflow-hidden" data-testid="create-product-page">

            {/* Breadcrumb / Back */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link
                    to="/admin/products"
                    className="hover:text-foreground transition-colors flex items-center gap-1"
                    data-testid="create-product-back-link"
                >
                    <ChevronLeft className="h-4 w-4" />
                    {t('products.backToProducts')}
                </Link>
            </div>

            {/* Page Header */}
            <div className="flex items-start gap-3">
                <Package className="h-8 w-8 text-primary mt-1 shrink-0" />
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('products.create.dialogTitle')}</h1>
                    <p className="text-muted-foreground mt-1 text-sm">{t('products.create.dialogDescription')}</p>
                </div>
            </div>

            <Form {...form}>
                <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.type !== 'submit') {
                            e.preventDefault();
                        }
                    }}
                    className="space-y-4"
                    data-testid="create-product-form"
                >
                    <div className="min-w-0 space-y-4">
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                        {sectionCards.map(({ id, icon: Icon, title, status }) => {
                            const isActive = activeSection === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setActiveSection(id)}
                                    className={cn(
                                        'flex min-h-16 min-w-0 items-center gap-2 rounded-md border p-2 text-start transition-colors',
                                        isActive
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-border bg-background hover:bg-muted/60'
                                    )}
                                >
                                    <span className={cn(
                                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
                                        isActive ? 'border-primary/30 bg-background' : 'bg-muted/40'
                                    )}>
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-xs font-semibold leading-tight text-foreground sm:text-[13px]">{title}</span>
                                        <span className={cn(
                                            'mt-1 block max-w-full truncate text-[10px] font-medium leading-none sm:text-[11px]',
                                            isActive ? 'text-primary/75' : 'text-muted-foreground'
                                        )}>
                                            {status}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold">{t('products.create.dialogTitle')}</p>
                            <p className="truncate text-xs text-muted-foreground">
                                {form.watch('title') || t('products.form.titlePlaceholder')}
                            </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => navigate('/admin/products')}
                                data-testid="create-product-cancel-button"
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button
                                type="submit"
                                disabled={actionLoading || couponLoading}
                                data-testid="create-product-submit-button"
                            >
                                {actionLoading
                                    ? <><LoadingSpinner className="h-4 w-4 text-primary-foreground" />{t('products.create.creating')}</>
                                    : <><Save className="me-2 h-4 w-4" />{t('products.create.submit')}</>
                                }
                            </Button>
                        </div>
                    </div>

                    <FileUploadProgress
                        progress={uploadProgress}
                        isUploading={isUploading}
                        fileName={uploadFileName}
                        error={uploadError}
                        onCancel={handleCancelUpload}
                    />

                    <Accordion
                        type="single"
                        collapsible={false}
                        value={activeSection}
                        onValueChange={(value) => {
                            if (value) setActiveSection(value);
                        }}
                        className="min-w-0"
                    >

                    {/* ── Section: Core Details ── */}
                    <AccordionItem value="core" className="rounded-xl border border-border px-5">
                        <AccordionTrigger className="sr-only">{t('products.detail.info')}</AccordionTrigger>
                        <AccordionContent className="space-y-4 pb-5 pt-5">

                        {/* Title */}
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('products.form.title')} *</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder={t('products.form.titlePlaceholder')}
                                            data-testid="create-product-title-input"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Price + Type */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="price"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('products.form.price')} *</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                data-testid="create-product-price-input"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('products.form.type')}</FormLabel>
                                        <Select dir={i18n.dir()} onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger data-testid="create-product-type-select">
                                                    <SelectValue />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="Product">{t('products.type.Product')}</SelectItem>
                                                <SelectItem value="Book">{t('products.type.Book')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="isFreePreview"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                    <div className="space-y-0.5">
                                        <FormLabel className="flex items-center gap-1.5">
                                            {t('products.form.freePreviewToggle')}
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <button
                                                            type="button"
                                                            className="text-muted-foreground hover:text-foreground transition-colors"
                                                            aria-label={t('products.form.freePreviewHintAria', 'Free preview hint')}
                                                        >
                                                            <CircleHelp className="h-4 w-4" />
                                                        </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="max-w-[260px]">
                                                        {t('products.form.freePreviewHint', 'Enabling this will set the product discount to 100% (free).')}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </FormLabel>
                                    </div>
                                    <FormControl>
                                        <Switch
                                            checked={!!field.value}
                                            onCheckedChange={(checked) => {
                                                field.onChange(checked);
                                                if (checked) {
                                                    form.setValue('price_after_discount', '0', { shouldValidate: true, shouldDirty: true });
                                                }
                                            }}
                                            data-testid="create-product-free-preview-toggle"
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        {/* Price after discount + Serial */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="price_after_discount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('products.form.priceAfterDiscount')}</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                min="0"
                                                step="1"
                                                data-testid="create-product-discount-input"
                                                disabled={!!form.watch('isFreePreview')}
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="serial"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('products.form.serial')}</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder={t('products.form.serialPlaceholder')}
                                                data-testid="create-product-serial-input"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Release At + Perks */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="release_at"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel className="flex items-center gap-2">
                                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                                            {t('products.form.releaseAt', 'Release Date')}
                                        </FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button
                                                        type="button"
                                                        variant={"outline"}
                                                        className={cn(
                                                            "w-full pl-3 text-left font-normal",
                                                            !field.value && "text-muted-foreground"
                                                        )}
                                                        data-testid="create-product-release-at-input"
                                                    >
                                                        {field.value ? (
                                                            format(new Date(field.value), "PPP", { locale: isRtl ? arSA : undefined })
                                                        ) : (
                                                            <span>{t('products.form.pickDate', 'Pick a date')}</span>
                                                        )}
                                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                    </Button>
                                                </FormControl>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={field.value ? new Date(field.value) : undefined}
                                                    onSelect={(date) => field.onChange(date ? date.toISOString() : '')}
                                                    disabled={(date) => date < startOfDay(new Date())}
                                                    initialFocus
                                                    locale={isRtl ? arSA : undefined}
                                                    dir={isRtl ? 'rtl' : 'ltr'}
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="perks"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('products.form.perks')}</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder={t('products.form.perksPlaceholder')}
                                                data-testid="create-product-perks-input"
                                                {...field}
                                            />
                                        </FormControl>
                                        <p className="text-[0.8rem] text-muted-foreground mt-1">
                                            {t('products.form.perksTip')}
                                        </p>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Description */}
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('products.form.description')}</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder={t('products.form.descriptionPlaceholder')}
                                            rows={4}
                                            data-testid="create-product-description-input"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        </AccordionContent>
                    </AccordionItem>

                    {/* ── Section: Category ── */}
                    <AccordionItem value="category" className="rounded-xl border border-border px-5">
                        <AccordionTrigger className="sr-only">{t('products.detail.categories')}</AccordionTrigger>
                        <AccordionContent className="space-y-4 pb-5 pt-5">

                        {/* Selected category badge */}
                        {pickedCategory && (
                            <div className="flex flex-wrap gap-2">
                                <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm bg-primary/10 text-primary border border-primary/20"
                                    data-testid="create-product-selected-category"
                                >
                                    {pickedCategory.title}
                                    <button
                                        type="button"
                                        onClick={handleClearCategory}
                                        className="rounded-full hover:bg-primary/20 p-0.5"
                                        aria-label={`Remove ${pickedCategory.title}`}
                                        data-testid="create-product-remove-category"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            </div>
                        )}

                        {/* Cascading root → child → grandchild selects */}
                        <div className="flex flex-col gap-2">
                            <Select
                                dir={i18n.dir()}
                                value={selectedRootId}
                                onValueChange={handleRootChange}
                                disabled={roots.length === 0}
                            >
                                <SelectTrigger data-testid="create-product-category-root-select">
                                    <SelectValue placeholder={t('products.detail.selectCategory')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {roots.map((cat) => (
                                        <SelectItem key={cat.id} value={cat.id.toString()}>
                                            {cat.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {selectedRootId && (
                                childrenLoading ? (
                                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground px-2 py-2">
                                        <LoadingSpinner className="h-4 w-4 text-primary-foreground" />
                                        <span>{t('common.loading')}</span>
                                    </div>
                                ) : hasChildren ? (
                                    <Select
                                        dir={i18n.dir()}
                                        value={selectedChildId}
                                        onValueChange={handleChildChange}
                                        disabled={!currentChildren?.length}
                                    >
                                        <SelectTrigger data-testid="create-product-category-child-select">
                                            <SelectValue placeholder={t('products.detail.selectChildCategory', 'Subcategory (optional)')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {currentChildren.map((child) => (
                                                <SelectItem key={child.id} value={child.id.toString()}>
                                                    {child.title}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : null
                            )}

                            {selectedChildId && (
                                grandchildrenLoading ? (
                                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground px-2 py-2">
                                        <LoadingSpinner className="h-4 w-4 text-primary-foreground" />
                                        <span>{t('common.loading')}</span>
                                    </div>
                                ) : hasGrandchildren ? (
                                    <Select
                                        dir={i18n.dir()}
                                        value={selectedGrandchildId}
                                        onValueChange={handleGrandchildChange}
                                        disabled={!currentGrandchildren?.length}
                                    >
                                        <SelectTrigger data-testid="create-product-category-grandchild-select">
                                            <SelectValue placeholder={t('products.detail.selectGrandchildCategory', 'Sub-subcategory (optional)')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {currentGrandchildren.map((gc) => (
                                                <SelectItem key={gc.id} value={gc.id.toString()}>
                                                    {gc.title}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : null
                            )}
                        </div>
                        </AccordionContent>
                    </AccordionItem>

                    {/* ── Section: Required Fields ── */}
                    <AccordionItem value="fields" className="rounded-xl border border-border px-5">
                        <AccordionTrigger className="sr-only">{t('products.detail.requiredFields')}</AccordionTrigger>
                        <AccordionContent className="space-y-4 pb-5 pt-5">

                        {/* Picked field tags */}
                        {pickedFields.length > 0 ? (
                            <div className="flex flex-wrap gap-2 overflow-x-auto custom-scrollbar">
                                {pickedFields.map((field) => (
                                    <div
                                        key={field.id}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-primary/10 text-primary border border-primary/20"
                                        data-testid={`create-product-required-field-tag-${field.id}`}
                                    >
                                        <span className="font-medium">{field.label}</span>
                                        <span className="text-xs text-muted-foreground opacity-70">({field.field_type})</span>

                                        <div className="flex items-center gap-1 border-s border-primary/30 ps-2 ms-1">
                                            <span className="text-xs opacity-80">
                                                {field.is_required ? t('products.detail.fieldRequired', 'Required') : t('products.detail.fieldOptional', 'Optional')}
                                            </span>
                                            <Switch
                                                checked={field.is_required}
                                                onCheckedChange={(checked) => handleToggleFieldRequired(field.id, checked)}
                                                className="scale-75 origin-left rtl:origin-right"
                                                aria-label={t('products.detail.toggleRequiredStatus')}
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleRemoveField(field.id)}
                                            className="rounded-full hover:bg-primary/20 p-0.5 ms-1"
                                            aria-label={`Remove ${field.label}`}
                                            data-testid={`create-product-remove-field-${field.id}`}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">{t('products.detail.noRequiredFields')}</p>
                        )}

                        {/* Field picker */}
                        {availableFieldDefs.length > 0 && (
                            <div className="flex items-center gap-2">
                                <Select dir={i18n.dir()} value={selectedFieldDefId} onValueChange={setSelectedFieldDefId}>
                                    <SelectTrigger className="flex-1" data-testid="create-product-field-def-select">
                                        <SelectValue placeholder={t('products.detail.selectField')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableFieldDefs.map((def) => (
                                            <SelectItem key={def.id} value={def.id.toString()}>
                                                {def.label} ({def.field_type})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0"
                                    disabled={!selectedFieldDefId}
                                    onClick={handleAddField}
                                    data-testid="create-product-add-field-button"
                                >
                                    <PlusCircle className="me-2 h-4 w-4" />
                                    {t('products.detail.attachField')}
                                </Button>
                            </div>
                        )}
                        </AccordionContent>
                    </AccordionItem>

                    {/* ── Section: Media ── */}
                    <AccordionItem value="media" className="rounded-xl border border-border px-5">
                        <AccordionTrigger className="sr-only">{t('products.detail.media')}</AccordionTrigger>
                        <AccordionContent className="space-y-4 pb-5 pt-5">

                        <div className="grid grid-cols-1 gap-6">
                            {/* Thumbnail */}
                            <div className="space-y-1.5">
                                <FormLabel>{t('products.form.thumbnail')}</FormLabel>
                                <input
                                    ref={thumbnailInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => setThumbnail(e.target.files?.[0] ?? null)}
                                    className="sr-only"
                                    data-testid="create-product-thumbnail-input"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start"
                                    onClick={() => thumbnailInputRef.current?.click()}
                                    data-testid="create-product-thumbnail-button"
                                >
                                    {t('products.form.chooseImage')}
                                </Button>
                                <p className="text-xs text-muted-foreground truncate">
                                    {thumbnail?.name || t('products.form.noFileSelected')}
                                </p>
                            </div>

                            <Separator />

                            {/* Gallery Images */}
                            <div className="space-y-1.5">
                                <FormLabel>{t('products.form.galleryImages', 'Gallery Images')}</FormLabel>
                                <input
                                    ref={galleryInputRef}
                                    type="file"
                                    accept=".jpg,.jpeg,.png,.webp,.gif,.svg,image/*"
                                    multiple
                                    onChange={(e) => {
                                        const files = Array.from(e.target.files ?? []);
                                        if (files.length) setPendingGalleryImages(prev => [...prev, ...files]);
                                        e.target.value = '';
                                    }}
                                    className="sr-only"
                                    data-testid="create-product-gallery-input"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start"
                                    onClick={() => galleryInputRef.current?.click()}
                                    data-testid="create-product-gallery-button"
                                >
                                    {t('products.detail.addGalleryImages', 'Upload Images')}
                                </Button>
                                {pendingGalleryImages.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {pendingGalleryImages.map((f, i) => (
                                            <div key={i} className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs">
                                                <span className="truncate max-w-[120px]">{f.name}</span>
                                                <button type="button" onClick={() => setPendingGalleryImages(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive ml-1">&times;</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Gallery Video */}
                            <div className="space-y-1.5">
                                <FormLabel>{t('products.detail.addGalleryVideo', 'Gallery Video')}</FormLabel>
                                <input
                                    ref={galleryVideoInputRef}
                                    type="file"
                                    accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"
                                    onChange={(e) => { setPendingGalleryVideo(e.target.files?.[0] ?? null); e.target.value = ''; }}
                                    className="sr-only"
                                    data-testid="create-product-gallery-video-input"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start"
                                    onClick={() => galleryVideoInputRef.current?.click()}
                                    data-testid="create-product-gallery-video-button"
                                >
                                    {t('products.detail.addGalleryVideo', 'Upload Video')}
                                </Button>
                                {pendingGalleryVideo && (
                                    <div className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs mt-1">
                                        <span className="truncate max-w-[200px]">{pendingGalleryVideo.name}</span>
                                        <button type="button" onClick={() => setPendingGalleryVideo(null)} className="text-muted-foreground hover:text-destructive ml-1">&times;</button>
                                    </div>
                                )}
                            </div>

                            {/* External Video URL */}
                            <div className="space-y-1.5">
                                <FormLabel>{t('products.detail.addExternalVideo', 'External Video URL')}</FormLabel>
                                <Input
                                    type="url"
                                    placeholder="https://youtube.com/..."
                                    value={externalVideoUrl}
                                    onChange={(e) => setExternalVideoUrl(e.target.value)}
                                    data-testid="create-product-external-video-input"
                                />
                                <p className="text-xs text-muted-foreground">{t('products.detail.videoUrlHelp', 'Supported link from Youtube, Vimeo, etc.')}</p>
                            </div>

                            <Separator />

                            {/* Sample Section */}
                            <div className="space-y-1.5">
                                <FormLabel>{t('products.form.sampleTitle', 'Sample Title')}</FormLabel>
                                <Input 
                                    placeholder={t('products.form.sampleTitlePlaceholder', 'Enter a title for the sample')}
                                    value={sampleTitle}
                                    onChange={(e) => setSampleTitle(e.target.value)}
                                    data-testid="create-product-sample-title-input"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <FormLabel>{t('products.form.sampleSection')}</FormLabel>
                                <Select value={sampleSectionId} onValueChange={setSampleSectionId}>
                                    <SelectTrigger data-testid="create-product-sample-section-select">
                                        <SelectValue placeholder={t('products.form.selectSampleSection')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {sampleSections.map(sec => (
                                            <SelectItem key={sec.id} value={String(sec.id)}>{sec.title}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Media Type */}
                            <div className="space-y-1.5">
                                <FormLabel>{t('products.form.mediaType')}</FormLabel>
                                <Select value={mediaType} onValueChange={setMediaType}>
                                    <SelectTrigger data-testid="create-product-sample-media-type-select">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pdf">{t('products.form.mediaTypePdf', 'PDF')}</SelectItem>
                                        <SelectItem value="image">{t('products.form.mediaImage', 'Image')}</SelectItem>
                                        <SelectItem value="video">{t('products.form.mediaVideo', 'Video')}</SelectItem>
                                        <SelectItem value="word">{t('products.form.mediaWord', 'Word')}</SelectItem>
                                        <SelectItem value="powerpoint">{t('products.form.mediaPowerpoint', 'PowerPoint')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* HQ Sample */}
                                <div className="space-y-1.5">
                                    <FormLabel>{t('products.form.hqFile')}</FormLabel>
                                    <input
                                        ref={hqSampleInputRef}
                                        type="file"
                                        accept={mediaType === 'pdf' ? '.pdf,application/pdf' : mediaType === 'word' ? '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document' : mediaType === 'powerpoint' ? '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation' : mediaType === 'video' ? '.mp4,.webm,.mov,video/mp4,video/webm,video/quicktime' : mediaType === 'image' ? '.jpg,.jpeg,.png,.webp,.gif,.svg,image/*' : '*/*'}
                                        onChange={(e) => setHqSample(e.target.files?.[0] ?? null)}
                                        className="sr-only"
                                        data-testid="create-product-hq-sample-input"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={() => hqSampleInputRef.current?.click()}
                                        data-testid="create-product-hq-sample-button"
                                    >
                                        {t('products.form.chooseSampleFile')}
                                    </Button>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {hqSample?.name || t('products.form.noFileSelected')}
                                    </p>
                                </div>

                                {/* LQ Sample */}
                                <div className="space-y-1.5">
                                    <FormLabel>{t('products.form.lqFile')}</FormLabel>
                                    <input
                                        ref={lqSampleInputRef}
                                        type="file"
                                        accept={mediaType === 'pdf' ? '.pdf,application/pdf' : mediaType === 'word' ? '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document' : mediaType === 'powerpoint' ? '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation' : mediaType === 'video' ? '.mp4,.webm,.mov,video/mp4,video/webm,video/quicktime' : mediaType === 'image' ? '.jpg,.jpeg,.png,.webp,.gif,.svg,image/*' : '*/*'}
                                        onChange={(e) => setLqSample(e.target.files?.[0] ?? null)}
                                        className="sr-only"
                                        data-testid="create-product-lq-sample-input"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full justify-start"
                                        onClick={() => lqSampleInputRef.current?.click()}
                                        data-testid="create-product-lq-sample-button"
                                    >
                                        {t('products.form.chooseSampleFile')}
                                    </Button>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {lqSample?.name || t('products.form.noFileSelected')}
                                    </p>
                                </div>
                            </div>

                            <p className="text-xs text-muted-foreground">
                                {t('products.form.sampleFormats', 'Supported: images, videos, PDF, Word, PowerPoint')}
                            </p>
                        </div>
                        </AccordionContent>
                    </AccordionItem>

                    {/* ── Section: Quick Coupon ── */}
                    <AccordionItem value="coupon" className="rounded-xl border border-border px-5">
                        <AccordionTrigger className="sr-only">{t('products.quickCoupon.title')}</AccordionTrigger>
                        <AccordionContent className="space-y-4 pb-5 pt-5">

                        <div className="flex items-center justify-between gap-3">
                            <label htmlFor="create-product-quick-coupon-switch" className="text-sm font-medium">
                                {t('products.quickCoupon.enable')}
                            </label>
                            <Switch
                                id="create-product-quick-coupon-switch"
                                checked={quickCouponEnabled}
                                onCheckedChange={setQuickCouponEnabled}
                                data-testid="create-product-quick-coupon-switch"
                            />
                        </div>

                        {quickCouponEnabled && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium leading-none">{t('products.quickCoupon.code')}</label>
                                        <Input
                                            value={quickCouponCode}
                                            onChange={(e) => setQuickCouponCode(e.target.value.toUpperCase())}
                                            placeholder={t('products.quickCoupon.codePlaceholder')}
                                            data-testid="create-product-quick-coupon-code-input"
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="sm:self-end"
                                        disabled={couponLoading}
                                        onClick={handleGenerateQuickCouponCode}
                                        data-testid="create-product-quick-coupon-generate-button"
                                    >
                                        {t('products.quickCoupon.generate')}
                                    </Button>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium leading-none">{t('products.quickCoupon.type')}</label>
                                        <Select dir={i18n.dir()} value={quickCouponType} onValueChange={setQuickCouponType}>
                                            <SelectTrigger data-testid="create-product-quick-coupon-type-select">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="PERCENTAGE">{t('coupons.discountType.percentage')}</SelectItem>
                                                <SelectItem value="AMOUNT">{t('coupons.discountType.amount')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium leading-none">
                                            {quickCouponType === 'PERCENTAGE'
                                                ? t('products.quickCoupon.percentageValue')
                                                : t('products.quickCoupon.amountValue')}
                                        </label>
                                        <div className="relative">
                                            <Input
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                className="pe-14"
                                                value={quickCouponValue}
                                                onChange={(e) => setQuickCouponValue(e.target.value)}
                                                data-testid="create-product-quick-coupon-value-input"
                                            />
                                            <span
                                                className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted-foreground"
                                                data-testid="coupons-create-discount-amount-suffix"
                                            >
                                                {quickCouponType === 'PERCENTAGE' ? t('coupons.form.units.percentage') : t('coupons.form.units.amount')}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium leading-none">{t('coupons.form.expiresAt')}</label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className={cn(
                                                        'w-full justify-start text-start font-normal',
                                                        !quickCouponExpiresAt && 'text-muted-foreground'
                                                    )}
                                                    data-testid="create-product-quick-coupon-expires-at-input"
                                                >
                                                    <CalendarIcon className="me-2 h-4 w-4" />
                                                    {quickCouponExpiresAt
                                                        ? format(new Date(quickCouponExpiresAt), 'PPP', { locale: isRtl ? arSA : undefined })
                                                        : t('coupons.form.expiresAtPlaceholder')}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="end">
                                                <Calendar
                                                    mode="single"
                                                    selected={quickCouponExpiresAt ? new Date(quickCouponExpiresAt) : undefined}
                                                    onSelect={(date) => {
                                                        if (!date) return;
                                                        // End of the chosen day, so picking today still yields a
                                                        // future expiry (backend requires expires_at > now).
                                                        const endOfDay = new Date(date);
                                                        endOfDay.setHours(23, 59, 59, 999);
                                                        setQuickCouponExpiresAt(endOfDay.toISOString());
                                                    }}
                                                    locale={isRtl ? arSA : undefined}
                                                    dir={isRtl ? 'rtl' : 'ltr'}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>
                            </div>
                        )}
                        </AccordionContent>
                    </AccordionItem>
                    </Accordion>
                    </div>

                </form>
            </Form>
        </div>
    );
}
