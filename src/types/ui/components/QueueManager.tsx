import React, { useState, useMemo } from 'react';
import { QueueItem, ContentFilter } from '../../interfaces/ContentTypes';
import { ScoreBadge, MiniScore } from './ScoreBadge';

interface QueueManagerProps {
  items: QueueItem[];
  onRemove: (id: string) => void;
  onTag: (id: string, tags: string[]) => void;
  onExport: (ids: string[]) => void;
  filter?: ContentFilter;
}

export const QueueManager: React.FC<QueueManagerProps> = ({
  items,
  onRemove,
  onTag,
  onExport
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (search && !matchesSearch(item, search)) return false;
      return true;
    }).sort((a, b) => b.priority - a.priority);
  }, [items, search, statusFilter]);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    setSelected(new Set(filtered.map((i) => i.id)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        selectedCount={selected.size}
        onSelectAll={selectAll}
        onExport={() => onExport(Array.from(selected))}
      />
      
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtered.map((item) => (
          <QueueRow
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            onToggle={() => toggleSelect(item.id)}
            onRemove={() => onRemove(item.id)}
            onTag={(tags) => onTag(item.id, tags)}
          />
        ))}
      </div>
      
      <div style={{ padding: 12, borderTop: '1px solid #eee', fontSize: 12, color: '#666' }}>
        {filtered.length} items · {selected.size} selected
      </div>
    </div>
  );
};

const QueueRow: React.FC<{
  item: QueueItem;
  selected: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onTag: (tags: string[]) => void;
}> = ({ item, selected, onToggle, onRemove }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    padding: 12,
    borderBottom: '1px solid #f0f0f0',
    gap: 12,
    background: selected ? '#f0f9ff' : 'transparent'
  }}>
    <input type="checkbox" checked={selected} onChange={onToggle} />
    <MiniScore score={item.score.overall} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontSize: 13,
        fontWeight: 500,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}>
        {item.content.text.slice(0, 100)}...
      </div>
      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
        {item.content.platform} · {formatDate(item.addedAt)}
        {item.tags.length > 0 && ` · ${item.tags.join(', ')}`}
      </div>
    </div>
    <button onClick={onRemove} style={{ fontSize: 16, color: '#999', background: 'none', border: 'none', cursor: 'pointer' }}>
      ×
    </button>
  </div>
);

const Toolbar: React.FC<{
  search: string;
  onSearch: (s: string) => void;
  statusFilter: string;
  onStatusFilter: (s: string) => void;
  selectedCount: number;
  onSelectAll: () => void;
  onExport: () => void;
}> = ({ search, onSearch, statusFilter, onStatusFilter, selectedCount, onSelectAll, onExport }) => (
  <div style={{ padding: 12, borderBottom: '1px solid #eee', display: 'flex', gap: 8 }}>
    <input
      type="text"
      placeholder="Search queue..."
      value={search}
      onChange={(e) => onSearch(e.target.value)}
      style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}
    />
    <select value={statusFilter} onChange={(e) => onStatusFilter(e.target.value)} style={{ padding: '6px', borderRadius: 6, border: '1px solid #ddd' }}>
      <option value="all">All</option>
      <option value="pending">Pending</option>
      <option value="synced">Synced</option>
    </select>
    <button onClick={onSelectAll} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}>
      Select All
    </button>
    {selectedCount > 0 && (
      <button onClick={onExport} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer' }}>
        Export ({selectedCount})
      </button>
    )}
  </div>
);

function matchesSearch(item: QueueItem, query: string): boolean {
  const q = query.toLowerCase();
  return item.content.text.toLowerCase().includes(q) ||
         item.content.author.username.toLowerCase().includes(q) ||
         item.tags.some((t) => t.toLowerCase().includes(q));
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
