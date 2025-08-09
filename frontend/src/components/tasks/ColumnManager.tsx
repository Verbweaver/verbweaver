import React, { useState } from 'react';
import { Plus, Edit2, Trash2, GripVertical, X, Save, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import clsx from 'clsx';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
}

interface ColumnManagerProps {
  columns: KanbanColumn[];
  defaultColumnId: string;
  onColumnsChange: (columns: KanbanColumn[]) => void;
  onDefaultChange: (defaultId: string) => void;
  onClose: () => void;
}

const defaultColors = [
  'bg-gray-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-amber-500',
  'bg-red-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-orange-500',
];

// Sortable Column Item Component
function SortableColumnItem({ 
  column, 
  isEditing, 
  editingColumn, 
  setEditingColumn, 
  onEdit, 
  onDelete, 
  onCancelEdit,
  isDefault,
  onSetDefault
}: {
  column: KanbanColumn;
  isEditing: boolean;
  editingColumn: KanbanColumn | null;
  setEditingColumn: (column: KanbanColumn | null) => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onCancelEdit: () => void;
  isDefault: boolean;
  onSetDefault: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={clsx(
        "flex items-center gap-3 p-3 border rounded-lg",
        isDefault ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border",
        isDragging && "opacity-50"
      )}
    >
      <GripVertical className="w-4 h-4 text-muted-foreground cursor-move" />
      
      <input
        type="radio"
        checked={isDefault}
        onChange={() => onSetDefault(column.id)}
        className={clsx(
          "mr-2 accent-primary h-4 w-4 shrink-0",
          isDefault && "ring-2 ring-primary/50 rounded-full"
        )}
        title="Set as default column"
      />
      <div className={clsx('w-4 h-4 rounded-full', column.color)} />
      
      {isEditing ? (
        <div className="flex-1 flex items-center gap-2">
          <input
            type="text"
            value={editingColumn?.title || ''}
            onChange={(e) => setEditingColumn({ ...editingColumn!, title: e.target.value })}
            className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background"
            placeholder="Column title"
          />
          <div className="relative">
            <select
              value={editingColumn?.color || ''}
              onChange={(e) => setEditingColumn({ ...editingColumn!, color: e.target.value })}
              className="px-2 py-1 text-sm border border-border rounded bg-background pr-8"
            >
              {defaultColors.map(color => (
                <option key={color} value={color}>
                  {color.replace('bg-', '').replace('-500', '')}
                </option>
              ))}
            </select>
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 w-3 h-3 rounded-full" style={{ 
              backgroundColor: editingColumn?.color ? 
                (editingColumn.color === 'bg-gray-500' ? '#6b7280' : 
                 editingColumn.color === 'bg-blue-500' ? '#3b82f6' : 
                 editingColumn.color === 'bg-green-500' ? '#10b981' : 
                 editingColumn.color === 'bg-amber-500' ? '#f59e0b' : 
                 editingColumn.color === 'bg-red-500' ? '#ef4444' : 
                 editingColumn.color === 'bg-purple-500' ? '#8b5cf6' : 
                 editingColumn.color === 'bg-pink-500' ? '#ec4899' : 
                 editingColumn.color === 'bg-indigo-500' ? '#6366f1' : 
                 editingColumn.color === 'bg-teal-500' ? '#14b8a6' : 
                 editingColumn.color === 'bg-orange-500' ? '#f97316' : '#000') : '#000' 
            }}></div>
          </div>
          <Button
            onClick={onEdit}
            size="sm"
            className="flex items-center gap-1"
          >
            <Save className="w-3 h-3" />
            Save
          </Button>
          <Button
            onClick={onCancelEdit}
            variant="outline"
            size="sm"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-between">
          <span className="font-medium flex items-center gap-2">
            {column.title}
            {isDefault && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary text-primary-foreground uppercase tracking-wide">
                Default
              </span>
            )}
          </span>
          <div className="flex items-center gap-1">
            <Button
              onClick={() => setEditingColumn(column)}
              size="sm"
              variant="ghost"
            >
              <Edit2 className="w-3 h-3" />
            </Button>
            <Button
              onClick={() => onDelete(column.id)}
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ColumnManager({ columns, defaultColumnId, onColumnsChange, onDefaultChange, onClose }: ColumnManagerProps) {
  const [editingColumn, setEditingColumn] = useState<KanbanColumn | null>(null);
  const [defaultIdState, setDefaultIdState] = useState<string>(defaultColumnId);
  const [isAdding, setIsAdding] = useState(false);
  const [newColumn, setNewColumn] = useState<Partial<KanbanColumn>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleAddColumn = () => {
    if (!newColumn.title || !newColumn.color) return;

    const column: KanbanColumn = {
      id: newColumn.id || `column-${Date.now()}`,
      title: newColumn.title,
      color: newColumn.color,
    };

    onColumnsChange([...columns, column]);
    setNewColumn({});
    setIsAdding(false);
  };

  const handleEditColumn = () => {
    if (!editingColumn || !editingColumn.title || !editingColumn.color) return;

    const updatedColumns = columns.map(col =>
      col.id === editingColumn.id ? editingColumn : col
    );
    onColumnsChange(updatedColumns);
    setEditingColumn(null);
  };

  const handleDeleteColumn = (columnId: string) => {
    const updatedColumns = columns.filter(col => col.id !== columnId);
    onColumnsChange(updatedColumns);
  };

  const handleCancelEdit = () => {
    setEditingColumn(null);
    setIsAdding(false);
    setNewColumn({});
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = columns.findIndex(col => col.id === active.id);
    const newIndex = columns.findIndex(col => col.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const updatedColumns = [...columns];
      const [movedColumn] = updatedColumns.splice(oldIndex, 1);
      updatedColumns.splice(newIndex, 0, movedColumn);
      onColumnsChange(updatedColumns);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-semibold">Manage Kanban Columns</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Existing Columns */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">Current Columns</h3>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={columns.map(col => col.id)}
                strategy={verticalListSortingStrategy}
              >
                {columns.map((column) => (
                                      <SortableColumnItem
                     key={column.id}
                     column={column}
                     isEditing={editingColumn?.id === column.id}
                     editingColumn={editingColumn}
                     setEditingColumn={setEditingColumn}
                     onEdit={handleEditColumn}
                     onDelete={handleDeleteColumn}
                     onCancelEdit={handleCancelEdit}
                     isDefault={column.id === defaultIdState}
                     onSetDefault={(id) => { setDefaultIdState(id); onDefaultChange(id); }}
                   />
                ))}
              </SortableContext>
              
              <DragOverlay>
                {activeId ? (
                  <div className="flex items-center gap-3 p-3 border border-border rounded-lg bg-background shadow-lg">
                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                    <div className={clsx('w-4 h-4 rounded-full', columns.find(col => col.id === activeId)?.color)} />
                    <span className="font-medium">{columns.find(col => col.id === activeId)?.title}</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>

          {/* Add New Column */}
          {isAdding ? (
            <div className="p-3 border border-border rounded-lg">
              <h3 className="text-sm font-medium text-foreground mb-2">Add New Column</h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newColumn.title || ''}
                  onChange={(e) => setNewColumn({ ...newColumn, title: e.target.value })}
                  className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background"
                  placeholder="Column title"
                />
                <div className="relative">
                  <select
                    value={newColumn.color || ''}
                    onChange={(e) => setNewColumn({ ...newColumn, color: e.target.value })}
                    className="px-2 py-1 text-sm border border-border rounded bg-background pr-8"
                  >
                    <option value="">Select color</option>
                    {defaultColors.map(color => (
                      <option key={color} value={color}>
                        {color.replace('bg-', '').replace('-500', '')}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 w-3 h-3 rounded-full" style={{ 
                    backgroundColor: newColumn.color ? 
                      (newColumn.color === 'bg-gray-500' ? '#6b7280' : 
                       newColumn.color === 'bg-blue-500' ? '#3b82f6' : 
                       newColumn.color === 'bg-green-500' ? '#10b981' : 
                       newColumn.color === 'bg-amber-500' ? '#f59e0b' : 
                       newColumn.color === 'bg-red-500' ? '#ef4444' : 
                       newColumn.color === 'bg-purple-500' ? '#8b5cf6' : 
                       newColumn.color === 'bg-pink-500' ? '#ec4899' : 
                       newColumn.color === 'bg-indigo-500' ? '#6366f1' : 
                       newColumn.color === 'bg-teal-500' ? '#14b8a6' : 
                       newColumn.color === 'bg-orange-500' ? '#f97316' : '#000') : '#000' 
                  }}></div>
                </div>
                <Button
                  onClick={handleAddColumn}
                  size="sm"
                  className="flex items-center gap-1"
                >
                  <Save className="w-3 h-3" />
                  Add
                </Button>
                <Button
                  onClick={handleCancelEdit}
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setIsAdding(true)}
              variant="outline"
              className="w-full flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Column
            </Button>
          )}

          {/* Warning about existing tasks */}
          {columns.length === 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">
                No columns defined. Tasks will not be displayed until you add at least one column.
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
} 