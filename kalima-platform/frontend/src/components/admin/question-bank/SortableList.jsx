import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

function SortableItem({ id, disabled, children }) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
        useSortable({ id, disabled });
    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.85 : undefined,
        position: 'relative',
    };
    const handle = disabled ? null : (
        <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground p-1 rounded"
            aria-label="drag"
        >
            <GripVertical className="h-4 w-4" />
        </button>
    );
    return (
        <div ref={setNodeRef} style={style}>
            {children(handle)}
        </div>
    );
}

// Drag-and-drop list. renderItem(item, handle) draws a row and places the
// drag handle; onReorder gets the new list of ids.
export default function SortableList({ items, getId = (x) => x.id, onReorder, renderItem, disabled = false, className }) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
    const ids = items.map(getId);

    const onDragEnd = ({ active, over }) => {
        if (!over || active.id === over.id) return;
        const next = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id));
        onReorder(next);
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <div className={className}>
                    {items.map((item) => (
                        <SortableItem key={getId(item)} id={getId(item)} disabled={disabled}>
                            {(handle) => renderItem(item, handle)}
                        </SortableItem>
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}
