/* eslint-disable react/prop-types */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Form,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import CreateCouponCodeField from '@/components/admin/coupons/CreateCouponCodeField';
import CreateCouponDiscountFields from '@/components/admin/coupons/CreateCouponDiscountFields';
import CouponApplicabilityField from '@/components/admin/coupons/CouponApplicabilityField';
import CreateCouponDateFields from '@/components/admin/coupons/CreateCouponDateFields';

const getProductId = (product) => product?.id || product?._id;
const getProductPrice = (product) => {
    if (!product) return undefined;
    const parsed = Number(product.price);
    return Number.isFinite(parsed) ? parsed : undefined;
};

export default function CreateCouponDialog({
    onGenerateCode,
    onSubmitCoupon,
    loading,
    onSuccess,
    products,
    productPagination,
    productsLoading,
    productSearch,
    onProductSearchChange,
    onProductPageChange,
}) {
    const { t, i18n } = useTranslation('admin');
    const [open, setOpen] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const isRtl = i18n.language?.startsWith('ar');

    const schema = z
        .object({
            code: z
                .string()
                .trim()
                .min(6, t('coupons.validation.codeMinLength'))
                .regex(/^[A-Z0-9-]+$/, t('coupons.validation.codeFormat')),
            discount_type: z.enum(['PERCENTAGE', 'AMOUNT'], {
                required_error: t('coupons.validation.discountTypeRequired'),
                invalid_type_error: t('coupons.validation.discountTypeRequired'),
            }),
            discount_percentage: z.preprocess(
                (value) => {
                    if (value === '' || value === null || value === undefined) return undefined;
                    const parsed = Number(value);
                    return Number.isNaN(parsed) ? Number.NaN : parsed;
                },
                z
                    .number({ invalid_type_error: t('coupons.validation.discountPercentageInvalid') })
                    .positive(t('coupons.validation.discountValuePositive'))
                    .optional()
            ),
            discount_amount: z.preprocess(
                (value) => {
                    if (value === '' || value === null || value === undefined) return undefined;
                    const parsed = Number(value);
                    return Number.isNaN(parsed) ? Number.NaN : parsed;
                },
                z
                    .number({ invalid_type_error: t('coupons.validation.discountAmountInvalid') })
                    .positive(t('coupons.validation.discountValuePositive'))
                    .optional()
            ),
            applicability_scope: z.enum(['product', 'category']),
            product_id: z.string().optional(),
            category_id: z.string().optional(),
            starts_at: z.string().optional(),
            expires_at: z.string().min(1, t('coupons.validation.expiresAtRequired')),
        })
        .superRefine((values, ctx) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (values.discount_type === 'PERCENTAGE') {
                if (values.discount_percentage === undefined) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ['discount_percentage'],
                        message: t('coupons.validation.discountPercentageRequired'),
                    });
                } else if (values.discount_percentage > 100) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ['discount_percentage'],
                        message: t('coupons.validation.discountPercentageMax'),
                    });
                }
            }

            if (values.discount_type === 'AMOUNT' && values.discount_amount === undefined) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['discount_amount'],
                    message: t('coupons.validation.discountAmountRequired'),
                });
            }

            if (values.discount_type === 'AMOUNT' && values.discount_amount !== undefined) {
                if (values.applicability_scope === 'product') {
                    const selectedProduct = products?.find(
                        (product) => String(getProductId(product)) === String(values.product_id)
                    );
                    const productPrice = getProductPrice(selectedProduct);

                    if (productPrice !== undefined && values.discount_amount > productPrice) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            path: ['discount_amount'],
                            message: t('coupons.validation.discountAmountExceedsProductPrice'),
                        });
                    }
                }
            }

            if (values.applicability_scope === 'product' && !values.product_id) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['product_id'],
                    message: t('coupons.validation.productRequired'),
                });
            }

            if (values.applicability_scope === 'category' && !values.category_id) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['category_id'],
                    message: t('coupons.validation.categoryRequired'),
                });
            }

            const startsAtDate = values.starts_at ? new Date(values.starts_at) : null;
            const expiresAtDate = values.expires_at ? new Date(values.expires_at) : null;

            if (
                expiresAtDate
                && !Number.isNaN(expiresAtDate.getTime())
                && expiresAtDate < today
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['expires_at'],
                    message: t('coupons.validation.expiresAtNotPast'),
                });
            }

            if (
                startsAtDate
                && expiresAtDate
                && !Number.isNaN(startsAtDate.getTime())
                && !Number.isNaN(expiresAtDate.getTime())
                && startsAtDate >= expiresAtDate
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['starts_at'],
                    message: t('coupons.validation.startsAtBeforeExpiresAt'),
                });
            }
        });

    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            code: '',
            discount_type: 'PERCENTAGE',
            discount_percentage: undefined,
            discount_amount: undefined,
            applicability_scope: 'product',
            product_id: '',
            category_id: '',
            starts_at: '',
            expires_at: '',
        },
        mode: 'onChange',
    });

    const discountType = form.watch('discount_type');
    const selectedProductId = form.watch('product_id');
    const selectedStartsDate = form.watch('starts_at');
    const selectedExpiryDate = form.watch('expires_at');

    const selectedProduct = products?.find((product) => String(getProductId(product)) === String(selectedProductId));
    const selectedProductLabel = selectedProduct?.title
        ? `${selectedProduct.title} (${selectedProductId})`
        : selectedProductId || '';

    const handleGenerateCode = async () => {
        const generatedCode = await onGenerateCode();
        if (generatedCode) {
            form.setValue('code', generatedCode, { shouldDirty: true, shouldValidate: true });
        }
    };

    const onSubmit = async (values) => {
        const payload = {
            code: values.code,
            discount_type: values.discount_type,
            applicability_scope: values.applicability_scope,
            ...(values.applicability_scope === 'product'
                ? { product_id: values.product_id }
                : { category_id: values.category_id }),
            active: true,
            ...(values.starts_at ? { starts_at: new Date(values.starts_at).toISOString() } : {}),
            ...(values.expires_at
                ? {
                      // End of the chosen day, so picking today still yields a
                      // future expiry (backend requires expires_at > now).
                      expires_at: (() => {
                          const d = new Date(values.expires_at);
                          d.setHours(23, 59, 59, 999);
                          return d.toISOString();
                      })(),
                  }
                : {}),
            ...(values.discount_type === 'PERCENTAGE'
                ? { discount_percentage: values.discount_percentage }
                : { discount_amount: values.discount_amount }),
        };

        const result = await onSubmitCoupon(payload);
        if (result) {
            setOpen(false);
            form.reset({
                code: '',
                discount_type: 'PERCENTAGE',
                discount_percentage: undefined,
                discount_amount: undefined,
                applicability_scope: 'product',
                product_id: '',
                category_id: '',
                starts_at: '',
                expires_at: '',
            });
            onSuccess?.();
        }
    };

    const handleSelectProduct = (product) => {
        const productId = getProductId(product);
        if (!productId) return;

        form.setValue('product_id', String(productId), {
            shouldDirty: true,
            shouldValidate: true,
            shouldTouch: true,
        });
        setPickerOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button data-testid="coupons-create-open-button">
                    <Plus className="me-2 h-4 w-4" />
                    {t('coupons.actions.create')}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-140 max-h-[90vh] overflow-y-auto custom-scrollbar" data-testid="coupons-create-dialog">
                <DialogHeader>
                    <DialogTitle>{t('coupons.create.title')}</DialogTitle>
                    <DialogDescription>{t('coupons.create.description')}</DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <CreateCouponCodeField
                            form={form}
                            t={t}
                            loading={loading}
                            onGenerateCode={handleGenerateCode}
                        />

                        <CreateCouponDiscountFields
                            form={form}
                            discountType={discountType}
                            t={t}
                        />

                        <CouponApplicabilityField
                            form={form}
                            t={t}
                            mode="create"
                            pickerOpen={pickerOpen}
                            setPickerOpen={setPickerOpen}
                            products={products}
                            productPagination={productPagination}
                            productsLoading={productsLoading}
                            productSearch={productSearch}
                            onProductSearchChange={onProductSearchChange}
                            onProductPageChange={onProductPageChange}
                            onSelectProduct={handleSelectProduct}
                            selectedProductId={selectedProductId}
                            selectedProductLabel={selectedProductLabel}
                            selectedProduct={selectedProduct}
                        />

                        <CreateCouponDateFields
                            form={form}
                            t={t}
                            isRtl={isRtl}
                            selectedStartsDate={selectedStartsDate}
                            selectedExpiryDate={selectedExpiryDate}
                        />

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                                disabled={loading}
                                data-testid="coupons-create-cancel-button"
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button
                                type="submit"
                                disabled={loading || !form.formState.isValid}
                                data-testid="coupons-create-submit-button"
                            >
                                {loading ? <LoadingSpinner className="h-4 w-4" /> : t('common.confirm')}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
