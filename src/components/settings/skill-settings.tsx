'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, User } from 'lucide-react';

interface Member {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface AgentSkill {
  id: string;
  user_id: string;
  skill: string;
  level: number;
  created_at: string;
}

const SKILL_LEVELS = [
  { value: 1, label: 'Beginner' },
  { value: 2, label: 'Basic' },
  { value: 3, label: 'Intermediate' },
  { value: 4, label: 'Advanced' },
  { value: 5, label: 'Expert' },
];

export function SkillSettings() {
  const t = useTranslations('Settings.skills');
  const { account } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSkill, setNewSkill] = useState({ skill: '', level: 3 });
  const [saving, setSaving] = useState(false);

  const canEdit = canEditSettings(account?.role);

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/workspaces');
      const data = await res.json();
      if (res.ok && data.workspace?.members) {
        setMembers(data.workspace.members);
        if (data.workspace.members.length > 0 && !selectedUserId) {
          setSelectedUserId(data.workspace.members[0].user_id);
        }
      }
    } catch {
      console.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [selectedUserId]);

  const loadSkills = useCallback(async (userId: string) => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/agents/${userId}/skills`);
      const data = await res.json();
      if (res.ok) {
        setSkills(data.skills || []);
      }
    } catch {
      console.error('Failed to load skills');
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (selectedUserId) {
      loadSkills(selectedUserId);
    }
  }, [selectedUserId, loadSkills]);

  const handleAddSkill = async () => {
    if (!newSkill.skill.trim()) {
      toast.error(t('skillRequired'));
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${selectedUserId}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSkill),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add skill');
      }

      toast.success(t('skillAdded'));
      setDialogOpen(false);
      setNewSkill({ skill: '', level: 3 });
      loadSkills(selectedUserId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add skill');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSkill = async (skillId: string) => {
    try {
      const res = await fetch(`/api/agents/${selectedUserId}/skills?skill_id=${skillId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to remove skill');
      toast.success(t('skillRemoved'));
      loadSkills(selectedUserId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove skill');
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
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t('selectAgent')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger>
              <SelectValue placeholder={t('chooseAgent')} />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.full_name || m.email || m.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedUserId && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">{t('skillsFor', { name: members.find(m => m.user_id === selectedUserId)?.full_name || 'Agent' })}</h3>
            {canEdit && (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t('addSkill')}
              </Button>
            )}
          </div>

          {skills.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <User className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">{t('noSkills')}</p>
                <p className="text-sm text-muted-foreground mt-1">{t('noSkillsHint')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {skills.map((skill) => (
                <Card key={skill.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary">{skill.skill}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {t('level')}: {SKILL_LEVELS.find(l => l.value === skill.level)?.label || skill.level}
                        </span>
                      </div>
                      {canEdit && (
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveSkill(skill.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('addSkill')}</DialogTitle>
            <DialogDescription>{t('addSkillDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="skill-name">{t('skillName')}</Label>
              <Input
                id="skill-name"
                value={newSkill.skill}
                onChange={(e) => setNewSkill({ ...newSkill, skill: e.target.value })}
                placeholder={t('skillPlaceholder')}
                maxLength={50}
              />
            </div>

            <div>
              <Label>{t('skillLevel')}</Label>
              <Select
                value={String(newSkill.level)}
                onValueChange={(v) => setNewSkill({ ...newSkill, level: parseInt(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_LEVELS.map((l) => (
                    <SelectItem key={l.value} value={String(l.value)}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleAddSkill} disabled={saving}>
              {saving ? t('adding') : t('add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
