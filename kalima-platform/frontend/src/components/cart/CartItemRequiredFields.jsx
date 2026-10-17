import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash, ImageOff, ArrowRight, Copy } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput, egyptPhoneSchema } from '@/components/ui/phone-input';
import { cn } from '@/lib/utils';
import { checkImageFile } from '@/lib/imageFile';
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/components/ui/accordion';

export default function CartItemRequiredFields({
    item,
    baseURL,
    updateCartItemRequiredFields,
    updateCartItemRequiredFieldsImage,
    onOpenChange
}) {
    const { t } = useTranslation('cart');
    const [isOpen, setIsOpen] = useState(!item?.required_fields_filled);
    const [fieldValues, setFieldValues] = useState({});
    const [imageFields, setImageFields] = useState({});
    const [originalImages, setOriginalImages] = useState({});
    const [fileErrors, setFileErrors] = useState({});
    const [brokenPreviews, setBrokenPreviews] = useState({});
    const [errorShakeTick, setErrorShakeTick] = useState(0);

    const [isDirty, setIsDirty] = useState(false);
    const [missingFields, setMissingFields] = useState([]);
    const [highlightSave, setHighlightSave] = useState(false);
    const [highlightedFields, setHighlightedFields] = useState({});

    // Use a ref to keep track of current fieldValues for the event listener 
    // to safely perform side effects based on current state.
    const fieldValuesRef = React.useRef(fieldValues);
    useEffect(() => {
        fieldValuesRef.current = fieldValues;
    }, [fieldValues]);

    // Listen for cross-item field synchronization
    useEffect(() => {
        const handleSync = (e) => {
            const { fieldDefinitionId, value, imageFile, sourceItemId, onlyEmpty } = e.detail;
            if (sourceItemId === item.id) return;

            // Find the target field to verify it belongs to this item
            const targetRf = item.cart_item_required_fields.find(
                rf => Number(rf.field_definition_id) === Number(fieldDefinitionId)
            );

            if (targetRf) {
                const id = targetRf.field_definition_id;
                const isImage = targetRf.required_field_definitions.field_type === 'image';

                // Check empty condition using the REF to avoid side-effects in setters
                const currentValue = fieldValuesRef.current[id];
                const isEmpty = isFieldEmpty(currentValue);
                if (onlyEmpty && !isEmpty) return;

                // Safely perform state updates independently
                setFieldValues(prev => ({ ...prev, [id]: value }));

                if (isImage) {
                    setImageFields(prev => {
                        const next = { ...prev };
                        if (imageFile instanceof File) {
                            next[id] = imageFile;
                        } else {
                            delete next[id];
                        }
                        return next;
                    });

                    if (typeof value === 'string' && value.trim() !== '' && !value.startsWith('blob:')) {
                        setOriginalImages(prev => {
                            if (prev[id]) return prev;
                            return { ...prev, [id]: value };
                        });
                    }

                    setBrokenPreviews(prev => {
                        const next = { ...prev };
                        delete next[`${id}_new`];
                        delete next[`${id}_old`];
                        return next;
                    });
                }

                setFileErrors(prev => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                });
            }
        };

        window.addEventListener('sync-cart-field-value', handleSync);
        return () => window.removeEventListener('sync-cart-field-value', handleSync);
    }, [item.id, item.cart_item_required_fields]);

    // Listen for bulk submit signal
    useEffect(() => {
        const handleSubmitAll = () => {
            if (isDirty && missingFields.length === 0) {
                handleCartRequiredFieldsSubmit({ preventDefault: () => { } });
            }
        };
        window.addEventListener('submit-all-cart-item-fields', handleSubmitAll);
        return () => window.removeEventListener('submit-all-cart-item-fields', handleSubmitAll);
    }, [isDirty, missingFields]);

    const isFieldEmpty = (val) => {
        return !val || (typeof val === 'string' && val.trim() === '') || val === '+20';
    };

    const syncFieldToAll = (fieldDefinitionId, onlyEmpty = false) => {
        const value = fieldValues[fieldDefinitionId];
        const imageFile = imageFields[fieldDefinitionId];

        if (isFieldEmpty(value)) {
            toast.error(t('valueEmptySync', 'Please enter a value or select an image before applying to others.'));
            return;
        }

        window.dispatchEvent(new CustomEvent('sync-cart-field-value', {
            detail: { fieldDefinitionId, value, imageFile, sourceItemId: item.id, onlyEmpty }
        }));

        if (onlyEmpty) {
            toast.info(t('fieldSyncedEmpty', 'Applied to empty similar fields.'));
        } else {
            toast.info(t('fieldSynced', 'Applied to all similar fields.'));
        }
    };

    const syncAllFieldsToOthers = (onlyEmpty = false) => {
        let itemsSynced = 0;
        item.cart_item_required_fields.forEach(rf => {
            const id = rf.field_definition_id;
            const value = fieldValues[id];
            const imageFile = imageFields[id];

            if (!isFieldEmpty(value)) {
                window.dispatchEvent(new CustomEvent('sync-cart-field-value', {
                    detail: { fieldDefinitionId: id, value, imageFile, sourceItemId: item.id, onlyEmpty }
                }));
                itemsSynced++;
            }
        });

        if (itemsSynced === 0) {
            toast.error(t('noFieldsToSync', 'No fields have values to apply to others.'));
            return;
        }

        if (onlyEmpty) {
            toast.info(t('allFieldsSyncedEmpty', 'All non-empty fields applied to other empty fields.'));
        } else {
            toast.info(t('allFieldsSynced', 'All non-empty fields applied to all other items.'));
        }
    };

    // Track if any field differs from what's saved
    useEffect(() => {
        let dirty = false;
        if (item && item.cart_item_required_fields) {
            item.cart_item_required_fields.forEach(rf => {
                if (rf.required_field_definitions.field_type === 'image') {
                    const id = rf.field_definition_id;
                    const currentValue = fieldValues[id];
                    const savedValue = rf.value ? new URL(rf.value, baseURL).toString() : '';

                    if (imageFields[id] instanceof File) {
                        dirty = true;
                    } else if (typeof currentValue === 'string' && currentValue.trim() !== '' && currentValue !== savedValue) {
                        dirty = true;
                    }
                } else {
                    let currentVal = fieldValues[rf.field_definition_id];
                    if (typeof currentVal === 'string' && (currentVal === '+' || currentVal === '+2' || currentVal === '+20')) {
                        currentVal = '';
                    }
                    const savedVal = rf.value || '';
                    if (currentVal !== undefined && currentVal !== savedVal) {
                        dirty = true;
                    }
                }
            });
        }
        setIsDirty(dirty);
    }, [fieldValues, imageFields, item, baseURL]);

    // Track missing fields
    useEffect(() => {
        let missing = [];
        if (item && item.cart_item_required_fields) {
            item.cart_item_required_fields.forEach(rf => {
                if (!rf.is_required) return;

                if (rf.required_field_definitions.field_type === 'image') {
                    const hasSaved = !!originalImages[rf.field_definition_id];
                    const hasNewFile = imageFields[rf.field_definition_id] instanceof File;
                    if (!hasSaved && !hasNewFile) {
                        missing.push(rf.field_definition_id);
                    }
                } else if (rf.required_field_definitions.field_type === 'number') {
                    const val = fieldValues[rf.field_definition_id];
                    if (isFieldEmpty(val)) {
                        missing.push(rf.field_definition_id);
                    } else {
                        const parsed = egyptPhoneSchema(t).safeParse(val || "");
                        if (!parsed.success) {
                            missing.push(rf.field_definition_id);
                        }
                    }
                } else {
                    const val = fieldValues[rf.field_definition_id];
                    if (val === undefined || val === null || String(val).trim() === '') {
                        missing.push(rf.field_definition_id);
                    }
                }
            });
        }
        setMissingFields(missing);
    }, [fieldValues, imageFields, item, originalImages]);

    // Dispatch global event so summary knows we have unsaved/missing fields
    useEffect(() => {
        if (!item?.id) return;
        const details = { itemId: item.id, isDirty, missingFields };
        const event = new CustomEvent('cart-item-client-state', {
            detail: details
        });
        window.dispatchEvent(event);

        const handleRequest = () => {
            window.dispatchEvent(new CustomEvent('cart-item-client-state', {
                detail: details
            }));
        };
        window.addEventListener('request-cart-item-client-state', handleRequest);
        return () => {
            window.removeEventListener('request-cart-item-client-state', handleRequest);
            window.dispatchEvent(new CustomEvent('cart-item-client-state', {
                detail: { itemId: item.id, isDirty: false, missingFields: [] }
            }));
        };
    }, [isDirty, missingFields, item?.id]);

    // Listen for highlight signal from checkout button
    useEffect(() => {
        const handleMissing = () => {
            if (missingFields.length > 0) {
                setIsOpen(true);
                const h = {};
                missingFields.forEach(id => h[id] = true);
                setHighlightedFields(h);
                setTimeout(() => setHighlightedFields({}), 2000);
            }
        };
        window.addEventListener('highlight-missing-fields', handleMissing);
        return () => window.removeEventListener('highlight-missing-fields', handleMissing);
    }, [missingFields]);

    useEffect(() => {
        const handleUnsaved = () => {
            if (isDirty && missingFields.length === 0) {
                setIsOpen(true);
                setHighlightSave(true);
                setTimeout(() => setHighlightSave(false), 2000);
            }
        };
        window.addEventListener('highlight-unsaved-save-buttons', handleUnsaved);
        return () => window.removeEventListener('highlight-unsaved-save-buttons', handleUnsaved);
    }, [isDirty, missingFields]);

    useEffect(() => {
        if (!item) return;
        const vals = {};
        const origImgs = {};
        const imgFields = {};

        item.cart_item_required_fields.forEach(rf => {
            if (rf.required_field_definitions.field_type === 'image') {
                const serverUrl = rf.value ? new URL(rf.value, baseURL).toString() : '';
                vals[rf.field_definition_id] = serverUrl;
                if (serverUrl) {
                    origImgs[rf.field_definition_id] = serverUrl;
                }
                imgFields[rf.field_definition_id] = null;
            } else if (rf.required_field_definitions.field_type === 'number') {
                vals[rf.field_definition_id] = rf.value || '+20';
            } else {
                vals[rf.field_definition_id] = rf.value || '';
            }
        });
        setFieldValues(prev => {
            const next = { ...prev };
            Object.keys(vals).forEach(id => {
                const isDefault = !next[id] || next[id] === '' || next[id] === '+20';
                if (isDefault || !Object.prototype.hasOwnProperty.call(next, id)) {
                    next[id] = vals[id];
                }
            });
            return next;
        });
        setOriginalImages(prev => ({ ...origImgs, ...prev }));
        setImageFields(prev => ({ ...imgFields, ...prev }));
    }, [item, baseURL]);

    const getFileFromUrl = async (url, defaultName) => {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch image from ${url}`);
            const blob = await response.blob();
            const filename = defaultName || url.split('/').pop().split('?')[0] || 'image';
            return new File([blob], filename, { type: blob.type || 'application/octet-stream' });
        } catch (error) {
            console.error('Unable to convert image URL to file:', error);
            return null;
        }
    };

    async function handleCartRequiredFieldsSubmit(e) {
        e.preventDefault();
        let hasError = false;
        const errors = {};

        item.cart_item_required_fields.forEach(rf => {
            const id = rf.field_definition_id;
            const isImage = rf.required_field_definitions.field_type === 'image';

            if (isImage && rf.is_required) {
                const hasNewFile = imageFields[id] instanceof File || (imageFields[id] && imageFields[id].name);
                const hasOriginal = !!originalImages[id];
                const hasSyncedUrl = fieldValues[id] && typeof fieldValues[id] === 'string' && !fieldValues[id].startsWith('blob:');

                if (!hasNewFile && !hasOriginal && !hasSyncedUrl) {
                    hasError = true;
                    errors[id] = t('pleaseSelectFile', 'Please select a file');
                }
            } else if (rf.required_field_definitions.field_type === 'number') {
                const val = fieldValues[id];
                const rawVal = String(val || "").trim();

                if (rf.is_required || (rawVal !== '' && rawVal !== '+' && rawVal !== '+2' && rawVal !== '+20')) {
                    const parsed = egyptPhoneSchema(t).safeParse(rawVal);
                    if (!parsed.success) {
                        hasError = true;
                        errors[id] = t('invalidPhone', 'Invalid Egyptian mobile number');
                    }
                }
            }
        });

        if (hasError) {
            setFileErrors(errors);
            setErrorShakeTick(prev => prev + 1);
            return;
        }

        setFileErrors({});

        const imagePromises = [];
        for (const rf of item.cart_item_required_fields) {
            if (rf.required_field_definitions.field_type === 'image') {
                const id = rf.field_definition_id;
                let file = imageFields[id];

                if (!(file instanceof File) && typeof fieldValues[id] === 'string' && fieldValues[id].trim() !== '') {
                    file = await getFileFromUrl(fieldValues[id], `required-field-${id}`);
                }

                if (file instanceof File) {
                    const p = updateCartItemRequiredFieldsImage(
                        item.id,
                        id,
                        file
                    ).then(() => {
                        setImageFields(prev => ({ ...prev, [id]: null }));
                        setOriginalImages(prev => {
                            const copy = { ...prev };
                            delete copy[id];
                            return copy;
                        });
                        setFieldValues(prev => ({ ...prev, [id]: '' }));
                        const inputEl = document.getElementById(`file-${item.id}-${id}`);
                        if (inputEl) inputEl.value = '';
                    }).catch(err => {
                        console.error('Required fields image update failed:', err);
                        throw err;
                    });
                    imagePromises.push(p);
                }
            }
        }

        try {
            await Promise.all(imagePromises);
        } catch (err) {
            // ignore
        }

        const data = Object.entries(fieldValues)
            .filter(([id]) => {
                const rf = item.cart_item_required_fields.find(f => f.field_definition_id === Number(id));
                return rf?.required_field_definitions.field_type !== 'image';
            })
            .map(([id, value]) => {
                let finalValue = value;
                if (typeof finalValue === 'string' && (finalValue === '+' || finalValue === '+2' || finalValue === '+20')) {
                    finalValue = '';
                }
                return {
                    required_field_definition_id: Number(id),
                    value: finalValue,
                };
            });

        try {
            if (data.length > 0) {
                await updateCartItemRequiredFields(item.id, data);
            }
        } catch (e) {
            console.error('failed updating required fields', e);
        }
    };

    if (!item.cart_item_required_fields || item.cart_item_required_fields.length === 0) {
        return null;
    }

    return (
        <div className="mt-2 overflow-x-hidden">
            <Accordion
                type="single"
                collapsible
                value={isOpen ? 'fields' : ''}
                className="w-full mb-2 overflow-x-hidden"
                onValueChange={val => {
                    const open = !!val;
                    setIsOpen(open);
                    onOpenChange?.(item.id, open);
                }}
            >
                <AccordionItem value="fields">
                    <AccordionTrigger className={"text-sm " + (item.required_fields_filled ? "text-success" : "text-primary")} data-testid={`cart-item-fields-accordion-${item.id}`}>
                        <div className="flex flex-wrap items-center justify-between w-full gap-x-4 gap-y-2 px-1">
                            <span className="font-bold flex-1 min-w-[140px] text-left rtl:text-right">
                                {isOpen ? t('hideRequiredFields', 'Hide required fields') : t('viewRequiredFields', 'View required fields')}
                            </span>
                            <div className="flex items-center gap-3 me-2 border-primary/10 sm:border-s sm:ps-3" onClick={e => e.stopPropagation()}>
                                <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => syncAllFieldsToOthers(true)}
                                    onKeyDown={e => e.key === 'Enter' && syncAllFieldsToOthers(true)}
                                    className="text-[10px] font-bold text-primary flex items-center gap-1.5 hover:opacity-80 transition-opacity whitespace-nowrap cursor-pointer select-none bg-primary/5 px-2 py-1 rounded-lg"
                                    title={t('applyAllToEmptyItems', 'Apply ALL fields to empty ones')}
                                >
                                    <Copy className="w-3 h-3" />
                                    {t('applyAllToEmpty', 'All to Empty')}
                                </span>
                                <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => syncAllFieldsToOthers(false)}
                                    onKeyDown={e => e.key === 'Enter' && syncAllFieldsToOthers(false)}
                                    className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5 hover:text-primary transition-colors border-s border-border/40 ps-3 whitespace-nowrap cursor-pointer select-none"
                                    title={t('copyAllToAllItems', 'Overwrite ALL fields in similar items')}
                                >
                                    {t('applyAllToAll', 'All to All')}
                                </span>
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="mt-2 space-y-2 p-2 border rounded overflow-x-hidden min-w-0 w-full box-border max-w-full">
                        <form onSubmit={handleCartRequiredFieldsSubmit} className='flex flex-col gap-2 w-full max-w-full overflow-x-hidden'>
                            {item.cart_item_required_fields.map(rf => (
                                <div key={rf.field_definition_id} className="flex flex-col">
                                    <div className="flex flex-wrap items-center justify-between mb-1.5 gap-2">
                                        <label className="text-xs font-bold text-foreground/80">
                                            {rf.required_field_definitions.label}
                                            {rf.is_required && <span className="text-destructive ms-0.5">*</span>}
                                        </label>
                                        {!isFieldEmpty(fieldValues[rf.field_definition_id]) && (
                                            <div className="flex items-center gap-3">
                                                <span
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => syncFieldToAll(rf.field_definition_id, true)}
                                                    onKeyDown={e => e.key === 'Enter' && syncFieldToAll(rf.field_definition_id, true)}
                                                    className="text-[9px] font-bold text-primary flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer select-none"
                                                    title={t('applyToEmptyItems', 'Apply ONLY to empty fields')}
                                                >
                                                    <Copy className="w-2.5 h-2.5" />
                                                    {t('applyToEmpty', 'To Empty')}
                                                </span>
                                                <span
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => syncFieldToAll(rf.field_definition_id, false)}
                                                    onKeyDown={e => e.key === 'Enter' && syncFieldToAll(rf.field_definition_id, false)}
                                                    className="text-[9px] font-bold text-muted-foreground flex items-center gap-1 hover:text-primary transition-colors border-s border-border/40 ps-2.5 cursor-pointer select-none"
                                                    title={t('copyToAllItems', 'Overwrite all similar fields')}
                                                >
                                                    {t('applyToAll', 'To All')}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    {rf.required_field_definitions.field_type === 'image' ? (
                                        <>
                                            <div className="flex items-center gap-2 min-w-0">
                                                <label
                                                    htmlFor={`file-${item.id}-${rf.field_definition_id}`}
                                                    className={`cursor-pointer px-3 py-1 bg-accent text-accent-foreground rounded-sm text-sm transition-all duration-300 ${highlightedFields[rf.field_definition_id] ? 'ring-2 ring-destructive ring-offset-2 animate-pulse bg-destructive/20 text-destructive' : ''}`}
                                                    data-testid={`cart-item-fields-upload-${item.id}-${rf.field_definition_id}`}
                                                >
                                                    {originalImages[rf.field_definition_id]
                                                        ? t('replaceImage', 'Replace image')
                                                        : t('uploadImage', 'Upload image')}
                                                </label>
                                                <Input
                                                    id={`file-${item.id}-${rf.field_definition_id}`}
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={e => {
                                                        const file = e.target.files?.[0];
                                                        if (file && !checkImageFile(file)) {
                                                            e.target.value = "";
                                                            return;
                                                        }
                                                        if (file) {
                                                            setImageFields(prev => ({
                                                                ...prev,
                                                                [rf.field_definition_id]: file,
                                                            }));
                                                            const url = URL.createObjectURL(file);
                                                            setFieldValues(prev => ({
                                                                ...prev,
                                                                [rf.field_definition_id]: url,
                                                            }));
                                                            setFileErrors(prev => {
                                                                const copy = { ...prev };
                                                                delete copy[rf.field_definition_id];
                                                                return copy;
                                                            });
                                                            setBrokenPreviews(prev => {
                                                                const copy = { ...prev };
                                                                delete copy[`${rf.field_definition_id}_new`];
                                                                return copy;
                                                            });
                                                        }
                                                    }}
                                                    className="sr-only"
                                                    data-testid={`cart-item-fields-file-${item.id}-${rf.field_definition_id}`}
                                                />
                                                {imageFields[rf.field_definition_id] ? (
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-sm max-w-40 truncate block" title={imageFields[rf.field_definition_id].name}>
                                                            {imageFields[rf.field_definition_id].name}
                                                        </span>
                                                        <Button
                                                            type="button"
                                                            onClick={() => {
                                                                setImageFields(prev => ({
                                                                    ...prev,
                                                                    [rf.field_definition_id]: null,
                                                                }));
                                                                setFieldValues(prev => ({
                                                                    ...prev,
                                                                    [rf.field_definition_id]: originalImages[rf.field_definition_id] || '',
                                                                }));
                                                                const inputEl = document.getElementById(
                                                                    `file-${item.id}-${rf.field_definition_id}`
                                                                );
                                                                if (inputEl) inputEl.value = '';
                                                            }}
                                                            className="text-xs"
                                                            data-testid={`cart-item-fields-remove-image-${item.id}-${rf.field_definition_id}`}
                                                        >
                                                            <Trash className="w-3 h-3" />
                                                        </Button>
                                                    </div>
                                                ) : null}
                                                {fileErrors[rf.field_definition_id] && (
                                                    <motion.p
                                                        key={`error-${rf.field_definition_id}-${errorShakeTick}`}
                                                        initial={{ x: 0 }}
                                                        animate={{ x: [0, -7, 7, -5, 5, -3, 3, 0] }}
                                                        transition={{ duration: 0.35 }}
                                                        className="text-destructive text-xs mt-1"
                                                    >
                                                        {fileErrors[rf.field_definition_id]}
                                                    </motion.p>
                                                )}
                                            </div>
                                            {
                                                (() => {
                                                    const originalUrl = originalImages[rf.field_definition_id];
                                                    const hasSelectedFile = !!(imageFields[rf.field_definition_id] instanceof File);
                                                    const selectedUrl = fieldValues[rf.field_definition_id];
                                                    const isReplacingImage = originalUrl && selectedUrl && selectedUrl !== originalUrl;

                                                    const brokenOld = !!brokenPreviews[`${rf.field_definition_id}_old`];
                                                    const brokenNew = !!brokenPreviews[`${rf.field_definition_id}_new`];

                                                    if (isReplacingImage) {
                                                        return (
                                                            <div className="mt-2 flex flex-wrap items-center gap-3 max-w-full min-w-0">
                                                                <div className="w-20 h-20 overflow-hidden rounded bg-muted border shrink-0">
                                                                    {!brokenOld ? (
                                                                        <img
                                                                            src={originalUrl}
                                                                            alt={t('oldImage', 'Old image')}
                                                                            className="w-full h-full object-cover max-w-full"
                                                                            onError={() => setBrokenPreviews(prev => ({ ...prev, [`${rf.field_definition_id}_old`]: true }))}
                                                                        />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                                                            <ImageOff className="w-6 h-6 text-gray-400" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <ArrowRight className="w-5 h-5 text-muted-foreground" />
                                                                <div className="w-20 h-20 overflow-hidden rounded bg-muted border shrink-0">
                                                                    {!brokenNew ? (
                                                                        <img
                                                                            src={selectedUrl}
                                                                            alt={t('newImage', 'New image')}
                                                                            className="w-full h-full object-cover max-w-full"
                                                                            onError={() => setBrokenPreviews(prev => ({ ...prev, [`${rf.field_definition_id}_new`]: true }))}
                                                                        />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                                                            <ImageOff className="w-6 h-6 text-gray-400" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    }

                                                    const singleUrl = selectedUrl || originalUrl;
                                                    const singleBroken = selectedUrl ? brokenNew : brokenOld;
                                                    if (singleUrl && !singleBroken) {
                                                        return (
                                                            <img
                                                                src={singleUrl}
                                                                alt={t('preview', 'Preview')}
                                                                className="mt-2 w-24 max-w-full h-auto rounded"
                                                                style={{ display: 'block', maxWidth: '100%' }}
                                                                onError={() => {
                                                                    setBrokenPreviews(prev => ({ ...prev, [selectedUrl ? `${rf.field_definition_id}_new` : `${rf.field_definition_id}_old`]: true }));
                                                                }}
                                                            />
                                                        );
                                                    }

                                                    return (
                                                        <div className="mt-2 w-24 h-24 flex items-center justify-center bg-muted rounded">
                                                            <ImageOff className="w-6 h-6 text-muted-foreground" />
                                                        </div>
                                                    );
                                                })()
                                            }
                                        </>
                                    ) : rf?.required_field_definitions?.field_type === 'number' ? (
                                        <>
                                            <PhoneInput
                                                value={fieldValues[rf.field_definition_id] || '+20'}
                                                required={rf?.is_required}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setFieldValues(prev => ({
                                                        ...prev,
                                                        [rf.field_definition_id]: val,
                                                    }));
                                                    setFileErrors(prev => {
                                                        const copy = { ...prev };
                                                        delete copy[rf.field_definition_id];
                                                        return copy;
                                                    });
                                                }}
                                                className={`input-sm outline-none transition-all duration-300 ${highlightedFields[rf.field_definition_id] ? 'ring-2 ring-destructive ring-offset-1 animate-pulse border-destructive bg-destructive/5' : ''}`}
                                                data-testid={`cart-item-fields-input-${item.id}-${rf.field_definition_id}`}
                                            />
                                            {fileErrors[rf.field_definition_id] && (
                                                <motion.p
                                                    key={`error-text-${rf.field_definition_id}-${errorShakeTick}`}
                                                    initial={{ x: 0 }}
                                                    animate={{ x: [0, -7, 7, -5, 5, -3, 3, 0] }}
                                                    transition={{ duration: 0.35 }}
                                                    className="text-destructive text-xs mt-1"
                                                >
                                                    {fileErrors[rf.field_definition_id]}
                                                </motion.p>
                                            )}
                                        </>
                                    ) : (
                                        <Input
                                            type={rf?.required_field_definitions?.field_type}
                                            value={fieldValues[rf.field_definition_id] || ''}
                                            required={rf?.is_required}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setFieldValues(prev => ({
                                                    ...prev,
                                                    [rf.field_definition_id]: val,
                                                }));
                                            }}
                                            className={`input-sm transition-all duration-300 ${highlightedFields[rf.field_definition_id] ? 'ring-2 ring-destructive ring-offset-1 animate-pulse border-destructive bg-destructive/5' : ''}`}
                                            data-testid={`cart-item-fields-input-${item.id}-${rf.field_definition_id}`}
                                        />
                                    )}
                                </div>
                            ))}
                            {(isDirty || missingFields.length > 0) && (
                                <div className="flex justify-center sm:justify-end mt-4 p-2">
                                    <Button
                                        size="lg"
                                        type="submit"
                                        className={cn(
                                            "w-full sm:w-auto font-bold rounded-xl shadow-lg transition-all duration-300",
                                            highlightSave ? 'scale-[1.02] ring-4 ring-primary/20 animate-pulse bg-primary/90' : ''
                                        )}
                                        data-testid={`cart-item-fields-save-${item.id}`}
                                    >
                                        {t('save', 'Save Changes')}
                                    </Button>
                                </div>
                            )}
                        </form>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
}
