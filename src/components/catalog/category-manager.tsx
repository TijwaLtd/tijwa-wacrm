'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Pencil, Trash2, Folder, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import type { OfferingCategory } from '@/lib/business/offerings';

interface CategoryManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CategoryManager({ open, onOpenChange }: CategoryManagerProps) {
  const { activeAccountId } = useAuth();
  const [categories, setCategories] = useState<OfferingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<OfferingCategory | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<OfferingCategory | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const fetchCategories = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/offerings/categories?account_id=${activeAccountId}`);
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) fetchCategories();
  }, [open, fetchCategories]);

  const toggleParent = (id: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/offerings/categories/${deleteConfirm.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      toast.success('Category deleted');
      setDeleteConfirm(null);
      fetchCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  // Build tree: top-level + children
  const topLevel = categories.filter(c => !c.parent_id);
  const childrenMap = new Map<string, OfferingCategory[]>();
  for (const cat of categories) {
    if (cat.parent_id) {
      const siblings = childrenMap.get(cat.parent_id) || [];
      siblings.push(cat);
      childrenMap.set(cat.parent_id, siblings);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Manage Categories</DialogTitle>
                <DialogDescription>Create and organize offering categories</DialogDescription>
              </div>
              <Button size="sm" onClick={() => { setEditingCategory(null); setFormOpen(true); }} className="gap-1">
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : topLevel.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Folder className="h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">No categories yet</p>
                <Button variant="outline" size="sm" onClick={() => { setEditingCategory(null); setFormOpen(true); }} className="mt-3 border-border">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Create First Category
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {topLevel.map(cat => {
                  const children = childrenMap.get(cat.id) || [];
                  const isExpanded = expandedParents.has(cat.id);
                  const isGlobal = !cat.account_id;
                  return (
                    <div key={cat.id}>
                      <div className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/50 group">
                        {children.length > 0 ? (
                          <button onClick={() => toggleParent(cat.id)} className="text-muted-foreground hover:text-foreground">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        ) : (
                          <span className="w-4" />
                        )}
                        <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-sm text-foreground truncate">{cat.name}</span>
                        {isGlobal ? (
                          <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">Global</span>
                        ) : (
                          <div className="hidden group-hover:flex items-center gap-1">
                            <button onClick={() => { setEditingCategory(cat); setFormOpen(true); }} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setDeleteConfirm(cat)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      {isExpanded && children.map(child => (
                        <div key={child.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 pl-10 hover:bg-muted/50 group">
                          <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="flex-1 text-sm text-foreground truncate">{child.name}</span>
                          {!child.account_id ? (
                            <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">Global</span>
                          ) : (
                            <div className="hidden group-hover:flex items-center gap-1">
                              <button onClick={() => { setEditingCategory(child); setFormOpen(true); }} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setDeleteConfirm(child)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border text-muted-foreground hover:bg-muted">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Form */}
      <CategoryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editingCategory}
        categories={categories}
        onSuccess={() => { setFormOpen(false); fetchCategories(); }}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Category?</DialogTitle>
            <DialogDescription>
              This will permanently delete &ldquo;{deleteConfirm?.name}&rdquo;. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}
              className="border-border text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// Category Form (create/edit)
// ============================================================

interface CategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: OfferingCategory | null;
  categories: OfferingCategory[];
  onSuccess: () => void;
}

function CategoryForm({ open, onOpenChange, category, categories, onSuccess }: CategoryFormProps) {
  const { activeAccountId } = useAuth();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');

  const isEditing = !!category;
  const topLevel = categories.filter(c => !c.parent_id && c.id !== category?.id);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      if (category) {
        setName(category.name);
        setDescription(category.description || '');
        setParentId(category.parent_id || '');
      } else {
        setName('');
        setDescription('');
        setParentId('');
      }
    }
  }, [open, category]);

  const handleSubmit = async () => {
    if (!activeAccountId || !name.trim()) return;
    setSaving(true);
    try {
      const body = {
        account_id: activeAccountId,
        name: name.trim(),
        description: description.trim() || null,
        parent_id: parentId || null,
      };

      let res;
      if (isEditing) {
        res = await fetch(`/api/offerings/categories/${category.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/offerings/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      toast.success(isEditing ? 'Category updated' : 'Category created');
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Category' : 'New Category'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update category details' : 'Create a new offering category'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Electronics, Breakfast, Room Types"
              className="border-border bg-muted"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="border-border bg-muted"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Parent Category</Label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full border-border bg-muted text-foreground rounded-md px-3 py-2 text-sm"
            >
              <option value="">None (Top Level)</option>
              {topLevel.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter className="bg-popover border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}
            className="border-border text-muted-foreground hover:bg-muted">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {isEditing ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
