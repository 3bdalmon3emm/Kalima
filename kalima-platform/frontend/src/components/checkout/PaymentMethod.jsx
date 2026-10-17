/* eslint-disable react/prop-types */
import React, { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertDialog, AlertDialogContent, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "../ui/input";
import { ImageOff, Upload, X, Image as ImageIcon, ShieldCheck } from "lucide-react";
import { getImageUrl } from "@/lib/storeUtils";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { PhoneInput, egyptPhoneSchema } from "@/components/ui/phone-input";
import { motion } from "framer-motion";
import { checkImageFile } from "@/lib/imageFile";

export default function PaymentMethod({ getPaymentMethods, selectedId, onSelect,
    numberTransferredFrom, setNumberTransferredFrom,
    notes, setNotes,
    screenshotFile, setScreenshotFile, setValidationErrors, isFreeOrder = false }) {
    const { t, i18n } = useTranslation('checkout');
    const [methods, setMethods] = useState([]);
    const fileInputRef = useRef(null);
    const [showPreview, setShowPreview] = useState(false);
    const [previewUrl, setPreviewUrl] = useState('');

    const schema = React.useMemo(() => z.object({
        numberTransferredFrom: isFreeOrder
            ? z.string().optional()
            : egyptPhoneSchema(t).refine(val => val && val !== "+20", { message: t('validation.required', 'Required') }),
    }), [isFreeOrder]);

    const {
        control,
        trigger,
        formState: { errors, isValid }
    } = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            numberTransferredFrom: numberTransferredFrom || "",
        },
        mode: "onChange",
    });

    useEffect(() => {
        if (setValidationErrors) {
            setValidationErrors(!isValid);
        }
    }, [isValid, setValidationErrors]);

    useEffect(() => {
        if (screenshotFile) {
            const url = URL.createObjectURL(screenshotFile);
            setPreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        } else {
            setPreviewUrl('');
        }
    }, [screenshotFile]);

    useEffect(() => {
        getPaymentMethods().then(setMethods).catch(console.error);
    }, [getPaymentMethods]);

    const safeMethods = Array.isArray(methods) ? methods : [];

    return (
        <Card className="border border-border/40 bg-card/60 backdrop-blur-md shadow-xl rounded-3xl overflow-hidden">
            <CardHeader className="gap-1 pb-6 bg-muted/20 border-b border-border/5">
                <CardTitle className="text-2xl font-black uppercase tracking-tight">{t('payment.title')}</CardTitle>
            </CardHeader>
            <CardContent className="p-8">
                {isFreeOrder ? (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center justify-center py-12 text-center space-y-6"
                    >
                        <div className="relative">
                            <div className="absolute bg-primary/20 blur-2xl rounded-full scale-150" />
                            <div className="relative p-6 rounded-3xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
                                <ShieldCheck className={`w-16 h-16 ${i18n.dir() === 'rtl' ? 'scale-x-[-1]' : ''}`} strokeWidth={1.5} />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-2xl font-black tracking-tight">{t('payment.freeOrderNotice')}</h3>
                        </div>

                    </motion.div>
                ) : (
                    <>
                        <div className="grid gap-4">
                            <Label htmlFor="transfer-screenshot" className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-2">
                                {t('payment.chooseMethod')}
                                <span className="text-destructive">*</span>
                            </Label>
                            <RadioGroup
                                value={selectedId?.toString()}
                                onValueChange={val => onSelect && onSelect(Number(val))}
                                className="grid gap-3"
                                dir={i18n.dir()}
                                data-testid="checkout-payment-method-list"
                            >
                                {safeMethods.map(m => {
                                    const isSelected = selectedId?.toString() === m.id.toString();
                                    return (
                                        <div
                                            key={m.id}
                                            className={`group relative border transition-all duration-300 rounded-2xl overflow-hidden ${isSelected ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : 'border-border/40 hover:border-primary/20 hover:bg-muted/30'}`}
                                        >
                                            <div className="flex justify-between items-center p-5">
                                                <div className="flex items-center gap-4">
                                                    <RadioGroupItem
                                                        value={m.id.toString()}
                                                        id={`pm-${m.id}`}
                                                        className="border-primary/40 text-primary"
                                                        data-testid={`checkout-payment-method-${m.id}`}
                                                    />
                                                    <Label htmlFor={`pm-${m.id}`} className="font-bold cursor-pointer text-base">
                                                        {m.name}
                                                    </Label>
                                                </div>
                                                {m?.image_url && (
                                                    <div className="p-1 px-2 rounded-lg bg-white/10 shadow-sm border border-border/10">
                                                        <img
                                                            src={getImageUrl(m.image_url) || ''}
                                                            alt={m.name}
                                                            className="w-10 h-7 object-contain grayscale-[0.5] group-hover:grayscale-0 transition-all"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            {m.phone_number && isSelected && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    className="px-5 pb-5 pt-0 text-xs font-black uppercase tracking-wider text-primary"
                                                >
                                                    <div className="pt-4 border-t border-primary/20 flex items-center gap-2">
                                                        <span className="opacity-60">{t('payment.phone')}:</span>
                                                        <span className="select-all">{m.phone_number}</span>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </div>
                                    );
                                })}
                            </RadioGroup>
                        </div>

                        {/* bank transfer inputs */}
                        <div className="grid gap-8 mt-10">
                            <div className="grid gap-3">
                                <Label htmlFor="transfer-number" className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                                    {t('payment.transferNumber')}
                                    <span className="text-destructive ms-1">*</span>
                                </Label>
                                <Controller
                                    control={control}
                                    name="numberTransferredFrom"
                                    render={({ field }) => (
                                        <div className="space-y-2">
                                            <PhoneInput
                                                id="transfer-number"
                                                dir="ltr"
                                                {...field}
                                                onChange={(e) => {
                                                    field.onChange(e);
                                                    setNumberTransferredFrom(e.target.value);
                                                }}
                                                onBlur={() => trigger("numberTransferredFrom")}
                                                className="h-14 bg-background/50 rounded-2xl border-border/40 focus:ring-primary/20 transition-all font-medium text-lg"
                                                data-testid="checkout-payment-method-transfer-number"
                                            />
                                            {errors.numberTransferredFrom && (
                                                <p className="text-destructive text-xs font-bold uppercase tracking-tighter">
                                                    {errors.numberTransferredFrom.message?.toString()}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                />
                            </div>

                            <div className="grid gap-3" data-testid="checkout-payment-method-screenshot-section">
                                <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center justify-between">
                                    {t('payment.screenshot')}
                                    <span className="text-destructive">*</span>
                                </Label>

                                {screenshotFile ? (
                                    <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-2xl p-4 transition-all">
                                        <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                            <ImageIcon className="w-5 h-5" />
                                        </div>
                                        <button
                                            type="button"
                                            className="text-sm font-bold truncate flex-1 text-start hover:text-primary transition-colors"
                                            onClick={() => setShowPreview(true)}
                                            data-testid="checkout-payment-method-preview-button"
                                        >
                                            {screenshotFile.name}
                                        </button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className="h-8 w-8 rounded-full text-destructive hover:bg-destructive/10"
                                            onClick={() => {
                                                setScreenshotFile(null);
                                                if (fileInputRef.current) fileInputRef.current.value = '';
                                            }}
                                            aria-label={t('payment.removeScreenshot', 'Remove screenshot')}
                                            data-testid="checkout-payment-method-remove-button"
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <motion.label
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.99 }}
                                        htmlFor="transfer-screenshot"
                                        className="cursor-pointer border-2 border-dashed border-primary/20 hover:border-primary/40 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 bg-primary/5 hover:bg-primary/10 transition-all group lg:min-h-[160px]"
                                        data-testid="checkout-payment-method-upload-button"
                                    >
                                        <div className="h-12 w-12 rounded-full bg-primary/20 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all shadow-lg shadow-primary/10">
                                            <Upload className="w-6 h-6" />
                                        </div>
                                        <div className="text-center">
                                            <span className="font-bold text-base block text-foreground">{t('payment.uploadScreenshotButton', 'Select payment receipt')}</span>
                                            <span className="text-xs font-medium text-muted-foreground opacity-70 mt-1 block">{t('payment.uploadHint', 'PNG, JPG up to 5MB')}</span>
                                        </div>
                                    </motion.label>
                                )}

                                <Input
                                    id="transfer-screenshot"
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            if (!checkImageFile(file)) {
                                                e.target.value = "";
                                                return;
                                            }
                                            setScreenshotFile(file);
                                        }
                                    }}
                                    data-testid="checkout-payment-method-file-input"
                                />
                            </div>
                        </div>
                    </>
                )}
            </CardContent>
            {/* preview dialog */}
            <AlertDialog open={showPreview} onOpenChange={setShowPreview}>
                <AlertDialogContent>
                    {previewUrl ? <img src={previewUrl} alt={t('payment.preview', 'Screenshot preview')} className="w-full h-auto" /> : <ImageOff className="w-16 h-16 text-muted-foreground mx-auto my-8" />}
                    <AlertDialogFooter>
                        <Button variant="destructive" onClick={() => { setScreenshotFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} data-testid="checkout-payment-method-dialog-remove-button">
                            {t('payment.removeScreenshot', 'Remove')}
                        </Button>
                        <AlertDialogCancel data-testid="checkout-payment-method-dialog-cancel-button">{t('payment.cancel', 'Cancel')}</AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
