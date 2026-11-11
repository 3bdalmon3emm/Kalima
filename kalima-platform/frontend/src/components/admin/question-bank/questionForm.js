// Converts between the API question and the editor state, and back.

let counter = 0;
export const newKey = () => `new-${Date.now()}-${++counter}`;

const media = (obj, id) => (obj ? obj : id ? { id, url: null } : null);

export function emptyOption(text = '') {
    return { id: null, key: newKey(), text, image: null, label: '', is_correct: false, explanation_text: '' };
}

export function trueFalseOptions(t) {
    return [
        { ...emptyOption(t('editor.true')), is_correct: true },
        emptyOption(t('editor.false')),
    ];
}

// Puts a smart-paste result into the form. A single-answer question keeps only
// the first option marked correct; with no options found, the current ones stay.
// True/false takes the pasted pair only when exactly two options came.
export function withPaste(form, { stem, options }) {
    if (!options.length || (form.type === 'true_false' && options.length !== 2)) return { ...form, stem_text: stem };
    const single = form.type === 'mcq_single' || form.type === 'true_false';
    let seen = false;
    const next = options.map((o) => {
        const correct = o.is_correct && !(single && seen);
        if (o.is_correct) seen = true;
        return { ...emptyOption(o.text), is_correct: correct };
    });
    return { ...form, stem_text: stem, options: next };
}

export function emptyQuestion(type, t) {
    const base = {
        type,
        difficulty: type === 'passage' ? null : 'medium',
        category_id: null,
        subcategory_id: null,
        reference_no: '',
        stem_text: '',
        stem_image: null,
        stem_audio: null,
        explanation_mode: 'none',
        explanation_text: '',
        explanation_image: null,
        model_answer_text: '',
        model_answer_image: null,
        font: 'default',
        options: [],
        matching_items: [],
    };
    if (type === 'mcq_single' || type === 'mcq_multi') {
        base.options = [emptyOption(), emptyOption(), emptyOption(), emptyOption()];
    }
    if (type === 'true_false') base.options = trueFalseOptions(t);
    if (type === 'matching') {
        const r1 = newKey();
        const r2 = newKey();
        base.matching_items = [
            { id: null, key: newKey(), side: 'left', text: '', image: null, audio: null, match_key: r1 },
            { id: null, key: newKey(), side: 'left', text: '', image: null, audio: null, match_key: r2 },
            { id: null, key: r1, side: 'right', text: '', image: null, audio: null, match_key: null },
            { id: null, key: r2, side: 'right', text: '', image: null, audio: null, match_key: null },
        ];
    }
    return base;
}

export function fromApi(q) {
    const keyOf = (id) => `id-${id}`;
    return {
        type: q.type,
        difficulty: q.difficulty,
        category_id: q.category_id,
        subcategory_id: q.subcategory_id,
        reference_no: q.reference_no || '',
        stem_text: q.stem_text || '',
        stem_image: media(q.stem_image, q.stem_image_id),
        stem_audio: media(q.stem_audio, q.stem_audio_id),
        explanation_mode: q.explanation_mode,
        explanation_text: q.explanation_text || '',
        explanation_image: media(q.explanation_image, q.explanation_image_id),
        model_answer_text: q.model_answer_text || '',
        model_answer_image: media(q.model_answer_image, q.model_answer_image_id),
        font: q.font || 'default',
        options: (q.options || []).map((o) => ({
            id: o.id,
            key: keyOf(o.id),
            text: o.text || '',
            image: media(o.image, o.image_id),
            label: o.label || '',
            is_correct: o.is_correct,
            explanation_text: o.explanation_text || '',
        })),
        matching_items: (q.matching_items || []).map((m) => ({
            id: m.id,
            key: keyOf(m.id),
            side: m.side,
            text: m.text || '',
            image: media(m.image, m.image_id),
            audio: media(m.audio, m.audio_id),
            match_key: m.match_item_id ? keyOf(m.match_item_id) : null,
        })),
    };
}

export function toApi(state, passageId) {
    return {
        type: state.type,
        passage_id: passageId || null,
        difficulty: state.difficulty,
        category_id: state.category_id,
        subcategory_id: state.subcategory_id,
        reference_no: state.reference_no,
        stem_text: state.stem_text,
        stem_image_id: state.stem_image?.id ?? null,
        stem_audio_id: state.stem_audio?.id ?? null,
        explanation_mode: state.explanation_mode,
        explanation_text: state.explanation_text,
        explanation_image_id: state.explanation_image?.id ?? null,
        model_answer_text: state.model_answer_text,
        model_answer_image_id: state.model_answer_image?.id ?? null,
        font: state.font,
        options: state.options.map((o) => ({
            id: o.id,
            text: o.text,
            image_id: o.image?.id ?? null,
            label: o.label,
            is_correct: o.is_correct,
            explanation_text: o.explanation_text,
        })),
        matching_items: state.matching_items.map((m) => ({
            id: m.id,
            key: m.key,
            side: m.side,
            text: m.text,
            image_id: m.image?.id ?? null,
            audio_id: m.audio?.id ?? null,
            match_key: m.side === 'left' ? m.match_key : null,
        })),
    };
}
