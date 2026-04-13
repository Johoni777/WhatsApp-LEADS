import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ContactDetailModal } from '@/components/contacts/ContactDetailModal';
import {
  Plus, Search, Upload, UserPlus, Phone,
  Tag, CheckSquare, Square, Trash2, FileSpreadsheet, Bot, ClipboardPaste, FolderOpen, FolderPlus, Edit2,
} from 'lucide-react';
import { useContactStore } from '@/stores/contactStore';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/services/supabase';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import type { Contact } from '@/types/database';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

export function ContactsPage() {
  const { workspace } = useAuthStore();
  const {
    contacts,
    groups,
    fetchContacts,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    createContact,
    deleteContacts,
    selectedContacts,
    toggleSelectContact,
    selectAllFiltered,
    clearSelection,
    isLoading,
    bulkAddTag,
    bulkSetAI,
  } = useContactStore();

  const [search, setSearch] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string } | null>(null);
  const [newContact, setNewContact] = useState({ name: '', phone: '', tags: '' });
  const [newGroupName, setNewGroupName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [detailContactId, setDetailContactId] = useState<string | null>(null);
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [bulkTagValue, setBulkTagValue] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | 'ungrouped'>('ungrouped');
  const [importMode, setImportMode] = useState<'google' | 'paste' | 'file'>('file');
  const [pastedSheet, setPastedSheet] = useState('');
  const [importTargetGroupId, setImportTargetGroupId] = useState<string | 'ungrouped'>('ungrouped');
  const [importProgress, setImportProgress] = useState<{
    phase: string;
    processed: number;
    total: number;
    inserted: number;
    skipped: number;
  } | null>(null);

  const detailContact = detailContactId
    ? contacts.find((c) => c.id === detailContactId) ?? null
    : null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadContactsPage = useCallback(async () => {
    if (!workspace?.id) return;
    await Promise.all([fetchContacts(), fetchGroups()]);
  }, [workspace?.id, fetchContacts, fetchGroups]);

  useRefreshOnFocus(loadContactsPage, '/contacts');

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let ungrouped = 0;
    for (const contact of contacts) {
      if (contact.group_id) {
        counts.set(contact.group_id, (counts.get(contact.group_id) || 0) + 1);
      } else {
        ungrouped++;
      }
    }
    return { counts, ungrouped };
  }, [contacts]);

  const filtered = contacts.filter((c) => {
    const matchesGroup = selectedGroupId === 'ungrouped'
      ? !c.group_id
      : c.group_id === selectedGroupId;

    const matchesSearch =
      !search ||
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search);

    return matchesGroup && matchesSearch;
  });

  const toggleAll = () => {
    const filteredIds = filtered.map((c) => c.id);
    if (selectedContacts.size === filtered.length && filtered.length > 0) {
      clearSelection();
    } else {
      selectAllFiltered(filteredIds);
    }
  };

  const handleApplyBulkTag = async () => {
    const tag = bulkTagValue.trim();
    if (!tag) {
      toast.error('Informe uma tag');
      return;
    }
    const res = await bulkAddTag(Array.from(selectedContacts), tag);
    if (res.error) toast.error(res.error);
    else {
      toast.success('Tags aplicadas');
      setShowBulkTagModal(false);
      setBulkTagValue('');
    }
  };

  const handleBulkAI = async (active: boolean) => {
    const res = await bulkSetAI(Array.from(selectedContacts), active);
    if (res.error) toast.error(res.error);
    else toast.success(active ? 'IA ativada nos selecionados' : 'IA desativada nos selecionados');
  };

  const parseSheetRows = (rows: Record<string, unknown>[]) => {
    if (rows.length === 0) return [];
    const headerKeys = Object.keys(rows[0] || {});
    const nameKey = headerKeys.find((h) => h.toLowerCase().includes('nome'));
    const phoneKey = headerKeys.find((h) => /telefone|celular|whatsapp/i.test(h));
    const tagKey = headerKeys.find((h) => h.toLowerCase().includes('tag'));

    if (!phoneKey) {
      throw new Error('Nao encontrei uma coluna de telefone na planilha.');
    }

    return rows.map((row) => {
      const phone = normalizeImportedPhone(String(row[phoneKey] || ''));
      const tags = tagKey
        ? String(row[tagKey] || '').split(',').map((t) => t.trim()).filter(Boolean)
        : [];

      return {
        name: nameKey ? String(row[nameKey] || 'Indefinido') : 'Indefinido',
        phone,
        tags,
      };
    }).filter((row) => row.phone);
  };

  const normalizeImportedPhone = (phone: string) => {
    const raw = String(phone || '').replace(/\D/g, '');
    if (raw.length >= 12) return raw;
    if (raw.length >= 10) return `55${raw}`;
    return '';
  };

  const parsePastedContacts = (raw: string) => {
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) return [];

    const delimiter = lines[0].includes('\t') ? '\t' : ';';
    const headers = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());
    const nameIndex = headers.findIndex((h) => h.includes('nome'));
    const phoneIndex = headers.findIndex((h) => h.includes('telefone') || h.includes('celular') || h.includes('whatsapp'));
    const tagIndex = headers.findIndex((h) => h.includes('tag'));

    if (phoneIndex === -1) {
      throw new Error('Nao encontrei uma coluna de telefone na planilha colada.');
    }

    return lines.slice(1).map((line) => {
      const cols = line.split(delimiter).map((value) => value.trim());
      const phone = normalizeImportedPhone(cols[phoneIndex] || '');
      const tags = tagIndex >= 0
        ? (cols[tagIndex] || '').split(',').map((t) => t.trim()).filter(Boolean)
        : [];

      return {
        name: nameIndex >= 0 ? (cols[nameIndex] || 'Indefinido') : 'Indefinido',
        phone,
        tags,
      };
    }).filter((row) => row.phone);
  };

  const runImportedInsert = async (
    rows: { name: string; phone: string; tags: string[] }[],
    source: 'google_sheets' | 'csv'
  ) => {
    const workspaceId = workspace?.id;
    if (!workspaceId) throw new Error('Sem workspace');

    const seenPhones = new Set<string>();
    const existingPhones = new Set(contacts.map((contact) => contact.phone));
    let skipped = 0;

    const dedupedRows = rows.filter((row) => {
      if (!row.phone || seenPhones.has(row.phone) || existingPhones.has(row.phone)) {
        skipped++;
        return false;
      }
      seenPhones.add(row.phone);
      return true;
    });

    const targetGroupId = importTargetGroupId === 'ungrouped' ? null : importTargetGroupId;
    const toInsert = dedupedRows.map((c) => ({
      workspace_id: workspaceId,
      group_id: targetGroupId,
      name: c.name,
      phone: c.phone,
      tags: c.tags || [],
      source,
    }));

    let inserted = 0;
    const CHUNK = 100;

    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      setImportProgress({
        phase: 'Salvando no banco',
        processed: Math.min(i, toInsert.length),
        total: toInsert.length,
        inserted,
        skipped,
      });

      const { data, error } = await supabase
        .from('contacts')
        .upsert(chunk, { onConflict: 'workspace_id,phone' })
        .select('id');

      if (error) throw error;
      inserted += data?.length || chunk.length;

      setImportProgress({
        phase: 'Salvando no banco',
        processed: Math.min(i + CHUNK, toInsert.length),
        total: toInsert.length,
        inserted,
        skipped,
      });
    }
  };

  const handleCreateGroup = async () => {
    if (editingGroup) {
      const res = await updateGroup(editingGroup.id, newGroupName);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success('Pasta atualizada');
    } else {
      const res = await createGroup(newGroupName);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success('Pasta criada');
    }
    setNewGroupName('');
    setEditingGroup(null);
    setShowGroupModal(false);
  };

  const handleDeleteGroup = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Deseja apagar esta pasta? Os contatos não serão apagados, apenas ficarão sem pasta.")) return;
    
    const res = await deleteGroup(id);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Pasta apagada");
      if (selectedGroupId === id) setSelectedGroupId('ungrouped');
    }
  };

  const handleCreateContact = async () => {
    if (!newContact.phone) return toast.error("Telefone é obrigatório");
    setIsSaving(true);
    const tags = newContact.tags ? newContact.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    
    // Formatar telefone removendo caracteres não numéricos
    const rawPhone = newContact.phone.replace(/\D/g, "");
    const finalPhone = rawPhone.length <= 11 ? "55" + rawPhone : rawPhone;

    const res = await createContact({
      name: newContact.name,
      phone: finalPhone,
      tags,
      source: 'manual'
    });
    
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Contato criado");
      setShowAddModal(false);
      setNewContact({ name: '', phone: '', tags: '' });
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (selectedContacts.size === 0) return;
    if (!window.confirm("Deseja apagar os contatos selecionados?")) return;
    
    const ids = Array.from(selectedContacts);
    const res = await deleteContacts(ids);
    if (res.error) toast.error(res.error);
    else toast.success("Deletados com sucesso");
  };

  return (
    <div className="page-shell page-stack mobile-safe-bottom animate-fade-in relative z-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="section-title">Contatos</h1>
          <p className="section-subtitle">
            {selectedGroupId === 'ungrouped'
              ? `${groupCounts.ungrouped} sem pasta`
              : `${filtered.length} dentro da pasta selecionada`}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button className="w-full sm:w-auto" variant="secondary" icon={<FolderPlus className="w-4 h-4" />} onClick={() => { setEditingGroup(null); setNewGroupName(''); setShowGroupModal(true); }}>
            Nova Pasta
          </Button>
          <Button className="w-full sm:w-auto" variant="secondary" icon={<Upload className="w-4 h-4" />} onClick={() => setShowImportModal(true)}>
            Importar
          </Button>
          <Button className="w-full sm:w-auto" icon={<UserPlus className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
            Adicionar Contato
          </Button>
        </div>
      </div>

      {/* Buscar e Bulk */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
        <div className="flex-1 max-w-md">
          <Input
            placeholder="Buscar por nome ou número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>
        {selectedContacts.size > 0 && (
          <div className="flex items-center gap-3 bg-surface-800 border border-white/[0.04] p-2 rounded-xl animate-slide-up shadow-lg">
            <span className="text-sm font-semibold text-neon-green px-2">{selectedContacts.size} selecionados</span>
            <Button size="sm" variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={handleDelete}>
              Apagar Lote
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Tag className="w-4 h-4" />}
              onClick={() => setShowBulkTagModal(true)}
            >
              Tags
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Bot className="w-4 h-4" />}
              onClick={() => handleBulkAI(true)}
            >
              IA on
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Bot className="w-4 h-4" />}
              onClick={() => handleBulkAI(false)}
            >
              IA off
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] gap-4">
        <div className="glass-panel p-4 border border-white/[0.04] h-fit">
          <div className="flex items-center gap-2 mb-3">
            <FolderOpen className="w-4 h-4 text-neon-blue" />
            <h2 className="font-semibold text-white">Pastas</h2>
          </div>
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setSelectedGroupId('ungrouped')}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${
                selectedGroupId === 'ungrouped' ? 'bg-surface-700 text-white' : 'text-text-300 hover:bg-surface-800'
              }`}
            >
              <span>Sem pasta</span>
              <span className="text-xs text-text-400">{groupCounts.ungrouped}</span>
            </button>
            {groups.map((group) => (
              <div key={group.id} className="flex items-center gap-1 group">
                <button
                  type="button"
                  onClick={() => setSelectedGroupId(group.id)}
                  className={`flex-1 flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${
                    selectedGroupId === group.id ? 'bg-surface-700 text-white' : 'text-text-300 hover:bg-surface-800'
                  }`}
                >
                  <span className="truncate">{group.name}</span>
                  <span className="text-xs text-text-400">{groupCounts.counts.get(group.id) || 0}</span>
                </button>
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingGroup({ id: group.id, name: group.name });
                      setNewGroupName(group.name);
                      setShowGroupModal(true);
                    }}
                    className="p-1 text-text-400 hover:text-white transition-colors rounded-lg hover:bg-surface-700"
                    title="Editar pasta"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteGroup(group.id, e)}
                    className="p-1 text-text-400 hover:text-red-400 transition-colors rounded-lg hover:bg-surface-700"
                    title="Apagar pasta"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            {groups.length === 0 && (
              <p className="text-xs text-text-400 px-1 pt-2">Nenhuma pasta criada ainda.</p>
            )}
          </div>
        </div>

        <div className="glass-panel overflow-hidden border border-white/[0.04]">
          {isLoading ? (
            <div className="p-8 text-center text-text-400">Carregando contatos...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-400 border-b border-white/[0.04] bg-surface-800/50">
                  <th className="p-4 w-12">
                    <button onClick={toggleAll} className="text-text-400 hover:text-white transition-colors">
                      {selectedContacts.size === filtered.length && filtered.length > 0 ? (
                        <CheckSquare className="w-5 h-5 text-neon-green" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </th>
                  <th className="p-4 font-semibold">Contato</th>
                  <th className="p-4 font-semibold">Número Real</th>
                  <th className="p-4 font-semibold hidden md:table-cell">Etiquetas (Tags)</th>
                  <th className="p-4 font-semibold hidden md:table-cell">Origem</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((contact) => (
                  <tr
                    key={contact.id}
                    className={`
                      border-b border-white/[0.02] transition-colors
                      ${selectedContacts.has(contact.id) ? 'bg-white/[0.02]' : 'hover:bg-white/[0.02]'}
                    `}
                  >
                    <td className="p-4">
                      <button
                        type="button"
                        onClick={() => toggleSelectContact(contact.id)}
                        className="text-text-400 hover:text-white transition-colors"
                        aria-label="Selecionar contato"
                      >
                        {selectedContacts.has(contact.id) ? (
                          <CheckSquare className="w-5 h-5 text-neon-green" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </td>
                    <td className="p-4">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDetailContactId(contact.id); }}
                        className="flex items-center gap-3 text-left min-w-0 w-full hover:opacity-90"
                      >
                        <Avatar name={contact.name || contact.phone} size="sm" />
                        <span className="font-semibold text-white truncate">{contact.name || 'Sem nome'}</span>
                      </button>
                    </td>
                    <td className="p-4">
                      <button
                        type="button"
                        onClick={() => toggleSelectContact(contact.id)}
                        className="flex items-center gap-2 text-text-300 w-full text-left hover:text-white"
                      >
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        {contact.phone}
                      </button>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <div className="flex gap-1.5 flex-wrap">
                        {contact.tags?.map(tag => (
                          <Badge key={tag} size="sm" variant="default">{tag}</Badge>
                        ))}
                      </div>
                    </td>
                    <td
                      className="p-4 hidden md:table-cell text-text-400 capitalize text-xs cursor-pointer"
                      onClick={() => toggleSelectContact(contact.id)}
                    >
                      {contact.source === 'google_sheets' ? 'Planilha' : contact.source}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                   <tr><td colSpan={5} className="p-8 text-center text-text-400">Nenhum contato encontrado.</td></tr>
                )}
              </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Novo Contato"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAddModal(false)}>Voltar</Button>
            <Button icon={<UserPlus className="w-4 h-4" />} onClick={handleCreateContact} loading={isSaving}>Adicionar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nome Completo"
            placeholder="João Victor..."
            value={newContact.name}
            onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
          />
          <Input
            label="Celular com DDD (obrigatório)"
            placeholder="11999999999"
            value={newContact.phone}
            onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
            icon={<Phone className="w-4 h-4" />}
          />
          <Input
            label="Etiquetas"
            placeholder="Separado por vírgula (vip, lead)"
            value={newContact.tags}
            onChange={(e) => setNewContact({ ...newContact, tags: e.target.value })}
            icon={<Tag className="w-4 h-4" />}
          />
        </div>
      </Modal>

      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Importar Contatos"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowImportModal(false)}>Cancelar</Button>
            <Button className="font-semibold" loading={isSaving} onClick={async () => {
              setIsSaving(true);
              setImportProgress({ phase: 'Preparando importacao', processed: 0, total: 0, inserted: 0, skipped: 0 });
              try {
                if (importMode === 'google') {
                  const spreadId = prompt('Cole o ID da sua planilha:');
                  if (!spreadId?.trim()) {
                    setIsSaving(false);
                    setImportProgress(null);
                    return;
                  }

                  setImportProgress({ phase: 'Buscando planilha', processed: 0, total: 0, inserted: 0, skipped: 0 });
                  const { data, error } = await supabase.functions.invoke('google-sheets-sync', {
                    body: { spreadsheet_id: spreadId.trim() },
                  });

                  if (error) throw new Error(error.message);
                  const payload = data as { error?: string; contacts?: { name: string; phone: string; tags: string[] }[]; total_rows?: number };
                  if (payload?.error) throw new Error(payload.error);
                  const rows = payload?.contacts || [];
                  if (rows.length === 0) throw new Error('Nenhum contato valido na planilha');

                  setImportProgress({
                    phase: 'Planilha carregada',
                    processed: 0,
                    total: rows.length,
                    inserted: 0,
                    skipped: 0,
                  });

                  await runImportedInsert(rows, 'google_sheets');
                } else if (importMode === 'file') {
                  const file = fileInputRef.current?.files?.[0];
                  if (!file) throw new Error('Selecione um arquivo de planilha.');

                  setImportProgress({ phase: 'Lendo arquivo', processed: 0, total: 0, inserted: 0, skipped: 0 });
                  const arrayBuffer = await file.arrayBuffer();
                  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
                  const rows = parseSheetRows(rawRows);
                  if (rows.length === 0) throw new Error('Nenhum contato valido encontrado no arquivo.');

                  setImportProgress({
                    phase: 'Arquivo validado',
                    processed: 0,
                    total: rows.length,
                    inserted: 0,
                    skipped: 0,
                  });

                  await runImportedInsert(rows, 'csv');
                } else {
                  const rows = parsePastedContacts(pastedSheet);
                  if (rows.length === 0) throw new Error('Cole uma planilha valida com cabecalho e linhas.');

                  setImportProgress({
                    phase: 'Planilha colada validada',
                    processed: 0,
                    total: rows.length,
                    inserted: 0,
                    skipped: 0,
                  });

                  await runImportedInsert(rows, 'csv');
                }

                toast.success('Contatos importados com sucesso!');
                await fetchContacts();
                setShowImportModal(false);
                setPastedSheet('');
                if (fileInputRef.current) fileInputRef.current.value = '';
                setImportProgress(null);
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Falha na importação';
                toast.error(msg);
              } finally {
                setIsSaving(false);
              }
            }}>
              {importMode === 'google' ? 'Sincronizar Planilha' : 'Importar Colagem'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-2 rounded-xl bg-surface-800 p-1 border border-white/[0.04]">
            <button
              type="button"
              onClick={() => setImportMode('google')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${importMode === 'google' ? 'bg-surface-700 text-white' : 'text-text-400 hover:text-white'}`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Google Sheets
            </button>
            <button
              type="button"
              onClick={() => setImportMode('paste')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${importMode === 'paste' ? 'bg-surface-700 text-white' : 'text-text-400 hover:text-white'}`}
            >
              <ClipboardPaste className="w-4 h-4" />
              Colar planilha
            </button>
            <button
              type="button"
              onClick={() => setImportMode('file')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${importMode === 'file' ? 'bg-surface-700 text-white' : 'text-text-400 hover:text-white'}`}
            >
              <Upload className="w-4 h-4" />
              Arquivo
            </button>
          </div>

          <div>
            <label className="block text-sm text-text-200 mb-1">Pasta de destino</label>
            <select
              value={importTargetGroupId}
              onChange={(e) => setImportTargetGroupId(e.target.value)}
              className="glass-input w-full h-10 outline-none"
            >
              <option value="ungrouped">Sem pasta</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </div>

          {importMode === 'google' ? (
            <div className="p-8 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center bg-surface-800/50">
              <FileSpreadsheet className="w-12 h-12 text-neon-blue mb-4" />
              <p className="text-white font-semibold">Importação Rápida (via Google Sheets público)</p>
              <p className="text-text-400 text-sm mt-2 text-center max-w-sm">
                1. Compartilhe a planilha.<br />
                2. Defina como <b>Qualquer pessoa com o link</b>.<br />
                3. Mantenha cabeçalhos como <b>Nome</b> e <b>Telefone</b>.<br />
                4. Clique em sincronizar e cole o ID.
              </p>
            </div>
          ) : importMode === 'file' ? (
            <div className="space-y-3">
              <p className="text-sm text-text-300">
                Envie um arquivo `.xlsx`, `.xls` ou `.csv`. Vamos validar, deduplicar e importar em lotes grandes.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="glass-input w-full h-11 px-3 py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-surface-700 file:px-3 file:py-2 file:text-white"
              />
              <p className="text-xs text-text-400">
                A planilha deve conter pelo menos as colunas <b>Nome</b> e <b>Telefone</b>. Se houver coluna de <b>Tags</b>,
                ela também será importada.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-text-300">
                Cole aqui a planilha copiada do Excel/Google Sheets. O cabeçalho deve conter ao menos <b>Nome</b> e <b>Telefone</b>.
              </p>
              <textarea
                value={pastedSheet}
                onChange={(e) => setPastedSheet(e.target.value)}
                rows={12}
                className="w-full glass-input h-auto resize-y font-mono text-sm leading-relaxed"
                placeholder={'Nome\tTelefone\tTags\nJoão\t11999999999\tvip, lead'}
              />
            </div>
          )}

          {importProgress && (
            <div className="rounded-2xl border border-white/[0.06] bg-surface-800/40 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-white">{importProgress.phase}</p>
                <span className="text-xs text-text-400">
                  {importProgress.processed} / {Math.max(importProgress.total, importProgress.processed)}
                </span>
              </div>
              <div className="w-full h-2 bg-surface-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-neon-green rounded-full transition-all"
                  style={{
                    width: `${importProgress.total > 0 ? Math.min(100, (importProgress.processed / importProgress.total) * 100) : 8}%`,
                  }}
                />
              </div>
              <div className="flex gap-4 text-xs text-text-300">
                <span>Importados: {importProgress.inserted}</span>
                <span>Pulados/duplicados: {importProgress.skipped}</span>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showGroupModal}
        onClose={() => { setShowGroupModal(false); setEditingGroup(null); setNewGroupName(''); }}
        title={editingGroup ? "Editar Pasta" : "Nova Pasta de Contatos"}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowGroupModal(false); setEditingGroup(null); setNewGroupName(''); }}>Cancelar</Button>
            <Button icon={editingGroup ? <Edit2 className="w-4 h-4" /> : <FolderPlus className="w-4 h-4" />} onClick={handleCreateGroup}>
              {editingGroup ? "Salvar" : "Criar Pasta"}
            </Button>
          </>
        }
      >
        <Input
          label="Nome da pasta"
          placeholder="Ex: Contabilidade"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          icon={<FolderOpen className="w-4 h-4" />}
        />
      </Modal>

      <Modal
        isOpen={showBulkTagModal}
        onClose={() => { setShowBulkTagModal(false); setBulkTagValue(''); }}
        title="Adicionar tag em massa"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowBulkTagModal(false); setBulkTagValue(''); }}>Cancelar</Button>
            <Button icon={<Tag className="w-4 h-4" />} onClick={handleApplyBulkTag}>Aplicar</Button>
          </>
        }
      >
        <Input
          label="Nova tag"
          placeholder="ex: vip"
          value={bulkTagValue}
          onChange={(e) => setBulkTagValue(e.target.value)}
          icon={<Tag className="w-4 h-4" />}
        />
        <p className="text-xs text-text-400 mt-2">A tag sera adicionada a {selectedContacts.size} contato(s) sem remover as existentes.</p>
      </Modal>

      <ContactDetailModal
        contact={detailContact}
        workspaceId={workspace?.id ?? null}
        isOpen={detailContactId !== null}
        onClose={() => setDetailContactId(null)}
      />

    </div>
  );
}
