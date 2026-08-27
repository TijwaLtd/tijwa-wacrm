'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SettingsPanelHead } from '@/components/settings/settings-panel-head';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';

interface Department {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  auto_assign_enabled: boolean;
  priority: number;
  created_at: string;
}

interface DepartmentFormData {
  name: string;
  description: string;
  color: string;
  priority: number;
  auto_assign_enabled: boolean;
}

const DEFAULT_FORM: DepartmentFormData = {
  name: '',
  description: '',
  color: '#6366f1',
  priority: 0,
  auto_assign_enabled: true,
};

export function DepartmentSettings() {
  const t = useTranslations('Settings.departments');
  const { account } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [form, setForm] = useState<DepartmentFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const canEdit = canEditSettings(account?.role);

  const loadDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/departments');
      const data = await res.json();
      if (res.ok) {
        setDepartments(data.departments || []);
      }
    } catch {
      console.error('Failed to load departments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  const openCreateDialog = () => {
    setEditingDept(null);
    setForm(DEFAULT_FORM);
    setDialogOpen(true);
  };

  const openEditDialog = (dept: Department) => {
    setEditingDept(dept);
    setForm({
      name: dept.name,
      description: dept.description || '',
      color: dept.color,
      priority: dept.priority,
      auto_assign_enabled: dept.auto_assign_enabled,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t('nameRequired'));
      return;
    }

    setSaving(true);
    try {
      const url = editingDept ? `/api/departments/${editingDept.id}` : '/api/departments';
      const method = editingDept ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      toast.success(editingDept ? t('updated') : t('created'));
      setDialogOpen(false);
      loadDepartments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (dept: Department) => {
    if (!confirm(t('confirmDelete', { name: dept.name }))) return;

    try {
      const res = await fetch(`/api/departments/${dept.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success(t('deleted'));
      loadDepartments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  if (loading) {
    return <div className="text-muted-foreground py-8">{t('loading')}</div>;
  }

  return (
    <>
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
        action={
          canEdit ? (
            <Button onClick={openCreateDialog}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t('addDepartment')}
            </Button>
          ) : undefined
        }
      />

      {departments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">{t('noDepartments')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('noDepartmentsHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {departments.map((dept) => (
            <Card key={dept.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: dept.color }}
                    />
                    <div>
                      <CardTitle className="text-base">{dept.name}</CardTitle>
                      {dept.description && (
                        <CardDescription className="mt-0.5">{dept.description}</CardDescription>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!dept.is_active && <Badge variant="secondary">Inactive</Badge>}
                    {dept.auto_assign_enabled && <Badge variant="outline">Auto-assign</Badge>}
                    {canEdit && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(dept)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(dept)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDept ? t('editDepartment') : t('createDepartment')}</DialogTitle>
            <DialogDescription>{t('formDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="dept-name">{t('name')}</Label>
              <Input
                id="dept-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('namePlaceholder')}
                maxLength={50}
              />
            </div>

            <div>
              <Label htmlFor="dept-desc">{t('description')}</Label>
              <Input
                id="dept-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t('descriptionPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="dept-color">{t('color')}</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="dept-color"
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="h-10 w-10 rounded border"
                  />
                  <Input
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="dept-priority">{t('priority')}</Label>
                <Input
                  id="dept-priority"
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
                  min={0}
                />
                <p className="text-xs text-muted-foreground mt-1">{t('priorityHint')}</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>{t('autoAssign')}</Label>
                <p className="text-sm text-muted-foreground">{t('autoAssignHint')}</p>
              </div>
              <Switch
                checked={form.auto_assign_enabled}
                onCheckedChange={(checked) => setForm({ ...form, auto_assign_enabled: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t('saving') : editingDept ? t('update') : t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
