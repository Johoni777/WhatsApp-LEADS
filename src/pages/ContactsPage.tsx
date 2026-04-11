import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  Plus, Search, Upload, UserPlus, MoreVertical, Phone,
  Tag, CheckSquare, Square, Trash2, FileSpreadsheet,
} from 'lucide-react';
import { formatPhone } from '@/utils/formatters';
import { useContactStore } from '@/stores/contactStore';
import toast from 'react-hot-toast';

export function ContactsPage() {
  const { 
    contacts, fetchContacts, createContact, deleteContacts, 
    selectedContacts, toggleSelectContact, selectAll, clearSelection, isLoading 
  } = useContactStore();

  const [search, setSearch] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', phone: '', tags: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const filtered = contacts.filter(c =>
    !search ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  const toggleAll = () => {
    if (selectedContacts.size === filtered.length) {
      clearSelection();
    } else {
      selectAll();
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
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 animate-fade-in relative z-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Contatos</h1>
          <p className="text-sm text-text-400 mt-1">{contacts.length} cadastrados no sistema</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={<Upload className="w-4 h-4" />} onClick={() => setShowImportModal(true)}>
            Importar
          </Button>
          <Button icon={<UserPlus className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
            Adicionar Adulso
          </Button>
        </div>
      </div>

      {/* Buscar e Bulk */}
      <div className="flex flex-col sm:flex-row gap-4 items-end">
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
            <Button size="sm" variant="secondary" icon={<Tag className="w-4 h-4" />}>Tags</Button>
          </div>
        )}
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
                    onClick={() => toggleSelectContact(contact.id)}
                    className={`
                      border-b border-white/[0.02] transition-colors cursor-pointer
                      ${selectedContacts.has(contact.id) ? 'bg-white/[0.02]' : 'hover:bg-white/[0.02]'}
                    `}
                  >
                    <td className="p-4">
                      {selectedContacts.has(contact.id) ? (
                        <CheckSquare className="w-5 h-5 text-neon-green" />
                      ) : (
                        <Square className="w-5 h-5 text-text-400" />
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={contact.name || contact.phone} size="sm" />
                        <span className="font-semibold text-white">{contact.name || 'Sem nome'}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-text-300">
                        <Phone className="w-3.5 h-3.5" />
                        {contact.phone}
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <div className="flex gap-1.5 flex-wrap">
                        {contact.tags?.map(tag => (
                          <Badge key={tag} size="sm" variant="default">{tag}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell text-text-400 capitalize text-xs">
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
        title="Importar do Google Sheets"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowImportModal(false)}>Cancelar</Button>
            <Button className="font-semibold" loading={isSaving} onClick={async () => {
              const spreadId = prompt("Cole o ID da sua planilha:");
              if (!spreadId) return;
              setIsSaving(true);
              try {
                const { data: { session } } = await import('@/services/supabase').then(m => m.supabase.auth.getSession());
                const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-sheets-sync`, {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                   body: JSON.stringify({ spreadsheet_id: spreadId })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                
                toast.success(`${data.total_rows} contatos encontrados na planilha! Estamos salvando na base...`);
                
                // Gravar no BD em massa (pode levar alguns segundos se forem muitos)
                // Vamos delegar a inserção um a um para não dar timeout ou apenas mandar o objeto grande direto
                const authModule = await import('@/stores/authStore');
                const workspaceId = authModule.useAuthStore.getState().workspace?.id;
                const toInsert = data.contacts.map((c: any) => ({
                   workspace_id: workspaceId,
                   name: c.name,
                   phone: c.phone,
                   tags: c.tags,
                   source: 'google_sheets'
                }));
                const supabase = await import('@/services/supabase').then(m => m.supabase);
                const { error: insertErr } = await supabase.from('contacts').insert(toInsert);
                if (insertErr) throw insertErr;
                
                toast.success("Contatos salvos com sucesso!");
                fetchContacts();
                setShowImportModal(false);
              } catch (e: any) {
                toast.error(e.message || "Falha na importação");
              } finally {
                setIsSaving(false);
              }
            }}>Sincronizar (Requer Planilha Pública)</Button>
          </>
        }
      >
        <div className="p-8 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center bg-surface-800/50">
           <FileSpreadsheet className="w-12 h-12 text-neon-blue mb-4" />
           <p className="text-white font-semibold">Importação Rápida (via CSV Público)</p>
           <p className="text-text-400 text-sm mt-2 text-center max-w-sm">
             1. Na sua planilha, clique em <b>Compartilhar</b>.<br/>
             2. Altere o acesso para <b>Qualquer pessoa com o link</b>.<br/>
             3. Certifique-se de que a planilha possui cabeçalhos com "Nome" e "Telefone".<br/>
             4. Clique em Sincronizar e cole o ID da URL.
           </p>
        </div>
      </Modal>

    </div>
  );
}
